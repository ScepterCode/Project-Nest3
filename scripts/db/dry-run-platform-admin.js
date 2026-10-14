// Applies 20261016120000_platform_admin.sql inside a transaction, seeds a
// throwaway programme (platform admin, two schools, people, classes,
// submissions, files), checks every platform_* function and who may call it
// (RLS on), then ROLLBACK. Nothing persists. Meant for a throwaway database
// with the migrations replayed (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-platform-admin.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync('supabase/migrations/20261016120000_platform_admin.sql', 'utf8')
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `efefefef-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const ADMIN_A = id(2);
const TEACHER_A = id(3);
const STUDENT_A1 = id(4);
const STUDENT_A2 = id(5); // turned off general messages
const TEACHER_B = id(6);
const LOST = id(7); // student with no school
const SCHOOL_A = id(20);
const SCHOOL_B = id(21);
const CLASS_A = id(30);
const ASSIGN_A = id(40);

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
  const ownerOne = async (sql, params, back) => {
    await asOwner();
    const r = await one(sql, params);
    await as(back, 'aal2');
    return r;
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner) ---
    const people = [
      [PLATFORM, 'system_admin', 'Pat', 'Platform', null],
      [ADMIN_A, 'institution_admin', 'Ada', 'Admin', SCHOOL_A],
      [TEACHER_A, 'teacher', 'Tom', 'Teach', SCHOOL_A],
      [STUDENT_A1, 'student', 'Sam', 'One', SCHOOL_A],
      [STUDENT_A2, 'student', 'Sue', 'Two', SCHOOL_A],
      [TEACHER_B, 'teacher', 'Bea', 'Other', SCHOOL_B],
      [LOST, 'student', 'Lou', 'Lost_Student', null],
    ];
    await q(
      "insert into public.institutions (id, name, status, created_by) values ($1, 'Alpha Academy', 'active', null), ($2, 'Beta School', 'active', null)",
      [SCHOOL_A, SCHOOL_B]
    );
    for (const [uid, role, first, last, school] of people) {
      await q(
        "insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at, email_confirmed_at) values ($1, $2, $3, now() - interval '2 days', now())",
        [
          uid,
          `${first.toLowerCase()}@dry-run.test`,
          { first_name: first, last_name: last },
        ]
      );
      await q(
        'update public.users set role = $2, institution_id = $3 where id = $1',
        [uid, role, school]
      );
    }
    await q(
      'update public.notification_preferences set system_notifications = false where user_id = $1',
      [STUDENT_A2]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Anim 101', 'PLATDRY1', $2, $3)",
      [CLASS_A, TEACHER_A, SCHOOL_A]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled'), ($1, $3, 'enrolled')",
      [CLASS_A, STUDENT_A1, STUDENT_A2]
    );
    await q(
      "insert into public.assignments (id, title, class_id, teacher_id, points_possible) values ($1, 'Bounce', $2, $3, 10)",
      [ASSIGN_A, CLASS_A, TEACHER_A]
    );
    await q(
      "insert into public.submissions (assignment_id, student_id, status, submitted_at, grade) values ($1, $2, 'graded', now(), 8)",
      [ASSIGN_A, STUDENT_A1]
    );
    await q(
      "insert into storage.objects (bucket_id, name, metadata) values ('class-materials', $1, '{\"size\": 3000000}'), ('submissions', $2, '{\"size\": 1000000}')",
      [`${CLASS_A}/r/notes.pdf`, `${STUDENT_A1}/${ASSIGN_A}/bounce.mp4`]
    );

    // --- who may call ---
    await as(TEACHER_A, 'aal2');
    check(
      'a teacher is refused',
      /Platform admins only/.test(
        await error('select public.platform_overview()')
      ),
      true
    );
    await as(PLATFORM, 'aal1');
    check(
      'a platform admin without two-factor is refused',
      /two-factor/.test(await error('select public.platform_overview()')),
      true
    );
    await as(PLATFORM, 'aal2');
    check(
      'with two-factor it works',
      (await error('select public.platform_overview()')) === null,
      true
    );
    check(
      'signed-in users cannot write the activity log directly',
      /permission denied/.test(
        await error(
          "select public.platform_record_action($1, 'x', null, null)",
          [PLATFORM]
        )
      ),
      true
    );

    // --- 1. invites ---
    const code = (
      await one(
        "select public.platform_create_invite('Gamma School – Mr Gee', 30) c"
      )
    ).c;
    let invite = (
      await rows('select * from public.platform_list_invites()')
    )[0];
    check(
      'invite listed as unused with its note',
      [invite.code, invite.note, invite.status],
      [code, 'Gamma School – Mr Gee', 'unused']
    );
    await q('select public.platform_revoke_invite($1)', [code]);
    check(
      'revoked invite shows as revoked',
      (await rows('select status from public.platform_list_invites()'))[0]
        .status,
      'revoked'
    );
    await asOwner();
    await q("select set_config('role','anon',true)");
    check(
      'a revoked code is no longer valid',
      (await one('select public.check_signup_code($1) r', [code])).r,
      null
    );
    await asOwner();
    await q(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [id(8), 'gee@dry-run.test', { signup_code: code }]
    );
    check(
      'signing up with it makes a student',
      (await one('select role from public.users where id = $1', [id(8)])).role,
      'student'
    );
    await as(PLATFORM, 'aal2');
    const code2 = (await one("select public.platform_create_invite('Delta') c"))
      .c;
    await asOwner();
    await q(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [
        id(9),
        'dee@dry-run.test',
        { signup_code: code2, first_name: 'Dee', last_name: 'Delta' },
      ]
    );
    await as(PLATFORM, 'aal2');
    invite = (
      await rows(
        'select * from public.platform_list_invites() where code = $1',
        [code2]
      )
    )[0];
    check(
      'a used invite shows who used it',
      [invite.status, invite.used_by_email, invite.used_by_name],
      ['used', 'dee@dry-run.test', 'Dee Delta']
    );
    check(
      'a used invite cannot be cancelled',
      /already been used/.test(
        await error('select public.platform_revoke_invite($1)', [code2])
      ),
      true
    );

    // --- 3. overview ---
    const ov = (await one('select public.platform_overview() r')).r;
    check(
      'overview totals',
      [ov.schools, ov.teachers, ov.classes, ov.assignments, ov.submissions],
      [2, 2, 1, 1, 1]
    );
    check(
      'overview activity and weekly series',
      [ov.active_7d >= 7, ov.weekly.length],
      [true, 8]
    );

    // --- 2. schools ---
    const schools = await rows('select * from public.platform_schools()');
    const alpha = schools.find(s => s.name === 'Alpha Academy');
    check(
      'school row: people and work',
      [
        alpha.admins,
        Number(alpha.teachers),
        Number(alpha.students),
        Number(alpha.classes),
        Number(alpha.submissions),
      ],
      ['Ada Admin', 1, 2, 1, 1]
    );
    check(
      'school row: submission rate and average grade',
      [Number(alpha.submission_rate), Number(alpha.average_grade)],
      [50, 80]
    );
    const detail = (
      await one('select public.platform_school_detail($1) r', [SCHOOL_A])
    ).r;
    check(
      'school detail lists classes with teacher and counts',
      detail.classes.map(k => [k.name, k.teacher, k.students, k.assignments]),
      [['Anim 101', 'Tom Teach', 2, 1]]
    );
    await q('select public.platform_set_school_status($1, false)', [SCHOOL_A]);
    await asOwner();
    await q('select app_private.ensure_join_codes($1)', [SCHOOL_A]);
    const joinCodes = await one(
      'select code, staff_code from app_private.institution_join_codes where institution_id = $1',
      [SCHOOL_A]
    );
    await as(LOST, 'aal1');
    check(
      "a suspended school's codes stop working",
      /No active institution/.test(
        await error('select public.join_institution_by_code($1)', [
          joinCodes.code,
        ])
      ),
      true
    );
    await as(PLATFORM, 'aal2');
    await q('select public.platform_set_school_status($1, true)', [SCHOOL_A]);
    await as(LOST, 'aal1');
    check(
      "reactivated school's code works again",
      (await error('select public.join_institution_by_code($1)', [
        joinCodes.code,
      ])) === null,
      true
    );

    // --- 4. people ---
    await as(PLATFORM, 'aal2');
    check(
      'search by email fragment',
      (
        await rows("select name from public.platform_search_people('tom@')")
      ).map(r => r.name),
      ['Tom Teach']
    );
    check(
      'underscore is matched literally',
      (
        await rows("select name from public.platform_search_people('t_st')")
      ).map(r => r.name),
      ['Lou Lost_Student']
    );
    const tom = (
      await rows("select * from public.platform_search_people('tom@')")
    )[0];
    check(
      'search shows school, sign-in and confirmation',
      [
        tom.school_name,
        !!tom.last_sign_in_at,
        tom.email_confirmed,
        tom.disabled,
      ],
      ['Alpha Academy', true, true, false]
    );
    await q("select public.platform_set_role($1, 'institution_admin')", [
      TEACHER_B,
    ]);
    check(
      'make someone a school admin',
      (
        await ownerOne(
          'select role from public.users where id = $1',
          [TEACHER_B],
          PLATFORM
        )
      ).role,
      'institution_admin'
    );
    check(
      'cannot grant platform admin here',
      /must be student/.test(
        await error("select public.platform_set_role($1, 'system_admin')", [
          TEACHER_B,
        ])
      ),
      true
    );
    check(
      'cannot change a platform admin here',
      /SQL editor/.test(
        await error("select public.platform_set_role($1, 'student')", [
          PLATFORM,
        ])
      ),
      true
    );
    await q('select public.platform_move_user($1, $2)', [TEACHER_B, SCHOOL_A]);
    check(
      'move someone to another school',
      (
        await ownerOne(
          'select institution_id from public.users where id = $1',
          [TEACHER_B],
          PLATFORM
        )
      ).institution_id,
      SCHOOL_A
    );
    await as(ADMIN_A, 'aal2');
    check(
      'a school admin still cannot move people in from elsewhere',
      /Not allowed/.test(
        await error(
          'update public.users set institution_id = $1 where id = $2',
          [SCHOOL_A, id(8)]
        )
      ) ||
        (
          await q('update public.users set institution_id = $1 where id = $2', [
            SCHOOL_A,
            id(8),
          ]).catch(() => ({ rowCount: -1 }))
        ).rowCount === 0,
      true
    );

    // --- 6. announcements ---
    await as(PLATFORM, 'aal2');
    const sent = (
      await one(
        "select public.platform_send_announcement('students', 'Term starts Monday', 'Welcome back!', $1) n",
        [SCHOOL_A]
      )
    ).n;
    // Lou joined Alpha above; Sue turned general messages off.
    check("announcement to one school's students (one opted out)", sent, 2);
    await asOwner();
    check(
      'it arrives as a general message',
      (
        await rows(
          "select user_id, type from public.notifications where title = 'Term starts Monday'"
        )
      )
        .map(r => [r.user_id, r.type])
        .sort(),
      [
        [STUDENT_A1, 'system_message'],
        [LOST, 'system_message'],
      ].sort()
    );
    await as(PLATFORM, 'aal2');
    const all = (
      await one(
        "select public.platform_send_announcement('everyone', 'Maintenance', 'Down Sunday 2am') n"
      )
    ).n;
    check('everyone except platform admins and opted-out', all, 7);
    check(
      'announcement history',
      (
        await rows(
          'select title, recipients from public.platform_list_announcements()'
        )
      ).map(r => [r.title, r.recipients]),
      [
        ['Maintenance', 7],
        ['Term starts Monday', 2],
      ]
    );
    check(
      'bad audience refused',
      /Unknown audience/.test(
        await error(
          "select public.platform_send_announcement('parents', 'Hi', 'Hello')"
        )
      ),
      true
    );

    // --- 5. health ---
    const health = (await one('select public.platform_health() r')).r;
    check(
      'storage totals',
      [Number(health.storage_bytes), Number(health.files)],
      [4000000, 2]
    );
    check(
      'top classes by storage',
      health.top_classes.map(t => [t.class, t.school, Number(t.bytes)]),
      [['Anim 101', 'Alpha Academy', 4000000]]
    );
    check('database size reported', Number(health.database_bytes) > 0, true);

    // --- activity log ---
    await asOwner();
    check(
      'every change is in the activity log',
      (
        await rows('select action from app_private.platform_audit order by id')
      ).map(r => r.action),
      [
        'invite_created',
        'invite_revoked',
        'invite_created',
        'school_suspended',
        'school_reactivated',
        'role_changed',
        'user_moved',
        'announcement_sent',
        'announcement_sent',
      ]
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
