// Applies 20261013120000_uploads_enrollment_signup.sql inside a transaction,
// seeds throwaway users, checks upload limits, leaving/removing students,
// enrollment counts and sign-up codes (RLS on), then ROLLBACK. Nothing
// persists. Meant for a throwaway database with the migrations replayed
// (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-uploads-enrollment-signup.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261013120000_uploads_enrollment_signup.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `ffffffff-0000-0000-0000-${String(n).padStart(12, '0')}`;

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
  const as = (sub, role = 'authenticated') =>
    q(
      "select set_config('role',$2,true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub, role }), role]
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
  // Signs a user up the way Supabase Auth does (no JWT: trusted).
  const signUp = (uid, meta) =>
    q(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [uid, `${uid}@dry-run.test`, meta]
    );
  const userRow = uid =>
    one('select role, institution_id from public.users where id = $1', [uid]);
  const count = cls =>
    one('select enrollment_count n from public.classes where id = $1', [
      cls,
    ]).then(r => r.n);

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- 1. upload limits ---
    const subs = await one(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = 'submissions'"
    );
    check(
      'submissions: 50 MB per file',
      String(subs.file_size_limit),
      '52428800'
    );
    check(
      'submissions: video, GIF and project files allowed; HTML/SVG not',
      [
        'video/mp4',
        'video/quicktime',
        'image/gif',
        'application/octet-stream',
        'text/html',
        'image/svg+xml',
      ].map(t => subs.allowed_mime_types.includes(t)),
      [true, true, true, true, false, false]
    );
    check(
      'materials: Windows ZIP type allowed',
      (
        await one(
          "select 'application/x-zip-compressed' = any(allowed_mime_types) ok from storage.buckets where id = 'class-materials'"
        )
      ).ok,
      true
    );

    // --- 3. sign-up codes (needs an admin and an institution first) ---
    const invite = (await one('select public.create_admin_invite() c')).c;
    check(
      'operator can create an admin invite',
      /^[A-Z2-9]{8}$/.test(invite),
      true
    );

    await signUp(id(1), {
      role: 'institution',
      signup_code: invite.toLowerCase(),
    });
    check(
      'admin invite makes an institution admin',
      (await userRow(id(1))).role,
      'institution_admin'
    );
    await signUp(id(2), { role: 'institution', signup_code: invite });
    check(
      'an admin invite works only once',
      (await userRow(id(2))).role,
      'student'
    );
    await signUp(id(3), { role: 'teacher' });
    check(
      'choosing "teacher" without a code makes a student',
      (await userRow(id(3))).role,
      'student'
    );
    await signUp(id(4), { role: 'institution_admin' });
    check(
      'choosing "admin" without a code makes a student',
      (await userRow(id(4))).role,
      'student'
    );

    await as(id(1));
    const inst = (
      await one("select public.create_my_institution('Codes Academy') r")
    ).r;
    const mine = (await one('select public.get_my_institution() r')).r;
    check(
      'admin sees two different codes',
      /^[A-Z2-9]{8}$/.test(mine.join_code) &&
        /^[A-Z2-9]{8}$/.test(mine.staff_code) &&
        mine.join_code !== mine.staff_code,
      true
    );
    check(
      'teachers cannot create admin invites',
      /permission denied/.test(
        await error('select public.create_admin_invite()')
      ),
      true
    );

    await asOwner();
    const staffCode = mine.staff_code;
    await signUp(id(5), {
      role: 'teacher',
      signup_code: `${staffCode.slice(0, 4).toLowerCase()}-${staffCode.slice(4)}`,
    });
    check(
      'teacher code makes a teacher in that institution',
      await userRow(id(5)),
      {
        role: 'teacher',
        institution_id: inst.id,
      }
    );
    await signUp(id(6), { role: 'teacher', signup_code: mine.join_code });
    check(
      'the student code does not make a teacher',
      (await userRow(id(6))).role,
      'student'
    );

    const expired = (await one('select public.create_admin_invite() c')).c;
    await q(
      "update app_private.admin_invites set expires_at = now() - interval '1 minute' where code = $1",
      [expired]
    );
    await signUp(id(7), { signup_code: expired });
    check(
      'an expired admin invite makes a student',
      (await userRow(id(7))).role,
      'student'
    );

    await asOwner();
    await q("select set_config('role','anon',true)");
    check(
      'sign-up form can check codes before creating the account',
      [
        (await one('select public.check_signup_code($1) r', [staffCode])).r,
        (await one('select public.check_signup_code($1) r', [invite])).r,
        (await one('select public.check_signup_code($1) r', ['ZZZZZZZZ'])).r,
        (await one('select public.check_signup_code($1) r', [mine.join_code]))
          .r,
      ],
      ['teacher', null, null, null]
    );

    await as(id(5));
    check(
      'teacher sees the institution, not its codes',
      (await one('select public.get_my_institution() r')).r,
      { id: inst.id, name: 'Codes Academy', join_code: null, staff_code: null }
    );
    await as(id(1));
    const newStaff = (
      await one("select public.regenerate_institution_join_code('staff') r")
    ).r;
    await asOwner();
    check(
      'replacing the teacher code retires the old one',
      [
        (await one('select public.check_signup_code($1) r', [staffCode])).r,
        (await one('select public.check_signup_code($1) r', [newStaff])).r,
      ],
      [null, 'teacher']
    );

    // --- 2. enrollments ---
    const TEACHER = id(5);
    const OTHER_TEACHER = id(10);
    const S1 = id(11);
    const S2 = id(12);
    await signUp(OTHER_TEACHER, {});
    await q("update public.users set role = 'teacher' where id = $1", [
      OTHER_TEACHER,
    ]);
    await signUp(S1, {});
    await signUp(S2, {});
    const CLASS = (
      await one(
        "insert into public.classes (name, code, teacher_id) values ('Anim 1', 'ENRDRY01', $1) returning id",
        [TEACHER]
      )
    ).id;
    // From 20261014120000 joining creates a request the teacher accepts.
    const accept = async student => {
      const { ok } = await one(
        "select to_regprocedure('public.review_join_request(uuid,uuid,boolean)') is not null ok"
      );
      if (!ok) return;
      await as(TEACHER);
      await q('select public.review_join_request($1, $2, true)', [
        CLASS,
        student,
      ]);
    };
    await as(S1);
    await q("select public.join_class_by_code('ENRDRY01')");
    await as(S2);
    await q("select public.join_class_by_code('ENRDRY01')");
    await accept(S1);
    await accept(S2);
    check('count after two students join', await count(CLASS), 2);

    await as(OTHER_TEACHER);
    const othersUpdate = await q(
      "update public.enrollments set status = 'dropped' where class_id = $1 and student_id = $2",
      [CLASS, S1]
    );
    check("another teacher can't remove students", othersUpdate.rowCount, 0);

    await as(TEACHER);
    await q(
      "update public.enrollments set status = 'dropped' where class_id = $1 and student_id = $2",
      [CLASS, S1]
    );
    check('teacher removes a student: count drops', await count(CLASS), 1);

    await as(S2);
    await q('select public.leave_class($1)', [CLASS]);
    await asOwner();
    check('student leaves: count drops', await count(CLASS), 0);
    await as(S2);
    check(
      'leaving again is refused',
      /not enrolled/.test(
        await error('select public.leave_class($1)', [CLASS])
      ),
      true
    );
    check(
      'student who left no longer sees the class',
      (await q('select id from public.classes where id = $1', [CLASS]))
        .rowCount,
      0
    );
    await q("select public.join_class_by_code('ENRDRY01')");
    await accept(S2);
    check('rejoining with the code counts again', await count(CLASS), 1);

    await as(S1);
    check(
      "a removed student can't leave on someone else's behalf",
      (await error('select public.leave_class($1)', [CLASS])) !== null,
      true
    );
    await asOwner();
    check(
      "S2 is still enrolled after S1's attempt",
      (
        await one(
          'select status from public.enrollments where class_id = $1 and student_id = $2',
          [CLASS, S2]
        )
      ).status,
      'enrolled'
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
