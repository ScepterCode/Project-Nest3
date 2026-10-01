// Applies 20261001120000_fix_rubric_points_trigger.sql inside a transaction,
// creates a rubric with criteria and levels as a real teacher (RLS on), checks
// total_points through insert/update/delete, then ROLLBACK. Nothing persists.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-rubric-trigger.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261001120000_fix_rubric_points_trigger.sql',
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

  await q('BEGIN');
  try {
    let teacher = (
      await q("select id from public.users where role = 'teacher' limit 1")
    ).rows[0]?.id;
    if (!teacher) {
      teacher = '2f000000-0000-0000-0000-000000000001';
      await q(
        `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'rubric-dry-run@test.invalid', '{"role":"teacher"}')`,
        [teacher]
      );
      await q("update public.users set role = 'teacher' where id = $1", [
        teacher,
      ]);
    }

    const asTeacher = () =>
      q(
        "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: teacher, role: 'authenticated' })]
      );
    const asOwner = () =>
      q("reset role; select set_config('request.jwt.claims','',true)");

    // Before the fix: inserting a level fails.
    await asTeacher();
    await q('SAVEPOINT before_fix');
    const r0 = (
      await q(
        "insert into public.rubrics (name, teacher_id) values ('pre', $1) returning id",
        [teacher]
      )
    ).rows[0].id;
    const c0 = (
      await q(
        "insert into public.rubric_criteria (rubric_id, name) values ($1, 'c') returning id",
        [r0]
      )
    ).rows[0].id;
    let preError = null;
    try {
      await q(
        "insert into public.rubric_levels (criterion_id, name, points) values ($1, 'l', 3)",
        [c0]
      );
    } catch (e) {
      preError = e.message;
    }
    await q('ROLLBACK TO SAVEPOINT before_fix');
    check(
      'level insert fails before fix',
      preError?.includes('rubric_id') ?? false,
      true
    );

    await asOwner();
    await q(MIGRATION);

    await asTeacher();
    const r = (
      await q(
        "insert into public.rubrics (name, teacher_id) values ('dry run', $1) returning id",
        [teacher]
      )
    ).rows[0].id;
    const ca = (
      await q(
        "insert into public.rubric_criteria (rubric_id, name) values ($1, 'A') returning id",
        [r]
      )
    ).rows[0].id;
    const cb = (
      await q(
        "insert into public.rubric_criteria (rubric_id, name) values ($1, 'B') returning id",
        [r]
      )
    ).rows[0].id;
    await q(
      "insert into public.rubric_levels (criterion_id, name, points) values ($1,'1',1),($1,'4',4),($2,'2',2),($2,'5',5)",
      [ca, cb]
    );
    const lvl = (
      await q(
        "select id from public.rubric_levels where criterion_id = $1 and name = '4'",
        [ca]
      )
    ).rows[0].id;
    await q(
      "insert into public.rubric_quality_indicators (level_id, indicator) values ($1, 'clear thesis')",
      [lvl]
    );
    check(
      'owner can read quality indicators',
      (
        await q(
          'select count(*)::int n from public.rubric_quality_indicators where level_id = $1',
          [lvl]
        )
      ).rows[0].n,
      1
    );
    const total = async () =>
      (await q('select total_points from public.rubrics where id = $1', [r]))
        .rows[0].total_points;
    check('total after inserts (4 + 5)', await total(), 9);
    await q(
      "update public.rubric_levels set points = 10 where criterion_id = $1 and name = '5'",
      [cb]
    );
    check('total after level update (4 + 10)', await total(), 14);
    await q(
      "delete from public.rubric_levels where criterion_id = $1 and name = '5'",
      [cb]
    );
    check('total after level delete (4 + 2)', await total(), 6);
    await q('delete from public.rubric_criteria where id = $1', [ca]);
    check('total after criterion delete (2)', await total(), 2);
    await q('delete from public.rubrics where id = $1', [r]);
    check(
      'rubric delete cascades cleanly',
      (
        await q(
          'select count(*)::int n from public.rubric_criteria where rubric_id = $1',
          [r]
        )
      ).rows[0].n,
      0
    );

    // Another teacher can't see or add indicators on this teacher's rubric.
    const other = (
      await (async () => {
        await asOwner();
        return q(
          "select id from public.users where role = 'teacher' and id <> $1 limit 1",
          [teacher]
        );
      })()
    ).rows[0]?.id;
    if (other) {
      await asOwner();
      const r2 = (
        await q(
          "insert into public.rubrics (name, teacher_id) values ('private', $1) returning id",
          [teacher]
        )
      ).rows[0].id;
      const c2 = (
        await q(
          "insert into public.rubric_criteria (rubric_id, name) values ($1, 'X') returning id",
          [r2]
        )
      ).rows[0].id;
      const l2 = (
        await q(
          "insert into public.rubric_levels (criterion_id, name, points) values ($1, 'x', 1) returning id",
          [c2]
        )
      ).rows[0].id;
      await q(
        "insert into public.rubric_quality_indicators (level_id, indicator) values ($1, 'secret')",
        [l2]
      );
      await q(
        "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: other, role: 'authenticated' })]
      );
      check(
        'other teacher sees no indicators',
        (
          await q(
            'select count(*)::int n from public.rubric_quality_indicators where level_id = $1',
            [l2]
          )
        ).rows[0].n,
        0
      );
      let writeError = null;
      await q('SAVEPOINT other_write');
      try {
        await q(
          "insert into public.rubric_quality_indicators (level_id, indicator) values ($1, 'x')",
          [l2]
        );
      } catch (e) {
        writeError = e.message;
      }
      await q('ROLLBACK TO SAVEPOINT other_write');
      check('other teacher cannot add indicators', !!writeError, true);
      await asTeacher();
    }

    let execError = null;
    await q('SAVEPOINT direct');
    try {
      await q('select public.update_rubric_total_points()');
    } catch (e) {
      execError = e.message;
    }
    await q('ROLLBACK TO SAVEPOINT direct');
    check('function not directly callable', !!execError, true);
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
