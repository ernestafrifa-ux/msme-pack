// Centralizes every call to the backend so each part of the app doesn't
// repeat fetch boilerplate, token handling, or error parsing. Throws a
// plain Error with a human-readable message on failure, so callers can
// catch it and show the message directly in a Toast.

const TOKEN_KEY = "santasi_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Separate from request() because this endpoint returns a binary file, not
// JSON — it needs to read the response as a Blob and trigger a real browser
// download, while still attaching the auth header the same way every other
// call does (a plain <a href> link can't carry that header).
async function downloadBackup() {
  const token = getToken();
  const res = await fetch("/api/admin/backup", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `Backup failed (${res.status}).`;
    try { const data = await res.json(); if (data?.error) message = data.error; } catch { /* not JSON */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `santasi-sda-backup-${new Date().toISOString().slice(0, 10)}.db`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const api = {
  // Auth
  login: (username, password) => request("POST", "/api/auth/login", { username, password }),
  changePassword: (currentPassword, newPassword) => request("POST", "/api/auth/change-password", { currentPassword, newPassword }),
  me: () => request("GET", "/api/auth/me"),

  // Categories
  getCategories: () => request("GET", "/api/categories"),
  createCategory: (data) => request("POST", "/api/categories", data),
  updateCategory: (id, data) => request("PUT", `/api/categories/${id}`, data),
  deleteCategory: (id) => request("DELETE", `/api/categories/${id}`),

  // Accounts
  getAccounts: () => request("GET", "/api/accounts"),
  createAccount: (data) => request("POST", "/api/accounts", data),
  updateAccount: (id, data) => request("PUT", `/api/accounts/${id}`, data),
  deleteAccount: (id) => request("DELETE", `/api/accounts/${id}`),

  // Members
  getMembers: () => request("GET", "/api/members"),
  createMember: (data) => request("POST", "/api/members", data),
  updateMember: (id, data) => request("PUT", `/api/members/${id}`, data),
  deleteMember: (id) => request("DELETE", `/api/members/${id}`),

  // Slips (transactions)
  getSlips: () => request("GET", "/api/slips"),
  createSlip: (data) => request("POST", "/api/slips", data),
  updateSlip: (id, data) => request("PUT", `/api/slips/${id}`, data),
  deleteSlip: (id) => request("DELETE", `/api/slips/${id}`),

  // Budget / prior year
  getBudget: (year) => request("GET", `/api/budget/${year}`),
  setBudgetFigure: (year, catId, amount) => request("PUT", `/api/budget/${year}/${catId}`, { amount }),
  getPriorYear: (year) => request("GET", `/api/prior-year/${year}`),

  // Disclosures
  getDisclosures: (year) => request("GET", `/api/disclosures${year ? `?year=${year}` : ""}`),
  createDisclosure: (data) => request("POST", "/api/disclosures", data),
  updateDisclosure: (id, data) => request("PUT", `/api/disclosures/${id}`, data),
  deleteDisclosure: (id) => request("DELETE", `/api/disclosures/${id}`),

  // Admin: users
  getUsers: () => request("GET", "/api/admin/users"),
  createUser: (data) => request("POST", "/api/admin/users", data),
  updateUser: (id, data) => request("PUT", `/api/admin/users/${id}`, data),
  resetUserPassword: (id) => request("POST", `/api/admin/users/${id}/reset-password`),
  deleteUser: (id) => request("DELETE", `/api/admin/users/${id}`),

  // Admin: roles
  getRoles: () => request("GET", "/api/admin/roles"),
  createRole: (data) => request("POST", "/api/admin/roles", data),
  updateRole: (id, data) => request("PUT", `/api/admin/roles/${id}`, data),
  deleteRole: (id) => request("DELETE", `/api/admin/roles/${id}`),

  // Admin: backup
  downloadBackup,
};
