import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PlatformAdminCheck =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Confirms the caller is a platform admin (users.role = 'system_admin') who
 * signed in with two-factor authentication. Mirrors
 * app_private.require_platform_admin() for the few actions that need
 * Supabase's admin API and so can't be database functions.
 */
export async function requirePlatformAdmin(
  supabase: SupabaseClient
): Promise<PlatformAdminCheck> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'system_admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Platform admins only' },
        { status: 403 }
      ),
    };
  }

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Enter your two-factor code first' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id };
}
