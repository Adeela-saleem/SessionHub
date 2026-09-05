/* ============================================================
   Formatting helpers.
   Dates and numbers are rendered the same way everywhere, so a
   value never changes shape between two screens.
   ============================================================ */

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity],
];

/** "3 minutes ago" — falls back to a date beyond a year. */
export function relativeTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let delta = (date.getTime() - Date.now()) / 1000;

  for (const [unit, span] of RELATIVE_STEPS) {
    if (Math.abs(delta) < span) return rtf.format(Math.round(delta), unit);
    delta /= span;
  }
  return date.toLocaleDateString();
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Mon 25 Aug" — the compact stamp for session rows and history
    lists; pass { time: true } for "Mon 25 Aug · 13:05". */
export function formatDayDate(value: string | Date | null | undefined, opts?: { time?: boolean }) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return opts?.time
    ? `${day} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : day;
}

/** Compact counts for badges and dense tables. */
export function compact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function initialsOf(name?: string | null) {
  return (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}
