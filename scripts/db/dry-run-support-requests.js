// Applies 20261020120000_support_requests.sql inside a transaction, seeds a
// platform admin, a school, a learner and a tutor, checks who can raise,
// read, answer and close support requests (RLS on), then ROLLBACK. Nothing
// persists. Meant for a throwaway database with the migrations replayed
// (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-support-requests.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs.readFileSync(
  'supabase/migrations/20261020120000_support_requests.sql',
  'utf8'
);

const id = n => `d4d4d4d4-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const LEARNER = id(2);
const TUTOR = id(3);
const SCHOOL = id(20);

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
  const ownerOne = async (sql, params) => {
    await asOwner();
    return one(sql, params);
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);

    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Aba Academy', 'active')",
      [SCHOOL]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [LEARNER, 'student', SCHOOL, 'Lola'],
      [TUTOR, 'teacher', SCHOOL, 'Tia'],
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

    // --- raising a request ---
    await as(LEARNER);
    check(
      'a too-short description is refused',
      /at least a sentence/.test(
        await error(
          "select public.create_support_request('complaint', 'Bad', 'no')"
        )
      ),
      true
    );
    check(
      'a non-web link is refused',
      /http/.test(
        await error(
          "select public.create_support_request('technical', 'Upload fails', 'My upload stops at half way every time.', 'javascript:alert(1)')"
        )
      ),
      true
    );
    const req = (
      await one(
        "select public.create_support_request('complaint', 'Tutor missed class', 'Our tutor has not come for two weeks.', 'https://example.com/photo') id"
      )
    ).id;
    check(
      'the learner sees their own request',
      (await one('select count(*)::int n from public.support_requests')).n,
      1
    );
    check(
      'and its first message',
      (await one('select count(*)::int n from public.support_messages')).n,
      1
    );
    check(
      'the request records their school',
      (
        await ownerOne(
          'select institution_id from public.support_requests where id = $1',
          [req]
        )
      ).institution_id,
      SCHOOL
    );
    check(
      'the platform admin is notified (high priority for a complaint)',
      await ownerOne(
        "select type, priority from public.notifications where user_id = $1 and metadata->>'request_id' = $2",
        [PLATFORM, req]
      ),
      { type: 'support_request', priority: 'high' }
    );

    await as(TUTOR);
    check(
      "a tutor can't see the learner's request",
      (await one('select count(*)::int n from public.support_requests')).n,
      0
    );
    check(
      'or read its thread',
      /two-factor|platform admin|Platform admin/i.test(
        await error('select public.support_thread($1)', [req])
      ),
      true
    );
    check(
      'or reply to it',
      /two-factor|platform admin|Platform admin/i.test(
        await error(
          "select public.reply_support_request($1, 'I was ill, sorry')",
          [req]
        )
      ),
      true
    );
    check(
      'or write rows directly',
      /permission denied/.test(
        await error(
          "insert into public.support_requests (requester_id, category, subject) values ($1, 'other', 'Hello')",
          [TUTOR]
        )
      ),
      true
    );

    const safe = (
      await one(
        "select public.create_support_request('safeguarding', 'Concern about a learner', 'Something said in class worries me.') id"
      )
    ).id;
    check(
      'a safeguarding concern is urgent',
      (
        await ownerOne(
          "select priority from public.notifications where user_id = $1 and metadata->>'request_id' = $2",
          [PLATFORM, safe]
        )
      ).priority,
      'urgent'
    );

    // --- the platform inbox ---
    await as(PLATFORM);
    check(
      'the inbox needs two-factor sign-in',
      /two-factor|aal2|verify/i.test(
        await error("select * from public.platform_support_requests('all')")
      ),
      true
    );
    await as(PLATFORM, 'aal2');
    const inbox = (
      await q("select * from public.platform_support_requests('active')")
    ).rows;
    check(
      'the inbox lists both, safeguarding first',
      inbox.map(r => r.category),
      ['safeguarding', 'complaint']
    );
    check(
      'with the requester and school',
      [inbox[1].requester_name, inbox[1].school_name],
      ['Lola Test', 'Aba Academy']
    );

    await q(
      "select public.reply_support_request($1, 'We are looking into it.')",
      [req]
    );
    check(
      'a staff reply moves it to in progress',
      (
        await ownerOne(
          'select status from public.support_requests where id = $1',
          [req]
        )
      ).status,
      'in_progress'
    );
    check(
      'and notifies the learner',
      (
        await ownerOne(
          "select count(*)::int n from public.notifications where user_id = $1 and type = 'support_reply'",
          [LEARNER]
        )
      ).n,
      1
    );

    await as(LEARNER);
    const thread = (await one('select public.support_thread($1) t', [req])).t;
    check(
      'the learner reads the thread; staff sign as the programme team',
      thread.messages.map(m => [m.author, m.from_staff]),
      [
        ['Lola Test', false],
        ['Programme team', true],
      ]
    );
    check(
      "the learner can't change the status",
      /two-factor|platform admin|Platform admin/i.test(
        await error("select public.platform_set_support_status($1, 'closed')", [
          req,
        ])
      ),
      true
    );

    await as(PLATFORM, 'aal2');
    await q("select public.platform_set_support_status($1, 'resolved')", [req]);
    check(
      'resolving is logged',
      (
        await ownerOne(
          "select count(*)::int n from app_private.platform_audit where action = 'support_status' and target_id = $1",
          [req]
        )
      ).n,
      1
    );

    await as(LEARNER);
    await q(
      "select public.reply_support_request($1, 'It happened again today.')",
      [req]
    );
    check(
      'a learner reply reopens a resolved request',
      await ownerOne(
        'select status, resolved_at from public.support_requests where id = $1',
        [req]
      ),
      { status: 'open', resolved_at: null }
    );

    await as(PLATFORM, 'aal2');
    await q("select public.platform_set_support_status($1, 'closed')", [req]);
    await as(LEARNER);
    check(
      'nobody can reply to a closed request',
      /closed/.test(
        await error("select public.reply_support_request($1, 'Hello?')", [req])
      ),
      true
    );

    for (let i = 0; i < 4; i++) {
      await q(
        "select public.create_support_request('question', 'Question ' || $1, 'How do I export my animation?')",
        [String(i)]
      );
    }
    check(
      'more than five requests an hour are refused',
      /several requests/.test(
        await error(
          "select public.create_support_request('question', 'One more', 'How do I export my animation?')"
        )
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
