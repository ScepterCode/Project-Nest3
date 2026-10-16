// Applies 20261021120000_production_projects.sql inside a transaction (on
// top of the support-requests migration), seeds a mentorship group with a
// mentor and learners, checks projects, teams, milestones, versions and
// approvals (RLS on), then ROLLBACK. Nothing persists. Meant for a throwaway
// database with the migrations replayed (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-production-projects.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const read = name => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
const MIGRATION = read('20261021120000_production_projects.sql');
// Applied first if this database doesn't have it yet.
const SUPPORT = read('20261020120000_support_requests.sql');

const id = n => `e5e5e5e5-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const MENTOR = id(2);
const OTHER_MENTOR = id(3);
const ANA = id(4); // on the team
const BAYO = id(5); // on the team
const CHI = id(6); // in the group, not on the team
const DEMI = id(7); // not in the group
const SCHOOL_ADMIN = id(8); // Ana's school
const SCHOOL = id(20);
const GROUP = id(30);
const PLAIN_CLASS = id(31);

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
  const as = (sub, aal = 'aal1') =>
    q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub, role: 'authenticated', aal })]
    );
  const asOwner = () =>
    q("reset role; select set_config('request.jwt.claims','{}',true)");
  let sp = 0;
  const error = async (sql, params) => {
    const name = `sp${++sp}`;
    await q(`SAVEPOINT ${name}`);
    try {
      await q(sql, params);
      await q(`RELEASE SAVEPOINT ${name}`);
      return null;
    } catch (e) {
      await q(`ROLLBACK TO SAVEPOINT ${name}`);
      return e.message;
    }
  };
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  const ownerOne = async (sql, params) => {
    await asOwner();
    return one(sql, params);
  };
  const notes = async (user, like) =>
    (
      await ownerOne(
        "select count(*)::int n from public.notifications where user_id = $1 and type = 'project_update' and title like $2",
        [user, like]
      )
    ).n;

  await q('BEGIN');
  try {
    const hasSupport = (
      await one("select to_regclass('public.support_requests') is not null s")
    ).s;
    if (!hasSupport) await q(SUPPORT);
    await q(MIGRATION);

    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Aba Academy', 'active')",
      [SCHOOL]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [MENTOR, 'teacher', null, 'Mira'],
      [OTHER_MENTOR, 'teacher', null, 'Oko'],
      [ANA, 'student', SCHOOL, 'Ana'],
      [BAYO, 'student', SCHOOL, 'Bayo'],
      [CHI, 'student', SCHOOL, 'Chi'],
      [DEMI, 'student', SCHOOL, 'Demi'],
      [SCHOOL_ADMIN, 'institution_admin', SCHOOL, 'Sal'],
    ]) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [
          uid,
          `${first.toLowerCase()}@dry-run.test`,
          { first_name: first, last_name: 'Test' },
        ]
      );
      await q(
        'update public.users set role = $2, institution_id = $3 where id = $1',
        [uid, role, school]
      );
    }
    await q(
      'update public.users set is_programme_mentor = true where id in ($1, $2)',
      [MENTOR, OTHER_MENTOR]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, cohort_stage) values ($1, 'Mentorship 2027', 'PRJDRY01', $2, 'mentorship')",
      [GROUP, MENTOR]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Foundation 2D', 'PRJDRY02', $2, $3)",
      [PLAIN_CLASS, MENTOR, SCHOOL]
    );
    for (const s of [ANA, BAYO, CHI]) {
      await q(
        "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled')",
        [GROUP, s]
      );
    }

    // --- starting a project ---
    await as(OTHER_MENTOR);
    check(
      "another mentor can't start a project in this group",
      /Only the group's mentor/.test(
        await error(
          "select public.create_production_project($1, 'Short film')",
          [GROUP]
        )
      ),
      true
    );
    await as(MENTOR);
    check(
      'projects are only for mentorship/fellowship groups',
      /mentorship and fellowship/.test(
        await error(
          "select public.create_production_project($1, 'Short film')",
          [PLAIN_CLASS]
        )
      ),
      true
    );
    const project = (
      await one(
        "select public.create_production_project($1, 'The Lost Kite', 'A two-minute short.', 'https://drive.google.com/drive/folders/abc') id",
        [GROUP]
      )
    ).id;

    // --- team ---
    check(
      "learners outside the group can't join the team",
      /must be in this group/.test(
        await error('select public.set_project_team($1, $2)', [
          project,
          JSON.stringify([{ student_id: DEMI }]),
        ])
      ),
      true
    );
    await q('select public.set_project_team($1, $2)', [
      project,
      JSON.stringify([
        { student_id: ANA, role_title: 'Storyboard' },
        { student_id: BAYO, role_title: 'Animator' },
      ]),
    ]);
    check(
      'new team members are notified',
      await notes(ANA, 'You joined the project%'),
      1
    );
    await as(MENTOR);
    await q('select public.set_project_team($1, $2)', [
      project,
      JSON.stringify([
        { student_id: ANA, role_title: 'Director' },
        { student_id: BAYO, role_title: 'Animator' },
      ]),
    ]);
    check(
      "saving the team again doesn't re-notify, and updates roles",
      [
        await notes(ANA, 'You joined the project%'),
        (
          await ownerOne(
            'select role_title from public.production_project_members where student_id = $1',
            [ANA]
          )
        ).role_title,
      ],
      [1, 'Director']
    );

    // --- milestones ---
    await as(MENTOR);
    const script = (
      await one(
        "select public.save_project_milestone($1, null, 'Script', 'One page.', '2027-02-01') id",
        [project]
      )
    ).id;
    const board = (
      await one(
        "select public.save_project_milestone($1, null, 'Storyboard') id",
        [project]
      )
    ).id;
    await as(ANA);
    check(
      "a learner can't add milestones",
      /Only the group's mentor/.test(
        await error("select public.save_project_milestone($1, null, 'Party')", [
          project,
        ])
      ),
      true
    );

    // --- visibility ---
    await as(CHI);
    check(
      "a learner in the group but not on the team can't see the project",
      (await one('select count(*)::int n from public.production_projects')).n,
      0
    );
    check(
      'or open it',
      /not found/.test(
        await error('select public.production_project_detail($1)', [project])
      ),
      true
    );
    await as(SCHOOL_ADMIN);
    check(
      "a team member's school admin can follow it",
      (await one('select count(*)::int n from public.production_projects')).n,
      1
    );
    await as(ANA);
    const detail = (
      await one('select public.production_project_detail($1) d', [project])
    ).d;
    check(
      'the team sees milestones in order and their roles',
      [
        detail.milestones.map(m => m.title),
        detail.team.map(t => t.role_title),
        detail.i_member,
        detail.i_mentor,
      ],
      [['Script', 'Storyboard'], ['Director', 'Animator'], true, false]
    );

    // --- versions and approval ---
    await as(CHI);
    check(
      "someone off the team can't hand in work",
      /Only the project team/.test(
        await error(
          "select public.submit_milestone_version($1, 'https://youtu.be/x')",
          [script]
        )
      ),
      true
    );
    await as(ANA);
    check(
      'a version needs a web link',
      /http/.test(
        await error(
          "select public.submit_milestone_version($1, 'file:///c:/script.pdf')",
          [script]
        )
      ),
      true
    );
    check(
      'version numbers count up',
      [
        (
          await one(
            "select public.submit_milestone_version($1, 'https://docs.google.com/document/d/1', 'First draft') v",
            [script]
          )
        ).v,
        (
          await one(
            "select public.submit_milestone_version($1, 'https://docs.google.com/document/d/2', 'Fixed typos') v",
            [script]
          )
        ).v,
      ],
      [1, 2]
    );
    check(
      'a newer version replaces the one waiting for review',
      (
        await ownerOne(
          "select string_agg(decision, ',' order by version) d from public.production_milestone_versions where milestone_id = $1",
          [script]
        )
      ).d,
      'superseded,pending'
    );
    check(
      'the mentor is told it is ready for review',
      await notes(MENTOR, '%Script v2 ready for review'),
      1
    );
    check(
      'and the teammate sees it was handed in',
      await notes(BAYO, '%Script v2 handed in'),
      1
    );

    const v2 = (
      await ownerOne(
        'select id from public.production_milestone_versions where milestone_id = $1 and version = 2',
        [script]
      )
    ).id;
    const v1 = (
      await ownerOne(
        'select id from public.production_milestone_versions where milestone_id = $1 and version = 1',
        [script]
      )
    ).id;
    await as(ANA);
    check(
      "a learner can't approve their own work",
      /Only the group's mentor/.test(
        await error('select public.review_milestone_version($1, true)', [v2])
      ),
      true
    );
    await as(MENTOR);
    check(
      'a replaced version cannot be reviewed',
      /already been reviewed or replaced/.test(
        await error('select public.review_milestone_version($1, true)', [v1])
      ),
      true
    );
    check(
      'asking for changes needs a note',
      /Say what needs to change/.test(
        await error('select public.review_milestone_version($1, false)', [v2])
      ),
      true
    );
    await q(
      "select public.review_milestone_version($1, false, 'Make the ending clearer.')",
      [v2]
    );
    check(
      'the milestone shows changes requested and the team is told',
      [
        (
          await ownerOne(
            'select status from public.production_milestones where id = $1',
            [script]
          )
        ).status,
        await notes(ANA, '%Script needs changes'),
      ],
      ['changes_requested', 1]
    );

    await as(BAYO);
    await q(
      "select public.submit_milestone_version($1, 'https://docs.google.com/document/d/3')",
      [script]
    );
    const v3 = (
      await ownerOne(
        'select id from public.production_milestone_versions where milestone_id = $1 and version = 3',
        [script]
      )
    ).id;
    await as(MENTOR);
    await q("select public.review_milestone_version($1, true, 'Lovely.')", [
      v3,
    ]);
    await as(ANA);
    check(
      'an approved milestone takes no more versions',
      /already approved/.test(
        await error(
          "select public.submit_milestone_version($1, 'https://youtu.be/y')",
          [script]
        )
      ),
      true
    );
    await as(MENTOR);
    check(
      "a milestone with work handed in can't be deleted",
      /can't be removed/.test(
        await error('select public.delete_project_milestone($1)', [script])
      ),
      true
    );
    check(
      'an empty one can',
      await error('select public.delete_project_milestone($1)', [board]),
      null
    );

    const sound = (
      await one("select public.save_project_milestone($1, null, 'Sound') id", [
        project,
      ])
    ).id;
    const mine = (await q('select * from public.my_production_projects()'))
      .rows;
    check(
      "the mentor's list shows progress",
      mine.map(p => [p.title, +p.team_size, +p.milestones, +p.approved]),
      [['The Lost Kite', 2, 2, 1]]
    );

    // --- finishing, and the platform view ---
    await as(PLATFORM);
    check(
      'platform admins need two-factor sign-in to manage projects',
      /Only the group's mentor/.test(
        await error(
          "select public.update_production_project($1, 'The Lost Kite', null, null, 'completed')",
          [project]
        )
      ),
      true
    );
    await as(PLATFORM, 'aal2');
    check(
      'platform admins see every project',
      (await q('select * from public.my_production_projects()')).rows.length,
      1
    );
    await q(
      "select public.update_production_project($1, 'The Lost Kite', null, 'https://drive.google.com/drive/folders/abc', 'completed')",
      [project]
    );
    check(
      'completing a project tells the team',
      await notes(BAYO, 'Project complete:%'),
      1
    );
    await as(ANA);
    check(
      'no work is handed in to a completed project',
      /is completed/.test(
        await error(
          "select public.submit_milestone_version($1, 'https://youtu.be/z')",
          [sound]
        )
      ),
      true
    );
    check(
      "learners can't write rows directly",
      /permission denied/.test(
        await error(
          "update public.production_milestones set status = 'approved' where id = $1",
          [sound]
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
