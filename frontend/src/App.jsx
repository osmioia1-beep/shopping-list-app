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

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `${diffDays} dias atrás`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} sem. atrás`;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

// ===== Toast =====
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
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
            type="text" name="name" placeholder="Adicionar item..."
            value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
          />
          <input
            type="number" name="quantity" min="1" max="999"
            value={quantity} onChange={(e) => setQuantity(e.target.valueAsNumber || 1)}
          />
        </div>
        <button type="submit" disabled={!name.trim()}>＋ Adicionar</button>
      </div>
    </form>
  );
}

// ===== Item Card =====
function ItemCard({ item, onToggle, onDelete }) {
  const [justChecked, setJustChecked] = useState(false);

  const handleCheck = useCallback(() => {
    haptic(); setJustChecked(true);
    onToggle(item.id);
    setTimeout(() => setJustChecked(false), 600);
  }, [item.id, onToggle]);

  const handleDelete = useCallback(() => { haptic(); onDelete(item.id); }, [item.id, onDelete]);

  return (
    <div className={`item-card ${item.purchased ? "purchased" : ""} ${justChecked ? "just-purchased" : ""}`}>
      <button className={`item-check ${item.purchased ? "checked" : ""} ${justChecked ? "just-checked" : ""}`} onClick={handleCheck}>
        {item.purchased ? "✓" : ""}
      </button>
      <div className="item-info"><div className="item-name">{item.name}</div></div>
      <span className="item-quantity-badge">{item.quantity}</span>
      <button className="item-delete" onClick={handleDelete} aria-label="Apagar">🗑</button>
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
      <input type="text" placeholder="Pesquisar items..." value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button className="search-clear" onClick={() => onChange("")}>✕</button>}
    </div>
  );
}

// ===== Sort Bar =====
function SortBar({ value, onChange }) {
  return (
    <div className="sort-bar">
      {SORT_OPTIONS.map(opt => (
        <button key={opt.key} className={`sort-chip ${opt.key === value ? "active" : ""}`} onClick={() => onChange(opt.key)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ===== Stats Panel =====
function StatsPanel({ stats }) {
  if (!stats) return null;
  const total = parseInt(stats.total_count) || 0;
  const purchased = parseInt(stats.purchased_count) || 0;
  const active = parseInt(stats.active_count) || 0;
  const pct = total > 0 ? Math.round((purchased / total) * 100) : 0;

  return (
    <div className="stats-panel">
      <div className="stats-row">
        <div className="stat-item">
          <span className="stat-num">{active}</span>
          <span className="stat-label">Por comprar</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{purchased}</span>
          <span className="stat-label">Comprados</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{total}</span>
          <span className="stat-label">Total</span>
        </div>
      </div>
      <div className="stats-progress">
        <div className="stats-progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ===== History Panel =====
function HistoryPanel({ history, onReAdd, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const displayItems = expanded ? history : history.slice(0, 5);

  if (!history || history.length === 0) {
    return (
      <div className="history-overlay" onClick={onClose}>
        <div className="history-panel" onClick={(e) => e.stopPropagation()}>
          <div className="history-header">
            <h2>📊 Histórico</h2>
            <button className="history-close" onClick={onClose}>✕</button>
          </div>
          <div className="history-empty">
            <div className="icon">📋</div>
            <p>Ainda não há items comprados.<br />Os items que compras aparecerão aqui.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h2>📊 Histórico</h2>
          <button className="history-close" onClick={onClose}>✕</button>
        </div>
        <div className="history-list">
          {displayItems.map((h, i) => (
            <div key={i} className="history-item">
              <div className="history-info">
                <div className="history-name">{h.name}</div>
                <div className="history-meta">
                  🕐 {formatDate(h.last_purchased_at)} · 🛒 {h.times_purchased}x comprado
                </div>
              </div>
              <button className="history-readd" onClick={() => onReAdd(h.name, h.total_quantity / h.times_purchased || 1)}>
                ＋
              </button>
            </div>
          ))}
          {history.length > 5 && (
            <button className="history-expand" onClick={() => setExpanded(!expanded)}>
              {expanded ? "▲ Mostrar menos" : `▼ Ver todos (${history.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Export Menu =====
function ExportMenu({ items, lists, activeListId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeItems = items.filter(i => !i.purchased);
  const purchasedItems = items.filter(i => i.purchased);
  const listName = lists.find(l => l.id === activeListId)?.name || "Lista";

  const formatListText = () => {
    let text = `🛒 ${listName}\n\n`;
    if (activeItems.length > 0) {
      text += `📋 Por comprar (${activeItems.length}):\n`;
      activeItems.forEach(i => { text += `  ☐ ${i.name} (${i.quantity})\n`; });
    }
    if (purchasedItems.length > 0) {
      text += `\n✅ Comprados (${purchasedItems.length}):\n`;
      purchasedItems.forEach(i => { text += `  ✓ ${i.name} (${i.quantity})\n`; });
    }
    text += `\n— ${new Date().toLocaleDateString("pt-PT")}`;
    return text;
  };

  const handleShare = async () => {
    const text = formatListText();
    if (navigator.share) {
      try { await navigator.share({ title: listName, text }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
    setOpen(false);
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(formatListText()); } catch { /* ignore */ }
    setOpen(false);
  };

  const handlePDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Title
    doc.setFontSize(20);
    doc.text(`🛒 ${listName}`, pageWidth / 2, y, { align: "center" });
    y += 12;

    // Date
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }), pageWidth / 2, y, { align: "center" });
    y += 10;

    // Divider
    doc.setDrawColor(200);
    doc.line(20, y, pageWidth - 20, y);
    y += 10;

    // Active items
    if (activeItems.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(`📋 Por comprar (${activeItems.length})`, 20, y);
      y += 8;

      doc.setFontSize(11);
      activeItems.forEach(i => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`☐  ${i.name}  (${i.quantity})`, 25, y);
        y += 7;
      });
      y += 5;
    }

    // Purchased items
    if (purchasedItems.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(`✅ Comprados (${purchasedItems.length})`, 20, y);
      y += 8;

      doc.setFontSize(11);
      purchasedItems.forEach(i => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`✓  ${i.name}  (${i.quantity})`, 25, y);
        y += 7;
      });
    }

    // Footer
    y = Math.max(y + 10, 260);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Shopping List — Gerado automaticamente", pageWidth / 2, y, { align: "center" });

    doc.save(`${listName.replace(/\s+/g, "_")}.pdf`);
    setOpen(false);
  };

  return (
    <div className="export-menu" ref={ref}>
      <button className="export-btn" onClick={() => setOpen(!open)} aria-label="Partilhar">
        📤
      </button>
      {open && (
        <div className="export-dropdown">
          {typeof navigator.share === "function" && (
            <button className="export-option" onClick={handleShare}>📱 Partilhar...</button>
          )}
          <button className="export-option" onClick={handleCopy}>📋 Copiar lista</button>
          <button className="export-option" onClick={handlePDF}>📄 Exportar PDF</button>
        </div>
      )}
    </div>
  );
}

