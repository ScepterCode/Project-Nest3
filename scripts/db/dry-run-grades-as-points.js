// Applies 20261001130000_grades_as_points.sql inside a transaction, checks
// grade limits as the real teacher of a real submission (RLS on), then
// ROLLBACK. Nothing persists.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-grades-as-points.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261001130000_grades_as_points.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '');

(async () => {
  const c = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(
    "SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'"
  );
  const q = (s, p) => c.query(s, p);
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`
    );
  };
  const as = sub =>
    q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub, role: 'authenticated' })]
    );
  const asOwner = () =>
    q("reset role; select set_config('request.jwt.claims','',true)");
  const fails = async (label, sql, params) => {
    await q('SAVEPOINT attempt');
    let err = null;
    try {
      await q(sql, params);
    } catch (e) {
      err = e.message;
    }
    await q('ROLLBACK TO SAVEPOINT attempt');
    check(label, !!err, true);
    return err;
  };

  await q('BEGIN');
  try {
    const before = (
      await q(
        'select count(*)::int n, count(grade)::int graded, coalesce(sum(grade),0)::int total from public.submissions'
      )
    ).rows[0];
    const row = (
      await q(`
      select s.id sub, s.student_id, a.id asg, a.teacher_id
      from public.submissions s join public.assignments a on a.id = s.assignment_id
      order by s.grade is null, s.id limit 1`)
    ).rows[0];
    if (!row) throw new Error('no submissions to test with');

    await asOwner();
    await q(
      'update public.assignments set points_possible = 150 where id = $1',
      [row.asg]
    );
    await fails(
      'before: 120 points rejected by the 0-100 check',
      'update public.submissions set grade = 120 where id = $1',
      [row.sub]
    );

    await q(MIGRATION);
    check(
      'existing grades unchanged',
      (
        await q(
          'select count(*)::int n, count(grade)::int graded, coalesce(sum(grade),0)::int total from public.submissions'
        )
      ).rows[0],
      before
    );
    check(
      'points mirrors points_possible everywhere',
      (
        await q(
          'select count(*)::int n from public.assignments where points is distinct from points_possible'
        )
      ).rows[0].n,
      0
    );

    await as(row.teacher_id);
    await q('update public.submissions set grade = 120 where id = $1', [
      row.sub,
    ]);
    check(
      'teacher can give 120/150',
      (await q('select grade from public.submissions where id = $1', [row.sub]))
        .rows[0].grade,
      120
    );
    const over = await fails(
      '151/150 rejected',
      'update public.submissions set grade = 151 where id = $1',
      [row.sub]
    );
    console.log('     message:', over);
    await fails(
      'negative grade rejected',
      'update public.submissions set grade = -1 where id = $1',
      [row.sub]
    );
    await fails(
      'points_possible below an existing grade rejected',
      'update public.assignments set points_possible = 100 where id = $1',
      [row.asg]
    );
    await q(
      'update public.assignments set points_possible = 200 where id = $1',
      [row.asg]
    );
    check(
      'raising points_possible works and syncs points',
      (
        await q(
          'select points, points_possible from public.assignments where id = $1',
          [row.asg]
        )
      ).rows[0],
      { points: 200, points_possible: 200 }
    );
    await q('update public.assignments set points = 5 where id = $1', [
      row.asg,
    ]);
    check(
      'writing legacy points is overridden by points_possible',
      (
        await q('select points from public.assignments where id = $1', [
          row.asg,
        ])
      ).rows[0].points,
      200
    );

    await as(row.student_id);
    await fails(
      'student still cannot grade',
      'update public.submissions set grade = 1 where id = $1',
      [row.sub]
    );
    await asOwner();
    await fails(
      'trigger functions not callable',
      'select app_private.check_grade_within_points()'
    );
  } finally {
    await q('ROLLBACK');
    await c.end();
  }
  console.log(
    failures
      ? `\n${failures} check(s) failed`
      : '\nall checks passed (rolled back)'
  );
  process.exit(failures ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
