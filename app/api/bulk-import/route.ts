import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireInstitutionAdmin } from '@/lib/bulk/institution-admin';
import {
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_ROWS,
  ImportRow,
  ImportRowError,
  validateImportRow,
} from '@/lib/bulk/csv';

// Accounts created per batch in parallel. Supabase's admin API is rate
// limited, so keep this modest.
const CONCURRENCY = 5;

interface ImportBatchRequest {
  importId?: string;
  fileName?: string;
  fileSize?: number;
  totalRows?: number;
  rows?: unknown[];
  final?: boolean;
}

/**
 * Imports one batch of users (up to IMPORT_BATCH_SIZE rows). The page sends
 * the file in batches so each request stays well within the function time
 * limit. The first batch creates the bulk_imports record; later batches pass
 * its id back.
 *
 * Each row becomes a real login account (email already confirmed, no
 * password; the user sets one via "Forgot password") in the admin's
 * institution. Existing accounts are never modified: they're reported as
 * skipped.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  let body: ImportBatchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (rawRows.length === 0 || rawRows.length > IMPORT_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Send between 1 and ${IMPORT_BATCH_SIZE} rows per request` },
      { status: 400 }
    );
  }

  // Create or look up the import record (RLS limits it to the admin's institution).
  let importId = body.importId;
  if (!importId) {
    const totalRows = Number(body.totalRows) || rawRows.length;
    if (totalRows > IMPORT_MAX_ROWS) {
      return NextResponse.json(
        { error: `Imports are limited to ${IMPORT_MAX_ROWS} rows` },
        { status: 400 }
      );
    }
    const { data: created, error } = await supabase
      .from('bulk_imports')
      .insert({
        institution_id: auth.institutionId,
        initiated_by: auth.userId,
        file_name: String(body.fileName || 'import.csv').slice(0, 255),
        file_size: Math.max(0, Number(body.fileSize) || 0),
        file_type: 'csv',
        total_records: totalRows,
        processed_records: 0,
        successful_records: 0,
        failed_records: 0,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !created) {
      console.error('Failed to create import record:', error);
      return NextResponse.json(
        { error: 'Could not start the import' },
        { status: 500 }
      );
    }
    importId = created.id;
  }

  const { data: importRecord } = await supabase
    .from('bulk_imports')
    .select('id, status, processed_records, successful_records, failed_records')
    .eq('id', importId)
    .eq('institution_id', auth.institutionId)
    .single();
  if (!importRecord) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 });
  }
  if (importRecord.status !== 'processing') {
    return NextResponse.json(
      { error: 'This import has already finished' },
      { status: 409 }
    );
  }

  const admin = createAdminClient();
  const created: { line: number; email: string }[] = [];
  const skipped: ImportRowError[] = [];
  const failed: ImportRowError[] = [];

  const importOne = async (raw: unknown) => {
    const line = Number((raw as { line?: unknown })?.line) || 0;
    const validated = validateImportRow(
      (raw ?? {}) as Record<string, unknown>,
      line
    );
    if ('error' in validated) {
      failed.push(validated.error);
      return;
    }
    const row: ImportRow = validated.row;

    // role in user_metadata is read by the handle_new_user trigger, which
    // creates the public.users row (it only accepts student/teacher here).
    const { data, error } = await admin.auth.admin.createUser({
      email: row.email,
      email_confirm: true,
      user_metadata: {
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
      },
    });

    if (error || !data?.user) {
      const exists =
        (error as { code?: string } | null)?.code === 'email_exists' ||
        /already (been )?registered|already exists/i.test(error?.message ?? '');
      (exists ? skipped : failed).push({
        line,
        email: row.email,
        message: exists
          ? 'An account with this email already exists (left unchanged)'
          : error?.message || 'Could not create account',
      });
      return;
    }

    const { error: profileError } = await admin.from('users').upsert(
      {
        id: data.user.id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
        institution_id: auth.institutionId,
      },
      { onConflict: 'id' }
    );
    if (profileError) {
      failed.push({
        line,
        email: row.email,
        message: `Account created but profile setup failed: ${profileError.message}`,
      });
      return;
    }
    created.push({ line, email: row.email });
  };

  for (let i = 0; i < rawRows.length; i += CONCURRENCY) {
    await Promise.all(rawRows.slice(i, i + CONCURRENCY).map(importOne));
  }

  const problems = [
    ...skipped.map(e => ({ ...e, type: 'duplicate' })),
    ...failed.map(e => ({ ...e, type: 'account_error' })),
  ];
  if (problems.length > 0) {
    const { error } = await admin.from('import_errors').insert(
      problems.map(e => ({
        import_id: importId,
        row_number: e.line,
        error_type: e.type,
        error_message: e.message,
        field_name: 'email',
        field_value: e.email,
        raw_data: { email: e.email },
        is_fixable: e.type !== 'duplicate',
      }))
    );
    if (error) console.error('Failed to record import errors:', error);
  }

  const { error: updateError } = await supabase
    .from('bulk_imports')
    .update({
      processed_records: (importRecord.processed_records || 0) + rawRows.length,
      successful_records:
        (importRecord.successful_records || 0) + created.length,
      failed_records:
        (importRecord.failed_records || 0) + failed.length + skipped.length,
      ...(body.final
        ? { status: 'completed', completed_at: new Date().toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', importId);
  if (updateError)
    console.error('Failed to update import record:', updateError);

  return NextResponse.json({ importId, created, skipped, failed });
}

/** Recent imports for the admin's institution. */
export async function GET() {
  const supabase = await createClient();
  const auth = await requireInstitutionAdmin(supabase);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from('bulk_imports')
    .select(
      'id, file_name, total_records, processed_records, successful_records, failed_records, status, created_at, completed_at'
    )
    .eq('institution_id', auth.institutionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: 'Could not load import history' },
      { status: 500 }
    );
  }
  return NextResponse.json({ imports: data });
}
