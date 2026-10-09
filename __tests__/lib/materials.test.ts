import {
  MAX_MATERIAL_BYTES,
  fileProblem,
  formatBytes,
  isVideoLink,
  materialPath,
  normalizeLink,
  safeFileName,
} from '@/lib/materials';

describe('normalizeLink', () => {
  it.each([
    ['https://example.com/notes', 'https://example.com/notes'],
    ['  youtu.be/abc  ', 'https://youtu.be/abc'],
    ['http://site.org', 'http://site.org/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLink(input)).toBe(expected);
  });

  it.each([
    '',
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://x.org',
    'localhost',
    'not a url',
  ])('rejects %p', input => {
    expect(normalizeLink(input)).toBeNull();
  });
});

describe('isVideoLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=1', true],
    ['https://youtu.be/1', true],
    ['https://m.youtube.com/watch?v=1', true],
    ['https://vimeo.com/123', true],
    ['https://www.loom.com/share/x', true],
    ['https://notyoutube.com/x', false],
    ['https://docs.google.com/document/d/1', false],
    [null, false],
  ])('%s → %s', (link, expected) => {
    expect(isVideoLink(link)).toBe(expected);
  });
});

describe('fileProblem', () => {
  it('accepts an allowed file within the limit', () => {
    expect(fileProblem({ size: 1000, type: 'application/pdf' })).toBeNull();
  });

  it('rejects files over 50 MB', () => {
    expect(
      fileProblem({ size: MAX_MATERIAL_BYTES + 1, type: 'application/pdf' })
    ).toMatch(/up to 50 MB/);
  });

  it.each([
    'text/html',
    'image/svg+xml',
    'application/javascript',
    'video/mp4',
    '',
  ])('rejects %p', type => {
    expect(fileProblem({ size: 10, type })).toMatch(/isn’t supported/);
  });
});

describe('file names and paths', () => {
  it('makes names storage-safe and keeps the extension', () => {
    expect(safeFileName('Week 1 — Notes (final).pdf')).toBe(
      'Week_1_Notes_final_.pdf'
    );
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd');
    expect(safeFileName('')).toBe('file');
  });

  it('puts files in the class folder', () => {
    expect(materialPath('class-1', 'a b.pdf', 'r1')).toBe('class-1/r1/a_b.pdf');
  });
});

describe('formatBytes', () => {
  it.each([
    [500, '500 B'],
    [2048, '2 KB'],
    [5 * 1024 * 1024, '5 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
  ])('%s → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
