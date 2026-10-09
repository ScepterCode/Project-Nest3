// Replays every migration in supabase/migrations, in order, into an EMPTY
// Postgres database, to prove the schema can be rebuilt from the repo.
//
// For a plain (non-Supabase) Postgres it first creates the minimal Supabase
// environment the schema depends on: the anon/authenticated/service_role
// roles, auth.users + auth.uid()/auth.role()/auth.jwt(), and storage tables.
// Never point this at a real database.
//
// Usage: REPLAY_DATABASE_URL=postgres://... node scripts/db/replay-migrations.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const url = process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set REPLAY_DATABASE_URL to an empty throwaway database.');
  process.exit(1);
}

const SUPABASE_STUB = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres NOLOGIN; END IF;
END $$;
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  aud text,
  role text,
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.role', true),
                         current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '')::text
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- As on Supabase: the API roles may use the tables, and RLS decides what they see.
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
`;

(async () => {
  const c = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // If this script dies mid-transaction, the server ends the orphaned session
  // (and releases its locks) instead of blocking the app's queries.
  await c.query(
    "SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'"
  );

  const existing = await c.query(
    "select count(*)::int n from pg_tables where schemaname = 'public'"
  );
  if (existing.rows[0].n > 0) {
    console.error(
      `Refusing to run: the target database already has ${existing.rows[0].n} public tables.`
    );
    process.exit(1);
  }

  const isSupabase = (
    await c.query(
      "select to_regnamespace('auth') is not null and to_regprocedure('auth.uid()') is not null as ok"
    )
  ).rows[0].ok;
  if (!isSupabase) {
    await c.query(SUPABASE_STUB);
    console.log(
      'ok   created minimal Supabase environment (roles, auth, storage)'
    );
  }

  const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const started = Date.now();
    try {
      await c.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      console.log(`ok   ${file} (${Date.now() - started} ms)`);
    } catch (e) {
      console.log(`FAIL ${file}: ${e.message}`);
      await c.end();
      process.exit(1);
    }
  }

  const counts = (
    await c.query(`
      select
        (select count(*) from pg_tables where schemaname = 'public') tables,
        (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app_private')) functions,
        (select count(*) from pg_policies where schemaname in ('public','storage')) policies,
        (select count(*) from pg_indexes where schemaname = 'public') indexes
    `)
  ).rows[0];
  console.log('\nrebuilt:', counts);
  await c.end();
})();
