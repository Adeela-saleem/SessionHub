/* ============================================================
   Text going into the PDF.
   The sheets use the PDF standard Times faces, which only carry
   the WinAnsi (Latin-1) glyphs. Anything else — arrows, Greek,
   maths symbols the model likes — would print as a blank, so it
   is rewritten into plain characters here instead.
   ============================================================ */

const REPLACEMENTS: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '↑': '^', '↓': 'v',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '−': '-', '∞': 'infinity',
  '∑': 'sum', '√': 'sqrt', '∈': 'in', '∪': 'union', '∩': 'intersection',
  '∧': 'and', '∨': 'or', '¬': 'not', '∀': 'for all', '∃': 'there exists',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'θ': 'theta',
  'λ': 'lambda', 'μ': 'mu', 'π': 'pi', 'σ': 'sigma', 'τ': 'tau', 'φ': 'phi', 'ω': 'omega',
  'Δ': 'Delta', 'Σ': 'Sigma', 'Ω': 'Omega',
  '✓': 'yes', '✗': 'no', '★': '*', '☐': '[ ]', '☑': '[x]',
  ' ': ' ', ' ': ' ', '​': '',
  '‐': '-', '‑': '-', '‒': '-', '′': "'", '″': '"',
};

/** Rewrites a string so every character has a glyph in the standard Times faces. */
export function pdfSafe(input: unknown): string {
  const s = String(input ?? '');
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code === 0x0a || (code >= 0x20 && code <= 0xff)) { out += ch; continue; }
    // Curly quotes, dashes, ellipsis and bullet are in WinAnsi.
    if ('‘’“”–—…•'.includes(ch)) { out += ch; continue; }
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    // Strip combining marks and anything else rather than print a blank box.
    if (code >= 0x300 && code <= 0x36f) continue;
    out += '?';
  }
  return out;
}

/** "1", "2", "3" → "1st", "2nd", "3rd"; already-ordinal input is returned as is. */
export function ordinal(v: string): string {
  const s = v.trim();
  if (!/^\d+$/.test(s)) return s;
  const n = Number(s);
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th'
    : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** A file name the OS will accept, from a free-text title. */
export function pdfFileName(...parts: (string | undefined)[]): string {
  const base = parts.filter(Boolean).join(' ')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'paper'}.pdf`;
}
