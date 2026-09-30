import {
  parseCsv,
  parseImportFile,
  validateImportRow,
  IMPORT_TEMPLATE_CSV,
  IMPORT_MAX_ROWS,
} from '@/lib/bulk/csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas in fields, CRLF and a BOM', () => {
    const text = '﻿a,b\r\n"Smith, Jr.","say ""hi"""\r\n\r\nx,y';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['Smith, Jr.', 'say "hi"'],
      ['x', 'y'],
    ]);
  });

  it('keeps a trailing empty field', () => {
    expect(parseCsv('a,b,\n')).toEqual([['a', 'b', '']]);
  });
});

describe('validateImportRow', () => {
  it('normalizes email and role and defaults role to student', () => {
    const result = validateImportRow(
      {
        email: ' Ada@Example.EDU ',
        first_name: 'Ada',
        last_name: 'Lovelace',
        role: '',
      },
      2
    );
    expect(result).toEqual({
      row: {
        line: 2,
        email: 'ada@example.edu',
        first_name: 'Ada',
        last_name: 'Lovelace',
        role: 'student',
      },
    });
  });

  it.each([
    [
      { email: 'not-an-email', first_name: 'A', last_name: 'B' },
      'Invalid email address',
    ],
    [
      { email: 'a@b.co', first_name: '', last_name: 'B' },
      'First name is required',
    ],
    [
      { email: 'a@b.co', first_name: 'A', last_name: ' ' },
      'Last name is required',
    ],
    [
      {
        email: 'a@b.co',
        first_name: 'A',
        last_name: 'B',
        role: 'institution_admin',
      },
      'Role must be student or teacher',
    ],
    [
      {
        email: 'a@b.co',
        first_name: 'A',
        last_name: 'B',
        role: 'system_admin',
      },
      'Role must be student or teacher',
    ],
  ])('rejects %o', (raw, message) => {
    expect(validateImportRow(raw, 3)).toEqual({
      error: { line: 3, email: String(raw.email).toLowerCase(), message },
    });
  });
});

describe('parseImportFile', () => {
  it('accepts the downloadable template', () => {
    const { rows, errors, fatal } = parseImportFile(IMPORT_TEMPLATE_CSV);
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([]);
    expect(rows.map(r => r.role)).toEqual(['student', 'teacher']);
  });

  it('matches headers case-insensitively and allows a missing role column', () => {
    const { rows, fatal } = parseImportFile(
      'Email,First Name,Last Name\na@b.co,A,B\n'
    );
    expect(fatal).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('student');
  });

  it('reports missing required columns', () => {
    expect(parseImportFile('email,first_name\na@b.co,A\n').fatal).toBe(
      'Missing column(s): last_name'
    );
  });

  it('flags duplicate emails with their line numbers', () => {
    const { rows, errors } = parseImportFile(
      'email,first_name,last_name\na@b.co,A,B\nA@B.co,C,D\n'
    );
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      { line: 3, email: 'a@b.co', message: 'Duplicate email in this file' },
    ]);
  });

  it('rejects files over the row limit', () => {
    const body = Array.from(
      { length: IMPORT_MAX_ROWS + 1 },
      (_, i) => `u${i}@b.co,A,B`
    ).join('\n');
    expect(
      parseImportFile(`email,first_name,last_name\n${body}`).fatal
    ).toMatch(/Too many rows/);
  });

  it('reports an empty file', () => {
    expect(parseImportFile('email,first_name,last_name\n').fatal).toBe(
      'The file has no data rows'
    );
  });
});
