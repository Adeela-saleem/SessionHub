export type Theme = 'light' | 'dark';
const KEY = 'sessionhub.theme';

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }            // private mode
}

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

/** Clears a stored choice so the OS preference decides again. */
export function clearTheme() {
  document.documentElement.removeAttribute('data-theme');
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/**
 * Restores a saved choice at boot. Without this the toggle wrote to
 * localStorage but nothing read it back, so the preference was lost on
 * every reload.
 */
export function initTheme() {
  const saved = storedTheme();
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  if (storedRail() === 'light') document.documentElement.setAttribute('data-rail', 'light');
  const sidebar = storedSidebar();
  if (sidebar) document.documentElement.setAttribute('data-sidebar', sidebar);
}

/* ── Sidebar width ───────────────────────────────────────
   No stored choice means automatic: full rail on a wide
   window, icon rail under 1180px. An explicit choice holds
   at every width above the phone breakpoint. Applied before
   first paint by index.html like the theme. */
export type Sidebar = 'expanded' | 'collapsed';
const SIDEBAR_KEY = 'sessionhub.sidebar';

export function storedSidebar(): Sidebar | null {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY);
    return v === 'expanded' || v === 'collapsed' ? v : null;
  } catch { return null; }
}

export function applySidebar(state: Sidebar) {
  document.documentElement.setAttribute('data-sidebar', state);
  try { localStorage.setItem(SIDEBAR_KEY, state); } catch { /* ignore */ }
}

/* ── Navigation rail finish ──────────────────────────────
   `navy` is the brand foundation; `light` is a quiet tonal
   panel. Stored beside the theme and applied before first
   paint by index.html. */
export type Rail = 'navy' | 'light';
const RAIL_KEY = 'sessionhub.rail';

export function storedRail(): Rail {
  try {
    const v = localStorage.getItem(RAIL_KEY);
    return v === 'light' ? 'light' : 'navy';
  } catch { return 'navy'; }
}

export function applyRail(rail: Rail) {
  if (rail === 'light') document.documentElement.setAttribute('data-rail', 'light');
  else document.documentElement.removeAttribute('data-rail');
  try { localStorage.setItem(RAIL_KEY, rail); } catch { /* ignore */ }
}
