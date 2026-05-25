import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useShoppingList } from "./hooks/useShoppingList.js";

// ===== Dark Mode Hook =====
function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem("shopping-list-theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch { return false; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try { localStorage.setItem("shopping-list-theme", isDark ? "dark" : "light"); } catch { /* */ }
  }, [isDark]);

  return [isDark, useCallback(() => setIsDark(d => !d), [])];
}

// ===== Haptic =====
function haptic() {
  try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* */ }
}

// ===== Sort Options =====
const SORT_OPTIONS = [
  { key: "default", label: "Padrão" },
  { key: "name", label: "Nome A-Z" },
  { key: "nameDesc", label: "Nome Z-A" },
  { key: "qtyAsc", label: "Qtd ↑" },
  { key: "qtyDesc", label: "Qtd ↓" },
  { key: "newest", label: "Mais recentes" },
  { key: "oldest", label: "Mais antigos" },
];

function sortItems(items, sortKey) {
  const arr = [...items];
  switch (sortKey) {
    case "name": return arr.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    case "nameDesc": return arr.sort((a, b) => b.name.localeCompare(a.name, "pt"));
    case "qtyAsc": return arr.sort((a, b) => (a.quantity || 1) - (b.quantity || 1));
    case "qtyDesc": return arr.sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
    case "newest": return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    case "oldest": return arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    default: return arr;
  }
}

// ===== Error Banner =====
function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-banner">
      <span>⚠️ {error}</span>
      <button onClick={onDismiss}>✕</button>
    </div>
  );
}

// ===== Add Item Form =====
function AddItemForm({ onAdd }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), quantity || 1);
    setName("");
    setQuantity(1);
  };

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="add-form-row">
        <div className="form-top">
          <input
            type="text"
            name="name"
            placeholder="Adicionar item..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <input
            type="number"
            name="quantity"
            min="1"
            max="999"
            value={quantity}
            onChange={(e) => setQuantity(e.target.valueAsNumber || 1)}
          />
        </div>
        <button type="submit" disabled={!name.trim()}>
          ＋ Adicionar
        </button>
      </div>
    </form>
  );
}

// ===== Item Card =====
function ItemCard({ item, onToggle, onDelete }) {
  const [justChecked, setJustChecked] = useState(false);

  const handleCheck = useCallback(() => {
    haptic();
    setJustChecked(true);
    onToggle(item.id);
    setTimeout(() => setJustChecked(false), 600);
  }, [item.id, onToggle]);

  const handleDelete = useCallback(() => {
    haptic();
    onDelete(item.id);
  }, [item.id, onDelete]);

  return (
    <div className={`item-card ${item.purchased ? "purchased" : ""} ${justChecked ? "just-purchased" : ""}`}>
      <button
        className={`item-check ${item.purchased ? "checked" : ""} ${justChecked ? "just-checked" : ""}`}
        onClick={handleCheck}
        aria-label={item.purchased ? "Desmarcar" : "Marcar como comprado"}
      >
        {item.purchased ? "✓" : ""}
      </button>
      <div className="item-info">
        <div className="item-name">{item.name}</div>
      </div>
      <span className="item-quantity-badge">{item.quantity}</span>
      <button className="item-delete" onClick={handleDelete} aria-label="Apagar item">🗑</button>
    </div>
  );
}

// ===== List Tabs =====
function ListTabs({ lists, activeId, onSelect }) {
  return (
    <div className="list-tabs">
      {lists.map((list) => (
        <button key={list.id} className={`list-tab ${list.id === activeId ? "active" : ""}`} onClick={() => onSelect(list.id)}>
          {list.name}
        </button>
      ))}
    </div>
  );
}

// ===== Search Bar =====
function SearchBar({ value, onChange }) {
  return (
    <div className="search-bar">
      <span className="search-icon">🔍</span>
      <input
        type="text"
        placeholder="Pesquisar items..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange("")}>✕</button>
      )}
    </div>
  );
}

