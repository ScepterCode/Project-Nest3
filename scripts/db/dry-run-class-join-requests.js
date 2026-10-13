// Applies 20261014120000_class_join_requests.sql inside a transaction, seeds
// throwaway users and a class, walks through requesting, accepting,
// declining and withdrawing (RLS on), then ROLLBACK. Nothing persists.
// Meant for a throwaway database with the migrations replayed
// (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-class-join-requests.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261014120000_class_join_requests.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `abababab-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1);
const TEACHER = id(2);
const OTHER_TEACHER = id(3);
const S1 = id(4); // accepted
const S2 = id(5); // declined, then asks again and withdraws
const S3 = id(6); // class full
const INSTITUTION = id(10);
const CLASS = id(20);

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
  const as = sub =>
    q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub, role: 'authenticated' })]
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
  const status = async student => {
    await asOwner();
    return (
      (
        await one(
          'select status from public.enrollments where class_id = $1 and student_id = $2',
          [CLASS, student]
        )
      )?.status ?? null
    );
  };
  const count = async () => {
    await asOwner();
    return (
      await one('select enrollment_count n from public.classes where id = $1', [
        CLASS,
      ])
    ).n;
  };
  const notes = async user => {
    await asOwner();
    return (
      await q(
        'select type, title, action_url from public.notifications where user_id = $1 order by created_at',
        [user]
      )
    ).rows;
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner) ---
    for (const [uid, role] of [
      [ADMIN, 'institution_admin'],
      [TEACHER, 'teacher'],
      [OTHER_TEACHER, 'teacher'],
      [S1, 'student'],
      [S2, 'student'],
      [S3, 'student'],
    ]) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [
          uid,
          `${uid}@dry-run.test`,
          {
            first_name: role === 'student' ? `Stu${uid.slice(-1)}` : 'Tess',
            last_name: 'Test',
          },
        ]
      );
      await q('update public.users set role = $2 where id = $1', [uid, role]);
    }
    await q(
      "insert into public.institutions (id, name, status, created_by) values ($1, 'Join U', 'active', $2)",
      [INSTITUTION, ADMIN]
    );
    await q(
      'update public.users set institution_id = $1 where id in ($2, $3)',
      [INSTITUTION, ADMIN, TEACHER]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id, max_enrollment) values ($1, '2D Animation', 'JOINDRY1', $2, $3, 1)",
      [CLASS, TEACHER, INSTITUTION]
    );

    // --- request ---
    await as(S1);
    const res = (await one("select public.join_class_by_code('joindry1') r")).r;
    check('joining with the code creates a request', res.status, 'pending');
    check('request is pending', await status(S1), 'pending');
    check('a pending request does not count as enrolled', await count(), 0);
    const tNotes = await notes(TEACHER);
    check(
      'teacher is notified, with a link to the Students tab',
      tNotes.map(n => [n.type, n.title, n.action_url]),
      [
        [
          'enrollment_requested',
          'Stu4 Test asked to join 2D Animation',
          `/dashboard/teacher/classes/${CLASS}/manage?tab=students`,
        ],
      ]
    );
    await as(S1);
    check(
      'pending student cannot see the class',
      (await q('select id from public.classes where id = $1', [CLASS]))
        .rowCount,
      0
    );
    check(
      'pending student sees their request',
      (
        await q(
          'select class_name, teacher_name from public.my_join_requests()'
        )
      ).rows,
      [{ class_name: '2D Animation', teacher_name: 'Tess Test' }]
    );
    check(
      'asking twice is refused',
      /already asked/.test(
        await error("select public.join_class_by_code('JOINDRY1')")
      ),
      true
    );

    // --- who may answer ---
    await as(OTHER_TEACHER);
    check(
      "another teacher can't answer",
      /Only the class/.test(
        await error('select public.review_join_request($1, $2, true)', [
          CLASS,
          S1,
        ])
      ),
      true
    );
    await as(S1);
    check(
      "the student can't accept themselves",
      /Only the class/.test(
        await error('select public.review_join_request($1, $2, true)', [
          CLASS,
          S1,
        ])
      ),
      true
    );
    check(
      "and can't flip their own enrollment",
      (
        await q(
          "update public.enrollments set status = 'enrolled' where class_id = $1 and student_id = $2",
          [CLASS, S1]
        )
      ).rowCount,
      0
    );

    // --- teacher sees and accepts ---
    await as(TEACHER);
    check(
      'teacher sees the pending student and their name',
      (
        await q(
          "select u.first_name from public.enrollments e join public.users u on u.id = e.student_id where e.class_id = $1 and e.status = 'pending'",
          [CLASS]
        )
      ).rows,
      [{ first_name: 'Stu4' }]
    );
    check(
      'accept',
      (
        await one('select public.review_join_request($1, $2, true) r', [
          CLASS,
          S1,
        ])
      ).r,
      'enrolled'
    );
    check(
      'accepted: enrolled and counted',
      [await status(S1), await count()],
      ['enrolled', 1]
    );
    await asOwner();
    check(
      "accepted student joins the teacher's institution",
      (await one('select institution_id from public.users where id = $1', [S1]))
        .institution_id,
      INSTITUTION
    );
    check(
      'accepted student is notified',
      (await notes(S1)).map(n => [n.type, n.action_url]),
      [['enrollment_approved', `/dashboard/student/classes/${CLASS}`]]
    );
    await as(S1);
    check(
      'accepted student can see the class',
      (await q('select id from public.classes where id = $1', [CLASS]))
        .rowCount,
      1
    );
    await as(TEACHER);
    check(
      'answering twice is refused',
      /no pending request/.test(
        await error('select public.review_join_request($1, $2, true)', [
          CLASS,
          S1,
        ])
      ),
      true
    );

    // --- decline, ask again, withdraw ---
    await as(S2);
    await q("select public.join_class_by_code('JOINDRY1')");
    await as(TEACHER);
    check(
      'decline',
      (
        await one('select public.review_join_request($1, $2, false) r', [
          CLASS,
          S2,
        ])
      ).r,
      'declined'
    );
    check(
      'declined: not enrolled, not counted',
      [await status(S2), await count()],
      ['declined', 1]
    );
    check(
      'declined student is notified',
      (await notes(S2)).map(n => n.type),
      ['enrollment_declined']
    );
    await asOwner();
    check(
      'declined student stays out of the institution',
      (await one('select institution_id from public.users where id = $1', [S2]))
        .institution_id,
      null
    );
    await as(S2);
    await q("select public.join_class_by_code('JOINDRY1')");
    check('a declined student can ask again', await status(S2), 'pending');
    await as(S2);
    await q('select public.leave_class($1)', [CLASS]);
    check('withdrawing a request cancels it', await status(S2), 'cancelled');
    await as(S2);
    check(
      'no pending requests left',
      (await q('select * from public.my_join_requests()')).rowCount,
      0
    );

    // --- class size checked on acceptance ---
    await as(S3);
    await q("select public.join_class_by_code('JOINDRY1')");
    await as(TEACHER);
    check(
      'accepting into a full class is refused',
      /maximum enrollment/.test(
        await error('select public.review_join_request($1, $2, true)', [
          CLASS,
          S3,
        ])
      ),
      true
    );
    check('the request stays pending', await status(S3), 'pending');

    // --- students already enrolled before this change ---
    await asOwner();
    await q('update public.classes set max_enrollment = null where id = $1', [
      CLASS,
    ]);
    await as(S1);
    await q('select public.leave_class($1)', [CLASS]);
    check(
      'leaving still works for enrolled students',
      [await status(S1), await count()],
      ['dropped', 0]
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
