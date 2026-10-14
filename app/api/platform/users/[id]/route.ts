import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/platform/server';

// About 100 years: Supabase has no "forever", and the account can be enabled
// again at any time.
const DISABLED = '876000h';

type Action = 'disable' | 'enable' | 'reset_password';

/**
 * Platform support actions that need Supabase's admin API: disable or enable
 * an account, or email a password-reset link. Recorded in the platform
 * activity log.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requirePlatformAdmin(supabase);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let action: Action;
  try {
    ({ action } = (await request.json()) as { action: Action });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!['disable', 'enable', 'reset_password'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  if (id === auth.userId && action === 'disable') {
    return NextResponse.json(
      { error: "You can't disable your own account" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: target, error: lookupError } =
    await admin.auth.admin.getUserById(id);
  if (lookupError || !target.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', id)
    .single();
  if (profile?.role === 'system_admin' && action === 'disable') {
    return NextResponse.json(
      { error: 'Platform admins are changed in the SQL editor' },
      { status: 403 }
    );
  }

  if (action === 'reset_password') {
    if (!target.user.email) {
      return NextResponse.json(
        { error: 'This account has no email address' },
        { status: 400 }
      );
    }
    const origin = request.nextUrl.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(
      target.user.email,
      { redirectTo: `${origin}/auth/update-password` }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
  } else {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: action === 'disable' ? DISABLED : 'none',
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
  }

  const { error: logError } = await admin.rpc('platform_record_action', {
    p_actor: auth.userId,
    p_action:
      action === 'reset_password'
        ? 'password_reset_sent'
        : action === 'disable'
          ? 'account_disabled'
          : 'account_enabled',
    p_target_type: 'user',
    p_target_id: id,
    p_details: {},
  });
  if (logError) console.error('Could not record platform action:', logError);

  return NextResponse.json({ ok: true });
}
