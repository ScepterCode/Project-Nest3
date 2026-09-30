// Applies supabase/migrations/20260930160000_role_requests.sql inside a
// transaction, tests it as real users, then ROLLS BACK.
// Usage: node scripts/dry-run-role-requests-migration.js  (reads SUPABASE_DATABASE_URL from .env.local)
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const fs = require('fs');

const sql = fs
  .readFileSync('supabase/migrations/20260930160000_role_requests.sql', 'utf8')
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
          e.message.slice(0, 110)
      );
    }
  };
  const as = uid =>
    q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' })]
    );
  const reset = () =>
    q("reset role; select set_config('request.jwt.claims','',true)");
  const one = async (s, p) => (await q(s, p)).rows[0];
  // On error, t() rolls back to its savepoint, which also undoes the role
  // switch, so only reset on success (resetting in an aborted transaction
  // would hide the real error).
  const asUser = async (uid, fn) => {
    await as(uid);
    const result = await fn();
    await reset();
    return result;
  };

  try {
    await q('BEGIN');
    // Fixtures: an institution admin with an institution, four student
    // members, and one student outside any institution.
    const admin = (
      await one("select id from users where role = 'institution_admin' limit 1")
    ).id;
    const inst = (await one('select id from institutions limit 1')).id;
    const students = (
      await q(
        "select id from users where role = 'student' order by created_at limit 5"
      )
    ).rows.map(r => r.id);
    const [s1, s2, s3, s4, outsider] = students;
    await q('update users set institution_id = $1 where id = any($2::uuid[])', [
      inst,
      [admin, s1, s2, s3, s4],
    ]);
    await q('update users set institution_id = null where id = $1', [outsider]);

    await q(sql);
    console.log('ok   migration applied cleanly inside the transaction\n');

    console.log('-- REQUESTING');
    let r1;
    await t('member requests teacher', async () => {
      r1 = (
        await asUser(s1, () =>
          one("select request_role('teacher', 'I teach Biology 101') id")
        )
      ).id;
      return 'created';
    });
    await t('admins were notified', () =>
      q(
        "select count(*) from notifications where user_id = $1 and metadata->>'role_request_id' = $2",
        [admin, r1]
      ).then(r => r.rows[0].count)
    );
    await t(
      'second pending request is rejected',
      () =>
        asUser(s1, () =>
          q("select request_role('institution_admin', 'again')")
        ),
      true
    );
    await t(
      'system_admin cannot be requested',
      () =>
        asUser(s2, () => q("select request_role('system_admin', 'please')")),
      true
    );
    await t(
      'empty reason is rejected',
      () => asUser(s2, () => q("select request_role('teacher', '   ')")),
      true
    );
    await t(
      'someone without an institution cannot request',
      () => asUser(outsider, () => q("select request_role('teacher', 'hi')")),
      true
    );
    await t(
      'direct insert is blocked',
      () =>
        asUser(s2, () =>
          q(
            "insert into role_requests (user_id, requested_role, institution_id, status) values ($1, 'institution_admin', $2, 'approved')",
            [s2, inst]
          )
        ),
      true
    );
    await t('member sees only their own requests', () =>
      asUser(s2, () =>
        q('select count(*) from role_requests').then(r => r.rows[0].count)
      )
    );
    await t('admin sees the institution request', () =>
      asUser(admin, () =>
        q('select count(*) from role_requests where id = $1', [r1]).then(
          r => r.rows[0].count
        )
      )
    );

    console.log('\n-- REVIEWING');
    await t(
      'non-admin cannot review',
      () =>
        asUser(s2, () => q('select review_role_request($1, true, null)', [r1])),
      true
    );
    await t('admin approves', () =>
      asUser(admin, () =>
        q("select review_role_request($1, true, 'Welcome aboard')", [r1]).then(
          () => 'approved'
        )
      )
    );
    await t('role actually changed', () =>
      one('select role from users where id = $1', [s1])
    );
    await t('request marked approved with reviewer', () =>
      one(
        'select status, reviewed_by = $2 as by_admin, review_notes from role_requests where id = $1',
        [r1, admin]
      )
    );
    await t('audit log entry written', () =>
      one(
        'select action, old_role, new_role from role_audit_log where user_id = $1',
        [s1]
      )
    );
    await t('requester notified', () =>
      one(
        "select type, title from notifications where user_id = $1 and metadata->>'role_request_id' = $2",
        [s1, r1]
      )
    );
    await t('requester sees their audit log', () =>
      asUser(s1, () =>
        q('select count(*) from role_audit_log').then(r => r.rows[0].count)
      )
    );
    await t(
      'approving twice is rejected',
      () =>
        asUser(admin, () =>
          q('select review_role_request($1, true, null)', [r1])
        ),
      true
    );

    let r2;
    await t('deny path: request', async () => {
      r2 = (
        await asUser(s2, () =>
          one("select request_role('institution_admin', 'I run IT') id")
        )
      ).id;
      return 'created';
    });
    await t('admin denies', () =>
      asUser(admin, () =>
        q("select review_role_request($1, false, 'Please ask the principal')", [
          r2,
        ]).then(() => 'denied')
      )
    );
    await t('role unchanged after deny', () =>
      one('select role from users where id = $1', [s2])
    );

    let r3;
    await t('stale role: request', async () => {
      r3 = (
        await asUser(s3, () => one("select request_role('teacher', 'x') id"))
      ).id;
      return 'created';
    });
    await q("update users set role = 'teacher' where id = $1", [s3]);
    await t(
      'approving after the role changed is rejected',
      () =>
        asUser(admin, () =>
          q('select review_role_request($1, true, null)', [r3])
        ),
      true
    );

    let r4;
    await t('expiry: request', async () => {
      r4 = (
        await asUser(s4, () => one("select request_role('teacher', 'x') id"))
      ).id;
      return 'created';
    });
    await q(
      "update role_requests set requested_at = now() - interval '31 days', expires_at = now() - interval '1 day' where id = $1",
      [r4]
    );
    await t(
      'reviewing an expired request is rejected',
      () =>
        asUser(admin, () =>
          q('select review_role_request($1, true, null)', [r4])
        ),
      true
    );

    let rs;
    await t('admin can request for themselves', async () => {
      rs = (
        await asUser(admin, () =>
          one("select request_role('teacher', 'switching') id")
        )
      ).id;
      return 'created';
    });
    await t(
      'admin cannot approve their own request',
      () =>
        asUser(admin, () =>
          q('select review_role_request($1, true, null)', [rs])
        ),
      true
    );

    console.log('\n-- RATE LIMIT');
    await t(
      '3 requests in a day allowed, 4th rejected',
      async () => {
        for (let i = 0; i < 2; i++) {
          const id = (
            await asUser(s2, () =>
              one("select request_role('institution_admin', 'retry') id")
            )
          ).id;
          await asUser(admin, () =>
            q('select review_role_request($1, false, null)', [id])
          );
        }
        return asUser(s2, () =>
          q("select request_role('institution_admin', 'one more')")
        );
      },
      true
    );
  } catch (e) {
    failures++;
    console.log('FATAL', e.message);
  } finally {
    await q('ROLLBACK').catch(() => {});
    console.log(`\nROLLED BACK. Failures: ${failures}`);
    await c.end();
  }
})();
