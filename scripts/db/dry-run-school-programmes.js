// Applies 20261031120000_school_programmes.sql inside a transaction (on a
// database with the earlier migrations replayed), checks school programmes,
// school mentors and cross-school programmes, then ROLLBACK.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-school-programmes.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs.readFileSync(
  'supabase/migrations/20261031120000_school_programmes.sql',
  'utf8'
);

const id = n => `a7a7a7a7-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const ADMIN = id(2); // school A admin
const TIA = id(3); // teacher, school A
const OTO = id(4); // teacher, school B
const ANA = id(5); // learner, school A
const BAYO = id(6); // learner, school B
const OTHER_ADMIN = id(7); // school B admin
const A = id(20);
const B = id(21);

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
  const asOwner = () =>
    q("reset role; select set_config('request.jwt.claims','{}',true)");
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
  const owner = async (sql, p) => {
    await asOwner();
    return one(sql, p);
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'School A', 'active'), ($2, 'School B', 'active')",
      [A, B]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [ADMIN, 'institution_admin', A, 'Sal'],
      [TIA, 'teacher', A, 'Tia'],
      [OTO, 'teacher', B, 'Oto'],
      [ANA, 'student', A, 'Ana'],
      [BAYO, 'student', B, 'Bayo'],
      [OTHER_ADMIN, 'institution_admin', B, 'Ola'],
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

    // --- school mentors ---
    await as(ADMIN);
    await q('select public.set_school_mentor($1, true)', [TIA]);
    check(
      'a school admin makes their teacher a school mentor',
      (
        await owner('select school_mentor from public.users where id = $1', [
          TIA,
        ])
      ).school_mentor,
      true
    );
    await as(ADMIN);
    check(
      "but not another school's teacher",
      /school admin/.test(
        await error('select public.set_school_mentor($1, true)', [OTO])
      ),
      true
    );
    await as(OTO);
    check(
      "teachers can't make themselves school mentors",
      /school's admin/.test(
        (await error(
          'update public.users set school_mentor = true where id = $1',
          [OTO]
        )) ?? ''
      ),
      true
    );

    // --- school programmes ---
    await as(ADMIN);
    check(
      "a school admin can't start a programme with another school's teacher",
      /own school/.test(
        await error(
          "select public.create_programme_group('Film club', $1, 'school')",
          [OTO]
        )
      ),
      true
    );
    check(
      'or a cross-school programme',
      /two-factor|Platform admins/i.test(
        await error(
          "select public.create_programme_group('Big one', $1, 'mentorship')",
          [TIA]
        )
      ),
      true
    );
    const prog = (
      await one(
        "select public.create_programme_group('Film club', $1, 'school') g",
        [TIA]
      )
    ).g;
    check(
      'a school programme gets a join code',
      /^[A-Z2-9]{8}$/.test(prog.code),
      true
    );
    check(
      'run by the chosen teacher, at the school',
      await owner(
        'select teacher_id, institution_id, school_programme, cohort_stage from public.classes where id = $1',
        [prog.id]
      ),
      {
        teacher_id: TIA,
        institution_id: A,
        school_programme: true,
        cohort_stage: null,
      }
    );
    check(
      'the mentor is told',
      (
        await owner(
          "select count(*)::int n from public.notifications where user_id = $1 and type = 'class_created'",
          [TIA]
        )
      ).n,
      1
    );

    await as(BAYO);
    check(
      "another school's learner can't join it",
      /for learners at School A/.test(
        await error('select public.join_class_by_code($1)', [prog.code])
      ),
      true
    );
    await as(ANA);
    check(
      'its own learner can ask to join',
      (await one('select public.join_class_by_code($1) r', [prog.code])).r
        .status,
      'pending'
    );
    await asOwner();
    await q(
      "update public.enrollments set status = 'enrolled' where class_id = $1",
      [prog.id]
    );

    await as(ADMIN);
    check(
      'the school admin sees it among their groups',
      (await rows('select name, scope from public.project_groups()')).map(r => [
        r.name,
        r.scope,
      ]),
      [['Film club', 'school']]
    );
    const project = (
      await one(
        "select public.create_production_project($1, 'Short film') id",
        [prog.id]
      )
    ).id;
    check(
      'and can start a project and pick its team',
      (
        await rows('select name from public.project_team_candidates($1)', [
          project,
        ])
      ).map(r => r.name),
      ['Ana T']
    );
    await as(OTHER_ADMIN);
    check(
      "another school's admin can't run it",
      /Only the group's mentor/.test(
        await error("select public.create_production_project($1, 'Nope')", [
          prog.id,
        ])
      ),
      true
    );
    await as(TIA);
    check(
      'the mentor sees it too',
      (await rows('select name from public.project_groups()')).map(r => r.name),
      ['Film club']
    );
    check(
      'and is shown as a mentor',
      (await one('select public.my_project_access() a')).a.school_mentor,
      true
    );

    // --- cross-school programmes ---
    await as(PLATFORM, 'aal2');
    const big = (
      await one(
        "select public.create_programme_group('Mentorship 2027', $1, 'mentorship') g",
        [OTO]
      )
    ).g;
    check(
      'a platform admin starts a cross-school programme; its mentor becomes a programme mentor',
      [
        await owner(
          'select cohort_stage, institution_id from public.classes where id = $1',
          [big.id]
        ),
        (
          await owner(
            'select is_programme_mentor from public.users where id = $1',
            [OTO]
          )
        ).is_programme_mentor,
      ],
      [{ cohort_stage: 'mentorship', institution_id: null }, true]
    );
    await as(PLATFORM, 'aal2');
    check(
      'platform admins see every programme',
      (await rows('select name from public.project_groups()'))
        .map(r => r.name)
        .sort(),
      ['Film club', 'Mentorship 2027']
    );
    await as(ADMIN);
    check(
      "school admins don't see cross-school programmes as theirs to run",
      (await rows('select name from public.project_groups()')).map(r => r.name),
      ['Film club']
    );
    await as(ANA);
    check(
      'cross-school programmes still need the stage',
      /mentorship stage/.test(
        await error('select public.join_class_by_code($1)', [big.code])
      ),
      true
    );
    await as(TIA);
    check(
      "a teacher can't flip a class into a school programme",
      /school's admin/.test(
        await error(
          "insert into public.classes (name, code, teacher_id, institution_id, school_programme) values ('Sneaky', 'SNEAKY01', $1, $2, true)",
          [TIA, A]
        )
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
