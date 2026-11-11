import { useState, useEffect, useCallback, useRef } from "react";
import {
  getLists, createList, updateList, deleteList,
  getItems, addItem, updateItem, toggleItem, deleteItem,
  getHistory, getStats,
} from "../services/api.js";

export function useShoppingList() {
  const [lists, setLists] = useState([]);
  const [activeListId, setSelectedListId] = useState(null);
  const selectedList = useRef(null);
  const listRequest = useRef(0);
  const [accessNotice, setAccessNotice] = useState(null);

  const setActiveListId = useCallback((id) => {
    if (selectedList.current === id) return;
    selectedList.current = id;
    setItems([]);
    setHistory([]);
    setStats(null);
    setSelectedListId(id);
  }, []);
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
    const request = ++listRequest.current;
    try {
      const data = await getLists();
      if (request !== listRequest.current) return;
      const previous = selectedList.current;
      setLists(data);
      if (!data.some(list => list.id === previous)) {
        if (previous !== null) setAccessNotice("Deixaste de ter acesso à lista que estava aberta.");
        setActiveListId(data[0]?.id ?? null);
      }
      return selectedList.current;
    } catch (e) {
      if (request === listRequest.current) setError(e.message);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }

  async function loadItems(listId) {
    try {
      setError(null);
      const data = await getItems(listId);
      if (selectedList.current === listId) setItems(data);
    } catch (e) {
      if (selectedList.current !== listId) return;
      if (e.status === 403) await loadLists();
      else setError(e.message);
    }
  }

  async function loadHistory(listId) {
    try {
      const data = await getHistory(listId);
      if (selectedList.current === listId) setHistory(data);
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }

  async function loadStats(listId) {
    try {
      const data = await getStats(listId);
      if (selectedList.current === listId) setStats(data);
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  // List operations
  const handleCreateList = useCallback(async (name) => {
    try {
      const newList = await createList(name);
      setLists((prev) => [{ ...newList, role: 'owner' }, ...prev]);
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
      if (selectedList.current === id) setActiveListId(null);
      await loadLists();
    } catch (e) { setError(e.message); }
  }, [setActiveListId]);

  // Item operations
  const handleAddItem = useCallback(async (name, quantity) => {
    if (!activeListId) return false;
    try {
      // Check for duplicate (case-insensitive)
      const normalizedName = name.trim().toLowerCase();
      const existingItem = items.find(
        i => i.name.toLowerCase() === normalizedName
      );

      if (existingItem) {
        if (existingItem.purchased) {
          // Item exists but is purchased — uncheck it
          await toggleItem(activeListId, existingItem.id);
          loadItems(activeListId);
          loadHistory(activeListId);
          loadStats(activeListId);
          showToast(`"${existingItem.name}" foi desmarcado.`);
        } else {
          // Item exists and is active — increment quantity
          const newQty = (existingItem.quantity || 1) + (quantity || 1);
          await updateItem(activeListId, existingItem.id, { quantity: newQty });
          loadItems(activeListId);
          showToast(`"${existingItem.name}" já existe. Quantidade atualizada para ${newQty}.`);
        }
        return true;
      }

      const newItem = await addItem(activeListId, name, quantity);
      if (selectedList.current === activeListId) {
        setItems(prev => prev.some(item => item.id === newItem.id) ? prev : [...prev, newItem]);
      }
      return true;
    } catch (e) {
      if (e.status === 403) await loadLists();
      else setError("Não foi possível adicionar o artigo. Verifica a ligação e tenta novamente.");
      return false;
    }
  }, [activeListId, items, addItem, updateItem, toggleItem, loadItems, setError]);

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
      if (selectedList.current === activeListId) setItems((prev) => prev.filter((i) => i.id !== itemId));
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
      if (selectedList.current === activeListId) {
        setItems(prev => prev.some(item => item.id === newItem.id) ? prev : [...prev, newItem]);
      }
      showToast(`"${name}" adicionado à lista.`);
    } catch (e) { setError(e.message); }
  }, [activeListId, items]);

  return {
    lists, activeListId, setActiveListId,
    items, history, stats,
    loading, error, setError, toast, accessNotice, setAccessNotice,
    createList: handleCreateList,
    renameList: handleRenameList,
    deleteList: handleDeleteList,
    addItem: handleAddItem,
    toggleItem: handleToggleItem,
    updateItem: handleUpdateItem,
    deleteItem: handleDeleteItem,
    reAddFromHistory: handleReAddFromHistory,
    reloadAll: async () => {
      const listId = await loadLists();
      if (listId) await Promise.all([loadItems(listId), loadHistory(listId), loadStats(listId)]);
    },
  };
}
