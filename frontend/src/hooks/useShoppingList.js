import { useState, useEffect, useCallback } from "react";
import {
  getLists, createList, updateList, deleteList,
  getItems, addItem, updateItem, toggleItem, deleteItem
} from "../services/api.js";

export function useShoppingList() {
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load lists on mount
  useEffect(() => {
    loadLists();
  }, []);

  // Load items when active list changes
  useEffect(() => {
    if (activeListId) {
      loadItems(activeListId);
    }
  }, [activeListId]);

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

  // List operations
  const handleCreateList = useCallback(async (name) => {
    try {
      const newList = await createList(name);
      setLists((prev) => [newList, ...prev]);
      setActiveListId(newList.id);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleRenameList = useCallback(async (id, name) => {
    try {
      await updateList(id, name);
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    } catch (e) {
      setError(e.message);
    }
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
    } catch (e) {
      setError(e.message);
    }
  }, [activeListId]);

  // Item operations
  const handleAddItem = useCallback(async (name, quantity) => {
    if (!activeListId) return;
    try {
      const newItem = await addItem(activeListId, name, quantity);
      setItems((prev) => [...prev, newItem]);
    } catch (e) {
      setError(e.message);
    }
  }, [activeListId]);

  const handleToggleItem = useCallback(async (itemId) => {
    if (!activeListId) return;
    try {
      await toggleItem(activeListId, itemId);
      // Reload items to get proper ordering
      loadItems(activeListId);
    } catch (e) {
      setError(e.message);
    }
  }, [activeListId]);

  const handleUpdateItem = useCallback(async (itemId, data) => {
    if (!activeListId) return;
    try {
      await updateItem(activeListId, itemId, data);
      loadItems(activeListId);
    } catch (e) {
      setError(e.message);
    }
  }, [activeListId]);

  const handleDeleteItem = useCallback(async (itemId) => {
    if (!activeListId) return;
    try {
      await deleteItem(activeListId, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      setError(e.message);
    }
  }, [activeListId]);

  return {
    lists,
    activeListId,
    setActiveListId,
    items,
    loading,
    error,
    setError,
    createList: handleCreateList,
    renameList: handleRenameList,
    deleteList: handleDeleteList,
    addItem: handleAddItem,
    toggleItem: handleToggleItem,
    updateItem: handleUpdateItem,
    deleteItem: handleDeleteItem,
    reloadItems: () => activeListId && loadItems(activeListId),
  };
}
