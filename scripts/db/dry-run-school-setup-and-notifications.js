// Applies 20261015120000_school_setup_and_notification_settings.sql inside a
// transaction, seeds throwaway users, checks school setup from onboarding and
// that notification preferences are honoured (RLS on), then ROLLBACK.
// Nothing persists. Meant for a throwaway database with the migrations
// replayed (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-school-setup-and-notifications.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261015120000_school_setup_and_notification_settings.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `cdcdcdcd-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1);
const TEACHER = id(2);
const STUDENT = id(3);
const OTHER = id(4);

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
  const setUp = args =>
    one(
      'select public.set_up_my_institution($1, $2, $3, $4, $5, $6, $7, $8) r',
      [
        args.name,
        args.type ?? null,
        args.size ?? null,
        args.contactName ?? null,
        args.title ?? null,
        args.email ?? null,
        args.phone ?? null,
        args.departments ?? [],
      ]
    ).then(r => r.r);

  await q('BEGIN');
  try {
    await q(MIGRATION);
    for (const [uid, role] of [
      [ADMIN, 'institution_admin'],
      [TEACHER, 'teacher'],
      [STUDENT, 'student'],
      [OTHER, 'student'],
    ]) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [uid, `${uid}@dry-run.test`, {}]
      );
      await q('update public.users set role = $2 where id = $1', [uid, role]);
    }

    // --- 1. school setup from onboarding ---
    await as(ADMIN);
    const first = await setUp({
      name: '  Lagos Animation Academy ',
      type: 'Training Center',
      size: '101–500 students',
      contactName: 'Ada Admin',
      title: 'Head of Programme',
      email: 'Ada@Academy.test',
      phone: '+234 800 000 0000',
      departments: [
        '2D Animation',
        '3D Animation',
        ' 2d animation ',
        '',
        'Storyboarding',
      ],
    });
    check(
      'school created with its details',
      {
        name: first.name,
        type: first.institution_type,
        size: first.size_band,
        contact: [
          first.contact_name,
          first.contact_title,
          first.contact_email,
          first.contact_phone,
        ],
      },
      {
        name: 'Lagos Animation Academy',
        type: 'Training Center',
        size: '101–500 students',
        contact: [
          'Ada Admin',
          'Head of Programme',
          'ada@academy.test',
          '+234 800 000 0000',
        ],
      }
    );
    check(
      'departments created once each (blank and duplicate skipped)',
      first.department_count,
      3
    );
    check(
      'admin gets both codes too',
      [!!first.join_code, !!first.staff_code],
      [true, true]
    );
    check(
      'admin is linked to the new school',
      (
        await one('select institution_id from public.users where id = $1', [
          ADMIN,
        ])
      ).institution_id,
      first.id
    );

    const second = await setUp({
      name: '',
      size: '501–2,000 students',
      departments: ['VFX', 'Storyboarding'],
    });
    check(
      'running again updates the given details only',
      [second.name, second.institution_type, second.size_band],
      ['Lagos Animation Academy', 'Training Center', '501–2,000 students']
    );
    check('and adds only the new departments', second.department_count, 4);
    check(
      'a bad contact email is refused',
      /check constraint/.test(
        await error(
          'select public.set_up_my_institution($1, null, null, null, null, $2)',
          ['Lagos Animation Academy', 'not-an-email']
        )
      ),
      true
    );
    check(
      'admin sees the departments',
      (await q('select name from public.departments order by name')).rows.map(
        r => r.name
      ),
      ['2D Animation', '3D Animation', 'Storyboarding', 'VFX']
    );

    await as(TEACHER);
    check(
      "teachers can't set up a school",
      /Only institution admins/.test(
        await error("select public.set_up_my_institution('X')")
      ),
      true
    );

    // --- 2. notification preferences ---
    await as(STUDENT);
    const upd = await q(
      'update public.notification_preferences set assignment_notifications = false, announcement_notifications = false where user_id = $1',
      [STUDENT]
    );
    check('a user can change their own preferences', upd.rowCount, 1);
    const other = await q(
      'update public.notification_preferences set grade_notifications = false where user_id = $1',
      [OTHER]
    );
    check("but not someone else's", other.rowCount, 0);

    await asOwner();
    for (const type of [
      'assignment_created',
      'class_announcement',
      'assignment_graded',
      'enrollment_approved',
      'role_changed',
    ]) {
      await q(
        "insert into public.notifications (user_id, type, title, message) values ($1, $2, 'T', 'M')",
        [STUDENT, type]
      );
    }
    check(
      'switched-off categories are skipped; grades and membership notices arrive',
      (
        await q(
          'select type from public.notifications where user_id = $1 order by type',
          [STUDENT]
        )
      ).rows.map(r => r.type),
      ['assignment_graded', 'enrollment_approved', 'role_changed']
    );
    await q(
      "insert into public.notifications (user_id, type, title, message) values ($1, 'assignment_created', 'T', 'M')",
      [OTHER]
    );
    check(
      'users who changed nothing still get everything',
      (
        await one(
          'select count(*)::int n from public.notifications where user_id = $1',
          [OTHER]
        )
      ).n,
      1
    );

    await q("select set_config('role','anon',true)");
    check(
      'signed-out visitors cannot read preferences',
      /permission denied/.test(
        await error('select * from public.notification_preferences')
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
