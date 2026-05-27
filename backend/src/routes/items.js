import { Router } from "express";
import { pool } from "../db/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);

// Middleware to check list access and attach user's role for the list
router.use(async (req, res, next) => {
  try {
    const { listId } = req.params;
    const userId = req.user.id;

    // Check if user is a member of the list (includes owner)
    const memberResult = await pool.query(
      `SELECT role FROM list_members WHERE list_id = $1 AND user_id = $2`,
      [listId, userId]
    );

    if (memberResult.rows.length === 0) {
      // If not a member, check if the user is the owner (though owner should be in list_members)
      const ownerResult = await pool.query(
        `SELECT owner_id FROM lists WHERE id = $1`,
        [listId]
      );
      if (ownerResult.rows.length === 0 || ownerResult.rows[0].owner_id !== userId) {
        return res.status(403).json({ error: 'Access denied to this list' });
      }
      // If owner but not in list_members, we can still allow access and treat as owner
      req.listRole = 'owner';
    } else {
      req.listRole = memberResult.rows[0].role;
    }

    next();
  } catch (err) {
    console.error('List access check error:', err);
    return res.status(500).json({ error: 'Access check failed' });
  }
});

// Get all items for a list
router.get("/", async (req, res) => {
  const { listId } = req.params;
  try {
    // Get items: unpurchased first (alphabetical), then purchased (alphabetical)
    const items = await pool.query(
      `SELECT * FROM items
       WHERE list_id = $1
       ORDER BY purchased ASC, LOWER(name) ASC`,
      [listId]
    );
    res.json(items.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add item to a list
router.post("/", async (req, res) => {
  const { listId } = req.params;
  const { name, quantity } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const qty = Math.max(1, parseInt(quantity) || 1);
    const result = await pool.query(
      "INSERT INTO items (list_id, name, quantity) VALUES ($1, $2, $3) RETURNING *",
      [listId, name.trim(), qty]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Edit item (name and/or quantity)
router.put("/:itemId", async (req, res) => {
  const { listId, itemId } = req.params;
  const { name, quantity } = req.body;

  try {
    const item = await pool.query(
      "SELECT * FROM items WHERE id = $1 AND list_id = $2",
      [itemId, listId]
    );
    if (item.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const newName = name !== undefined ? (name.trim() || item.rows[0].name) : item.rows[0].name;
    const newQty = quantity !== undefined ? Math.max(1, parseInt(quantity) || 1) : item.rows[0].quantity;

    const updated = await pool.query(
      "UPDATE items SET name = $1, quantity = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [newName, newQty, itemId]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle purchased status (and move to end)
router.patch("/:itemId/toggle", async (req, res) => {
  const { listId, itemId } = req.params;

  try {
    const item = await pool.query(
      "SELECT * FROM items WHERE id = $1 AND list_id = $2",
      [itemId, listId]
    );
    if (item.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const newStatus = !item.rows[0].purchased;
    const updated = await pool.query(
      "UPDATE items SET purchased = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [newStatus, itemId]
    );

    // Record in history when marking as purchased
    if (newStatus === true) {
      await pool.query(
        "INSERT INTO purchase_history (list_id, name, quantity) VALUES ($1, $2, $3)",
        [listId, item.rows[0].name, item.rows[0].quantity]
      );
    }

    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete item
router.delete("/:itemId", async (req, res) => {
  const { listId, itemId } = req.params;

  try {
    await pool.query("DELETE FROM items WHERE id = $1 AND list_id = $2", [itemId, listId]);
    res.json({ success: true, id: parseInt(itemId) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;