import type { SupabaseClient } from '@supabase/supabase-js';

// What a school admin can do to the teachers and students of their school
// (server-only, service-role client). Admins and other schools' people are
// never touched.

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// About 100 years: Supabase has no "forever", and reactivating undoes it.
export const SUSPENDED = '876000h';

export interface ManagedMember {
  id: string;
  email: string;
  first_name: string | null;
  role: 'student' | 'teacher';
  neverSignedIn: boolean;
  suspended: boolean;
}

/** The admin's own school's students and teachers among `ids`. */
export async function managedMembers(
  admin: SupabaseClient,
  institutionId: string,
  ids: string[]
): Promise<ManagedMember[]> {
  const { data: rows } = await admin
    .from('users')
    .select('id, email, first_name, role')
    .in('id', ids)
    .eq('institution_id', institutionId)
    .in('role', ['student', 'teacher']);

  const members = await Promise.all(
    (rows ?? []).map(async row => {
      const { data } = await admin.auth.admin.getUserById(row.id);
      if (!data?.user) return null;
      const bannedUntil = (data.user as { banned_until?: string | null })
        .banned_until;
      return {
        id: row.id,
        email: row.email,
        first_name: row.first_name,
        role: row.role,
        neverSignedIn: !data.user.last_sign_in_at,
        suspended: !!bannedUntil && new Date(bannedUntil) > new Date(),
      } as ManagedMember;
    })
  );
  return members.filter((m): m is ManagedMember => m !== null);
}

/**
 * Why an account can't be deleted, or null if it can. Deleting removes
 * everything tied to it, so only accounts with nothing attached qualify:
 * a teacher with no classes, a student who handed nothing in.
 */
export async function deleteBlocker(
  admin: SupabaseClient,
  member: ManagedMember
): Promise<string | null> {
  if (member.role === 'teacher') {
    const { count } = await admin
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', member.id);
    return count
      ? `They teach ${count} ${count === 1 ? 'class' : 'classes'}. Deleting them would also delete those classes and their students' work, so suspend them instead.`
      : null;
  }
  const { count } = await admin
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', member.id)
    .neq('status', 'draft');
  return count
    ? `They have handed in ${count} ${count === 1 ? 'piece' : 'pieces'} of work, which deleting would erase. Suspend them instead.`
    : null;
}