// ===== Loading =====
function LoadingSpinner() {
  return (<div className="loading"><div className="spinner" /></div>);
}

// ===== Empty State =====
function EmptyState({ hasSearch }) {
  if (hasSearch) {
    return (
      <div className="empty-state">
        <div className="icon">🔍</div><h3>Sem resultados</h3>
        <div className="empty-divider" /><p>Nenhum item encontrado para a tua pesquisa.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <div className="icon">🛒</div><h3>A tua lista está vazia</h3>
      <div className="empty-divider" /><p>Adiciona itens usando o formulário acima.</p>
    </div>
  );
}

// ===== Toolbar =====
function Toolbar({ searchQuery, setSearchQuery, sortKey, setSortKey, onOpenHistory, items, lists, activeListId }) {
  return (
    <>
      <div className="toolbar">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <div className="toolbar-row">
          <SortBar value={sortKey} onChange={setSortKey} />
          <div className="toolbar-actions">
            <button className="toolbar-btn" onClick={onOpenHistory} title="Histórico">📊</button>
            <ExportMenu items={items} lists={lists} activeListId={activeListId} />
          </div>
        </div>
      </div>
    </>
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
    if (dy > 0 && dy < 150) { e.preventDefault(); setPtrState("pulling"); setPtrY(dy); }
  }, [listRef]);

  const handleTouchEnd = useCallback(async () => {
    if (ptrY > 70) {
      setPtrState("refreshing"); setPtrY(60);
      await onRefresh();
      setTimeout(() => { setPtrState("idle"); setPtrY(0); }, 300);
    } else { setPtrState("idle"); setPtrY(0); }
  }, [ptrY, onRefresh]);

  return { ptrState, ptrY, handleTouchStart, handleTouchMove, handleTouchEnd };
}

// ===== Main App =====
export default function App() {
  const {
    lists, activeListId, setActiveListId,
    items, history, stats,
    loading, error, setError, toast,
    addItem, toggleItem, deleteItem, reAddFromHistory, reloadAll,
  } = useShoppingList();

  const [isDark, toggleDark] = useDarkMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("default");
  const [showHistory, setShowHistory] = useState(false);

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
    usePullToRefresh(listRef, () => reloadAll());

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
        <button className="dark-toggle" onClick={toggleDark}>{isDark ? "☀️" : "🌙"}</button>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <Toast message={toast} />

      {lists.length > 1 && <ListTabs lists={lists} activeId={activeListId} onSelect={setActiveListId} />}

      <AddItemForm onAdd={addItem} />

      <Toolbar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        sortKey={sortKey} setSortKey={setSortKey}
        onOpenHistory={() => setShowHistory(true)}
        items={allItems} lists={lists} activeListId={activeListId}
      />

      <StatsPanel stats={stats} />

      <div ref={listRef} className="items-list"
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {ptrState !== "idle" && (
          <div className="ptr-indicator" style={{ opacity: Math.min(ptrY / 70, 1) }}>
            {ptrState === "refreshing" ? "⏳ A atualizar..." : ptrY > 70 ? "↗️ Soltar para atualizar" : "⬇️ Puxar para atualizar"}
          </div>
        )}
        {activeItems.length === 0 && purchasedItems.length === 0 && <EmptyState hasSearch={!!searchQuery.trim()} />}
        {activeItems.map((item) => <ItemCard key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />)}
        {purchasedItems.length > 0 && (
          <>
            <div className="divider">Comprados ✓</div>
            {purchasedItems.map((item) => <ItemCard key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />)}
          </>
        )}
      </div>

      {showHistory && (
        <HistoryPanel history={history} onReAdd={(name, qty) => { reAddFromHistory(name, Math.round(qty) || 1); }} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
