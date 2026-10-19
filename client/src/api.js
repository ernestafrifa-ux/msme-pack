// Thin wrapper around fetch for the MSME Pack API.
const TOKEN_KEY = 'msme.token';

export class ApiError extends Error {
  constructor(status, message, fields, code) {
    super(message);
    this.status = status;
    this.fields = fields || {};
    this.code = code;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the session just won't survive a reload */
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api' + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...qs].length) url += '?' + qs;
  }
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'No connection. Check your data or Wi‑Fi and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error || 'Something went wrong. Please try again.', data.fields, data.code);
  }
  return data;
}

// A UUID for idempotent saves. crypto.randomUUID needs HTTPS or localhost,
// so fall back for plain-HTTP test servers on a local network.
export function newClientRef() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Sends a file (e.g. a logo) as the raw request body.
export async function uploadBlob(path, blob) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${getToken()}`, 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your data or Wi‑Fi and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || (res.status === 413 ? 'That picture is too big.' : 'Something went wrong. Please try again.'), data.fields, data.code);
  return data;
}