// ===== Sort Bar (full width, below search) =====
function SortBar({ value, onChange }) {
  return (
    <div className="sort-bar">
      {SORT_OPTIONS.map(opt => (
        <button
          key={opt.key}
          className={`sort-chip ${opt.key === value ? "active" : ""}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ===== Loading Spinner =====
function LoadingSpinner() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

// ===== Empty State =====
function EmptyState({ hasSearch }) {
  if (hasSearch) {
    return (
      <div className="empty-state">
        <div className="icon">🔍</div>
        <h3>Sem resultados</h3>
        <div className="empty-divider" />
        <p>Nenhum item encontrado para a tua pesquisa.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <div className="icon">🛒</div>
      <h3>A tua lista está vazia</h3>
      <div className="empty-divider" />
      <p>Adiciona itens usando o formulário acima.<br />Toca no 🗑 para apagar um item.</p>
    </div>
  );
}

// ===== Pull to Refresh =====
function usePullToRefresh(listRef, onRefresh) {
  const [ptrState, setPtrState] = useState("idle");
  const [ptrY, setPtrY] = useState(0);
  const startY = useRef(0);

  const handleTouchStart = useCallback((e) => {
    const el = listRef.current;
    if (el && el.scrollTop === 0) startY.current = e.touches[0].clientY;
  }, [listRef]);

  const handleTouchMove = useCallback((e) => {
    const el = listRef.current;
    if (!el || el.scrollTop !== 0) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && dy < 150) {
      e.preventDefault();
      setPtrState("pulling");
      setPtrY(dy);
    }
  }, [listRef]);

  const handleTouchEnd = useCallback(async () => {
    if (ptrY > 70) {
      setPtrState("refreshing");
      setPtrY(60);
      await onRefresh();
      setTimeout(() => { setPtrState("idle"); setPtrY(0); }, 300);
    } else {
      setPtrState("idle");
      setPtrY(0);
    }
  }, [ptrY, onRefresh]);

  return { ptrState, ptrY, handleTouchStart, handleTouchMove, handleTouchEnd };
}

// ===== Main App =====
export default function App() {
  const {
    lists, activeListId, setActiveListId,
    items, loading, error, setError,
    addItem, toggleItem, deleteItem, reloadItems,
  } = useShoppingList();

  const [isDark, toggleDark] = useDarkMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("default");

  const activeList = lists.find((l) => l.id === activeListId);
  const allItems = items || [];

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const q = searchQuery.toLowerCase();
    return allItems.filter(i => i.name.toLowerCase().includes(q));
  }, [allItems, searchQuery]);

  const activeItemsRaw = filteredItems.filter(i => !i.purchased);
  const purchasedItemsRaw = filteredItems.filter(i => i.purchased);

  const activeItems = useMemo(() => sortItems(activeItemsRaw, sortKey), [activeItemsRaw, sortKey]);
  const purchasedItems = useMemo(() => sortItems(purchasedItemsRaw, sortKey), [purchasedItemsRaw, sortKey]);

  const listRef = useRef(null);
  const { ptrState, ptrY, handleTouchStart, handleTouchMove, handleTouchEnd } =
    usePullToRefresh(listRef, () => reloadItems());

  if (loading) {
    return (
      <div className="app">
        <div className="header">
          <div className="header-left"><h1>🛒 Shopping List</h1></div>
          <button className="dark-toggle" onClick={toggleDark}>{isDark ? "☀️" : "🌙"}</button>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>🛒 Shopping List</h1>
          {activeList && <div className="header-subtitle">{activeList.name}</div>}
        </div>
        <button className="dark-toggle" onClick={toggleDark} aria-label="Alternar tema">
          {isDark ? "☀️" : "🌙"}
        </button>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {lists.length > 1 && (
        <ListTabs lists={lists} activeId={activeListId} onSelect={setActiveListId} />
      )}

      <AddItemForm onAdd={addItem} />

      {/* Toolbar: Search + Sort below */}
      <div className="toolbar">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <SortBar value={sortKey} onChange={setSortKey} />
      </div>

      <div
        ref={listRef}
        className="items-list"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {ptrState !== "idle" && (
          <div className="ptr-indicator" style={{ opacity: Math.min(ptrY / 70, 1) }}>
            {ptrState === "refreshing" ? "⏳ A atualizar..." : ptrY > 70 ? "↗️ Soltar para atualizar" : "⬇️ Puxar para atualizar"}
          </div>
        )}

        {activeItems.length === 0 && purchasedItems.length === 0 && <EmptyState hasSearch={!!searchQuery.trim()} />}

        {activeItems.map((item) => (
          <ItemCard key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />
        ))}

        {purchasedItems.length > 0 && (
          <>
            <div className="divider">Comprados ✓</div>
            {purchasedItems.map((item) => (
              <ItemCard key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
