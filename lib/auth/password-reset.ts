import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Password-reset emails, sent from the server.
//
// Supabase's browser client uses the PKCE flow: the link in the email only
// works in the browser that asked for it (it holds a secret "code
// verifier"). Opened on a phone, in the email app's own browser or after an
// admin asked for it, the link signs nobody in, and saving the new password
// failed with "Auth session missing!". Asked for from here with the implicit
// flow, the link carries its own session (in the URL fragment), so it works
// on any device; /auth/update-password picks it up.
//
// (If the "Reset password" email template in Supabase points at
// /auth/confirm?token_hash=… — see docs/accounts-and-codes.md — that link
// works on any device too.)

export async function sendPasswordReset(email: string, origin: string) {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update-password`,
  });
}
