import {
  emailLinkError,
  isEmailNotConfirmed,
  safeNextPath,
} from '@/lib/auth/email-links';

describe('safeNextPath', () => {
  it.each([
    ['/onboarding', '/onboarding'],
    ['/dashboard/student/classes', '/dashboard/student/classes'],
    ['https://evil.example/dashboard/', null],
    ['//evil.example/dashboard/', null],
    ['/\\evil.example', null], // "/\host" is another site too
    ['dashboard', null],
    ['/x\nSet-Cookie', null],
    [null, null],
  ])('%j -> %j', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});

describe('emailLinkError', () => {
  it('only shows fixed messages', () => {
    expect(emailLinkError('link_expired').offerResend).toBe(true);
    expect(emailLinkError('Call 0800 to verify').title).toBe(
      'Sorry, something went wrong'
    );
  });
});

describe('isEmailNotConfirmed', () => {
  it('spots the Supabase error by code or message', () => {
    expect(isEmailNotConfirmed({ code: 'email_not_confirmed' })).toBe(true);
    expect(isEmailNotConfirmed(new Error('Email not confirmed'))).toBe(true);
    expect(
      isEmailNotConfirmed({ code: 'invalid_credentials', message: 'x' })
    ).toBe(false);
    expect(isEmailNotConfirmed(null)).toBe(false);
  });
});
