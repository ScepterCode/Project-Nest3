import { csvField, slug, toCsv } from '@/lib/csv';

describe('csvField', () => {
  it.each([
    ['plain', 'plain'],
    ['has, comma', '"has, comma"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    [42, '42'],
    [null, ''],
    [undefined, ''],
  ])('%p -> %p', (value, expected) => {
    expect(csvField(value as string)).toBe(expected);
  });

  it.each(['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)'])(
    'neutralises formula-like text %p',
    value => {
      expect(csvField(value).replace(/^"/, '')).toMatch(/^'/);
    }
  );

  it('leaves negative numbers alone', () => {
    expect(csvField(-5)).toBe('-5');
  });
});

it('joins rows with CRLF', () => {
  expect(
    toCsv([
      ['a', 'b'],
      [1, 2],
    ])
  ).toBe('a,b\r\n1,2');
});

it('makes file-name slugs', () => {
  expect(slug('2D Animation – Week 3!')).toBe('2d-animation-week-3');
  expect(slug('!!!')).toBe('export');
});
