/**
 * CSV building and download. No dependencies — the format is small
 * enough that a library would cost more than these forty lines.
 */
export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  const s = String(cell);
  // RFC 4180: quote anything holding a comma, quote or line break;
  // double any quotes inside.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Builds the CSV in memory and hands it to the browser as a download. */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  // The BOM makes Excel read the file as UTF-8 instead of guessing.
  const blob = new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
