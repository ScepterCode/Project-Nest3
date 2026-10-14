// CSV export for tables shown in the app.

type Cell = string | number | boolean | null | undefined;

/** One CSV field. Quotes when needed, and neutralises spreadsheet formulas. */
export function csvField(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // A cell starting with = + - @ (or tab/CR) runs as a formula in Excel and
  // Sheets; prefix it so user-entered names and comments stay plain text.
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map(row => row.map(csvField).join(',')).join('\r\n');
}

/** Starts a download of `rows` as a CSV file (UTF-8 with BOM for Excel). */
export function downloadCsv(fileName: string, rows: Cell[][]) {
  const blob = new Blob(['﻿', toCsv(rows)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "2D Animation – Week 3" -> "2d-animation-week-3" for file names. */
export function slug(text: string) {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'export'
  );
}
