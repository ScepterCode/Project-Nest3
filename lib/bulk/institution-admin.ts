import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type InstitutionAdminCheck =
  | { ok: true; userId: string; institutionId: string }
  | { ok: false; response: NextResponse };

/**
 * Confirms the signed-in user is an institution admin with an institution.
 * Reads the users table (never user_metadata, which users can edit).
 */
export async function requireInstitutionAdmin(
  supabase: SupabaseClient
): Promise<InstitutionAdminCheck> {
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
    .select('role, institution_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'institution_admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Only institution admins can do this' },
        { status: 403 }
      ),
    };
  }
  if (!profile.institution_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Your account is not linked to an institution yet' },
        { status: 409 }
      ),
    };
  }

  return { ok: true, userId: user.id, institutionId: profile.institution_id };
}
