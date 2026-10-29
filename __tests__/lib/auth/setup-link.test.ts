import { setupLinkUrl, setupMessage } from '@/lib/auth/setup-link';

it('points at our own confirm page with a recovery token', () => {
  const url = new URL(setupLinkUrl('https://app.example', 'abc123'));
  expect(url.origin + url.pathname).toBe('https://app.example/auth/confirm');
  expect(url.searchParams.get('token_hash')).toBe('abc123');
  expect(url.searchParams.get('type')).toBe('recovery');
});

it('writes a message ready to paste', () => {
  expect(setupMessage('Ada', 'https://x/l')).toMatch(
    /^Hello Ada, your ProjectNest account is ready\..*https:\/\/x\/l$/
  );
  expect(setupMessage(null, 'https://x/l')).toMatch(/^Hello, /);
});
