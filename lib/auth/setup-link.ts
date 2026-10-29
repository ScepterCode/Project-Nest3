import type { SupabaseClient } from '@supabase/supabase-js';

// Set-up links let a school admin hand a new account to its owner without
// email: a one-time password-reset token, built into a link to our own
// /auth/confirm (works on any device), which the admin copies and sends by
// WhatsApp, SMS, etc. Generating a link never sends an email. A new link
// replaces the previous one.

/** The link for a token hash from auth.admin.generateLink. */
export function setupLinkUrl(origin: string, hashedToken: string) {
  const url = new URL('/auth/confirm', origin);
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', 'recovery');
  return url.toString();
}

/** Creates a set-up link for an account. Server-only (service-role client). */
export async function createSetupLink(
  admin: SupabaseClient,
  email: string,
  origin: string
): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    throw new Error(error?.message || 'Could not create a set-up link');
  }
  return setupLinkUrl(origin, token);
}

/** A ready-to-send message for the admin to paste into WhatsApp or SMS. */
export function setupMessage(firstName: string | null, link: string) {
  return `Hello${firstName ? ` ${firstName}` : ''}, your ProjectNest account is ready. Open this link to choose your password and get started (it works once and expires soon): ${link}`;
}
