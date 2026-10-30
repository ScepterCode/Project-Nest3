// Applies 20261102120000_programme_containers.sql inside a transaction on a
// database replayed up to 20261101120000 (REPLAY_UNTIL=20261101120000), with
// old-style programme groups seeded first so the move into programmes is
// checked too. Then checks managing programmes, classes, tutors, statuses,
// projects and analytics. ROLLBACK at the end.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-programme-containers.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs.readFileSync(
  'supabase/migrations/20261102120000_programme_containers.sql',
  'utf8'
);

const id = n => `c9c9c9c9-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const ADMIN_A = id(2);
const ADMIN_B = id(3);
const TIA = id(4); // teacher A
const TOM = id(5); // teacher A
const OTO = id(6); // teacher B
const ANA = id(7); // learner A
const BAYO = id(8); // learner B
const [A, B] = [id(20), id(21)];
const OLD_SCHOOL_GROUP = id(30);
const OLD_PLATFORM_GROUP = id(31);
const PLAIN_A = id(32); // ordinary class at A (Tom)
const PLAIN_B = id(33); // ordinary class at B (Oto)

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
  const owner = async (sql, p) => {
    await asOwner();
    return one(sql, p);
  };
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
  const accept = async classId => {
    await asOwner();
    await q(
      "update public.enrollments set status = 'enrolled' where class_id = $1",
      [classId]
    );
  };

  await q('BEGIN');
  try {
    // --- old-style data, before the migration ---
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'School A', 'active'), ($2, 'School B', 'active')",
      [A, B]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [ADMIN_A, 'institution_admin', A, 'Sal'],
      [ADMIN_B, 'institution_admin', B, 'Ola'],
      [TIA, 'teacher', A, 'Tia'],
      [TOM, 'teacher', A, 'Tom'],
      [OTO, 'teacher', B, 'Oto'],
      [ANA, 'student', A, 'Ana'],
      [BAYO, 'student', B, 'Bayo'],
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
      `insert into public.classes (id, name, code, teacher_id, institution_id, school_programme, programme_group)
       values ($1, 'Film club', 'OLDSCH01', $2, $3, true, true)`,
      [OLD_SCHOOL_GROUP, TIA, A]
    );
    await q(
      `insert into public.classes (id, name, code, teacher_id, cohort_stage, programme_group)
       values ($1, 'Mentorship 2027', 'OLDPLT01', $2, 'mentorship', true)`,
      [OLD_PLATFORM_GROUP, OTO]
    );
    await q(
      'insert into public.programme_schools (class_id, institution_id) values ($1, $2), ($1, $3)',
      [OLD_PLATFORM_GROUP, A, B]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Drawing A', 'PLAINA01', $2, $3), ($4, 'Drawing B', 'PLAINB01', $5, $6)",
      [PLAIN_A, TOM, A, PLAIN_B, OTO, B]
    );

    await q(MIGRATION);

    // --- the move ---
    check(
      'existing programme groups became programmes',
      (
        await rows(
          `select p.name, p.scope, p.stage, c.code from public.programmes p
           join public.classes c on c.programme_id = p.id order by p.name`
        )
      ).map(r => [r.name, r.scope, r.stage, r.code]),
      [
        ['Film club', 'school', null, 'OLDSCH01'],
        ['Mentorship 2027', 'programme', 'mentorship', 'OLDPLT01'],
      ]
    );
    check(
      'with their schools',
      (
        await one(
          `select count(*)::int n from public.programme_school_links l
           join public.classes c on c.programme_id = l.programme_id where c.id = $1`,
          [OLD_PLATFORM_GROUP]
        )
      ).n,
      2
    );

    // --- school admin: create, add classes and tutors ---
    await as(ADMIN_A);
    check(
      "a school programme's tutor must be at that school",
      /teachers at that school/.test(
        await error(
          "select public.create_programme('Comics 2027', null, 'school', null, null, null, 'Comics', $1)",
          [OTO]
        )
      ),
      true
    );
    const created = (
      await one(
        "select public.create_programme('Comics 2027', 'Short comics', 'school', null, null, null, 'Comics group', $1) r",
        [TIA]
      )
    ).r;
    const prog = created.id;
    const comicsClass = created.class.id;
    check(
      'a school admin starts a programme with a first class and tutor',
      /^[A-Z2-9]{8}$/.test(created.class.code),
      true
    );
    check(
      'and can add a second class with another tutor',
      /^[A-Z2-9]{8}$/.test(
        (
          await one("select public.add_programme_class($1, 'Comics B', $2) r", [
            prog,
            TOM,
          ])
        ).r.code
      ),
      true
    );
    check(
      "can't add another school's class",
      /that school's classes/.test(
        await error('select public.attach_programme_class($1, $2)', [
          prog,
          PLAIN_B,
        ])
      ),
      true
    );
    check(
      "but can add one of the school's existing classes",
      (
        await one(
          'select count(*)::int n from public.programme_classes_available($1)',
          [prog]
        )
      ).n >= 1 &&
        (await error('select public.attach_programme_class($1, $2)', [
          prog,
          PLAIN_A,
        ])) === null,
      true
    );
    check(
      'the programme now holds three classes',
      (await one('select public.programme_detail($1) d', [prog])).d.classes
        .length,
      3
    );
    check(
      'and the class tutor can be changed',
      (await error('select public.set_programme_class_tutor($1, $2)', [
        comicsClass,
        TOM,
      ])) === null &&
        (
          await owner('select teacher_id from public.classes where id = $1', [
            comicsClass,
          ])
        ).teacher_id === TOM,
      true
    );
    await as(ADMIN_A);
    await q(
      "select public.update_programme($1, 'Comics club 2027', 'Edited')",
      [prog]
    );
    check(
      'and the programme edited',
      await owner(
        'select name, description from public.programmes where id = $1',
        [prog]
      ),
      { name: 'Comics club 2027', description: 'Edited' }
    );

    await as(ADMIN_B);
    check(
      "another school's admin can't manage it",
      /school admin or a platform admin/.test(
        await error("select public.update_programme($1, 'Hijack', null)", [
          prog,
        ])
      ),
      true
    );
    check(
      'or even open it',
      /not found/.test(
        await error('select public.programme_detail($1)', [prog])
      ),
      true
    );

    // --- joining and statuses ---
    const comicsCode = (
      await owner('select code from public.classes where id = $1', [
        comicsClass,
      ])
    ).code;
    check(
      "another school's learner can't join",
      /for learners at School A/.test(await join(BAYO, comicsCode)),
      true
    );
    await as(ADMIN_A);
    await q("select public.set_programme_status($1, 'suspended')", [prog]);
    check(
      'nobody joins a suspended programme',
      /suspended/.test(await join(ANA, comicsCode)),
      true
    );
    await as(ADMIN_A);
    await q("select public.set_programme_status($1, 'active')", [prog]);
    check(
      'after resuming, its learner can join',
      await join(ANA, comicsCode),
      null
    );
    await accept(comicsClass);
    check(
      'tutors were told about the suspension',
      (
        await owner(
          "select count(*)::int n from public.notifications where user_id = $1 and title like '%is suspended'",
          [TOM]
        )
      ).n >= 1,
      true
    );

    // --- projects ---
    await as(TOM);
    const project = (
      await one("select public.create_production_project($1, 'Strip one') id", [
        comicsClass,
      ])
    ).id;
    await q("select public.save_project_milestone($1, null, 'Script')", [
      project,
    ]);
    await q('select public.set_project_team($1, $2)', [
      project,
      JSON.stringify([{ student_id: ANA }]),
    ]);
    const milestone = (
      await owner(
        'select id from public.production_milestones where project_id = $1',
        [project]
      )
    ).id;
    await as(ADMIN_A);
    check(
      'the school admin can start projects in it too',
      (await error("select public.create_production_project($1, 'Strip two')", [
        comicsClass,
      ])) === null,
      true
    );
    await as(ADMIN_A);
    await q("select public.set_programme_status($1, 'suspended')", [prog]);
    await as(ANA);
    check(
      'no work is handed in while the programme is suspended',
      /programme is suspended/.test(
        await error(
          "select public.submit_milestone_version($1, 'https://youtu.be/a')",
          [milestone]
        )
      ),
      true
    );
    await as(ADMIN_A);
    await q("select public.set_programme_status($1, 'active')", [prog]);
    await as(TOM);
    await q(
      "select public.update_production_project($1, 'Strip one', null, null, 'suspended')",
      [project]
    );
    await as(ANA);
    check(
      'or while the project is suspended',
      /project is suspended/.test(
        await error(
          "select public.submit_milestone_version($1, 'https://youtu.be/a')",
          [milestone]
        )
      ),
      true
    );
    await as(TOM);
    await q(
      "select public.update_production_project($1, 'Strip one', null, null, 'active')",
      [project]
    );
    await as(ANA);
    check(
      'resumed, work can be handed in',
      (
        await one(
          "select public.submit_milestone_version($1, 'https://youtu.be/a') v",
          [milestone]
        )
      ).v,
      1
    );

    // --- analytics ---
    await as(ADMIN_A);
    const detail = (await one('select public.programme_detail($1) d', [prog]))
      .d;
    check(
      'managers see analytics',
      [
        detail.can_manage,
        detail.totals.classes,
        detail.totals.learners,
        detail.totals.projects,
        detail.totals.milestones_waiting,
      ],
      [true, 3, 1, 2, 1]
    );
    check('with learners by school', detail.by_school, [
      { school: 'School A', learners: 1 },
    ]);
    await as(TOM);
    const tutorView = (
      await one('select public.programme_detail($1) d', [prog])
    ).d;
    check(
      'tutors can open it but see no programme-wide analytics',
      [tutorView.can_manage, tutorView.totals, tutorView.classes.length],
      [false, null, 3]
    );

    // --- platform programmes ---
    await as(PLATFORM, 'aal2');
    const plat = (
      await one(
        "select public.create_programme('Fellowship lab', null, 'programme', null, $1::uuid[], 'fellowship', 'Lab A', $2) r",
        [[A], OTO]
      )
    ).r;
    check(
      'a platform admin can use a tutor from any school',
      plat.class && /^[A-Z2-9]{8}$/.test(plat.class.code),
      true
    );
    await q('select public.update_programme($1, $2, null, $3::uuid[], null)', [
      plat.id,
      'Open lab',
      [A, B],
    ]);
    check(
      'and change its schools and stage',
      await join(BAYO, plat.class.code),
      null
    );
    await as(ADMIN_B);
    const bOverview = await rows(
      'select name, can_manage from public.programmes_overview() order by name'
    );
    check(
      'a school taking part sees it read-only',
      bOverview.map(r => [r.name, r.can_manage]),
      [
        ['Mentorship 2027', false],
        ['Open lab', false],
      ]
    );
    await as(PLATFORM, 'aal2');
    check(
      'platform admins see every programme with totals',
      (await rows('select name, totals from public.programmes_overview()'))
        .length,
      4
    );

    // --- ending and deleting ---
    await as(ADMIN_A);
    await q("select public.set_programme_status($1, 'ended')", [prog]);
    check(
      'ending closes its projects',
      (
        await owner(
          "select count(*)::int n from public.production_projects p join public.classes c on c.id = p.class_id where c.programme_id = $1 and p.status <> 'completed'",
          [prog]
        )
      ).n,
      0
    );
    await as(TOM);
    check(
      'a project can be deleted by its tutor',
      (await error('select public.delete_production_project($1)', [
        project,
      ])) === null,
      true
    );
    await as(ADMIN_A);
    await q('select public.delete_programme($1)', [prog]);
    check(
      'deleting a programme keeps its classes as ordinary classes',
      (
        await owner(
          'select count(*)::int n from public.classes where id = any($1) and programme_id is null',
          [[comicsClass, PLAIN_A]]
        )
      ).n,
      2
    );
    check(
      'and removes its projects',
      (
        await owner(
          'select count(*)::int n from public.production_projects where class_id = $1',
          [comicsClass]
        )
      ).n,
      0
    );

    await as(TIA);
    check(
      "teachers can't move classes into programmes themselves",
      /programme's managers/.test(
        await error(
          'update public.classes set programme_id = $1 where id = $2',
          [plat.id, OLD_SCHOOL_GROUP]
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
