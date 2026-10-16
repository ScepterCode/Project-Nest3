// Applies 20261019120000_learner_journey.sql inside a transaction, seeds a
// throwaway programme (two schools, tutors, a mentor, learners with work),
// checks consent, portfolios, featured work, nominations and cohort groups
// (RLS on), then ROLLBACK. Nothing persists. Meant for a throwaway database
// with the migrations replayed (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-learner-journey.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const MIGRATION = fs
  .readFileSync(
    'supabase/migrations/20261019120000_learner_journey.sql',
    'utf8'
  )
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '')
  .replace(/^NOTIFY .*$/m, '');

const id = n => `c3c3c3c3-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PLATFORM = id(1);
const SCHOOL_ADMIN = id(2);
const TUTOR = id(3);
const OTHER_TUTOR = id(4);
const MENTOR = id(5);
const LEARNER = id(6);
const OTHER_LEARNER = id(7); // another school
const SCHOOL = id(20);
const OTHER_SCHOOL = id(21);
const CLASS = id(30);
const ASSIGNMENT = id(40);

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
  const ownerOne = async (sql, params) => {
    await asOwner();
    return one(sql, params);
  };

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner) ---
    await q(
      "insert into public.institutions (id, name, status) values ($1, 'Aba Academy', 'active'), ($2, 'Other School', 'active')",
      [SCHOOL, OTHER_SCHOOL]
    );
    for (const [uid, role, school, first] of [
      [PLATFORM, 'system_admin', null, 'Pat'],
      [SCHOOL_ADMIN, 'institution_admin', SCHOOL, 'Sal'],
      [TUTOR, 'teacher', SCHOOL, 'Tia'],
      [OTHER_TUTOR, 'teacher', OTHER_SCHOOL, 'Oto'],
      [MENTOR, 'teacher', null, 'Max'],
      [LEARNER, 'student', SCHOOL, 'Lola'],
      [OTHER_LEARNER, 'student', OTHER_SCHOOL, 'Olu'],
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
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Foundation 2D', 'JRNDRY01', $2, $3)",
      [CLASS, TUTOR, SCHOOL]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled')",
      [CLASS, LEARNER]
    );
    await q(
      "insert into public.assignments (id, title, class_id, teacher_id, points_possible) values ($1, 'Bouncing ball', $2, $3, 10)",
      [ASSIGNMENT, CLASS, TUTOR]
    );
    const subId = (
      await one(
        "insert into public.submissions (assignment_id, student_id, status, grade, feedback, link_url) values ($1, $2, 'graded', 9, 'Lovely arcs', 'https://youtu.be/x') returning id",
        [ASSIGNMENT, LEARNER]
      )
    ).id;

    // --- consent ---
    await as(TUTOR);
    check(
      'a tutor cannot record consent',
      /school admin or a platform admin/.test(
        await error("select public.set_learner_consent($1, 'granted')", [
          LEARNER,
        ])
      ),
      true
    );
    await as(SCHOOL_ADMIN);
    check(
      "a school admin can't record consent for another school's learner",
      /school admin or a platform admin/.test(
        await error("select public.set_learner_consent($1, 'granted')", [
          OTHER_LEARNER,
        ])
      ),
      true
    );

    // --- portfolio access ---
    for (const [label, who, ok] of [
      ['learner sees their own portfolio', LEARNER, true],
      ['their tutor sees it', TUTOR, true],
      ['their school admin sees it', SCHOOL_ADMIN, true],
      ["another school's tutor does not", OTHER_TUTOR, false],
      ['another learner does not', OTHER_LEARNER, false],
    ]) {
      await as(who);
      check(
        label,
        (await error('select public.learner_portfolio($1)', [LEARNER])) ===
          null,
        ok
      );
    }
    await as(PLATFORM, 'aal2');
    const portfolio = (
      await one('select public.learner_portfolio($1) r', [LEARNER])
    ).r;
    check(
      'portfolio: learner, stage, consent, work',
      [
        portfolio.learner.school,
        portfolio.learner.stage,
        portfolio.learner.consent_status,
        portfolio.work.map(w => [w.assignment, w.grade, w.feedback]),
      ],
      [
        'Aba Academy',
        'foundation',
        'not_recorded',
        [['Bouncing ball', 9, 'Lovely arcs']],
      ]
    );

    // --- featured work ---
    await as(LEARNER);
    check(
      "a learner can't feature their own work",
      /Only the tutor/.test(
        await error(
          'update public.submissions set portfolio_featured = true where id = $1',
          [subId]
        )
      ),
      true
    );
    await as(TUTOR);
    await q(
      'update public.submissions set portfolio_featured = true where id = $1',
      [subId]
    );
    check(
      'the tutor features it',
      (
        await ownerOne(
          'select portfolio_featured f from public.submissions where id = $1',
          [subId]
        )
      ).f,
      true
    );

    // --- nominations ---
    await as(OTHER_TUTOR);
    check(
      "a tutor who doesn't teach them can't nominate",
      /tutors or school admin/.test(
        await error(
          "select public.nominate_learner($1, 'mentorship', 'Strong timing and arcs all term')",
          [LEARNER]
        )
      ),
      true
    );
    await as(LEARNER);
    check(
      "a learner can't nominate themselves",
      /tutors or school admin/.test(
        await error(
          "select public.nominate_learner($1, 'mentorship', 'I am very good at this')",
          [LEARNER]
        )
      ),
      true
    );
    await as(TUTOR);
    check(
      'a one-word reason is refused',
      /Say why/.test(
        await error(
          "select public.nominate_learner($1, 'mentorship', 'great')",
          [LEARNER]
        )
      ),
      true
    );
    const nomination = (
      await one(
        "select public.nominate_learner($1, 'mentorship', 'Strong timing and arcs all term') n",
        [LEARNER]
      )
    ).n;
    check(
      'a second pending nomination is refused',
      /already has a nomination/.test(
        await error(
          "select public.nominate_learner($1, 'mentorship', 'Strong timing and arcs all term')",
          [LEARNER]
        )
      ),
      true
    );
    check(
      'platform admins are told',
      (
        await ownerOne(
          "select count(*)::int n from public.notifications where user_id = $1 and type = 'nomination_submitted'",
          [PLATFORM]
        )
      ).n,
      1
    );

    await as(PLATFORM, 'aal2');
    const listed = (
      await rows('select * from public.platform_nominations()')
    )[0];
    check(
      'reviewers see the case with results',
      [
        listed.student_name,
        listed.school_name,
        listed.current_stage,
        listed.consent_status,
        Number(listed.submissions),
        Number(listed.average_grade),
      ],
      ['Lola Test', 'Aba Academy', 'foundation', 'not_recorded', 1, 90]
    );
    check(
      'approval needs consent',
      /consent must be recorded/.test(
        await error('select public.platform_review_nomination($1, true)', [
          nomination,
        ])
      ),
      true
    );

    await as(SCHOOL_ADMIN);
    await q(
      "select public.set_learner_consent($1, 'granted', 'Form signed by mother, 12 Oct')",
      [LEARNER]
    );
    await as(PLATFORM, 'aal2');
    await q(
      "select public.platform_review_nomination($1, true, 'Welcome aboard')",
      [nomination]
    );
    check(
      'approved: learner moves to mentorship',
      (
        await ownerOne(
          'select stage from public.learner_profiles where user_id = $1',
          [LEARNER]
        )
      ).stage,
      'mentorship'
    );
    await asOwner();
    check(
      'learner and nominator are told',
      (
        await rows(
          "select user_id from public.notifications where type = 'nomination_decided' order by user_id"
        )
      ).map(r => r.user_id),
      [TUTOR, LEARNER].sort()
    );
    check(
      'consent and decision are logged',
      (
        await rows(
          "select action from app_private.platform_audit where action in ('consent_recorded', 'nomination_approved') order by id"
        )
      ).map(r => r.action),
      ['consent_recorded', 'nomination_approved']
    );
    await as(TUTOR);
    check(
      'nominating again for the same stage is refused',
      /already at the mentorship stage/.test(
        await error(
          "select public.nominate_learner($1, 'mentorship', 'Strong timing and arcs all term')",
          [LEARNER]
        )
      ),
      true
    );
    check(
      "the tutor sees the learner's profile",
      (
        await rows(
          'select stage from public.learner_profiles where user_id = $1',
          [LEARNER]
        )
      ).length,
      1
    );
    await as(OTHER_TUTOR);
    check(
      "another school's tutor doesn't",
      (
        await rows(
          'select stage from public.learner_profiles where user_id = $1',
          [LEARNER]
        )
      ).length,
      0
    );

    // --- mentors and cohort groups ---
    await as(TUTOR);
    check(
      "tutors can't make themselves mentors",
      /Only platform admins/.test(
        await error(
          'update public.users set is_programme_mentor = true where id = $1',
          [TUTOR]
        )
      ),
      true
    );
    check(
      'or run a mentorship group',
      /Only programme mentors/.test(
        await error(
          "insert into public.classes (name, code, teacher_id, institution_id, cohort_stage) values ('Mentor?', 'JRNDRY02', $1, $2, 'mentorship')",
          [TUTOR, SCHOOL]
        )
      ),
      true
    );
    await as(PLATFORM, 'aal2');
    await q('select public.platform_set_mentor($1, true)', [MENTOR]);
    await as(MENTOR);
    await q(
      "insert into public.classes (name, code, teacher_id, cohort_stage) values ('Mentorship 2027', 'MENDRY01', $1, 'mentorship')",
      [MENTOR]
    );
    check(
      'a mentor runs a mentorship group',
      (
        await ownerOne(
          "select cohort_stage from public.classes where code = 'MENDRY01'"
        )
      ).cohort_stage,
      'mentorship'
    );
    await as(OTHER_LEARNER);
    check(
      'foundation learners from any school are kept out',
      /selected for the mentorship stage/.test(
        await error("select public.join_class_by_code('MENDRY01')")
      ),
      true
    );
    await as(LEARNER);
    check(
      'a selected learner can ask to join',
      (await one("select public.join_class_by_code('MENDRY01') r")).r.status,
      'pending'
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
