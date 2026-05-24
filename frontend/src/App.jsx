import React, { useState } from "react";
import { useShoppingList } from "./hooks/useShoppingList.js";

// ===== Sub-components =====

function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-banner">
      <span>⚠️ {error}</span>
      <button onClick={onDismiss}>✕</button>
    </div>
  );
}

function AddItemForm({ onAdd }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), quantity);
    setName("");
    setQuantity(1);
  };

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="add-form-row">
        <input
          type="text"
          placeholder="Adicionar item..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          name="quantity"
          min="1"
          max="999"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          Adicionar
        </button>
      </div>
    </form>
  );
}

function ItemCard({ item, onToggle, onDelete }) {
  return (
    <div className={`item-card ${item.purchased ? "purchased" : ""}`}>
      <button
        className={`item-check ${item.purchased ? "checked" : ""}`}
        onClick={() => onToggle(item.id)}
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
        onClick={() => onDelete(item.id)}
        aria-label="Apagar item"
      >
        🗑
      </button>
    </div>
  );
}

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

function LoadingSpinner() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

function EmptyState({ itemCount }) {
  if (itemCount > 0) return null;
  return (
    <div className="empty-state">
      <div className="icon">🛒</div>
      <p>A lista está vazia.<br />Adiciona itens ao formulário acima!</p>
    </div>
  );
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
  } = useShoppingList();

  const activeList = lists.find((l) => l.id === activeListId);
  const activeItems = (items || []).filter((i) => !i.purchased);
  const purchasedItems = (items || []).filter((i) => i.purchased);

  if (loading) {
    return (
      <div className="app">
        <div className="header">
          <h1>🛒 Shopping List</h1>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🛒 Shopping List</h1>
        {activeList && (
          <div className="header-subtitle">{activeList.name}</div>
        )}
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {lists.length > 1 && (
        <ListTabs
          lists={lists}
          activeId={activeListId}
          onSelect={setActiveListId}
        />
      )}

      <AddItemForm onAdd={addItem} />

      <div className="items-list">
        {activeItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        ))}

        {activeItems.length === 0 && purchasedItems.length === 0 && (
          <EmptyState itemCount={0} />
        )}

        {purchasedItems.length > 0 && (
          <>
            <div className="divider">Comprados ✓</div>
            {purchasedItems.map((item) => (
              <ItemCard
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
