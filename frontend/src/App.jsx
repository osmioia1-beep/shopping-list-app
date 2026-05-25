import React, { useState, useRef, useCallback, useEffect } from "react";
import { useShoppingList } from "./hooks/useShoppingList.js";

// ===== Dark Mode Hook =====
function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem("shopping-list-theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("shopping-list-theme", isDark ? "dark" : "light");
    } catch { /* ignore */ }
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((d) => !d), []);
  return [isDark, toggle];
}

// ===== Haptic Feedback =====
function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(15);
  } catch { /* ignore */ }
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

// ===== Item Card with Swipe =====
function SwipeableItemCard({ item, onToggle, onDelete }) {
  const [swipeX, setSwipeX] = useState(0);
  const [justChecked, setJustChecked] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const cardRef = useRef(null);
  const maxSwipe = 80;

  const handleTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    
    // Only trigger horizontal swipe if horizontal movement > vertical
    if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
      isDragging.current = true;
      setSwipeX(Math.max(-maxSwipe, dx));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeX < -50) {
      setSwipeX(-maxSwipe);
    } else {
      setSwipeX(0);
    }
    isDragging.current = false;
  }, [swipeX]);

  const handleCheck = useCallback(() => {
    haptic();
    setJustChecked(true);
    onToggle(item.id);
    setTimeout(() => setJustChecked(false), 600);
  }, [item.id, onToggle]);

  const handleDelete = useCallback(() => {
    haptic();
    setSwipeX(-300);
    setTimeout(() => onDelete(item.id), 200);
  }, [item.id, onDelete]);

  return (
    <div className="item-card-swipe">
      <div className="item-card-bg">Apagar</div>
      <div
        ref={cardRef}
        className={`item-card-inner ${swipeX < -50 ? "swiped-open" : ""}`}
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
          <button
            className="item-delete"
            onClick={handleDelete}
            aria-label="Apagar item"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== List Tabs =====
function ListTabs({ lists, activeId, onSelect }) {
  return (
    <div className="list-tabs">
      {lists.map((list) => (
        <button
          key={list.id}
          className={`list-tab ${list.id === activeId ? "active" : ""}`}
          onClick={() => onSelect(list.id)}
        >
          {list.name}
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
function EmptyState() {
  return (
    <div className="empty-state">
      <div className="icon">🛒</div>
      <h3>A tua lista está vazia</h3>
      <div className="empty-divider" />
      <p>Adiciona itens usando o formulário acima.<br />Desliza um item para a esquerda para o apagar.</p>
    </div>
  );
}

// ===== Pull to Refresh =====
function usePullToRefresh(onRefresh) {
  const [ptrState, setPtrState] = useState("idle"); // idle | pulling | refreshing
  const [ptrY, setPtrY] = useState(0);
  const startY = useRef(0);
  const listRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (window.scrollY !== 0) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && dy < 120) {
      setPtrState("pulling");
      setPtrY(dy);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (ptrY > 60) {
      setPtrState("refreshing");
      setPtrY(60);
      await onRefresh();
      setTimeout(() => {
        setPtrState("idle");
        setPtrY(0);
      }, 300);
    } else {
      setPtrState("idle");
      setPtrY(0);
    }
  }, [ptrY, onRefresh]);

  return { ptrState, ptrY, listRef, handleTouchStart, handleTouchMove, handleTouchEnd };
}

// ===== Main App =====
export default function App() {
  const {
    lists,
    activeListId,
    setActiveListId,
    items,
    loading,
    error,
    setError,
    addItem,
    toggleItem,
    deleteItem,
    reloadItems,
  } = useShoppingList();

  const [isDark, toggleDark] = useDarkMode();
  const activeList = lists.find((l) => l.id === activeListId);
  const activeItems = (items || []).filter((i) => !i.purchased);
  const purchasedItems = (items || []).filter((i) => i.purchased);

  const { ptrState, ptrY, listRef, handleTouchStart, handleTouchMove, handleTouchEnd } =
    usePullToRefresh(() => reloadItems());

  if (loading) {
    return (
      <div className="app">
        <div className="header">
          <div className="header-left">
            <h1>🛒 Shopping List</h1>
          </div>
          <button className="dark-toggle" onClick={toggleDark}>
            {isDark ? "☀️" : "🌙"}
          </button>
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

      <div
        ref={listRef}
        className={`items-list ${ptrState !== "idle" ? "ptr-active" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {ptrState !== "idle" && (
          <div className="ptr-indicator" style={{ opacity: Math.min(ptrY / 60, 1) }}>
            {ptrState === "refreshing" ? "⏳ A atualizar..." : ptrY > 60 ? "↗️ Soltar para atualizar" : "⬇️ Puxar para atualizar"}
          </div>
        )}

        {activeItems.length === 0 && purchasedItems.length === 0 && <EmptyState />}

        {activeItems.map((item) => (
          <SwipeableItemCard
            key={item.id}
            item={item}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        ))}

        {purchasedItems.length > 0 && (
          <>
            <div className="divider">Comprados ✓</div>
            {purchasedItems.map((item) => (
              <SwipeableItemCard
                key={item.id}
                item={item}
                onToggle={toggleItem}
                onDelete={deleteItem}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
