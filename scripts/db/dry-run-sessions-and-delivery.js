// Applies 20261018120000_sessions_attendance_and_delivery.sql inside a
// transaction, seeds a throwaway school with two tutors and their classes,
// checks sessions/attendance rules, the delivery metrics and programme
// viewer access (RLS on), then ROLLBACK. Nothing persists. Meant for a
// throwaway database with the migrations replayed (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-sessions-and-delivery.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261018120000_sessions_attendance_and_delivery.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `b2b2b2b2-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const VIEWER = id(2);
const SCHOOL_ADMIN = id(3);
const T1 = id(4);
const T2 = id(5);
const A = id(6);
const B = id(7);
const PENDING = id(8); // asked to join, not accepted
const LATER_VIEWER = id(9);
const SCHOOL = id(20);
const C1 = id(30);
const C2 = id(31);
const ASG1 = id(40); // past due: A graded, B missed
const ASG2 = id(41); // due next week
const ASG3 = id(42); // past due: B handed in 9 days ago, not reviewed; A missed

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
  const rows = async (sql, params) => (await q(sql, params)).rows;

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner) ---
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Delivery School', 'active')",
      [SCHOOL]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [VIEWER, 'programme_viewer', null, 'Vic'],
      [SCHOOL_ADMIN, 'institution_admin', SCHOOL, 'Sal'],
      [T1, 'teacher', SCHOOL, 'Tutor'],
      [T2, 'teacher', SCHOOL, 'Quiet'],
      [A, 'student', SCHOOL, 'Ann'],
      [B, 'student', SCHOOL, 'Ben'],
      [PENDING, 'student', null, 'Pen'],
      [LATER_VIEWER, 'student', null, 'Lee'],
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
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Anim A', 'DELDRY01', $3, $5), ($2, 'Anim B', 'DELDRY02', $4, $5)",
      [C1, C2, T1, T2, SCHOOL]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled'), ($1, $3, 'active'), ($1, $4, 'pending')",
      [C1, A, B, PENDING]
    );
    await q(
      `insert into public.assignments (id, title, class_id, teacher_id, points_possible, due_date) values
      ($1, 'Bounce', $4, $5, 10, now() - interval '2 days'),
      ($2, 'Walk', $4, $5, 10, now() + interval '7 days'),
      ($3, 'Jump', $4, $5, 10, now() - interval '1 day')`,
      [ASG1, ASG2, ASG3, C1, T1]
    );
    await q(
      `insert into public.submissions (assignment_id, student_id, status, submitted_at, graded_at, grade, feedback) values
      ($1, $3, 'graded', now() - interval '10 days', now() - interval '9 days', 8, 'Good arcs'),
      ($2, $4, 'submitted', now() - interval '9 days', null, null, null)`,
      [ASG1, ASG3, A, B]
    );

    // --- 1. sessions and attendance ---
    await as(T1);
    const today = (
      await one(
        "insert into public.class_sessions (class_id, held_on, topic) values ($1, current_date, 'Squash and stretch') returning id",
        [C1]
      )
    ).id;
    const earlier = (
      await one(
        "insert into public.class_sessions (class_id, held_on, topic) values ($1, current_date - 20, 'Timing') returning id",
        [C1]
      )
    ).id;
    await q(
      "insert into public.session_attendance (session_id, student_id, status) values ($1, $3, 'present'), ($1, $4, 'absent'), ($2, $3, 'late'), ($2, $4, 'excused')",
      [today, earlier, A, B]
    );
    check(
      'tutor logs sessions and attendance',
      (await one('select count(*)::int n from public.session_attendance')).n,
      4
    );
    check(
      "can't mark someone who isn't (yet) in the class",
      /row-level security/.test(
        await error(
          "insert into public.session_attendance (session_id, student_id, status) values ($1, $2, 'present')",
          [today, PENDING]
        )
      ),
      true
    );
    await as(T2);
    check(
      "another tutor can't log a session for this class",
      /row-level security/.test(
        await error(
          "insert into public.class_sessions (class_id, held_on, topic) values ($1, current_date, 'x')",
          [C1]
        )
      ),
      true
    );
    await as(A);
    check(
      'a student sees the class sessions',
      (
        await one(
          'select count(*)::int n from public.class_sessions where class_id = $1',
          [C1]
        )
      ).n,
      2
    );
    check(
      'and only their own attendance',
      (
        await rows(
          'select student_id, status from public.session_attendance order by status'
        )
      ).map(r => [r.student_id, r.status]),
      [
        [A, 'late'],
        [A, 'present'],
      ]
    );
    check(
      "students can't mark attendance",
      /row-level security/.test(
        await error(
          "update public.session_attendance set status = 'present' where student_id = $1",
          [B]
        )
      ) ||
        (
          await q(
            "update public.session_attendance set status = 'present' where student_id = $1",
            [B]
          )
        ).rowCount === 0,
      true
    );
    await as(SCHOOL_ADMIN);
    check(
      "the school admin can see the school's sessions",
      (await one('select count(*)::int n from public.class_sessions')).n,
      2
    );

    // --- 2. delivery metrics ---
    await as(PLATFORM, 'aal2');
    const metrics = await rows('select * from public.platform_tutor_metrics()');
    const t1 = metrics.find(m => m.teacher_id === T1);
    check(
      'tutor 1: classes, students, sessions',
      [
        Number(t1.classes),
        Number(t1.students),
        Number(t1.sessions_30d),
        Number(t1.sessions_total),
      ],
      [1, 2, 2, 2]
    );
    check(
      'tutor 1: attendance (excused not counted)',
      Number(t1.attendance_rate),
      66.7
    );
    check(
      'tutor 1: work and marking',
      [
        Number(t1.assignments),
        Number(t1.submissions),
        Number(t1.graded),
        Number(t1.avg_turnaround_hours),
      ],
      [3, 2, 1, 24]
    );
    check(
      'tutor 1: waiting, overdue, feedback, missed',
      [
        Number(t1.awaiting_review),
        Number(t1.overdue_reviews),
        Number(t1.feedback_rate),
        Number(t1.missed_deadlines),
      ],
      [1, 1, 100, 2]
    );
    check('tutor 1 flags', t1.flags, ['overdue_reviews', 'low_attendance']);
    check(
      'tutor 2 is flagged for no sessions',
      metrics.find(m => m.teacher_id === T2).flags,
      ['no_recent_sessions']
    );

    await as(SCHOOL_ADMIN);
    check(
      "a school admin sees their school's tutors",
      (
        await rows('select teacher_name from public.school_tutor_metrics()')
      ).map(r => r.teacher_name),
      ['Quiet Test', 'Tutor Test']
    );
    await as(T1);
    check(
      "tutors can't see the metrics table",
      /School admins only/.test(
        await error('select * from public.school_tutor_metrics()')
      ),
      true
    );

    // --- 3. programme viewer ---
    await as(VIEWER, 'aal1');
    check(
      'viewer needs two-factor',
      /two-factor/.test(await error('select public.programme_overview()')),
      true
    );
    await as(VIEWER, 'aal2');
    check(
      'viewer sees programme totals',
      (await one('select public.programme_overview() r')).r.teachers,
      2
    );
    const school = (await rows('select * from public.programme_schools()'))[0];
    check(
      'viewer sees delivery per school',
      [
        school.school_name,
        Number(school.sessions_30d),
        Number(school.missed_deadlines),
        Number(school.overdue_reviews),
        Number(school.tutors_flagged),
      ],
      ['Delivery School', 2, 2, 1, 2]
    );
    check(
      'no names or contacts in the school rows',
      Object.keys(school).some(
        k => /email|contact|admin|name/.test(k) && k !== 'school_name'
      ),
      false
    );
    check(
      "viewer can't open admin tools",
      /Platform admins only/.test(
        await error('select * from public.platform_schools()')
      ),
      true
    );
    check(
      'or look people up',
      /Platform admins only/.test(
        await error("select * from public.platform_search_people('ann')")
      ),
      true
    );
    check(
      'or see named tutor metrics',
      /Platform admins only/.test(
        await error('select * from public.platform_tutor_metrics()')
      ),
      true
    );
    await as(T1, 'aal2');
    check(
      "tutors can't use programme views",
      /Programme staff only/.test(
        await error('select public.programme_overview()')
      ),
      true
    );

    await as(PLATFORM, 'aal2');
    await q("select public.platform_set_role($1, 'programme_viewer')", [
      LATER_VIEWER,
    ]);
    await asOwner();
    check(
      'platform admin can make someone a programme viewer',
      await one(
        'select role, onboarding_completed from public.users where id = $1',
        [LATER_VIEWER]
      ),
      { role: 'programme_viewer', onboarding_completed: true }
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
