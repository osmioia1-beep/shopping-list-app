import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuth } from './context/AuthContext.jsx';
import { useShoppingList } from './hooks/useShoppingList.js';
import { useRealtimeSync } from "./hooks/useRealtimeSync.js";
import { supabase } from "./services/supabase.js";

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
function ListTabs({ lists, activeId, onSelect, onCreate }) {
  return (
    <div className="list-tabs">
      {lists.map((list) => (
        <button key={list.id} className={`list-tab ${list.id === activeId ? "active" : ""}`} onClick={() => onSelect(list.id)}>
          {list.name}
        </button>
      ))}
      <button className="list-tab list-tab-create" onClick={onCreate} title="Nova lista">➕</button>
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

    // Helper: strip emoji and normalize accented chars for PDF
    const pdfSafe = (str) => {
      // Remove emoji ranges
      return str
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/\u2713/g, 'x')       // ✓ -> x
        .replace(/\u2610/g, '[ ]')     // ☐ -> [ ]
        .trim();
    };

    // Title
    doc.setFontSize(20);
    doc.text(pdfSafe(`Lista: ${listName}`), pageWidth / 2, y, { align: "center" });
    y += 12;

    // Date
    doc.setFontSize(10);
    doc.setTextColor(120);
    const dateStr = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    doc.text(pdfSafe(dateStr), pageWidth / 2, y, { align: "center" });
    y += 10;

    // Divider
    doc.setDrawColor(200);
    doc.line(20, y, pageWidth - 20, y);
    y += 10;

    // Active items
    if (activeItems.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(`Por comprar (${activeItems.length})`, 20, y);
      y += 8;

      doc.setFontSize(11);
      activeItems.forEach(i => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`[ ]  ${pdfSafe(i.name)}  (${i.quantity})`, 25, y);
        y += 7;
      });
      y += 5;
    }

    // Purchased items
    if (purchasedItems.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(`Comprados (${purchasedItems.length})`, 20, y);
      y += 8;

      doc.setFontSize(11);
      purchasedItems.forEach(i => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`x   ${pdfSafe(i.name)}  (${i.quantity})`, 25, y);
        y += 7;
      });
    }

    // Footer
    y = Math.max(y + 10, 260);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Shopping List - Gerado automaticamente", pageWidth / 2, y, { align: "center" });

    doc.save(`${listName.replace(/\s+/g, "_")}.pdf`);
    setOpen(false);
  };

  return (
    <div className="export-menu" ref={ref}>
      <button className="header-action-btn" onClick={() => setOpen(!open)} aria-label="Partilhar e exportar" title="Partilhar e exportar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
      </button>
      {open && (
        <div className="export-dropdown">
          {navigator.share && (
            <button className="export-option" onClick={handleShare}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Partilhar...
            </button>
          )}
          <button className="export-option" onClick={handleCopy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copiar lista
          </button>
          <button className="export-option" onClick={handlePDF}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Exportar PDF
          </button>
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

// ===== Toolbar (search + sort only) =====
function Toolbar({ searchQuery, setSearchQuery, sortKey, setSortKey }) {
  return (
    <div className="toolbar">
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <SortBar value={sortKey} onChange={setSortKey} />
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
export default function App({ onLogout }) {
  const { user } = useAuth();
  const {
    lists, activeListId, setActiveListId,
    items, history, stats,
    loading, error, setError, toast,
    createList, renameList, deleteList,
    addItem, toggleItem, deleteItem, reAddFromHistory, reloadAll,
  } = useShoppingList();

  const [isDark, toggleDark] = useDarkMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("default");
  const [showHistory, setShowHistory] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const listDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (listDropdownRef.current && !listDropdownRef.current.contains(e.target)) {
        setShowListDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Multi-device realtime sync via Supabase
  const { syncConnected, lastSyncAt } = useRealtimeSync(activeListId, () => {
    reloadAll();
  });

  // Share list handler
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareRole, setShareRole] = useState('editor');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');

  const handleShareList = async () => {
    setShowShareModal(true);
    setShareLink('');
    setShareError('');
    setShareLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShareError('Precisas de estar logado');
        setShareLoading(false);
        return;
      }

      const res = await fetch(`/api/lists/${activeListId}/invite-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ role: shareRole })
      });

      const data = await res.json();

      if (!res.ok) {
        setShareError(data.error || 'Erro ao gerar link');
      } else {
        setShareLink(data.inviteLink);
      }
    } catch (e) {
      setShareError('Erro ao gerar link');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      showToast('Link copiado!');
    } catch {
      // Fallback: select the input
      navigator.clipboard.writeText(shareLink).catch(() => {});
    }
  };

  // List management handlers
  const handleCreateList = async () => {
    const name = prompt("Nome da nova lista:");
    if (!name || !name.trim()) return;
    try {
      const newList = await createList(name.trim());
      setActiveListId(newList.id);
      setShowListMenu(false);
    } catch (e) { setError(e.message); }
  };

  const handleRenameList = async (id) => {
    const list = lists.find(l => l.id === id);
    const newName = prompt("Renomear lista:", list?.name || "");
    if (!newName || !newName.trim()) return;
    try {
      await renameList(id, newName.trim());
      setEditingListName(null);
    } catch (e) { setError(e.message); }
  };

  const handleDeleteList = async (id) => {
    const list = lists.find(l => l.id === id);
    if (!confirm(`Apagar a lista "${list?.name}" e todos os seus itens?`)) return;
    try {
      await deleteList(id);
      setShowListDropdown(false);
      // If we deleted the active list, switch to another one
      if (id === activeListId) {
        const remaining = lists.filter(l => l.id !== id);
        if (remaining.length > 0) {
          setActiveListId(remaining[0].id);
        }
      }
    } catch (e) { setError(e.message); }
  };

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
          <div className="header-right">
            {user && (
              <button className="header-action-btn" onClick={onLogout} title="Sair" aria-label="Sair">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            )}
            <span className="sync-indicator sync-disconnected" title="A conectar…">🟠</span>
            <button className="dark-toggle" onClick={toggleDark}>{isDark ? "☀️" : "🌙"}</button>
          </div>
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
          {/* List Dropdown */}
          <div className="list-dropdown" ref={listDropdownRef}>
            <button className="list-dropdown-trigger" onClick={() => setShowListDropdown(!showListDropdown)} title="Selecionar lista">
              <span className="list-dropdown-name">{activeList?.name || "Selecionar lista"}</span>
              <span className="list-dropdown-arrow">▾</span>
            </button>
            {showListDropdown && (
              <div className="list-dropdown-menu">
                <div className="list-dropdown-items">
                  {lists.map(list => (
                    <div key={list.id} className={`list-dropdown-item ${list.id === activeListId ? "active" : ""}`}>
                      <span className="list-dropdown-item-name" onClick={() => { setActiveListId(list.id); setShowListDropdown(false); }}>
                        {list.id === activeListId ? "● " : "○ "}{list.name}
                      </span>
                      <div className="list-dropdown-item-actions">
                        <button className="list-dropdown-action" onClick={() => { setShowListDropdown(false); handleRenameList(list.id); }} title="Renomear">✏️</button>
                        {lists.length > 1 && (
                          <button className="list-dropdown-action delete" onClick={() => { setShowListDropdown(false); handleDeleteList(list.id); }} title="Apagar">🗑️</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="list-dropdown-create" onClick={() => { setShowListDropdown(false); handleCreateList(); }}>
                  ➕ Nova lista
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <span className={`sync-indicator ${syncConnected ? "sync-connected" : "sync-disconnected"}`} title={syncConnected ? "Sincronização em tempo real ativa" : "Sem conexão em tempo real"}>
            {syncConnected ? "🟢" : "🟠"}
          </span>
          <button className="header-action-btn" onClick={handleShareList} title="Partilhar lista" aria-label="Partilhar lista">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          <button className="header-action-btn" onClick={() => setShowHistory(true)} title="Histórico" aria-label="Histórico">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
              <path d="M12 7v5l4 2"/>
            </svg>
          </button>
          <ExportMenu items={allItems} lists={lists} activeListId={activeListId} />
          {user && (
            <button className="header-action-btn" onClick={onLogout} title="Sair" aria-label="Sair">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          )}
          <button className="dark-toggle" onClick={toggleDark} title="Alternar tema" aria-label="Alternar tema">
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <Toast message={toast} />

      <AddItemForm onAdd={addItem} />

      <Toolbar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        sortKey={sortKey} setSortKey={setSortKey}
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

      {showShareModal && (
        <div className="history-overlay" onClick={() => setShowShareModal(false)}>
          <div className="history-panel share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-header">
              <h2>📨 Partilhar Lista</h2>
              <button className="history-close" onClick={() => setShowShareModal(false)}>✕</button>
            </div>
            <div className="share-content">
              <p>Convidas alguém para colaborar na lista <strong>{activeList?.name}</strong>.</p>

              <div className="share-role-select">
                <label>Permissão:</label>
                <div className="share-role-options">
                  <button
                    className={`share-role-btn ${shareRole === 'editor' ? 'active' : ''}`}
                    onClick={() => { setShareRole('editor'); setShareLink(''); }}
                  >
                    ✏️ Editor
                    <small>Pode adicionar e remover itens</small>
                  </button>
                  <button
                    className={`share-role-btn ${shareRole === 'viewer' ? 'active' : ''}`}
                    onClick={() => { setShareRole('viewer'); setShareLink(''); }}
                  >
                    👁️ Visualizador
                    <small>Só pode ver a lista</small>
                  </button>
                </div>
              </div>

              {shareLoading && <div className="loading small"><div className="spinner" /></div>}

              {shareError && <p className="share-error">⚠️ {shareError}</p>}

              {shareLink && (
                <div className="share-link-result">
                  <p>Partilha este link com quem quiseres:</p>
                  <div className="share-link-row">
                    <input type="text" value={shareLink} readOnly onClick={(e) => e.target.select()} />
                    <button className="share-copy-btn" onClick={handleCopyShareLink}>📋 Copiar</button>
                  </div>
                  <p className="share-expiry">⏰ Este link expira em 7 dias</p>
                </div>
              )}

              {!shareLink && !shareLoading && !shareError && (
                <p className="share-hint">Seleciona uma permissão acima para gerar um link.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <HistoryPanel history={history} onReAdd={(name, qty) => { reAddFromHistory(name, Math.round(qty) || 1); }} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
