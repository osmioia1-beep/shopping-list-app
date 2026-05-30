import { Router } from "express";
import { pool } from "../db/database.js";
import { authenticateToken, authorizeListAccess } from "../middleware/auth.js";

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all lists with item counts for the authenticated user
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
      SELECT l.*, l.id as list_id,
             COUNT(i.id) as total_items,
             SUM(CASE WHEN i.purchased = true THEN 1 ELSE 0 END) as purchased_items
      FROM lists l
      LEFT JOIN items i ON i.list_id = l.id
      LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $1
      WHERE l.owner_id = $1 OR lm.user_id IS NOT NULL
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new list — prevent duplicates by name (case-insensitive) for same owner
router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  try {
    const userId = req.user.id;
    const trimmedName = name.trim();

    // Check for existing list with same name (case-insensitive) owned by this user
    const existing = await pool.query(
      "SELECT id FROM lists WHERE owner_id = $1 AND LOWER(name) = LOWER($2)",
      [userId, trimmedName]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Já existe uma lista com este nome" });
    }

    const result = await pool.query(
      "INSERT INTO lists (name, owner_id) VALUES ($1, $2) RETURNING *",
      [trimmedName, userId]
    );
    // Add creator as owner in list_members
    await pool.query(
      "INSERT INTO list_members (list_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
      [result.rows[0].id, userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rename a list
router.put("/:id", authorizeListAccess(true), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  try {
    const updated = await pool.query(
      "UPDATE lists SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [name.trim(), id]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a list
router.delete("/:id", authorizeListAccess(true), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM lists WHERE id = $1", [id]);
    res.json({ success: true, id: parseInt(id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get list members
router.get("/:id/members", authorizeListAccess(false), async (req, res) => {
  try {
    const listId = req.params.id;
    const result = await pool.query(`
      SELECT u.id, u.email, u.name, u.avatar_url, lm.role, lm.joined_at
      FROM list_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.list_id = $1
    `, [listId]);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Invite user to list by email (direct add)
router.post("/:id/invite", authenticateToken, authorizeListAccess(true), async (req, res) => {
  try {
    const listId = req.params.id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find user by email
    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found with this email" });
    }

    const userId = userResult.rows[0].id;

    // Add as member with editor role by default
    await pool.query(`
      INSERT INTO list_members (list_id, user_id, role)
      VALUES ($1, $2, 'editor')
      ON CONFLICT (list_id, user_id) DO UPDATE SET role = 'editor'
    `, [listId, userId]);

    res.json({ success: true, message: "User invited successfully" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate shareable invite link
router.post("/:id/invite-link", authenticateToken, authorizeListAccess(true), async (req, res) => {
  try {
    const listId = req.params.id;
    const { role = 'editor' } = req.body;
    const userId = req.user.id;
    console.log("[invite-link] Generating link for listId:", listId, "userId:", userId, "role:", role);

    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'editor' or 'viewer'" });
    }

    // Generate unique token
    const { randomUUID } = await import('crypto');
    const token = randomUUID();

    await pool.query(`
      INSERT INTO list_invites (token, list_id, invited_by, role)
      VALUES ($1, $2, $3, $4)
    `, [token, listId, userId, role]);

    const frontendUrl = process.env.FRONTEND_URL || '';
    const inviteLink = `${frontendUrl}/accept-invite/${token}`;

    console.log("[invite-link] Success! Link:", inviteLink);
    res.json({ success: true, inviteLink, token, expiresIn: '7 days' });
  } catch (e) {
    console.error("[invite-link] Error:", e.message);
    res.status(500).json({ error: "Error generating invite link" });
  }
});

// Update member role
router.patch("/:listId/members/:userId/role", authenticateToken, authorizeListAccess(true), async (req, res) => {
  try {
    const { listId, userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['owner', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    
    await pool.query(
      "UPDATE list_members SET role = $1 WHERE list_id = $2 AND user_id = $3",
      [role, listId, userId]
    );
    
    res.json({ success: true, message: "Role updated" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove member from list
router.delete("/:listId/members/:userId", authenticateToken, authorizeListAccess(true), async (req, res) => {
  try {
    const { listId, userId } = req.params;
    
    // Prevent removing the last owner
    const ownerCheck = await pool.query(`
      SELECT COUNT(*) as owner_count 
      FROM list_members 
      WHERE list_id = $1 AND role = 'owner'
    `, [listId]);
    
    if (ownerCheck.rows[0].owner_count <= 1) {
      const isOwner = await pool.query(`
        SELECT role FROM list_members 
        WHERE list_id = $1 AND user_id = $2
      `, [listId, userId]);
      
      if (isOwner.rows[0].role === 'owner') {
        return res.status(400).json({ error: "Cannot remove the last owner" });
      }
    }
    
    await pool.query(
      "DELETE FROM list_members WHERE list_id = $1 AND user_id = $2",
      [listId, userId]
    );
    
    res.json({ success: true, message: "Member removed" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;