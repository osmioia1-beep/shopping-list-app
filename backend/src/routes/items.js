import { Router } from "express";
import { getDb } from "../db/database.js";

const router = Router({ mergeParams: true });

// Get all items for a list
router.get("/", (req, res) => {
  const { listId } = req.params;
  const db = getDb();

  const list = db.prepare("SELECT * FROM lists WHERE id = ?").get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  // Get items: unpurchased first (alphabetical), then purchased (alphabetical)
  const items = db.prepare(`
    SELECT * FROM items
    WHERE list_id = ?
    ORDER BY purchased ASC, LOWER(name) ASC
  `).all(listId);

  res.json(items);
});

// Add item to a list
router.post("/", (req, res) => {
  const { listId } = req.params;
  const { name, quantity } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  const db = getDb();
  const list = db.prepare("SELECT * FROM lists WHERE id = ?").get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  const qty = Math.max(1, parseInt(quantity) || 1);

  const result = db.prepare(
    "INSERT INTO items (list_id, name, quantity) VALUES (?, ?, ?)"
  ).run(listId, name.trim(), qty);

  const newItem = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(newItem);
});

// Edit item (name and/or quantity)
router.put("/:itemId", (req, res) => {
  const { listId, itemId } = req.params;
  const { name, quantity } = req.body;

  const db = getDb();
  const item = db.prepare("SELECT * FROM items WHERE id = ? AND list_id = ?").get(itemId, listId);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  const newName = name !== undefined ? (name.trim() || item.name) : item.name;
  const newQty = quantity !== undefined ? Math.max(1, parseInt(quantity) || 1) : item.quantity;

  db.prepare(
    "UPDATE items SET name = ?, quantity = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newName, newQty, itemId);

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  res.json(updated);
});

// Toggle purchased status (and move to end)
router.patch("/:itemId/toggle", (req, res) => {
  const { listId, itemId } = req.params;

  const db = getDb();
  const item = db.prepare("SELECT * FROM items WHERE id = ? AND list_id = ?").get(itemId, listId);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  const newStatus = item.purchased === 1 ? 0 : 1;
  db.prepare(
    "UPDATE items SET purchased = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newStatus, itemId);

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  res.json(updated);
});

// Delete item
router.delete("/:itemId", (req, res) => {
  const { listId, itemId } = req.params;

  const db = getDb();
  const item = db.prepare("SELECT * FROM items WHERE id = ? AND list_id = ?").get(itemId, listId);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  db.prepare("DELETE FROM items WHERE id = ? AND list_id = ?").run(itemId, listId);
  res.json({ success: true, id: parseInt(itemId) });
});

export default router;
