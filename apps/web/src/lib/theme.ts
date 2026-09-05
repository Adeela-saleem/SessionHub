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

/**
 * Restores a saved choice at boot. Without this the toggle wrote to
 * localStorage but nothing read it back, so the preference was lost on
 * every reload.
 */
export function initTheme() {
  const saved = storedTheme();
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}
