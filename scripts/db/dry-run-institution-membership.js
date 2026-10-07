// Applies 20261007120000_institution_membership.sql inside a transaction,
// seeds throwaway users and classes, exercises institution setup, join codes
// and class-join linking as those users (RLS on), then ROLLBACK. Nothing
// persists. Meant for a throwaway database with the migrations replayed
// (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-institution-membership.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261007120000_institution_membership.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `dddddddd-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1);
const ADMIN2 = id(2);
const TEACHER = id(3);
const LONE_TEACHER = id(4);
const S_IN_CLASS = id(5); // enrolled with TEACHER before the teacher joins
const S_ELSEWHERE = id(6); // already in ADMIN2's institution
const S_JOINS_CLASS = id(7); // joins TEACHER's class after
const S_LONE_CLASS = id(8); // joins LONE_TEACHER's class (no institution)
const S_CODE = id(9); // joins with the regenerated code

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
    q("reset role; select set_config('request.jwt.claims','',true)");
  // Runs sql expecting an error; returns the message (or null if it worked).
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
  const instOf = async user =>
    (await one('select institution_id from public.users where id = $1', [user]))
      .institution_id;

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner: trusted, bypasses the guard) ---
    const users = [
      [ADMIN, 'institution_admin'],
      [ADMIN2, 'institution_admin'],
      [TEACHER, 'teacher'],
      [LONE_TEACHER, 'teacher'],
      [S_IN_CLASS, 'student'],
      [S_ELSEWHERE, 'student'],
      [S_JOINS_CLASS, 'student'],
      [S_LONE_CLASS, 'student'],
      [S_CODE, 'student'],
    ];
    for (const [uid, role] of users) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [uid, `${uid}@dry-run.test`, { role }]
      );
    }
    const CLASS = (
      await one(
        "insert into public.classes (name, code, teacher_id) values ('Dry run', 'DRYRUN01', $1) returning id",
        [TEACHER]
      )
    ).id;
    await q(
      "insert into public.classes (name, code, teacher_id) values ('Lone', 'DRYRUN02', $1)",
      [LONE_TEACHER]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled'), ($1, $3, 'active')",
      [CLASS, S_IN_CLASS, S_ELSEWHERE]
    );

    // --- institution setup ---
    await as(ADMIN2);
    const other = (
      await one("select public.create_my_institution('Other School') r")
    ).r;
    await as(S_ELSEWHERE);
    await q('select public.join_institution_by_code($1)', [other.join_code]);
    check(
      'setup: second institution exists, student joined it',
      await instOf(S_ELSEWHERE),
      other.id
    );

    await as(ADMIN);
    const created = (
      await one(
        "select public.create_my_institution('  Dry Run University ') r"
      )
    ).r;
    check('create: name trimmed', created.name, 'Dry Run University');
    check(
      'create: 8-char join code',
      /^[A-Z2-9]{8}$/.test(created.join_code),
      true
    );
    check('create: admin is in it', await instOf(ADMIN), created.id);
    check(
      'create: a second institution is refused',
      /already belong/.test(
        await error("select public.create_my_institution('Again')")
      ),
      true
    );
    await as(S_CODE);
    check(
      'create: students cannot create one',
      /Only institution admins/.test(
        await error("select public.create_my_institution('Nope')")
      ),
      true
    );

    // --- codes are private ---
    check(
      'privacy: students cannot read the codes table',
      /permission denied/.test(
        await error('select * from app_private.institution_join_codes')
      ),
      true
    );
    check(
      'privacy: students cannot call the linking helper',
      /permission denied/.test(
        await error(
          'select app_private.link_users_to_institution(array[$1]::uuid[], $2)',
          [S_CODE, created.id]
        )
      ),
      true
    );
    check(
      'privacy: a direct institution change is still blocked',
      /Not allowed/.test(
        await error(
          'update public.users set institution_id = $1 where id = $2',
          [created.id, S_CODE]
        )
      ),
      true
    );

    // --- teacher joins with the code ---
    await as(TEACHER);
    check(
      'join: a wrong code is refused',
      /No active institution/.test(
        await error("select public.join_institution_by_code('ZZZZZZZZ')")
      ),
      true
    );
    const messy = `${created.join_code.slice(0, 4).toLowerCase()}-${created.join_code.slice(4)} `;
    const joined = (
      await one('select public.join_institution_by_code($1) r', [messy])
    ).r;
    check('join: code is case/space/dash-insensitive', joined.id, created.id);
    check('join: teacher is in it', await instOf(TEACHER), created.id);
    check(
      'join: joining again is refused',
      /already belong to this institution/.test(
        await error('select public.join_institution_by_code($1)', [
          created.join_code,
        ])
      ),
      true
    );
    await asOwner();
    check(
      "join: teacher's class moved in",
      (
        await one('select institution_id from public.classes where id = $1', [
          CLASS,
        ])
      ).institution_id,
      created.id
    );
    check(
      "join: teacher's student without an institution moved in",
      await instOf(S_IN_CLASS),
      created.id
    );
    check(
      "join: teacher's student in another institution stayed",
      await instOf(S_ELSEWHERE),
      other.id
    );

    // --- students joining classes ---
    await as(S_JOINS_CLASS);
    await q("select public.join_class_by_code('dryrun01')");
    check(
      "class join: student joins the teacher's institution",
      await instOf(S_JOINS_CLASS),
      created.id
    );
    await as(S_LONE_CLASS);
    await q("select public.join_class_by_code('DRYRUN02')");
    check(
      'class join: teacher without an institution links nobody',
      await instOf(S_LONE_CLASS),
      null
    );

    // --- what each role can see ---
    await as(ADMIN);
    const mine = (await one('select public.get_my_institution() r')).r;
    check('get: admin sees the code', mine.join_code, created.join_code);
    check(
      "admin sees the institution's members",
      (
        await one(
          'select count(*)::int n from public.users where institution_id = $1',
          [created.id]
        )
      ).n,
      4 // admin, teacher, two students
    );
    await as(TEACHER);
    check(
      'get: teacher sees the institution but not the code',
      (await one('select public.get_my_institution() r')).r,
      { id: created.id, name: 'Dry Run University', join_code: null }
    );
    await as(S_LONE_CLASS);
    check(
      'get: user without an institution gets null',
      (await one('select public.get_my_institution() r')).r,
      null
    );

    // --- regenerating the code ---
    await as(TEACHER);
    check(
      'regenerate: teachers cannot',
      /Only an institution/.test(
        await error('select public.regenerate_institution_join_code()')
      ),
      true
    );
    await as(ADMIN);
    const fresh = (
      await one('select public.regenerate_institution_join_code() r')
    ).r;
    check('regenerate: new code differs', fresh !== created.join_code, true);
    await as(S_CODE);
    check(
      'regenerate: old code stops working',
      /No active institution/.test(
        await error('select public.join_institution_by_code($1)', [
          created.join_code,
        ])
      ),
      true
    );
    await q('select public.join_institution_by_code($1)', [fresh]);
    check('regenerate: new code works', await instOf(S_CODE), created.id);

    // --- signed out ---
    await asOwner();
    await q("select set_config('role','anon',true)");
    check(
      'signed-out visitors cannot join',
      /permission denied/.test(
        await error('select public.join_institution_by_code($1)', [fresh])
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
