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

/**
 * Raised when the request never reached the server — the API is down,
 * the connection dropped, or the browser blocked it. Distinct from
 * ApiError, which means the server answered and said no.
 */
export class NetworkError extends Error {
  constructor(public url: string, cause?: unknown) {
    super('Could not reach the server. Check that the API is running, then try again.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const url = `${BASE}/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (cause) {
    // fetch only rejects for transport failures; a 4xx/5xx resolves.
    // Saying so beats a generic "something went wrong".
    throw new NetworkError(url, cause);
  }

  if (res.status === 401 && retry) {
    const fresh = await refreshAccessToken();
    if (fresh) return request<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw rateLimited();
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new ApiError(
      res.status,
      message ?? `The server returned ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`,
      body.code,
    );
  }
  return body as T;
}

/**
 * A 429 is the server protecting itself, not the connection failing.
 * Name it honestly so no screen blames the network for a throttle.
 */
function rateLimited(): ApiError {
  return new ApiError(
    429,
    'The server is briefly rate-limiting requests. It usually recovers within a minute.',
    'RATE_LIMITED',
  );
}

export const api = {
  get:   <T,>(p: string) => request<T>(p),
  post:  <T,>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del:   <T,>(p: string) => request<T>(p, { method: 'DELETE' }),
};

/**
 * Multipart upload. Content-Type is left to the browser so the
 * boundary is set correctly; auth + refresh behave like `request`.
 */
export async function apiUpload<T>(path: string, file: File, retry = true): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const url = `${BASE}/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: form, headers });
  } catch (cause) {
    throw new NetworkError(url, cause);
  }
  if (res.status === 401 && retry) {
    const fresh = await refreshAccessToken();
    if (fresh) return apiUpload<T>(path, file, false);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw rateLimited();
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new ApiError(res.status, message ?? `Upload failed (${res.status}).`, body.code);
  }
  return body as T;
}

/**
 * Authenticated download: files are served through a permission check,
 * not a public URL, so a plain <a href> cannot carry the token. Fetch
 * the bytes and hand them to the browser as a blob.
 */
export async function apiDownload(fileId: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const url = `${BASE}/api/files/${fileId}`;
  let res = await fetch(url, { headers }).catch((cause) => { throw new NetworkError(url, cause); });
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (!fresh) throw new ApiError(401, 'Your session has expired.');
    headers.set('Authorization', `Bearer ${fresh}`);
    res = await fetch(url, { headers });
  }
  if (res.status === 429) throw rateLimited();
  if (!res.ok) throw new ApiError(res.status, 'Could not download the file.');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(href);
}
