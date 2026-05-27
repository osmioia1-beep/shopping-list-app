import { supabase } from "./supabase.js";

const API_BASE = "/api";

async function fetchJSON(url, options = {}) {
  // Get the current Supabase session to extract the JWT
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    headers,
    ...options,
  });

  // Handle non-JSON responses (e.g., error pages)
  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (!res.ok) {
    // The server returns JSON with an error field
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
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

// History
export const getHistory = (listId) =>
  fetchJSON(`${API_BASE}/lists/${listId}/history`);
export const addToHistory = (listId, name, quantity) =>
  fetchJSON(`${API_BASE}/lists/${listId}/history`, {
    method: "POST",
    body: JSON.stringify({ name, quantity }),
  });

// Stats
export const getStats = (listId) =>
  fetchJSON(`${API_BASE}/lists/${listId}/stats`);