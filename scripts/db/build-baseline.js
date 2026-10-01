// Builds supabase/migrations/20260929000000_baseline_schema.sql from a
// `pg_dump --schema-only --no-owner --schema=public --schema=app_private` of
// the live database, plus the few objects that live outside those schemas.
//
// Usage: node scripts/db/build-baseline.js <dump.sql>
// (See docs/database.md for the full command.)
const fs = require('fs');

const [, , dumpPath] = process.argv;
if (!dumpPath) {
  console.error('Usage: node scripts/db/build-baseline.js <dump.sql>');
  process.exit(1);
}

let sql = fs.readFileSync(dumpPath, 'utf8').replace(/\r\n/g, '\n');

// psql-only meta-commands (pg_dump 17.6+/18) break migration runners.
sql = sql.replace(/^\\(un)?restrict .*\n/gm, '');
// Default privileges belong to Supabase's own roles (postgres, supabase_admin)
// and are set up by the platform; a migration may not change them.
sql = sql.replace(/^ALTER DEFAULT PRIVILEGES .*\n/gm, '');
// Schemas already exist on Supabase.
sql = sql.replace(
  /^CREATE SCHEMA (public|app_private);$/gm,
  'CREATE SCHEMA IF NOT EXISTS $1;'
);
sql = sql.replace(/^COMMENT ON SCHEMA public IS .*\n/gm, '');

const header = `-- =============================================================================
-- Baseline schema (generated ${new Date().toISOString().slice(0, 10)} from the live database)
-- =============================================================================
-- Until now the database was built by hand-run SQL that isn't in the repo.
-- This migration recreates the public and app_private schemas exactly as they
-- were in production on this date: tables, constraints, indexes, functions,
-- triggers, RLS policies and grants. It already includes the effect of the
-- 2026-09-30 migrations that follow it; those are kept (and are safe to re-run)
-- because they were applied to production individually.
--
-- Regenerate with scripts/db/build-baseline.js (see docs/database.md).
-- Do not edit by hand: add a new migration instead.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

`;

const outsideSchemas = `

-- =============================================================================
-- Objects outside public / app_private
-- =============================================================================

-- Create a public.users row for every new auth user (see handle_new_user).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage buckets (both private).
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false),
       ('Project Nest', 'Project Nest', false)
ON CONFLICT (id) DO NOTHING;

-- Submission files are stored as "<student_id>/<assignment_id>/<file>".
DROP POLICY IF EXISTS "Students can upload their own submissions" ON storage.objects;
CREATE POLICY "Students can upload their own submissions" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'submissions' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Students can view their own submissions" ON storage.objects;
CREATE POLICY "Students can view their own submissions" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'submissions' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Teachers can view class submissions" ON storage.objects;
CREATE POLICY "Teachers can view class submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND app_private.teaches_submission_path(name));

DROP POLICY IF EXISTS "Peer reviewers can view assigned submissions" ON storage.objects;
CREATE POLICY "Peer reviewers can view assigned submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND app_private.reviews_submission_path(name));

-- pg_dump cleared search_path for the session; restore the default so later
-- migrations run in the usual environment.
SELECT pg_catalog.set_config('search_path', '"$user", public, extensions', false);
`;

const out = 'supabase/migrations/20260929000000_baseline_schema.sql';
fs.writeFileSync(out, header + sql.trim() + '\n' + outsideSchemas);
console.log(
  `wrote ${out} (${(header + sql + outsideSchemas).split('\n').length} lines)`
);
