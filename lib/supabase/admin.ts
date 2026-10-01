import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client: bypasses row-level security and can manage auth users.
 *
 * Server-only. Use it only after the caller has been authenticated and
 * authorized with the normal session client, and only for the specific
 * writes RLS can't express (e.g. creating login accounts).
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() must never run in the browser');
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
