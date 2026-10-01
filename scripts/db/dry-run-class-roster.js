// Applies 20261001140000_class_roster.sql inside a transaction, calls
// get_class_roster as real users (RLS on), then ROLLBACK. Nothing persists.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-class-roster.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync('supabase/migrations/20261001140000_class_roster.sql', 'utf8')
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

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
  const as = (sub, role = 'authenticated') =>
    q(
      "select set_config('role',$2,true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub, role }), role]
    );
  const asOwner = () =>
    q("reset role; select set_config('request.jwt.claims','',true)");

  await q('BEGIN');
  try {
    // A class with at least two enrolled students, one of them as the actor.
    const cls = (
      await q(`
      select e.class_id, c.teacher_id, count(*)::int n
      from public.enrollments e join public.classes c on c.id = e.class_id
      where e.status in ('enrolled','active')
      group by 1, 2 having count(*) >= 2 order by n limit 1`)
    ).rows[0];
    if (!cls) throw new Error('need a class with 2+ enrolled students');
    const student = (
      await q(
        "select student_id from public.enrollments where class_id = $1 and status in ('enrolled','active') limit 1",
        [cls.class_id]
      )
    ).rows[0].student_id;
    const outsider = (
      await q(
        `
      select u.id from public.users u where u.role = 'student'
        and not exists (select 1 from public.enrollments e where e.student_id = u.id and e.class_id = $1)
      limit 1`,
        [cls.class_id]
      )
    ).rows[0]?.id;

    await as(student);
    check(
      'before: student sees only own enrollment in the class',
      (
        await q(
          'select count(*)::int n from public.enrollments where class_id = $1',
          [cls.class_id]
        )
      ).rows[0].n,
      1
    );

    await asOwner();
    await q(MIGRATION);

    await as(student);
    const roster = (
      await q('select * from public.get_class_roster($1)', [cls.class_id])
    ).rows;
    check('student sees the whole roster', roster.length, cls.n);
    check(
      'roster includes the student',
      roster.some(r => r.student_id === student),
      true
    );
    check(
      'roster columns are names and dates only',
      Object.keys(roster[0]).sort(),
      ['enrolled_at', 'first_name', 'last_name', 'student_id']
    );
    check(
      'direct table access still limited to own row',
      (
        await q(
          'select count(*)::int n from public.enrollments where class_id = $1',
          [cls.class_id]
        )
      ).rows[0].n,
      1
    );

    if (outsider) {
      await as(outsider);
      check(
        'student from another class gets nothing',
        (
          await q('select count(*)::int n from public.get_class_roster($1)', [
            cls.class_id,
          ])
        ).rows[0].n,
        0
      );
    }
    await as(cls.teacher_id);
    check(
      'teacher sees the roster',
      (
        await q('select count(*)::int n from public.get_class_roster($1)', [
          cls.class_id,
        ])
      ).rows[0].n,
      cls.n
    );

    await asOwner();
    await q("select set_config('role','anon',true)");
    await q('SAVEPOINT anon');
    let anonError = null;
    try {
      await q('select * from public.get_class_roster($1)', [cls.class_id]);
    } catch (e) {
      anonError = e.message;
    }
    await q('ROLLBACK TO SAVEPOINT anon');
    check('signed-out visitors cannot call it', !!anonError, true);
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
