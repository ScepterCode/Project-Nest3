// CSV parsing and validation for bulk user import. Shared by the upload page
// (preview) and the API (which re-validates every row it receives).

export const IMPORT_ROLES = ['student', 'teacher'] as const;
export type ImportRole = (typeof IMPORT_ROLES)[number];

export const IMPORT_COLUMNS = [
  'email',
  'first_name',
  'last_name',
  'role',
] as const;

/** Rows per request: keeps each API call well under the 30s function limit. */
export const IMPORT_BATCH_SIZE = 50;
/** Upper bound for one upload. Larger rosters can be split into files. */
export const IMPORT_MAX_ROWS = 5000;

export interface ImportRow {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  email: string;
  first_name: string;
  last_name: string;
  role: ImportRole;
}

export interface ImportRowError {
  line: number;
  email: string;
  message: string;
}

export const IMPORT_TEMPLATE_CSV =
  'email,first_name,last_name,role\n' +
  'ada.lovelace@example.edu,Ada,Lovelace,student\n' +
  'alan.turing@example.edu,Alan,Turing,teacher\n';

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // Excel BOM

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates one row. Returns the cleaned row or an error message. */
export function validateImportRow(
  raw: {
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    role?: unknown;
  },
  line: number
): { row: ImportRow } | { error: ImportRowError } {
  const email = String(raw.email ?? '')
    .trim()
    .toLowerCase();
  const first_name = String(raw.first_name ?? '').trim();
  const last_name = String(raw.last_name ?? '').trim();
  const role =
    String(raw.role ?? 'student')
      .trim()
      .toLowerCase() || 'student';

  const fail = (message: string) => ({ error: { line, email, message } });
  if (!EMAIL_RE.test(email) || email.length > 254)
    return fail('Invalid email address');
  if (!first_name) return fail('First name is required');
  if (!last_name) return fail('Last name is required');
  if (first_name.length > 100 || last_name.length > 100)
    return fail('Name is too long');
  if (!(IMPORT_ROLES as readonly string[]).includes(role)) {
    return fail(`Role must be ${IMPORT_ROLES.join(' or ')}`);
  }
  return {
    row: { line, email, first_name, last_name, role: role as ImportRole },
  };
}

/** Parses a whole file into valid rows and per-line errors (incl. duplicates). */
export function parseImportFile(text: string): {
  rows: ImportRow[];
  errors: ImportRowError[];
  fatal?: string;
} {
  const table = parseCsv(text);
  if (table.length < 2)
    return { rows: [], errors: [], fatal: 'The file has no data rows' };

  const header = table[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = IMPORT_COLUMNS.filter(
    c => c !== 'role' && !header.includes(c)
  );
  if (missing.length) {
    return {
      rows: [],
      errors: [],
      fatal: `Missing column(s): ${missing.join(', ')}`,
    };
  }
  if (table.length - 1 > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      errors: [],
      fatal: `Too many rows (${table.length - 1}). Split the file into files of up to ${IMPORT_MAX_ROWS}.`,
    };
  }

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < table.length; i++) {
    const record = Object.fromEntries(
      header.map((h, j) => [h, table[i][j] ?? ''])
    );
    const result = validateImportRow(record, i + 1);
    if ('error' in result) {
      errors.push(result.error);
    } else if (seen.has(result.row.email)) {
      errors.push({
        line: i + 1,
        email: result.row.email,
        message: 'Duplicate email in this file',
      });
    } else {
      seen.add(result.row.email);
      rows.push(result.row);
    }
  }
  return { rows, errors };
}
