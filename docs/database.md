# Database

The database is Supabase Postgres 17. **`supabase/migrations/` is the single
source of truth for the schema.** Anything not in a migration doesn't exist as
far as the repo is concerned.

| Path                                                     | What it is                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260929000000_baseline_schema.sql` | Snapshot of production as of 2026-09-29 (tables, functions, triggers, RLS policies, grants, storage policies). Generated, don't edit. |
| `supabase/migrations/2026093*_*.sql`                     | Changes applied since, one file per change, in timestamp order.                                                                       |
| `supabase/config.toml`                                   | Supabase CLI config (local stack, auth URLs).                                                                                         |
| `supabase/seed.sql`                                      | Local-only seed data (empty). Never put real personal data here.                                                                      |
| `supabase/backups/`                                      | JSON snapshots of policies/functions taken before each production migration, for manual rollback.                                     |
| `scripts/db/`                                            | Baseline generator, replay test, and per-migration dry-run scripts.                                                                   |

## Rules

1. **Never change the schema by hand** (Supabase SQL editor, psql, dashboard
   table editor). Every change is a new migration file. Hand-run SQL is how
   this project ended up with 125 tables referenced in code that didn't exist
   and 40 conflicting SQL files.
2. **Never edit a migration that has been applied.** Add a new one.
3. **Every new table needs row-level security in the same migration.**
   Supabase grants `anon` and `authenticated` full privileges on every new
   table in `public` by default, so a table without RLS is readable and
   writable by anyone, including signed-out visitors. Start every table with:

   ```sql
   ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public.my_table FROM anon;
   -- then CREATE POLICY ... TO authenticated USING (...) WITH CHECK (...);
   ```

4. **Policy helpers live in `app_private`** (not exposed through the API):
   `is_institution_admin_of()`, `teaches_class()`, `is_enrolled_in()`,
   `teaches_student()`, `owns_rubric()`, etc. Use them instead of querying other
   tables inside policies (avoids RLS recursion and keeps checks indexed).
5. **`SECURITY DEFINER` functions must `SET search_path`** and validate
   `auth.uid()` themselves. Revoke `EXECUTE` from `PUBLIC, anon` and grant it
   to `authenticated` explicitly.
6. **Never trust `user_metadata`** for authorization; users can edit it. Roles
   and institution membership live in `public.users`, and the
   `app_private.guard_users_privileged_columns` trigger controls who may
   change them.
7. **Grades are points, not percent.** `submissions.grade` is points earned,
   from 0 to the assignment's `points_possible` (enforced by the
   `check_grade_within_points` trigger). Compute percentages when displaying
   them, with `lib/grades.ts`. `assignments.points_possible` is the source of
   truth; the legacy `assignments.points` column is kept equal to it by a
   trigger, so don't read it in new code.

## Making a change

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm run db:new -- add_class_announcements
```

This creates `supabase/migrations/<timestamp>_add_class_announcements.sql`.
Write the SQL, wrapped in `BEGIN; ... COMMIT;`.

### Test before applying

Two options:

- **Dry run against production, rolled back.** Copy one of the
  `scripts/db/dry-run-*.js` scripts: it applies the migration inside a
  transaction, runs checks as real users (by setting `role` and
  `request.jwt.claims`), then rolls everything back. Nothing is persisted.
- **Full rebuild** into an empty throwaway database (never a real one):

  ```bash
  REPLAY_DATABASE_URL=postgres://... npm run db:replay
  ```

  This applies every migration in order and prints table/function/policy
  counts. On plain Postgres it first creates the minimal Supabase environment
  the schema expects (roles, `auth.users`, `auth.uid()`, storage tables).

### Apply

```bash
npm run db:push -- --db-url "$SUPABASE_DATABASE_URL"
```

`supabase db push` applies only migrations not yet recorded in production's
`supabase_migrations.schema_migrations` table. Check what's pending first:

```bash
npm run db:status -- --db-url "$SUPABASE_DATABASE_URL"
```

Before applying anything risky, save the affected policies/functions to
`supabase/backups/` (see the existing files for the format).

## Regenerating the baseline

Only needed if production drifted from the migrations (it shouldn't). Dump the
schema, then rebuild the baseline file from it:

```bash
pg_dump --dbname "$SUPABASE_DATABASE_URL" --schema-only --no-owner \
  --schema=public --schema=app_private -f /tmp/live-schema.sql
node scripts/db/build-baseline.js /tmp/live-schema.sql
```

The generator strips psql-only commands and Supabase-managed default
privileges, and appends the objects outside `public`/`app_private` (the
`on_auth_user_created` trigger, storage buckets and storage policies). If you
add storage policies or triggers on `auth.*`, update the appended section in
`scripts/db/build-baseline.js` too.

## How the baseline was verified (2026-09-30)

The baseline plus all later migrations were replayed into an empty Postgres 17
database and the result was diffed against production with `pg_dump`. They
matched except for:

- check constraints on `varchar` columns, which Postgres re-prints in an
  equivalent form after a round trip;
- Supabase platform default privileges (intentionally excluded);
- two trigger functions in `app_private` that get an extra (harmless)
  `EXECUTE` grant on a fresh build, because a later migration grants execute
  on all `app_private` functions after the baseline created them.
