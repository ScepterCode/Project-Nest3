// Helpers for the links in sign-up and password-reset emails.

/**
 * A `next` path from a link, kept only if it stays on this site ("/..." but
 * not "//host" or "/\host", which browsers treat as another site).
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  return next;
}

/** Why a link failed, as a fixed code for /auth/error (never raw text). */
export type EmailLinkError = 'link_expired' | 'link_incomplete' | 'unknown';

export const EMAIL_LINK_ERRORS: Record<
  EmailLinkError,
  { title: string; message: string; offerResend: boolean }
> = {
  link_expired: {
    title: 'This link has expired or was already used',
    message:
      'Confirmation links work once and for a limited time. If you already confirmed, just sign in. Otherwise send yourself a new link below.',
    offerResend: true,
  },
  link_incomplete: {
    title: 'This link is incomplete',
    message:
      'Part of the link may have been cut off. Open it straight from the email, or send yourself a new one below.',
    offerResend: true,
  },
  unknown: {
    title: 'Sorry, something went wrong',
    message: 'Please try again, or sign in if your account is already set up.',
    offerResend: false,
  },
};

export function emailLinkError(code: string | null | undefined) {
  return EMAIL_LINK_ERRORS[code as EmailLinkError] ?? EMAIL_LINK_ERRORS.unknown;
}

/** Supabase's "you haven't confirmed your email" sign-in error. */
export function isEmailNotConfirmed(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === 'email_not_confirmed' ||
    (typeof message === 'string' && /email not confirmed/i.test(message))
  );
}

/** Key for remembering the sign-up email in this tab (not in the URL). */
export const SIGNUP_EMAIL_KEY = 'pn_signup_email';
