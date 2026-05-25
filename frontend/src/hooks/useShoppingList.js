import { useState, useEffect, useCallback } from "react";
import {
  getLists, createList, updateList, deleteList,
  getItems, addItem, updateItem, toggleItem, deleteItem,
  getHistory, getStats,
} from "../services/api.js";

export function useShoppingList() {
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Load lists on mount
  useEffect(() => { loadLists(); }, []);

  // Load items, history, stats when active list changes
  useEffect(() => {
    if (activeListId) {
      loadItems(activeListId);
      loadHistory(activeListId);
      loadStats(activeListId);
    }
  }, [activeListId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function showToast(message) {
    setToast(message);
  }

  async function loadLists() {
    try {
      setLoading(true);
      setError(null);
      const data = await getLists();
      setLists(data);
      if (data.length > 0 && !activeListId) {
        setActiveListId(data[0].id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(listId) {
    try {
      setError(null);
      const data = await getItems(listId);
      setItems(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadHistory(listId) {
    try {
      const data = await getHistory(listId);
      setHistory(data);
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }

  async function loadStats(listId) {
    try {
      const data = await getStats(listId);
      setStats(data);
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  // List operations
  const handleCreateList = useCallback(async (name) => {
    try {
      const newList = await createList(name);
      setLists((prev) => [newList, ...prev]);
      setActiveListId(newList.id);
    } catch (e) { setError(e.message); }
  }, []);

  const handleRenameList = useCallback(async (id, name) => {
    try {
      await updateList(id, name);
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    } catch (e) { setError(e.message); }
  }, []);

  const handleDeleteList = useCallback(async (id) => {
    try {
      await deleteList(id);
      setLists((prev) => {
        const filtered = prev.filter((l) => l.id !== id);
        if (activeListId === id && filtered.length > 0) {
          setActiveListId(filtered[0].id);
        }
        return filtered;
      });
    } catch (e) { setError(e.message); }
  }, [activeListId]);

  // Item operations
  const handleAddItem = useCallback(async (name, quantity) => {
    if (!activeListId) return;
    try {
      // Check for duplicate (case-insensitive, only in unpurchased items)
      const normalizedName = name.trim().toLowerCase();
      const existingItem = items.find(
        i => i.name.toLowerCase() === normalizedName && !i.purchased
      );

      if (existingItem) {
        // Increment quantity instead of creating duplicate
        const newQty = (existingItem.quantity || 1) + (quantity || 1);
        await updateItem(activeListId, existingItem.id, { quantity: newQty });
        loadItems(activeListId);
        showToast(`"${existingItem.name}" já existe. Quantidade atualizada para ${newQty}.`);
        return;
      }

      const newItem = await addItem(activeListId, name, quantity);
      setItems((prev) => [...prev, newItem]);
    } catch (e) { setError(e.message); }
  }, [activeListId, items]);

  const handleToggleItem = useCallback(async (itemId) => {
    if (!activeListId) return;
    try {
      await toggleItem(activeListId, itemId);
      loadItems(activeListId);
      loadHistory(activeListId);
      loadStats(activeListId);
    } catch (e) { setError(e.message); }
  }, [activeListId]);

  const handleUpdateItem = useCallback(async (itemId, data) => {
    if (!activeListId) return;
    try {
      await updateItem(activeListId, itemId, data);
      loadItems(activeListId);
    } catch (e) { setError(e.message); }
  }, [activeListId]);

  const handleDeleteItem = useCallback(async (itemId) => {
    if (!activeListId) return;
    try {
      await deleteItem(activeListId, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      loadStats(activeListId);
    } catch (e) { setError(e.message); }
  }, [activeListId]);

  // Re-add item from history
  const handleReAddFromHistory = useCallback(async (name, quantity) => {
    if (!activeListId) return;
    try {
      // Check if already in active list
      const normalizedName = name.toLowerCase();
      const existingItem = items.find(
        i => i.name.toLowerCase() === normalizedName && !i.purchased
      );

      if (existingItem) {
        const newQty = (existingItem.quantity || 1) + (quantity || 1);
        await updateItem(activeListId, existingItem.id, { quantity: newQty });
        loadItems(activeListId);
        showToast(`"${existingItem.name}" já existe. Quantidade atualizada para ${newQty}.`);
        return;
      }

      const newItem = await addItem(activeListId, name, quantity || 1);
      setItems((prev) => [...prev, newItem]);
      showToast(`"${name}" adicionado à lista.`);
    } catch (e) { setError(e.message); }
  }, [activeListId, items]);

  return {
    lists, activeListId, setActiveListId,
    items, history, stats,
    loading, error, setError, toast,
    createList: handleCreateList,
    renameList: handleRenameList,
    deleteList: handleDeleteList,
    addItem: handleAddItem,
    toggleItem: handleToggleItem,
    updateItem: handleUpdateItem,
    deleteItem: handleDeleteItem,
    reAddFromHistory: handleReAddFromHistory,
    reloadItems: () => activeListId && loadItems(activeListId),
    reloadAll: () => {
      if (activeListId) {
        loadItems(activeListId);
        loadHistory(activeListId);
        loadStats(activeListId);
      }
    },
  };
}
