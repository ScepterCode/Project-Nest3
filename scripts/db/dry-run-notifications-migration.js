// Applies supabase/migrations/20260930130000_notification_types_and_links.sql
// inside a transaction, tests it as real users, then ROLLS BACK.
// Usage: node scripts/db/dry-run-notifications-migration.js  (reads SUPABASE_DATABASE_URL from .env.local)
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const fs = require('fs');

const sql = fs
  .readFileSync(
    'supabase/migrations/20260930130000_notification_types_and_links.sql',
    'utf8'
  )
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
  const reset = () =>
    q("reset role; select set_config('request.jwt.claims','',true)");
  const one = async (s, p) => (await q(s, p)).rows[0];

  try {
    await q('BEGIN');
    const pair = await one(
      "select e.student_id, c.teacher_id from enrollments e join classes c on c.id = e.class_id where e.status in ('enrolled','active') limit 1"
    );
    await q(sql);
    console.log('ok   migration applied cleanly inside the transaction\n');

    await as(pair.student_id);
    await t("student -> teacher 'assignment_submitted' with in-app link", () =>
      q(
        "insert into notifications (user_id, type, title, message, action_url) values ($1, 'assignment_submitted', 't', 'm', '/dashboard/teacher/assignments')",
        [pair.teacher_id]
      ).then(r => r.rowCount)
    );
    await t(
      'external https link rejected',
      () =>
        q(
          "insert into notifications (user_id, type, title, message, action_url) values ($1, 'system_message', 't', 'm', 'https://evil.example')",
          [pair.teacher_id]
        ),
      true
    );
    await t(
      'protocol-relative //link rejected',
      () =>
        q(
          "insert into notifications (user_id, type, title, message, action_url) values ($1, 'system_message', 't', 'm', '//evil.example')",
          [pair.teacher_id]
        ),
      true
    );
    await t(
      'javascript: link rejected',
      () =>
        q(
          "insert into notifications (user_id, type, title, message, action_url) values ($1, 'system_message', 't', 'm', 'javascript:alert(1)')",
          [pair.teacher_id]
        ),
      true
    );
    await t(
      'unknown type still rejected',
      () =>
        q(
          "insert into notifications (user_id, type, title, message) values ($1, 'made_up', 't', 'm')",
          [pair.teacher_id]
        ),
      true
    );
    await reset();

    await as(pair.teacher_id);
    await t("teacher 'class_created' to self", () =>
      q(
        "insert into notifications (user_id, type, title, message, action_url) values ($1, 'class_created', 't', 'm', '/dashboard/teacher/classes/1')",
        [pair.teacher_id]
      ).then(r => r.rowCount)
    );
    await reset();

    await t('reviewer path helper denies a non-reviewer', async () => {
      await as(pair.student_id);
      const r = await one(
        "select app_private.reviews_submission_path('someone/else/file.pdf') ok"
      );
      await reset();
      return r.ok;
    });
  } catch (e) {
    failures++;
    console.log('FATAL', e.message);
  } finally {
    await q('ROLLBACK').catch(() => {});
    console.log(`\nROLLED BACK. Failures: ${failures}`);
    await c.end();
  }
})();
