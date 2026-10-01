// Applies supabase/migrations/20260930120000_lock_down_rls.sql inside a
// transaction, tests it as real users, then ROLLS BACK. Nothing is persisted.
// Usage: node scripts/dry-run-rls-migration.js  (reads SUPABASE_DATABASE_URL from .env.local)
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const fs = require('fs');

const sql = fs
  .readFileSync('supabase/migrations/20260930120000_lock_down_rls.sql', 'utf8')
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '');

(async () => {
  const c = new Client({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = (s, p) => c.query(s, p);
  let n = 0,
    failures = 0;
  const t = async (name, fn, expectErr = false) => {
    n++;
    await q('SAVEPOINT s' + n);
    try {
      const r = await fn();
      await q('RELEASE SAVEPOINT s' + n);
      if (expectErr) failures++;
      console.log(
        (expectErr ? 'FAIL (no error) ' : 'ok   ') + name,
        r === undefined ? '' : '=> ' + JSON.stringify(r)
      );
    } catch (e) {
      await q('ROLLBACK TO SAVEPOINT s' + n);
      if (!expectErr) failures++;
      console.log(
        (expectErr ? 'ok   ' : 'FAIL ') +
          name +
          ' => ERR ' +
          e.message.slice(0, 100)
      );
    }
  };
  const as = uid =>
    q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' })]
    );
  const asAnon = () =>
    q(
      "select set_config('role','anon',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ role: 'anon' })]
    );
  const reset = () =>
    q("reset role; select set_config('request.jwt.claims','',true)");
  const one = async (s, p) => (await q(s, p)).rows[0];

  try {
    await q('BEGIN');
    const cls = await one(
      'select c.id, c.code, c.teacher_id, c.enrollment_count from classes c join enrollments e on e.class_id = c.id group by c.id order by count(*) desc limit 1'
    );
    const s1 = (
      await one(
        'select student_id from enrollments where class_id = $1 limit 1',
        [cls.id]
      )
    ).student_id;
    const s2 = (
      await one(
        "select u.id from users u where role = 'student' and not exists (select 1 from enrollments e where e.student_id = u.id and e.class_id = $1) limit 1",
        [cls.id]
      )
    )?.id;
    const ownSub = await one(
      'select s.id from submissions s join assignments a on a.id = s.assignment_id where a.class_id = $1 and s.student_id = $2 limit 1',
      [cls.id, s1]
    );
    const anySub = await one(
      'select s.id from submissions s join assignments a on a.id = s.assignment_id where a.class_id = $1 limit 1',
      [cls.id]
    );
    const otherSub = await one(
      'select id from submissions where student_id <> $1 limit 1',
      [s1]
    );
    const otherClass = await one(
      'select id from classes where id not in (select class_id from enrollments where student_id = $1) limit 1',
      [s1]
    );
    const stranger = await one(
      'select id from users where id <> $1 and id not in (select teacher_id from classes) and id not in (select student_id from enrollments e join classes c on c.id=e.class_id where c.teacher_id in (select teacher_id from classes c2 join enrollments e2 on e2.class_id=c2.id where e2.student_id=$1)) limit 1',
      [s1]
    );
    const totalUsers = (await one('select count(*) from users')).count;
    console.log(
      `fixtures: class with ${cls.enrollment_count} enrolled; total users ${totalUsers}; spare student: ${!!s2}; own submission: ${!!ownSub}; other class: ${!!otherClass}\n`
    );

    await q(sql);
    console.log('ok   migration applied cleanly inside the transaction\n');

    await asAnon();
    await t(
      'signed-out visitor cannot read users',
      () => q('select count(*) from users').then(r => r.rows[0].count),
      true
    );
    await reset();

    console.log('\n-- as an enrolled STUDENT');
    await as(s1);
    await t(`sees only self + own teachers (was all ${totalUsers})`, () =>
      q('select count(*) from users').then(r => r.rows[0].count)
    );
    await t(
      'cannot promote self to system_admin',
      () => q("update users set role = 'system_admin' where id = $1", [s1]),
      true
    );
    await t(
      'cannot promote self to institution_admin',
      () =>
        q("update users set role = 'institution_admin' where id = $1", [s1]),
      true
    );
    await t('can still edit own name (rows updated)', () =>
      q('update users set first_name = first_name where id = $1', [s1]).then(
        r => r.rowCount
      )
    );
    await t('editing other users updates 0 rows', () =>
      q("update users set first_name = 'x' where id <> $1", [s1]).then(
        r => r.rowCount
      )
    );
    await t('sees only enrolled classes', () =>
      q('select count(*) from classes').then(r => r.rows[0].count)
    );
    await t('deleting classes affects 0 rows', () =>
      q('delete from classes').then(r => r.rowCount)
    );
    await t('deleting assignments affects 0 rows', () =>
      q('delete from assignments').then(r => r.rowCount)
    );
    await t('sees assignments of enrolled class', () =>
      q('select count(*) from assignments').then(r => r.rows[0].count)
    );
    await t('sees only own submissions (distinct students)', () =>
      q('select count(distinct student_id) from submissions').then(
        r => r.rows[0].count
      )
    );
    if (otherSub)
      await t("editing someone else's submission updates 0 rows", () =>
        q("update submissions set content = 'hacked' where id = $1", [
          otherSub.id,
        ]).then(r => r.rowCount)
      );
    if (ownSub)
      await t(
        'cannot set own grade',
        () =>
          q('update submissions set grade = 100 where id = $1', [ownSub.id]),
        true
      );
    if (ownSub)
      await t('can still resubmit own work (rows updated)', () =>
        q(
          "update submissions set content = content, status = 'submitted' where id = $1",
          [ownSub.id]
        ).then(r => r.rowCount)
      );
    if (otherClass)
      await t(
        'cannot insert an enrollment directly (bypassing class code)',
        () =>
          q(
            "insert into enrollments (class_id, student_id, status) values ($1, $2, 'enrolled')",
            [otherClass.id, s1]
          ),
        true
      );
    if (stranger)
      await t(
        'cannot send a notification to an unrelated user',
        () =>
          q(
            "insert into notifications (user_id, type, title, message) values ($1, 'system_message', 'x', 'x')",
            [stranger.id]
          ),
        true
      );
    await t('can notify own teacher', () =>
      q(
        "insert into notifications (user_id, type, title, message) values ($1, 'system_message', 't', 'm')",
        [cls.teacher_id]
      ).then(r => r.rowCount)
    );
    await reset();

    console.log("\n-- as that class's TEACHER");
    await as(cls.teacher_id);
    await t('sees self + own students', () =>
      q('select count(*) from users').then(r => r.rows[0].count)
    );
    await t('sees own classes', () =>
      q('select count(*) from classes').then(r => r.rows[0].count)
    );
    await t('sees submissions for own classes', () =>
      q('select count(*) from submissions').then(r => r.rows[0].count)
    );
    if (anySub)
      await t('can grade a submission (rows updated)', () =>
        q(
          "update submissions set grade = 90, status = 'graded' where id = $1",
          [anySub.id]
        ).then(r => r.rowCount)
      );
    await t(
      'cannot promote self to system_admin',
      () =>
        q("update users set role = 'system_admin' where id = $1", [
          cls.teacher_id,
        ]),
      true
    );
    await reset();

    if (s2) {
      console.log('\n-- JOIN FLOW as a student not yet in the class');
      await as(s2);
      await t('cannot see the class before joining', () =>
        q('select count(*) from classes where id = $1', [cls.id]).then(
          r => r.rows[0].count
        )
      );
      await t('join_class_by_code (messy input " code ")', () =>
        q('select join_class_by_code($1) j', [
          ' ' + cls.code.toLowerCase() + ' ',
        ]).then(r => ({
          class: r.rows[0].j.class_name,
          teacher: r.rows[0].j.teacher_name,
        }))
      );
      await t(
        'joining twice is rejected',
        () => q('select join_class_by_code($1)', [cls.code]),
        true
      );
      await t(
        'bad code is rejected',
        () => q("select join_class_by_code('NOPE-000')"),
        true
      );
      await t('can see the class after joining', () =>
        q('select count(*) from classes where id = $1', [cls.id]).then(
          r => r.rows[0].count
        )
      );
      await reset();
      await t(
        `enrollment_count bumped by trigger (was ${cls.enrollment_count})`,
        () =>
          q('select enrollment_count from classes where id = $1', [
            cls.id,
          ]).then(r => r.rows[0].enrollment_count)
      );
    }

    console.log('\n-- SIGNUP trigger');
    await reset();
    const nid = '00000000-0000-4000-8000-00000000abcd';
    await t('signup asking for system_admin becomes student', async () => {
      await q(
        "insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values ($1, 'dryrun-audit@example.invalid', $2, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')",
        [nid, JSON.stringify({ role: 'system_admin', first_name: 'Dry' })]
      );
      return await one('select role from users where id = $1', [nid]);
    });
    await t('signup as teacher stays teacher', async () => {
      await q(
        "insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values ('00000000-0000-4000-8000-00000000abce', 'dryrun-audit2@example.invalid', $1, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')",
        [JSON.stringify({ role: 'teacher' })]
      );
      return await one(
        "select role from users where id = '00000000-0000-4000-8000-00000000abce'"
      );
    });
    await t('new user gets notification preferences row', () =>
      q('select count(*) from notification_preferences where user_id = $1', [
        nid,
      ]).then(r => r.rows[0].count)
    );
  } catch (e) {
    failures++;
    console.log('FATAL', e.message);
  } finally {
    await q('ROLLBACK').catch(() => {});
    const chk = await one(
      "select count(*) from pg_policies where schemaname = 'public' and policyname = 'Allow authenticated users full access'"
    );
    console.log(
      `\nROLLED BACK. Old full-access policies (3 before applying, 0 after): ${chk.count}. Failures: ${failures}`
    );
    await c.end();
  }
})();
