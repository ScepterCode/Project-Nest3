// Benchmarks the hot SELECT queries under the per-row policies vs. the
// set-based policies (20261001000100) on a synthetic institution:
// 10,000 students, 100 teachers, 300 classes, ~30,000 enrollments,
// ~100,000 submissions.
//
// Only for a THROWAWAY database that already has the migrations up to
// 20261001000000 replayed (see replay-migrations.js). Seeds once, then
// measures with EXPLAIN ANALYZE before/after applying the policy migration
// inside a savepoint (rolled back afterwards).
//
// Usage: REPLAY_DATABASE_URL=postgres://... node scripts/db/benchmark-rls.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set REPLAY_DATABASE_URL to a throwaway database.');
  process.exit(1);
}
const POLICIES = fs
  .readFileSync(
    'supabase/migrations/20261001000100_rls_set_based_select_policies.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '');

const SEED = `
-- ids are deterministic so the benchmark can pick fixed actors
INSERT INTO public.institutions (id, name, status) VALUES ('00000000-0000-0000-0000-000000000001', 'Bench U', 'active');

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 's' || g || '@bench.test', '{"role":"student"}'
FROM generate_series(1, 10000) g;
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ('20000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 't' || g || '@bench.test', '{"role":"teacher"}'
FROM generate_series(1, 100) g;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('30000000-0000-0000-0000-000000000001', 'admin@bench.test', '{"role":"institution_admin"}');

UPDATE public.users SET institution_id = '00000000-0000-0000-0000-000000000001',
  first_name = 'First' || right(id::text, 5), last_name = 'Last' || right(id::text, 5), onboarding_completed = true;

-- 3 classes per teacher
INSERT INTO public.classes (id, name, code, teacher_id, institution_id, status)
SELECT ('40000000-0000-0000-0000-' || lpad(((t - 1) * 3 + k)::text, 12, '0'))::uuid,
       'Class ' || ((t - 1) * 3 + k), 'C' || ((t - 1) * 3 + k),
       ('20000000-0000-0000-0000-' || lpad(t::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000001', 'active'
FROM generate_series(1, 100) t, generate_series(1, 3) k;

-- every student in 3 classes (~100 per class)
INSERT INTO public.enrollments (class_id, student_id, status)
SELECT ('40000000-0000-0000-0000-' || lpad((((s * 7 + k * 101) % 300) + 1)::text, 12, '0'))::uuid,
       ('10000000-0000-0000-0000-' || lpad(s::text, 12, '0'))::uuid, 'enrolled'
FROM generate_series(1, 10000) s, generate_series(0, 2) k
ON CONFLICT DO NOTHING;

-- 10 assignments per class
INSERT INTO public.assignments (id, title, class_id, teacher_id, status, points_possible)
SELECT ('50000000-0000-0000-0000-' || lpad(((c - 1) * 10 + a)::text, 12, '0'))::uuid, 'A' || a,
       ('40000000-0000-0000-0000-' || lpad(c::text, 12, '0'))::uuid,
       ('20000000-0000-0000-0000-' || lpad((((c - 1) / 3) + 1)::text, 12, '0'))::uuid, 'published', 100
FROM generate_series(1, 300) c, generate_series(1, 10) a;

-- each enrolled student submits the first ~3-4 assignments of each class
INSERT INTO public.submissions (assignment_id, student_id, status, content, submitted_at)
SELECT a.id, e.student_id, 'submitted', 'x', now()
FROM public.enrollments e
JOIN public.assignments a ON a.class_id = e.class_id
WHERE a.title IN ('A1', 'A2', 'A3') OR (a.title = 'A4' AND e.student_id::text < '10000000-0000-0000-0000-000000005000');

ANALYZE;
`;

const ACTORS = {
  admin: '30000000-0000-0000-0000-000000000001',
  teacher: '20000000-0000-0000-0000-000000000001',
  student: '10000000-0000-0000-0000-000000000042',
};

const SCENARIOS = [
  [
    'admin',
    'members page (50 of 10,101, sorted)',
    'select id, email, first_name, last_name, role from public.users where institution_id is not null order by last_name limit 50',
  ],
  [
    'admin',
    'member count',
    'select count(*) from public.users where institution_id is not null',
  ],
  [
    'teacher',
    'my students (users visible)',
    'select count(*) from public.users',
  ],
  [
    'teacher',
    'submissions across my classes',
    'select count(*) from public.submissions',
  ],
  [
    'student',
    'my assignments',
    'select id, title, due_date from public.assignments',
  ],
  ['student', 'my classes', 'select id, name from public.classes'],
];

(async () => {
  const c = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query("SET idle_in_transaction_session_timeout = '120s'");
  const q = (s, p) => c.query(s, p);

  const seeded = (
    await q(
      "select count(*)::int n from public.users where email like '%@bench.test'"
    )
  ).rows[0].n;
  if (seeded === 0) {
    const t0 = Date.now();
    await q(SEED);
    console.log(`seeded in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const counts = (
    await q(
      'select (select count(*) from public.users) users, (select count(*) from public.enrollments) enrollments, (select count(*) from public.submissions) submissions'
    )
  ).rows[0];
  console.log('data:', counts, '\n');

  const measure = async () => {
    const out = {};
    for (const [actor, name, sql] of SCENARIOS) {
      await q(
        "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: ACTORS[actor], role: 'authenticated' })]
      );
      await q(sql); // warm up
      const times = [];
      let rows;
      for (let i = 0; i < 3; i++) {
        const plan = (await q(`explain (analyze, format json) ${sql}`)).rows[0][
          'QUERY PLAN'
        ][0];
        times.push(plan['Execution Time']);
        rows = plan.Plan['Actual Rows'];
      }
      const result = await q(sql);
      out[`${actor}: ${name}`] = {
        ms: Math.min(...times),
        result: JSON.stringify(result.rows[0]).slice(0, 40),
        resultRows: result.rowCount,
      };
      await q("reset role; select set_config('request.jwt.claims','',true)");
    }
    return out;
  };

  await q('BEGIN');
  const before = await measure();
  await q('SAVEPOINT policies');
  await q(POLICIES);
  const after = await measure();
  await q('ROLLBACK TO SAVEPOINT policies');
  await q('COMMIT');

  console.log(
    'scenario'.padEnd(52),
    'per-row ms',
    'set-based ms',
    ' speedup',
    ' same result'
  );
  for (const key of Object.keys(before)) {
    const b = before[key];
    const a = after[key];
    console.log(
      key.padEnd(52),
      b.ms.toFixed(1).padStart(10),
      a.ms.toFixed(1).padStart(12),
      `${(b.ms / a.ms).toFixed(1)}x`.padStart(8),
      String(b.result === a.result && b.resultRows === a.resultRows).padStart(
        12
      )
    );
  }
  await c.end();
})();
