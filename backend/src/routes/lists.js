import { Router } from "express";
import { pool } from "../db/database.js";

const router = Router();

// Get all lists with item counts
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
             COUNT(i.id) as total_items,
             SUM(CASE WHEN i.purchased = true THEN 1 ELSE 0 END) as purchased_items
      FROM lists l
      LEFT JOIN items i ON i.list_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new list
router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO lists (name) VALUES ($1) RETURNING *",
      [name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rename a list
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  try {
    const existing = await pool.query("SELECT * FROM lists WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "List not found" });
    }
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
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query("SELECT * FROM lists WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "List not found" });
    }
    await pool.query("DELETE FROM lists WHERE id = $1", [id]);
    res.json({ success: true, id: parseInt(id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
