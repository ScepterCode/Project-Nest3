import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireInstitutionAdmin } from '@/lib/bulk/institution-admin';
import { createSetupLink } from '@/lib/auth/setup-link';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * School members who can be given a set-up link: students and teachers of
 * the admin's own school who have never signed in. (Once someone has signed
 * in, a link would let the admin take over their account, so they use
 * "Forgot password" instead.)
 */
async function eligibleMembers(
  institutionId: string,
  ids: string[]
): Promise<Map<string, { email: string; first_name: string | null }>> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from('users')
    .select('id, email, first_name, role, institution_id')
    .in('id', ids)
    .eq('institution_id', institutionId)
    .in('role', ['student', 'teacher']);

  const result = new Map<
    string,
    { email: string; first_name: string | null }
  >();
  await Promise.all(
    (members ?? []).map(async m => {
      const { data } = await admin.auth.admin.getUserById(m.id);
      if (data?.user && !data.user.last_sign_in_at) {
        result.set(m.id, { email: m.email, first_name: m.first_name });
      }
    })
  );
  return result;
}

/** GET ?ids=a,b,c → which of these members are still waiting to sign in. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .filter(id => UUID.test(id))
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ pending: [] });

  const eligible = await eligibleMembers(auth.institutionId, ids);
  return NextResponse.json({ pending: [...eligible.keys()] });
}

/** POST { userId } → a fresh set-up link for that member. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  if (!UUID.test(userId)) {
    return NextResponse.json({ error: 'Unknown person' }, { status: 400 });
  }

  const member = (await eligibleMembers(auth.institutionId, [userId])).get(
    userId
  );
  if (!member) {
    return NextResponse.json(
      {
        error:
          'Set-up links are only for students and teachers at your school who have never signed in. Anyone who has signed in before can use "Forgot password".',
      },
      { status: 409 }
    );
  }

  try {
    const link = await createSetupLink(
      createAdminClient(),
      member.email,
      request.nextUrl.origin
    );
    return NextResponse.json({
      link,
      email: member.email,
      firstName: member.first_name,
    });
  } catch (error) {
    console.error('Set-up link failed:', error);
    return NextResponse.json(
      { error: 'Could not create a set-up link. Try again.' },
      { status: 500 }
    );
  }
}
