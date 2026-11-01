/** A spreadsheet runs a cell that starts with one of these, so it is kept as text. */
const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** With a byte order mark, or Excel shows Arabic headers as gibberish. */
export function toCsv(rows: (string | number | null)[][]): string {
  return `﻿${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadCsv(name: string, rows: (string | number | null)[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N}-]+/gu, '')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
