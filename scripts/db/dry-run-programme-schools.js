// Applies 20261101120000_programme_schools.sql inside a transaction (on a
// database with the earlier migrations replayed), checks programmes for
// selected schools and stages, then ROLLBACK.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-programme-schools.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs.readFileSync(
  'supabase/migrations/20261101120000_programme_schools.sql',
  'utf8'
);

const id = n => `b8b8b8b8-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const MENTOR = id(2); // teacher, school A
const ADMIN_A = id(3);
const ANA = id(4); // learner, A
const BAYO = id(5); // learner, B
const CHI = id(6); // learner, C
const [A, B, C] = [id(20), id(21), id(22)];

(async () => {
  const c = new Client({ connectionString: url, ssl: false });
  await c.connect();
  const q = (s, p) => c.query(s, p);
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`
    );
  };
  const as = (sub, aal = 'aal1') =>
    q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub, role: 'authenticated', aal })]
    );
  const one = async (sql, p) => (await q(sql, p)).rows[0];
  const rows = async (sql, p) => (await q(sql, p)).rows;
  let sp = 0;
  const error = async (sql, p) => {
    const name = `s${++sp}`;
    await q(`SAVEPOINT ${name}`);
    try {
      await q(sql, p);
      await q(`RELEASE SAVEPOINT ${name}`);
      return null;
    } catch (e) {
      await q(`ROLLBACK TO SAVEPOINT ${name}`);
      return e.message;
    }
  };
  const create = (name, schools, stage) =>
    one(
      "select public.create_programme_group($1, $2, 'schools', null, $3::uuid[], $4) g",
      [name, MENTOR, schools, stage]
    ).then(r => r.g);
  const join = async (who, code) => {
    await as(who);
    return error('select public.join_class_by_code($1)', [code]);
  };

  await q('BEGIN');
  try {
    // An older programme, to check the backfill.
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'School A', 'active'), ($2, 'School B', 'active'), ($3, 'School C', 'active')",
      [A, B, C]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [MENTOR, 'teacher', A, 'Mira'],
      [ADMIN_A, 'institution_admin', A, 'Sal'],
      [ANA, 'student', A, 'Ana'],
      [BAYO, 'student', B, 'Bayo'],
      [CHI, 'student', C, 'Chi'],
    ]) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [
          uid,
          `${first.toLowerCase()}@dry.test`,
          { first_name: first, last_name: 'T' },
        ]
      );
      await q(
        'update public.users set role = $2, institution_id = $3 where id = $1',
        [uid, role, school]
      );
    }
    await q(
      "insert into public.classes (name, code, teacher_id, cohort_stage) values ('Old mentorship', 'OLDPRG01', $1, 'mentorship')",
      [MENTOR]
    );

    await q(MIGRATION);
    check(
      'existing stage groups are marked as programmes',
      (
        await one(
          "select programme_group from public.classes where code = 'OLDPRG01'"
        )
      ).programme_group,
      true
    );

    await as(ADMIN_A);
    check(
      "school admins can't start multi-school programmes",
      /two-factor|Platform admins/i.test(
        await error(
          "select public.create_programme_group('Big programme', $1, 'schools', null, $2::uuid[], null)",
          [MENTOR, [A, B]]
        )
      ),
      true
    );

    await as(PLATFORM, 'aal2');
    const ab = await create('Schools A and B', [A, B], null);
    const abMentorship = await create('A, mentorship', [A], 'mentorship');
    const open = await create('Everyone', null, null);
    check(
      'a programme for selected schools lists them',
      (
        await rows(
          'select name, scope, stage, schools from public.project_groups() order by name'
        )
      ).map(r => [r.name, r.scope, r.stage, r.schools]),
      [
        ['A, mentorship', 'programme', 'mentorship', 'School A'],
        ['Everyone', 'programme', null, null],
        ['Old mentorship', 'programme', 'mentorship', null],
        ['Schools A and B', 'programme', null, 'School A, School B'],
      ]
    );
    check(
      'unknown schools are refused',
      /doesn't exist/.test(
        await error(
          "select public.create_programme_group('Ghost schools', $1, 'schools', null, $2::uuid[], null)",
          [MENTOR, [id(99)]]
        )
      ),
      true
    );

    await q("reset role; select set_config('request.jwt.claims','{}',true)");
    check(
      "the chosen schools' admins are told, with the code",
      (
        await one(
          "select message from public.notifications where user_id = $1 and metadata->>'class_id' = $2",
          [ADMIN_A, ab.id]
        )
      ).message.includes(ab.code),
      true
    );
    await as(ADMIN_A);
    check(
      'and see the programmes their school is in, read-only',
      (
        await rows(
          'select name, can_run from public.project_groups() order by name'
        )
      ).map(r => [r.name, r.can_run]),
      [
        ['A, mentorship', false],
        ['Everyone', false],
        ['Old mentorship', false],
        ['Schools A and B', false],
      ]
    );
    check(
      "but can't start projects in them",
      /Only the group's mentor/.test(
        await error("select public.create_production_project($1, 'Nope')", [
          ab.id,
        ])
      ),
      true
    );
    check("a chosen school's learner can join", await join(ANA, ab.code), null);
    check("so can the other chosen school's", await join(BAYO, ab.code), null);
    check(
      "a learner from a school that wasn't chosen can't",
      /for learners at School A, School B/.test(await join(CHI, ab.code)),
      true
    );
    check(
      'a stage limit still applies on top of the schools',
      /mentorship stage/.test(await join(ANA, abMentorship.code)),
      true
    );
    check('an open programme takes anyone', await join(CHI, open.code), null);

    await as(PLATFORM, 'aal2');
    check(
      'projects can be started in a programme without a stage',
      (await error(
        "select public.create_production_project($1, 'Short film')",
        [ab.id]
      )) === null,
      true
    );
    check(
      'the older mentorship/fellowship call still works',
      /^[A-Z2-9]{8}$/.test(
        (
          await one(
            "select public.create_programme_group('Old style', $1, 'fellowship') g",
            [MENTOR]
          )
        ).g.code
      ),
      true
    );
    await as(MENTOR);
    check(
      "teachers can't mark a class as a programme",
      /Only platform admins start programmes/.test(
        await error(
          "insert into public.classes (name, code, teacher_id, programme_group) values ('Sneaky', 'SNEAKY02', $1, true)",
          [MENTOR]
        )
      ),
      true
    );
    check(
      "and can't read the school lists directly",
      /permission denied/.test(
        await error('select * from public.programme_schools')
      ),
      true
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
