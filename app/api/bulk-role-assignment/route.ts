import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireInstitutionAdmin } from '@/lib/bulk/institution-admin';
import { selectInChunks } from '@/lib/supabase/chunked-in';
import {
  ASSIGNABLE_ROLES,
  AssignableRole,
  BULK_ROLE_MAX_USERS as MAX_USERS,
} from '@/lib/bulk/roles';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Changes the role of up to MAX_USERS members of the admin's institution.
 *
 * The update runs with the admin's own session, so RLS and the users guard
 * trigger enforce that only members of their institution can be changed.
 * The run and each user's outcome are recorded in bulk_role_assignments /
 * bulk_role_assignment_items.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  let body: {
    userIds?: unknown;
    targetRole?: unknown;
    justification?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const targetRole = String(body.targetRole ?? '') as AssignableRole;
  if (!ASSIGNABLE_ROLES.includes(targetRole)) {
    return NextResponse.json(
      { error: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  const userIds = Array.from(
    new Set(
      (Array.isArray(body.userIds) ? body.userIds : [])
        .map(String)
        .filter(id => UUID_RE.test(id))
    )
  );
  if (userIds.length === 0 || userIds.length > MAX_USERS) {
    return NextResponse.json(
      { error: `Select between 1 and ${MAX_USERS} users` },
      { status: 400 }
    );
  }
  if (userIds.includes(auth.userId)) {
    return NextResponse.json(
      { error: "You can't change your own role" },
      { status: 400 }
    );
  }
  const justification =
    typeof body.justification === 'string'
      ? body.justification.slice(0, 1000)
      : null;

  // Current roles of the selected users who are in this institution.
  // Up to 500 ids: batched so the id filter never exceeds URL limits.
  let members: { id: string; role: string }[] = [];
  let membersError: unknown = null;
  try {
    members = await selectInChunks(userIds, chunk =>
      supabase
        .from('users')
        .select('id, role')
        .in('id', chunk)
        .eq('institution_id', auth.institutionId)
    );
  } catch (error) {
    membersError = error;
  }
  if (membersError) {
    return NextResponse.json(
      { error: 'Could not load the selected users' },
      { status: 500 }
    );
  }
  const previousRole = new Map(members.map(m => [m.id, m.role]));

  const { data: run, error: runError } = await supabase
    .from('bulk_role_assignments')
    .insert({
      institution_id: auth.institutionId,
      initiated_by: auth.userId,
      assignment_name: `Set ${userIds.length} user(s) to ${targetRole}`,
      target_role: targetRole,
      total_users: userIds.length,
      status: 'processing',
      justification,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (runError || !run) {
    console.error('Failed to create bulk role assignment:', runError);
    return NextResponse.json(
      { error: 'Could not start the role change' },
      { status: 500 }
    );
  }

  const toChange = userIds.filter(
    id => previousRole.has(id) && previousRole.get(id) !== targetRole
  );
  let changed = new Set<string>();
  let updateErrorMessage: string | null = null;
  if (toChange.length > 0) {
    try {
      const updated = await selectInChunks(toChange, chunk =>
        supabase
          .from('users')
          .update({ role: targetRole, updated_at: new Date().toISOString() })
          .in('id', chunk)
          .eq('institution_id', auth.institutionId)
          .select('id')
      );
      changed = new Set(updated.map(u => u.id));
    } catch (error) {
      updateErrorMessage =
        (error as { message?: string })?.message ?? 'Update failed';
    }
  }

  const items = userIds.map(id => {
    const previous = previousRole.get(id) ?? null;
    let status: 'success' | 'skipped' | 'failed';
    let message: string | null = null;
    if (!previousRole.has(id)) {
      status = 'failed';
      message = 'Not a member of your institution';
    } else if (previous === targetRole) {
      status = 'skipped';
      message = 'Already has this role';
    } else if (changed.has(id)) {
      status = 'success';
    } else {
      status = 'failed';
      message = updateErrorMessage || 'Role could not be changed';
    }
    return {
      bulk_assignment_id: run.id,
      user_id: id,
      previous_role: previous,
      target_role: targetRole,
      assignment_status: status,
      error_message: message,
      assigned_at: status === 'success' ? new Date().toISOString() : null,
    };
  });

  // The items table only has read policies; the rows are written with the
  // service role after the checks above.
  const { error: itemsError } = await createAdminClient()
    .from('bulk_role_assignment_items')
    .insert(items);
  if (itemsError)
    console.error('Failed to record bulk role assignment items:', itemsError);

  const count = (s: string) =>
    items.filter(i => i.assignment_status === s).length;
  await supabase
    .from('bulk_role_assignments')
    .update({
      processed_users: items.length,
      successful_assignments: count('success'),
      skipped_assignments: count('skipped'),
      failed_assignments: count('failed'),
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);

  return NextResponse.json({
    assignmentId: run.id,
    changed: count('success'),
    skipped: count('skipped'),
    failed: items
      .filter(i => i.assignment_status === 'failed')
      .map(i => ({ userId: i.user_id, message: i.error_message })),
  });
}

/** Recent bulk role changes for the admin's institution. */
export async function GET() {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from('bulk_role_assignments')
    .select(
      'id, assignment_name, target_role, total_users, successful_assignments, skipped_assignments, failed_assignments, status, created_at'
    )
    .eq('institution_id', auth.institutionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: 'Could not load history' },
      { status: 500 }
    );
  }
  return NextResponse.json({ assignments: data });
}
