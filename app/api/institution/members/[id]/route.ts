import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireInstitutionAdmin } from '@/lib/bulk/institution-admin';
import { createSetupLink } from '@/lib/auth/setup-link';
import {
  SUSPENDED,
  UUID,
  deleteBlocker,
  managedMembers,
} from '@/lib/institution/members';

type Action = 'setup_link' | 'suspend' | 'reactivate' | 'delete';
const ACTIONS: Action[] = ['setup_link', 'suspend', 'reactivate', 'delete'];

/**
 * School admin actions on one of their school's teachers or students:
 * a set-up link (never signed in only), suspend, reactivate, or delete
 * (only if nothing is tied to the account). Recorded in the platform
 * activity log.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body?.action as Action;
  if (!UUID.test(id) || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unknown request' }, { status: 400 });
  }

  const admin = createAdminClient();
  const [member] = await managedMembers(admin, auth.institutionId, [id]);
  if (!member) {
    return NextResponse.json(
      {
        error: 'Only teachers and students at your school can be changed here.',
      },
      { status: 404 }
    );
  }

  const fail = (error: string, status = 409) =>
    NextResponse.json({ error }, { status });
  let result: Record<string, unknown> = { ok: true };

  if (action === 'setup_link') {
    // Once someone has signed in, a link would let the admin into their
    // account; they use "Forgot password" instead.
    if (!member.neverSignedIn) {
      return fail(
        'Set-up links are only for people who have never signed in. They can use "Forgot password".'
      );
    }
    if (member.suspended) return fail('Reactivate this account first.');
    try {
      result = {
        link: await createSetupLink(
          admin,
          member.email,
          request.nextUrl.origin
        ),
        email: member.email,
        firstName: member.first_name,
      };
    } catch (error) {
      console.error('Set-up link failed:', error);
      return fail('Could not create a set-up link. Try again.', 500);
    }
  } else if (action === 'suspend' || action === 'reactivate') {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: action === 'suspend' ? SUSPENDED : 'none',
    });
    if (error) return fail(error.message, 502);
  } else {
    const blocker = await deleteBlocker(admin, member);
    if (blocker) return fail(blocker);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return fail(error.message, 502);
  }

  if (action !== 'setup_link') {
    const { error: logError } = await admin.rpc('platform_record_action', {
      p_actor: auth.userId,
      p_action: `school_member_${action}`,
      p_target_type: 'user',
      p_target_id: id,
      p_details: {
        email: member.email,
        role: member.role,
        institution_id: auth.institutionId,
      },
    });
    if (logError) console.error('Could not record the action:', logError);
  }

  return NextResponse.json(result);
}
