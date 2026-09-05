/**
 * Thin API client.
 *
 * The access token is short-lived and kept in memory; only the refresh
 * token is persisted. That way an XSS-readable store never holds a
 * credential that is immediately useful against the API.
 */
const BASE = import.meta.env.VITE_API_URL ?? '';
const REFRESH_KEY = 'sessionhub.refresh';

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const tokens = {
  get access() { return accessToken; },
  set(access: string, refresh?: string) {
    accessToken = access;
    if (refresh) {
      try { localStorage.setItem(REFRESH_KEY, refresh); } catch { /* private mode */ }
    }
  },
  get refresh() {
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  },
  clear() {
    accessToken = null;
    try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokens.refresh;
  if (!refresh) return null;

  // Collapse concurrent 401s into a single refresh call.
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
      .then(async (r) => {
        if (!r.ok) { tokens.clear(); return null; }
        const data = await r.json();
        tokens.set(data.accessToken, data.refreshToken);
        return data.accessToken as string;
      })
      .catch(() => { tokens.clear(); return null; })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    const fresh = await refreshAccessToken();
    if (fresh) return request<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new ApiError(res.status, message ?? 'Something went wrong', body.code);
  }
  return body as T;
}

export const api = {
  get:   <T,>(p: string) => request<T>(p),
  post:  <T,>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del:   <T,>(p: string) => request<T>(p, { method: 'DELETE' }),
};
