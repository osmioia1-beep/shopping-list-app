const API_BASE = "/api";

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Lists
export const getLists = () => fetchJSON(`${API_BASE}/lists`);
export const createList = (name) =>
  fetchJSON(`${API_BASE}/lists`, { method: "POST", body: JSON.stringify({ name }) });
export const updateList = (id, name) =>
  fetchJSON(`${API_BASE}/lists/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
export const deleteList = (id) =>
  fetchJSON(`${API_BASE}/lists/${id}`, { method: "DELETE" });

// Items
export const getItems = (listId) =>
  fetchJSON(`${API_BASE}/lists/${listId}/items`);
export const addItem = (listId, name, quantity) =>
  fetchJSON(`${API_BASE}/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ name, quantity }),
  });
export const updateItem = (listId, itemId, data) =>
  fetchJSON(`${API_BASE}/lists/${listId}/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const toggleItem = (listId, itemId) =>
  fetchJSON(`${API_BASE}/lists/${listId}/items/${itemId}/toggle`, {
    method: "PATCH",
  });
export const deleteItem = (listId, itemId) =>
  fetchJSON(`${API_BASE}/lists/${listId}/items/${itemId}`, {
    method: "DELETE",
  });
