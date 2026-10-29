import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireInstitutionAdmin } from '@/lib/bulk/institution-admin';
import { UUID, managedMembers } from '@/lib/institution/members';

/**
 * GET ?ids=a,b,c → account status of these school members: who hasn't
 * signed in yet (can get a set-up link) and who is suspended.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .filter(id => UUID.test(id))
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ members: [] });

  const members = await managedMembers(
    createAdminClient(),
    auth.institutionId,
    ids
  );
  return NextResponse.json({
    members: members.map(m => ({
      id: m.id,
      neverSignedIn: m.neverSignedIn,
      suspended: m.suspended,
    })),
  });
}
