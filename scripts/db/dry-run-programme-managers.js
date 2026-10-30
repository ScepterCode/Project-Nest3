// Applies 20261103120000_programme_managers.sql inside a transaction on a
// database replayed up to 20261102120000, and walks through a partner-run
// programme: the partner's organisation (its admin and instructors), two
// schools, a platform programme managed by the partner, one instructor
// teaching a class at each school. ROLLBACK at the end.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-programme-managers.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs.readFileSync(
  'supabase/migrations/20261103120000_programme_managers.sql',
  'utf8'
);

const id = n => `dadadada-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const FRIEND = id(2); // admin of the partner organisation
const INSTRUCTOR = id(3); // the partner's instructor
const ADMIN_A = id(4);
const ANA = id(5); // learner, school A
const BAYO = id(6); // learner, school B
const OTHER_TEACHER = id(7); // teacher at school A, not a manager
const [ORG, A, B] = [id(20), id(21), id(22)];

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
  const join = async (who, code) => {
    await as(who);
    return error('select public.join_class_by_code($1)', [code]);
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Partner Academy', 'active'), ($2, 'School A', 'active'), ($3, 'School B', 'active')",
      [ORG, A, B]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [FRIEND, 'institution_admin', ORG, 'Femi'],
      [INSTRUCTOR, 'teacher', ORG, 'Ike'],
      [ADMIN_A, 'institution_admin', A, 'Sal'],
      [ANA, 'student', A, 'Ana'],
      [BAYO, 'student', B, 'Bayo'],
      [OTHER_TEACHER, 'teacher', A, 'Tia'],
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

    // The platform admin creates the programme and makes the partner its manager.
    await as(PLATFORM, 'aal2');
    const prog = (
      await one(
        "select public.create_programme('Animation 2027', null, 'programme', null, $1::uuid[], null) r",
        [[A, B]]
      )
    ).r.id;
    check(
      'the partner can be chosen from the candidates',
      (await rows('select id from public.programme_manager_candidates()')).some(
        r => r.id === FRIEND
      ),
      true
    );
    await q('select public.add_programme_manager($1, $2)', [prog, FRIEND]);
    await asOwner();
    check(
      'and is told, with no new login',
      (
        await one(
          "select count(*)::int n from public.notifications where user_id = $1 and type = 'role_changed'",
          [FRIEND]
        )
      ).n,
      1
    );

    // The partner (a school admin of their own organisation) runs it.
    await as(FRIEND);
    check(
      'their dashboard knows they manage a programme',
      (await one('select public.my_project_access() a')).a.managed_programmes,
      1
    );
    check(
      'they see it as theirs to manage',
      (
        await rows('select name, can_manage from public.programmes_overview()')
      ).map(r => [r.name, r.can_manage]),
      [['Animation 2027', true]]
    );
    check(
      'their instructor is offered as a tutor',
      (
        await rows('select id from public.programme_tutor_candidates($1)', [
          prog,
        ])
      ).some(r => r.id === INSTRUCTOR),
      true
    );
    check(
      'the schools offered are the programme’s',
      (
        await rows('select name from public.programme_school_options($1)', [
          prog,
        ])
      ).map(r => r.name),
      ['School A', 'School B']
    );
    const classA = (
      await one(
        "select public.add_programme_class($1, 'Animation – School A', $2, $3) r",
        [prog, INSTRUCTOR, A]
      )
    ).r;
    const classB = (
      await one(
        "select public.add_programme_class($1, 'Animation – School B', $2, $3) r",
        [prog, INSTRUCTOR, B]
      )
    ).r;
    check(
      'one instructor runs a class at each school',
      (await one('select public.programme_detail($1) d', [prog])).d.classes.map(
        x => [x.tutor_id === INSTRUCTOR, x.school_name]
      ),
      [
        [true, 'School A'],
        [true, 'School B'],
      ]
    );
    check(
      "a class can't serve a school outside the programme",
      /isn't taking part/.test(
        await error(
          "select public.add_programme_class($1, 'Elsewhere', $2, $3)",
          [prog, INSTRUCTOR, ORG]
        )
      ),
      true
    );

    check(
      "a school B learner can't join the school A class",
      /for learners at School A/.test(await join(BAYO, classA.code)),
      true
    );
    check('a school A learner can', await join(ANA, classA.code), null);
    check(
      'and the school B learner joins theirs',
      await join(BAYO, classB.code),
      null
    );
    await asOwner();
    await q(
      "update public.enrollments set status = 'enrolled' where class_id in ($1, $2)",
      [classA.id, classB.id]
    );

    await as(FRIEND);
    await q("select public.set_programme_status($1, 'suspended')", [prog]);
    await q("select public.set_programme_status($1, 'active')", [prog]);
    check(
      'the partner suspends and resumes it',
      (await one('select public.programme_detail($1) d', [prog])).d.programme
        .status,
      'active'
    );
    check(
      'edits its schools (seeing every school to choose from)',
      (await rows('select id from public.programme_all_schools($1)', [prog]))
        .length === 3 &&
        (await error(
          "select public.update_programme($1, 'Animation 2027', 'Edited', $2::uuid[], null)",
          [prog, [A, B]]
        )) === null,
      true
    );
    const d = (await one('select public.programme_detail($1) d', [prog])).d;
    check(
      'and sees its analytics',
      [d.can_manage, d.totals.learners, d.totals.classes],
      [true, 2, 2]
    );
    check(
      "but can't delete it",
      [
        d.can_delete,
        /Only a platform admin/.test(
          await error('select public.delete_programme($1)', [prog])
        ),
      ],
      [false, true]
    );
    check(
      'or start another multi-school programme',
      /two-factor|Platform admins/i.test(
        await error(
          "select public.create_programme('Another', null, 'programme', null, null, null)"
        )
      ),
      true
    );
    check(
      'or add managers',
      /two-factor|Platform admins/i.test(
        await error('select public.add_programme_manager($1, $2)', [
          prog,
          OTHER_TEACHER,
        ])
      ),
      true
    );

    // A school taking part sees its own figures.
    await as(ADMIN_A);
    const schoolView = (
      await one('select public.programme_detail($1) d', [prog])
    ).d;
    check(
      "school A's admin sees their school's figures, not the whole programme's",
      [
        schoolView.can_manage,
        schoolView.totals,
        schoolView.my_school.school,
        schoolView.my_school.learners,
      ],
      [false, null, 'School A', 1]
    );

    await as(OTHER_TEACHER);
    check(
      "a teacher who isn't a manager can't change it",
      /school admin or a platform admin/.test(
        await error("select public.update_programme($1, 'Hijack', null)", [
          prog,
        ])
      ),
      true
    );

    // Managers' classes can be opened to any school taking part.
    await as(FRIEND);
    await q('select public.set_programme_class_school($1, null)', [classA.id]);
    await asOwner();
    await q(
      'delete from public.enrollments where class_id = $1 and student_id = $2',
      [classB.id, BAYO]
    );
    check(
      'with the school cleared, any school in the programme can join',
      await join(BAYO, classA.code),
      null
    );

    // Removing the manager takes the powers away.
    await as(PLATFORM, 'aal2');
    await q('select public.remove_programme_manager($1, $2)', [prog, FRIEND]);
    await as(FRIEND);
    check(
      'once removed, the partner can no longer manage it',
      /school admin or a platform admin/.test(
        await error("select public.set_programme_status($1, 'ended')", [prog])
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
