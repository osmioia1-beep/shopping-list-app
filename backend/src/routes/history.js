import { Router } from "express";
import { pool } from "../db/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);

// Middleware to check list access
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
    }

    next();
  } catch (err) {
    console.error('List access check error:', err);
    return res.status(500).json({ error: 'Access check failed' });
  }
});

// Get purchase history for a list
router.get("/history", async (req, res) => {
  const { listId } = req.params;
  try {
    const history = await pool.query(
      `SELECT 
        name,
        COUNT(*) as times_purchased,
        MAX(purchased_at) as last_purchased_at,
        SUM(quantity) as total_quantity
       FROM purchase_history
       WHERE list_id = $1
       GROUP BY name
       ORDER BY last_purchased_at DESC`,
      [listId]
    );
    res.json(history.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Record a purchase in history (called when item is toggled to purchased)
router.post("/history", async (req, res) => {
  const { listId } = req.params;
  const { name, quantity } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO purchase_history (list_id, name, quantity) VALUES ($1, $2, $3) RETURNING *",
      [listId, name.trim(), Math.max(1, parseInt(quantity) || 1)]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get list statistics
router.get("/stats", async (req, res) => {
  const { listId } = req.params;
  try {
    const stats = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE purchased = false) as active_count,
        COUNT(*) FILTER (WHERE purchased = true) as purchased_count,
        COUNT(*) as total_count,
        COALESCE(SUM(quantity) FILTER (WHERE purchased = false), 0) as active_quantity,
        COALESCE(SUM(quantity) FILTER (WHERE purchased = true), 0) as purchased_quantity
       FROM items
       WHERE list_id = $1`,
      [listId]
    );

    const historyStats = await pool.query(
      `SELECT 
        COUNT(DISTINCT name) as unique_items_purchased,
        COUNT(*) as total_purchases
       FROM purchase_history
       WHERE list_id = $1`,
      [listId]
    );

    res.json({
      ...stats.rows[0],
      ...historyStats.rows[0],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;