// Applies 20261030120000_project_groups_and_teams.sql inside a transaction
// (on a database with the migrations replayed), seeds a mentorship group,
// checks who sees which groups and team candidates, then ROLLBACK.
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-project-groups.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs.readFileSync(
  'supabase/migrations/20261030120000_project_groups_and_teams.sql',
  'utf8'
);

const id = n => `f6f6f6f6-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const MENTOR = id(2);
const OTHER_TEACHER = id(3);
const ANA = id(4);
const SCHOOL_ADMIN = id(5);
const SCHOOL = id(20);
const GROUP = id(30);
const PLAIN = id(31);

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
  const rows = async (sql, p) => (await q(sql, p)).rows;
  const error = async (sql, p) => {
    await q('SAVEPOINT s');
    try {
      await q(sql, p);
      await q('RELEASE SAVEPOINT s');
      return null;
    } catch (e) {
      await q('ROLLBACK TO SAVEPOINT s');
      return e.message;
    }
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Aba Academy', 'active')",
      [SCHOOL]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [MENTOR, 'teacher', null, 'Mira'],
      [OTHER_TEACHER, 'teacher', SCHOOL, 'Tia'],
      [ANA, 'student', SCHOOL, 'Ana'],
      [SCHOOL_ADMIN, 'institution_admin', SCHOOL, 'Sal'],
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
      'update public.users set is_programme_mentor = true where id = $1',
      [MENTOR]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, cohort_stage) values ($1, 'Mentorship 2027', 'GRPDRY01', $2, 'mentorship')",
      [GROUP, MENTOR]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Foundation', 'GRPDRY02', $2, $3)",
      [PLAIN, OTHER_TEACHER, SCHOOL]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled')",
      [GROUP, ANA]
    );

    await as(MENTOR);
    check(
      'a mentor sees their own group',
      (
        await rows('select name, students::int from public.project_groups()')
      ).map(r => [r.name, r.students]),
      [['Mentorship 2027', 1]]
    );
    check(
      'and is told they are a mentor with a group',
      (await rows('select public.my_project_access() a'))[0].a,
      {
        role: 'teacher',
        stage: null,
        groups: 1,
        is_mentor: true,
        platform_admin: false,
      }
    );
    await as(OTHER_TEACHER);
    check(
      'other teachers see no groups',
      (await rows('select * from public.project_groups()')).length,
      0
    );
    await as(PLATFORM);
    check(
      'a platform admin without two-factor sees none',
      (await rows('select * from public.project_groups()')).length,
      0
    );
    await as(PLATFORM, 'aal2');
    check(
      'with two-factor, every group (not ordinary classes)',
      (await rows('select name, mentor_name from public.project_groups()')).map(
        r => [r.name, r.mentor_name]
      ),
      [['Mentorship 2027', 'Mira T']]
    );
    const project = (
      await rows("select public.create_production_project($1, 'Kite') id", [
        GROUP,
      ])
    )[0].id;
    check(
      'and can list the team candidates',
      (
        await rows('select name from public.project_team_candidates($1)', [
          project,
        ])
      ).map(r => r.name),
      ['Ana T']
    );
    await as(OTHER_TEACHER);
    check(
      "other teachers can't list a project's candidates",
      /Only the group's mentor/.test(
        await error('select * from public.project_team_candidates($1)', [
          project,
        ])
      ),
      true
    );
    await as(ANA);
    check(
      'a learner sees their stage',
      (await rows('select public.my_project_access() a'))[0].a.stage,
      'foundation'
    );
    await as(SCHOOL_ADMIN);
    check(
      'a school admin sees no groups to start projects in',
      (await rows('select * from public.project_groups()')).length,
      0
    );
    await asOwner();
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
