import { Router } from "express";
import { getDb } from "../db/database.js";

const router = Router();

// Get all lists with item counts
router.get("/", (req, res) => {
  const db = getDb();
  const lists = db.prepare(`
    SELECT l.*,
           COUNT(i.id) as total_items,
           SUM(CASE WHEN i.purchased = 1 THEN 1 ELSE 0 END) as purchased_items
    FROM lists l
    LEFT JOIN items i ON i.list_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all();
  res.json(lists);
});

// Create a new list
router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  const db = getDb();
  const result = db.prepare("INSERT INTO lists (name) VALUES (?)").run(name.trim());
  const newList = db.prepare("SELECT * FROM lists WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(newList);
});

// Rename a list
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  const db = getDb();
  const existing = db.prepare("SELECT * FROM lists WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "List not found" });
  }
  db.prepare("UPDATE lists SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name.trim(), id);
  const updated = db.prepare("SELECT * FROM lists WHERE id = ?").get(id);
  res.json(updated);
});

// Delete a list
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM lists WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "List not found" });
  }
  db.prepare("DELETE FROM lists WHERE id = ?").run(id);
  res.json({ success: true, id: parseInt(id) });
});

export default router;
