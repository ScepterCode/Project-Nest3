// Applies 20261017120000_rubric_templates_and_revisions.sql inside a
// transaction, seeds throwaway users and a class, checks programme rubric
// templates and the revision loop (RLS on), then ROLLBACK. Nothing persists.
// Meant for a throwaway database with the migrations replayed
// (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-rubric-templates-and-revisions.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261017120000_rubric_templates_and_revisions.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `a1a1a1a1-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const TEACHER = id(2);
const OTHER_TEACHER = id(3);
const STUDENT = id(4);
const SCHOOL = id(10);
const CLASS = id(20);
const ASSIGNMENT = id(30);

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
  const sub = async () => {
    await asOwner();
    return one(
      'select status, revision_count, revision_requested_at is not null as stamped, grade from public.submissions where assignment_id = $1 and student_id = $2',
      [ASSIGNMENT, STUDENT]
    );
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner) ---
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Rubric School', 'active')",
      [SCHOOL]
    );
    for (const [uid, role, school] of [
      [PLATFORM, 'system_admin', null],
      [TEACHER, 'teacher', SCHOOL],
      [OTHER_TEACHER, 'teacher', null],
      [STUDENT, 'student', SCHOOL],
    ]) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [uid, `${uid}@dry-run.test`, {}]
      );
      await q(
        'update public.users set role = $2, institution_id = $3 where id = $1',
        [uid, role, school]
      );
    }
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Anim', 'RUBDRY01', $2, $3)",
      [CLASS, TEACHER, SCHOOL]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled')",
      [CLASS, STUDENT]
    );
    await q(
      "insert into public.assignments (id, title, class_id, teacher_id, points_possible) values ($1, 'Walk cycle', $2, $3, 10)",
      [ASSIGNMENT, CLASS, TEACHER]
    );

    // --- 1. templates ---
    await as(TEACHER);
    const own = (
      await one(
        "insert into public.rubrics (name, teacher_id) values ('Mine', $1) returning id",
        [TEACHER]
      )
    ).id;
    check(
      "a tutor can't publish a programme template",
      /Only platform admins/.test(
        await error(
          'update public.rubrics set is_programme_template = true where id = $1',
          [own]
        )
      ),
      true
    );
    check(
      'or create one already published',
      /Only platform admins/.test(
        await error(
          "insert into public.rubrics (name, teacher_id, is_programme_template) values ('Sneaky', $1, true)",
          [TEACHER]
        )
      ),
      true
    );

    await as(PLATFORM, 'aal2');
    const tpl = (
      await one(
        "insert into public.rubrics (name, teacher_id) values ('Foundation: Walk cycle', $1) returning id",
        [PLATFORM]
      )
    ).id;
    const crit = (
      await one(
        "insert into public.rubric_criteria (rubric_id, name, order_index) values ($1, 'Timing', 0) returning id",
        [tpl]
      )
    ).id;
    await q(
      "insert into public.rubric_levels (criterion_id, name, points, order_index) values ($1, 'Developing', 2, 0), ($1, 'Strong', 5, 1)",
      [crit]
    );

    await as(OTHER_TEACHER);
    check(
      'an unpublished draft is private',
      (await q('select id from public.rubrics where id = $1', [tpl])).rowCount,
      0
    );

    await as(PLATFORM, 'aal1');
    check(
      'publishing needs two-factor',
      /two-factor/.test(
        await error('select public.platform_set_programme_template($1, true)', [
          tpl,
        ])
      ),
      true
    );
    await as(PLATFORM, 'aal2');
    await q('select public.platform_set_programme_template($1, true)', [tpl]);

    await as(OTHER_TEACHER);
    check(
      'any tutor can read a published template, its criteria and levels',
      [
        (await q('select id from public.rubrics where id = $1', [tpl]))
          .rowCount,
        (
          await q(
            'select id from public.rubric_criteria where rubric_id = $1',
            [tpl]
          )
        ).rowCount,
        (
          await q(
            'select id from public.rubric_levels where criterion_id = $1',
            [crit]
          )
        ).rowCount,
      ],
      [1, 1, 2]
    );
    check(
      "but can't change it",
      (
        await q("update public.rubrics set name = 'Hijacked' where id = $1", [
          tpl,
        ])
      ).rowCount,
      0
    );

    await as(TEACHER);
    await q(
      "update public.assignments set rubric = jsonb_build_object('id', $1::text, 'name', 'Foundation: Walk cycle') where id = $2",
      [tpl, ASSIGNMENT]
    );
    await as(PLATFORM, 'aal2');
    const listed = (
      await q(
        'select name, published, criteria, max_points, assignments, schools from public.platform_rubric_templates() where id = $1',
        [tpl]
      )
    ).rows[0];
    check(
      'template usage across schools',
      [
        listed.published,
        Number(listed.criteria),
        Number(listed.max_points),
        Number(listed.assignments),
        Number(listed.schools),
      ],
      [true, 1, 5, 1, 1]
    );

    await q('select public.platform_set_programme_template($1, false)', [tpl]);
    await as(OTHER_TEACHER);
    check(
      'a withdrawn template disappears for tutors',
      (await q('select id from public.rubrics where id = $1', [tpl])).rowCount,
      0
    );

    // --- 2. revision loop ---
    await as(STUDENT);
    check(
      "a student can't submit straight into 'revision_requested'",
      /Only the teacher/.test(
        await error(
          "insert into public.submissions (assignment_id, student_id, status) values ($1, $2, 'revision_requested')",
          [ASSIGNMENT, STUDENT]
        )
      ),
      true
    );
    await q(
      "insert into public.submissions (assignment_id, student_id, link_url, status) values ($1, $2, 'https://youtu.be/v1', 'submitted')",
      [ASSIGNMENT, STUDENT]
    );

    await as(TEACHER);
    await q(
      "update public.submissions set status = 'revision_requested', feedback = 'Slow the passing position down' where assignment_id = $1 and student_id = $2",
      [ASSIGNMENT, STUDENT]
    );
    check('tutor asks for changes (time stamped)', await sub(), {
      status: 'revision_requested',
      revision_count: 0,
      stamped: true,
      grade: null,
    });
    await asOwner();
    check(
      'student is notified with the feedback and a link back',
      (
        await q(
          'select type, message, action_url from public.notifications where user_id = $1',
          [STUDENT]
        )
      ).rows,
      [
        {
          type: 'revision_requested',
          message: 'Slow the passing position down',
          action_url: `/dashboard/student/assignments/${ASSIGNMENT}/submit`,
        },
      ]
    );

    await as(STUDENT);
    check(
      "a student can't approve their own work",
      /Only the teacher/.test(
        await error(
          "update public.submissions set status = 'graded' where assignment_id = $1",
          [ASSIGNMENT]
        )
      ),
      true
    );
    await q(
      "update public.submissions set status = 'submitted', link_url = 'https://youtu.be/v2', revision_count = 99 where assignment_id = $1",
      [ASSIGNMENT]
    );
    check(
      "resubmitting counts one round (the counter can't be set by hand)",
      (await sub()).revision_count,
      1
    );
    await as(STUDENT);
    await q(
      "update public.submissions set link_url = 'https://youtu.be/v3' where assignment_id = $1",
      [ASSIGNMENT]
    );
    check(
      'editing again before review adds no round',
      (await sub()).revision_count,
      1
    );

    await as(TEACHER);
    await q(
      "update public.submissions set status = 'graded', grade = 9, graded_at = now(), graded_by = $2 where assignment_id = $1",
      [ASSIGNMENT, TEACHER]
    );
    await as(STUDENT);
    check(
      'graded work is locked for the student',
      /graded and can no longer be changed/.test(
        await error(
          "update public.submissions set link_url = 'https://youtu.be/v4' where assignment_id = $1",
          [ASSIGNMENT]
        )
      ),
      true
    );
    check('the grade stands', (await sub()).grade, 9);
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
