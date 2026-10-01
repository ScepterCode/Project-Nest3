// Applies the step-3 migrations (no department_admin assignment, peer reviews)
// inside a transaction, tests them as real users, then ROLLS BACK.
// Usage: node scripts/db/dry-run-step3-migrations.js  (reads SUPABASE_DATABASE_URL from .env.local)
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const fs = require('fs');

const migrations = [
  'supabase/migrations/20260930140000_no_department_admin_assignment.sql',
  'supabase/migrations/20260930150000_peer_reviews.sql',
].map(f =>
  fs
    .readFileSync(f, 'utf8')
    .replace(/^BEGIN;\s*$/m, '')
    .replace(/^COMMIT;\s*$/m, '')
);

(async () => {
  const c = new Client({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // If this script dies mid-transaction, the server ends the orphaned session
  // (and releases its locks) instead of blocking the app's queries.
  await c.query(
    "SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'"
  );
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

  try {
    await q('BEGIN');

    // Fixtures (read before migrating)
    const pra = await one(
      "select pra.* from peer_review_assignments pra where exists (select 1 from submissions s where s.assignment_id = pra.assignment_id and s.status in ('submitted','graded')) limit 1"
    );
    const subs = (
      await q(
        "select s.student_id, s.id from submissions s join enrollments e on e.student_id = s.student_id and e.class_id = $2 and e.status in ('enrolled','active') where s.assignment_id = $1 and s.status in ('submitted','graded')",
        [pra.assignment_id, pra.class_id]
      )
    ).rows;
    const outsider = (
      await one(
        "select id from users where role = 'student' and id <> all($1::uuid[]) limit 1",
        [subs.map(s => s.student_id)]
      )
    ).id;
    const admin = await one(
      "select id from users where role = 'institution_admin' limit 1"
    );
    const inst = await one('select id from institutions limit 1');
    console.log(
      `fixtures: peer review with ${subs.length} submitters (${pra.review_type}), outsider, admin: ${!!admin}\n`
    );

    for (const m of migrations) await q(m);
    console.log(
      'ok   both migrations applied cleanly inside the transaction\n'
    );

    // ---------------- department_admin restriction
    console.log(
      '-- INSTITUTION ADMIN (temporarily given an institution + member)'
    );
    if (admin && inst) {
      await q('update users set institution_id = $1 where id in ($2, $3)', [
        inst.id,
        admin.id,
        outsider,
      ]);
      await as(admin.id);
      await t(
        'cannot make a member department_admin',
        () =>
          q("update users set role = 'department_admin' where id = $1", [
            outsider,
          ]),
        true
      );
      await t('can still make a member a teacher (rows)', () =>
        q("update users set role = 'teacher' where id = $1", [outsider]).then(
          r => r.rowCount
        )
      );
      await reset();
      await q("update users set role = 'student' where id = $1", [outsider]);
    }

    // ---------------- peer reviews
    console.log('\n-- DATA FIXES');
    await t('orphaned "active" peer reviews reset to draft', () =>
      q(
        "select count(*) filter (where status = 'draft') drafts, count(*) filter (where status = 'active') active, count(*) filter (where end_date < now()) past_deadlines from peer_review_assignments"
      ).then(r => r.rows[0])
    );

    console.log('\n-- TEACHER');
    const other = await one(
      "select id from peer_review_assignments where id <> $1 and teacher_id = $2 and status = 'draft' limit 1",
      [pra.id, pra.teacher_id]
    );
    if (other) {
      await q(
        "update peer_review_assignments set end_date = now() - interval '1 hour' where id = $1",
        [other.id]
      );
    }
    await as(pra.teacher_id);
    if (other)
      await t(
        'publishing with a past end date is rejected',
        () => q('select publish_peer_review($1)', [other.id]),
        true
      );
    await t('publish pairs students', () =>
      q('select publish_peer_review($1) r', [pra.id]).then(r => r.rows[0].r)
    );
    await t(
      'publishing twice is rejected',
      () => q('select publish_peer_review($1)', [pra.id]),
      true
    );
    await t('teacher sees the pairs', () =>
      q(
        'select count(*) from peer_reviews where peer_review_assignment_id = $1',
        [pra.id]
      ).then(r => r.rows[0].count)
    );
    await t('every student reviews and is reviewed equally', () =>
      q(
        'select count(distinct reviewer_id) reviewers, count(distinct reviewee_id) reviewees, bool_and(reviewer_id <> reviewee_id) no_self from peer_reviews where peer_review_assignment_id = $1',
        [pra.id]
      ).then(r => r.rows[0])
    );
    await reset();

    const s1 = subs[0].student_id;
    const s2 = subs[1].student_id;
    const review = await one(
      'select id from peer_reviews where peer_review_assignment_id = $1 and reviewer_id = $2',
      [pra.id, s1]
    );

    console.log('\n-- OUTSIDER STUDENT');
    await as(outsider);
    await t(
      'cannot publish',
      () => q('select publish_peer_review($1)', [pra.id]),
      true
    );
    await t(
      "cannot open someone else's review",
      () => q('select get_peer_review($1)', [review.id]),
      true
    );
    await t('has no tasks', () =>
      q('select count(*) from get_my_peer_review_tasks()').then(
        r => r.rows[0].count
      )
    );
    await reset();

    console.log('\n-- REVIEWER (student 1)');
    await as(s1);
    await t('no direct access to peer_reviews (rows visible)', () =>
      q('select count(*) from peer_reviews').then(r => r.rows[0].count)
    );
    await t("no direct access to classmate's submission (rows)", () =>
      q('select count(*) from submissions where student_id = $1', [s2]).then(
        r => r.rows[0].count
      )
    );
    await t('sees own task', () =>
      q(
        'select title, author_name, status from get_my_peer_review_tasks()'
      ).then(r => r.rows)
    );
    await t('opens the review with the work to review', () =>
      q('select get_peer_review($1) r', [review.id]).then(r => ({
        hasSubmission: !!r.rows[0].r.submission.id,
        author: r.rows[0].r.author_name,
      }))
    );
    await t('saves a draft', () =>
      q(
        `select save_peer_review($1, 4, '{"overall_comments":"draft"}', 5, false)`,
        [review.id]
      ).then(() => 'saved')
    );
    await t(
      'rating above the scale is rejected',
      () => q(`select save_peer_review($1, 11, '{}', 0, false)`, [review.id]),
      true
    );
    await t(
      'submitting without comments is rejected',
      () =>
        q(
          `select save_peer_review($1, 4, '{"overall_comments":""}', 0, true)`,
          [review.id]
        ),
      true
    );
    await t('submits', () =>
      q(
        `select save_peer_review($1, 4, '{"overall_comments":"Nice work","strengths":["clear"]}', 3, true)`,
        [review.id]
      ).then(() => 'submitted')
    );
    await t(
      'cannot edit after submitting',
      () =>
        q(
          `select save_peer_review($1, 5, '{"overall_comments":"changed"}', 0, false)`,
          [review.id]
        ),
      true
    );
    await t(
      'cannot rate helpfulness of a review they wrote',
      () => q('select rate_peer_review_helpfulness($1, 5)', [review.id]),
      true
    );
    await reset();

    console.log('\n-- REVIEWEE (student 2)');
    await as(s2);
    await t('receives the review, reviewer hidden (anonymous)', () =>
      q(
        'select reviewer_name, overall_rating, rating_scale from get_my_received_peer_reviews()'
      ).then(r => r.rows)
    );
    await t('cannot edit a review about them (rows)', () =>
      q('update peer_reviews set overall_rating = 5 where id = $1', [
        review.id,
      ]).then(r => r.rowCount)
    );
    await t('rates helpfulness', () =>
      q('select rate_peer_review_helpfulness($1, 4)', [review.id]).then(
        () => 'rated'
      )
    );
    await t(
      'helpfulness above 5 is rejected',
      () => q('select rate_peer_review_helpfulness($1, 6)', [review.id]),
      true
    );
    await reset();

    console.log('\n-- BLIND MODE + DEADLINE');
    await q(
      "update peer_review_assignments set review_type = 'blind' where id = $1",
      [pra.id]
    );
    const review2 = await one(
      'select id from peer_reviews where peer_review_assignment_id = $1 and reviewer_id = $2',
      [pra.id, s2]
    );
    await as(s2);
    await t('blind: author hidden from reviewer', () =>
      q('select author_name from get_my_peer_review_tasks()').then(r => r.rows)
    );
    await reset();
    await q(
      "update peer_review_assignments set end_date = now() - interval '1 day' where id = $1",
      [pra.id]
    );
    await as(s2);
    await t(
      'saving after the deadline is rejected',
      () =>
        q(
          `select save_peer_review($1, 3, '{"overall_comments":"late"}', 0, true)`,
          [review2.id]
        ),
      true
    );
    await reset();
  } catch (e) {
    failures++;
    console.log('FATAL', e.message);
  } finally {
    await q('ROLLBACK').catch(() => {});
    console.log(`\nROLLED BACK. Failures: ${failures}`);
    await c.end();
  }
})();
