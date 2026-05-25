import { Router } from "express";
import { pool } from "../db/database.js";

const router = Router({ mergeParams: true });

// Get purchase history for a list
// Returns aggregated data: name, times_purchased, last_purchased_at, total_quantity
router.get("/:listId/history", async (req, res) => {
  const { listId } = req.params;
  try {
    const list = await pool.query("SELECT * FROM lists WHERE id = $1", [listId]);
    if (list.rows.length === 0) {
      return res.status(404).json({ error: "List not found" });
    }

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
router.post("/:listId/history", async (req, res) => {
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
router.get("/:listId/stats", async (req, res) => {
  const { listId } = req.params;
  try {
    const list = await pool.query("SELECT * FROM lists WHERE id = $1", [listId]);
    if (list.rows.length === 0) {
      return res.status(404).json({ error: "List not found" });
    }

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
      `SELECT COUNT(DISTINCT name) as unique_items_purchased,
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
