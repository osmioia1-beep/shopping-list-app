import { Router } from "express";
import { pool } from "../db/database.js";

const router = Router({ mergeParams: true });

// Get all items for a list
router.get("/", async (req, res) => {
  const { listId } = req.params;
  try {
    const list = await pool.query("SELECT * FROM lists WHERE id = $1", [listId]);
    if (list.rows.length === 0) {
      return res.status(404).json({ error: "List not found" });
    }

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
    const list = await pool.query("SELECT * FROM lists WHERE id = $1", [listId]);
    if (list.rows.length === 0) {
      return res.status(404).json({ error: "List not found" });
    }

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
    const item = await pool.query(
      "SELECT * FROM items WHERE id = $1 AND list_id = $2",
      [itemId, listId]
    );
    if (item.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    await pool.query("DELETE FROM items WHERE id = $1 AND list_id = $2", [itemId, listId]);
    res.json({ success: true, id: parseInt(itemId) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
