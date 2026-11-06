// End-to-end walkthrough of ProjectNest's main journeys, role by role, on a
// database with every migration replayed (npm run db:replay). Each step runs
// the same queries the page does, as the signed-in user (RLS on), so a step
// that would break in the app fails here with its name and the database's
// message. Everything runs in one transaction and is rolled back.
//
//   REPLAY_DATABASE_URL=postgres://... npm run db:replay
//   DATABASE_URL=postgres://... npm run db:walkthrough
//
// Steps that need an earlier step's result are skipped (not failed) when
// that step failed, so one break doesn't hide the rest.
const { Client } = require('pg');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to a database with the migrations replayed.');
  process.exit(1);
}

const id = n => `5a1e5a1e-0000-0000-0000-${String(n).padStart(12, '0')}`;
const PEOPLE = {
  platform: id(1),
  admin: id(2), // school admin (signs up with an invite)
  tutor: id(3), // signs up with the school's tutor code
  learner: id(4), // signs up with no code
};

(async () => {
  const c = new Client({ connectionString: url, ssl: false });
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const results = [];
  const state = {};
  let sp = 0;

  const as = async (who, aal = 'aal1') => {
    if (who === 'system') {
      await q("reset role; select set_config('request.jwt.claims','{}',true)");
      return;
    }
    await q(
      "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: PEOPLE[who], role: 'authenticated', aal })]
    );
  };
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  const rows = async (sql, params) => (await q(sql, params)).rows;
  const expect = (cond, message) => {
    if (!cond) throw new Error(message);
  };

  /** A step: who does it, what it is, what it needs from earlier steps. */
  const step = async (who, name, needs, fn) => {
    const missing = needs.filter(k => state[k] === undefined);
    if (missing.length) {
      results.push({
        who,
        name,
        status: 'SKIP',
        note: `needs ${missing.join(', ')}`,
      });
      return;
    }
    const savepoint = `s${++sp}`;
    await q(`SAVEPOINT ${savepoint}`);
    try {
      await as(
        who === 'platform' ? 'platform' : who,
        who === 'platform' ? 'aal2' : 'aal1'
      );
      const note = await fn();
      await as('system');
      await q(`RELEASE SAVEPOINT ${savepoint}`);
      results.push({ who, name, status: 'PASS', note: note ?? '' });
    } catch (e) {
      await q(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await as('system');
      results.push({ who, name, status: 'FAIL', note: e.message });
    }
  };

  /** Signing up: the auth row is created; handle_new_user makes the profile. */
  const signUp = async (who, first, meta = {}) => {
    await as('system');
    await q(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [
        PEOPLE[who],
        `${first.toLowerCase()}@walkthrough.test`,
        { first_name: first, last_name: 'Test', ...meta },
      ]
    );
  };

  await q('BEGIN');
  try {
    // The platform admin exists already (made in the SQL editor).
    await signUp('platform', 'Pat');
    await q(
      "update public.users set role = 'system_admin', onboarding_completed = true where id = $1",
      [PEOPLE.platform]
    );

    // --- Platform admin ---------------------------------------------------
    await step(
      'platform',
      'creates a school-admin invite (Admin invites)',
      [],
      async () => {
        state.invite = (
          await one(
            "select public.platform_create_invite('Walkthrough school') code"
          )
        ).code;
        expect(state.invite, 'no code returned');
      }
    );

    // --- School admin -----------------------------------------------------
    await step(
      'admin',
      'signs up with the invite and becomes a school admin',
      ['invite'],
      async () => {
        await signUp('admin', 'Sal', {
          signup_code: state.invite,
          role: 'institution',
        });
        await as('admin');
        const me = await one('select role from public.users where id = $1', [
          PEOPLE.admin,
        ]);
        expect(me?.role === 'institution_admin', `role is ${me?.role}`);
        state.adminSignedUp = true;
      }
    );
    await step(
      'admin',
      'finishes onboarding: sets up the school',
      ['adminSignedUp'],
      async () => {
        await q(
          "select public.set_up_my_institution('Walkthrough School', 'Secondary school', 'Up to 100 students', 'Sal Test', 'Head', 'sal@walkthrough.test', null, array['2D Animation'])"
        );
        await q(
          'update public.users set first_name = $2, last_name = $3, onboarding_completed = true where id = $1',
          [PEOPLE.admin, 'Sal', 'Test']
        );
        const inst = await one('select public.get_my_institution() i');
        expect(inst?.i?.staff_code, 'no tutor code');
        state.school = inst.i.id;
        state.tutorCode = inst.i.staff_code;
      }
    );

    // --- Tutor ------------------------------------------------------------
    await step(
      'tutor',
      'signs up with the tutor code',
      ['tutorCode'],
      async () => {
        await signUp('tutor', 'Tia', {
          signup_code: state.tutorCode,
          role: 'teacher',
        });
        await as('tutor');
        const me = await one(
          'select role, institution_id from public.users where id = $1',
          [PEOPLE.tutor]
        );
        expect(me?.role === 'teacher', `role is ${me?.role}`);
        expect(me?.institution_id === state.school, 'not linked to the school');
        state.tutorSignedUp = true;
      }
    );
    await step('tutor', 'finishes onboarding', ['tutorSignedUp'], async () => {
      await q(
        'update public.users set first_name = $2, last_name = $3, onboarding_completed = true where id = $1',
        [PEOPLE.tutor, 'Tia', 'Test']
      );
    });
    await step(
      'tutor',
      'creates a class (Classes → Create)',
      ['tutorSignedUp'],
      async () => {
        const me = await one(
          'select institution_id from public.users where id = $1',
          [PEOPLE.tutor]
        );
        const cls = await one(
          "insert into public.classes (name, description, teacher_id, institution_id, code) values ('2D Animation', 'Intro', $1, $2, 'WALK2345') returning id, code",
          [PEOPLE.tutor, me?.institution_id ?? null]
        );
        state.classId = cls.id;
        state.classCode = cls.code;
      }
    );

    // --- Learner ----------------------------------------------------------
    await step(
      'learner',
      'signs up (no code) and finishes onboarding',
      [],
      async () => {
        await signUp('learner', 'Lola');
        await as('learner');
        await q(
          'update public.users set first_name = $2, last_name = $3, onboarding_completed = true where id = $1',
          [PEOPLE.learner, 'Lola', 'Test']
        );
        const me = await one('select role from public.users where id = $1', [
          PEOPLE.learner,
        ]);
        expect(me?.role === 'student', `role is ${me?.role}`);
        state.learnerSignedUp = true;
      }
    );
    await step(
      'learner',
      'asks to join the class with its code',
      ['learnerSignedUp', 'classCode'],
      async () => {
        const r = await one('select public.join_class_by_code($1) r', [
          state.classCode,
        ]);
        expect(r.r.status === 'pending', `status ${r.r.status}`);
        state.joinRequested = true;
      }
    );

    // --- Tutor: the class Manage page --------------------------------------
    await step(
      'tutor',
      'opens the class Manage page and sees the request',
      ['joinRequested'],
      async () => {
        const cls = await one(
          'select * from public.classes where id = $1 and teacher_id = $2',
          [state.classId, PEOPLE.tutor]
        );
        expect(cls, 'class not readable');
        const enr = await rows(
          "select student_id, enrolled_at, status from public.enrollments where class_id = $1 and status in ('enrolled','active','pending')",
          [state.classId]
        );
        const people = await rows(
          'select id, first_name, last_name, email from public.users where id = any($1)',
          [enr.map(e => e.student_id)]
        );
        expect(
          enr.some(e => e.status === 'pending'),
          'no pending request'
        );
        expect(
          people.some(p => p.first_name === 'Lola'),
          "can't read the learner's name"
        );
      }
    );
    await step('tutor', 'accepts the learner', ['joinRequested'], async () => {
      await q('select public.review_join_request($1, $2, true)', [
        state.classId,
        PEOPLE.learner,
      ]);
      state.enrolled = true;
    });
    await step(
      'tutor',
      'posts a study material (link)',
      ['classId'],
      async () => {
        await one(
          "insert into public.class_materials (class_id, title, description, kind, url) values ($1, 'Bouncing ball', null, 'link', 'https://youtu.be/abc') returning id",
          [state.classId]
        );
        state.material = true;
      }
    );
    await step(
      'learner',
      'sees the material',
      ['enrolled', 'material'],
      async () => {
        const m = await rows(
          'select id, class_id, title, description, kind, url, file_path, file_name, file_size, mime_type, created_at from public.class_materials where class_id = $1',
          [state.classId]
        );
        expect(m.length === 1, `${m.length} materials`);
      }
    );

    // --- Assignments --------------------------------------------------------
    await step('tutor', 'creates an assignment', ['classId'], async () => {
      const a = await one(
        "insert into public.assignments (title, description, class_id, due_date, teacher_id, points_possible, status) values ('Bounce', 'Animate a ball', $1, now() + interval '7 days', $2, 10, 'published') returning id",
        [state.classId, PEOPLE.tutor]
      );
      state.assignment = a.id;
    });
    await step(
      'learner',
      'sees it on Assignments',
      ['enrolled', 'assignment'],
      async () => {
        const enr = await rows(
          "select class_id from public.enrollments where student_id = $1 and status in ('enrolled','active')",
          [PEOPLE.learner]
        );
        const asg = await rows(
          'select id, title, description, due_date, class_id, points_possible from public.assignments where class_id = any($1)',
          [enr.map(e => e.class_id)]
        );
        await rows('select id, name from public.classes where id = any($1)', [
          enr.map(e => e.class_id),
        ]);
        expect(
          asg.some(a => a.id === state.assignment),
          'assignment not visible'
        );
      }
    );
    await step(
      'learner',
      'hands in a link',
      ['enrolled', 'assignment'],
      async () => {
        await q(
          "insert into public.submissions (assignment_id, student_id, content, file_url, link_url, submitted_at, status) values ($1, $2, null, null, 'https://youtu.be/xyz', now(), 'submitted')",
          [state.assignment, PEOPLE.learner]
        );
        state.submitted = true;
      }
    );
    await step(
      'tutor',
      'opens grading and sees the work with the name',
      ['submitted'],
      async () => {
        const subs = await rows(
          'select id, student_id, link_url, status from public.submissions where assignment_id = $1',
          [state.assignment]
        );
        const people = await rows(
          'select id, first_name, last_name, email from public.users where id = any($1)',
          [subs.map(s => s.student_id)]
        );
        expect(
          subs.length === 1 && people.length === 1,
          `${subs.length} submissions, ${people.length} names`
        );
        state.submission = subs[0].id;
      }
    );
    await step('tutor', 'grades it with feedback', ['submission'], async () => {
      const r = await q(
        "update public.submissions set grade = 8, feedback = 'Nice arcs', status = 'graded', graded_at = now(), graded_by = $2 where id = $1",
        [state.submission, PEOPLE.tutor]
      );
      expect(r.rowCount === 1, 'nothing updated');
      state.graded = true;
    });
    await step(
      'learner',
      'sees the grade and feedback (Grades)',
      ['graded'],
      async () => {
        const g = await one(
          'select id, assignment_id, grade, submitted_at, graded_at, feedback from public.submissions where student_id = $1',
          [PEOPLE.learner]
        );
        expect(
          Number(g?.grade) === 8 && g.feedback === 'Nice arcs',
          'grade not visible'
        );
      }
    );

    // --- Sessions and attendance -------------------------------------------
    await step(
      'tutor',
      'logs a session and takes attendance',
      ['enrolled'],
      async () => {
        const s = await one(
          "insert into public.class_sessions (held_on, topic, notes, class_id) values (current_date, 'Timing', null, $1) returning id",
          [state.classId]
        );
        await q(
          "insert into public.session_attendance (session_id, student_id, status, recorded_at) values ($1, $2, 'present', now()) on conflict (session_id, student_id) do update set status = excluded.status",
          [s.id, PEOPLE.learner]
        );
        state.session = true;
      }
    );
    await step('learner', 'sees their attendance', ['session'], async () => {
      const a = await rows(
        'select a.status from public.session_attendance a join public.class_sessions s on s.id = a.session_id where s.class_id = $1',
        [state.classId]
      );
      expect(
        a.length === 1 && a[0].status === 'present',
        'attendance not visible'
      );
    });

    // --- School admin overview ---------------------------------------------
    await step(
      'admin',
      'opens the school dashboard',
      ['school', 'enrolled'],
      async () => {
        const students = await one(
          "select count(*)::int n from public.users where institution_id is not null and role = 'student'"
        );
        const classes = await rows(
          "select id, name, teacher_id, cohort_stage from public.classes where status <> 'archived'"
        );
        await rows(
          "select class_id from public.enrollments where status in ('enrolled','active')"
        );
        const tutors = await rows(
          'select * from public.school_tutor_metrics()'
        );
        expect(students.n === 1, `${students.n} students counted`);
        expect(classes.length === 1, `${classes.length} classes`);
        expect(tutors.length === 1, `${tutors.length} tutors`);
      }
    );
    await step('admin', "opens a learner's portfolio", ['graded'], async () => {
      const p = await one('select public.learner_portfolio($1) p', [
        PEOPLE.learner,
      ]);
      expect(p.p.work.length === 1, 'work missing from the portfolio');
    });
    await step('learner', 'opens their own portfolio', ['graded'], async () => {
      await one('select public.learner_portfolio($1) p', [PEOPLE.learner]);
    });

    // --- Help & support -----------------------------------------------------
    await step(
      'learner',
      'sends a support request',
      ['learnerSignedUp'],
      async () => {
        state.support = (
          await one(
            "select public.create_support_request('question', 'Export settings', 'How do I export my animation?') id"
          )
        ).id;
      }
    );
    await step(
      'platform',
      'sees it in the support inbox and replies',
      ['support'],
      async () => {
        const inbox = await rows(
          "select id from public.platform_support_requests('active')"
        );
        expect(
          inbox.some(r => r.id === state.support),
          'not in the inbox'
        );
        await q(
          "select public.reply_support_request($1, 'Use H.264 at 720p.')",
          [state.support]
        );
      }
    );

    // --- Programmes and production projects ---------------------------------
    await step(
      'platform',
      'starts a programme for the school with a class and tutor',
      ['school', 'tutorSignedUp'],
      async () => {
        const r = await one(
          "select public.create_programme('Walkthrough programme', null, 'programme', null, $1::uuid[], null, 'Programme class', $2) r",
          [[state.school], PEOPLE.tutor]
        );
        state.programme = r.r.id;
        state.progClass = r.r.class.id;
        state.progCode = r.r.class.code;
      }
    );
    await step(
      'platform',
      'makes the school admin a programme manager',
      ['programme', 'adminSignedUp'],
      async () => {
        await q('select public.add_programme_manager($1, $2)', [
          state.programme,
          PEOPLE.admin,
        ]);
      }
    );
    await step(
      'admin',
      'opens the programme as its manager',
      ['programme'],
      async () => {
        const d = await one('select public.programme_detail($1) d', [
          state.programme,
        ]);
        expect(d.d.can_manage === true, 'cannot manage');
      }
    );
    await step(
      'learner',
      'joins the programme class',
      ['progCode', 'learnerSignedUp'],
      async () => {
        await one('select public.join_class_by_code($1) r', [state.progCode]);
        await as('tutor');
        await q('select public.review_join_request($1, $2, true)', [
          state.progClass,
          PEOPLE.learner,
        ]);
        state.inProgramme = true;
      }
    );
    await step(
      'tutor',
      'starts a project, adds a milestone and the team',
      ['inProgramme'],
      async () => {
        state.project = (
          await one(
            "select public.create_production_project($1, 'Short film') id",
            [state.progClass]
          )
        ).id;
        await q(
          "select public.save_project_milestone($1, null, 'Storyboard')",
          [state.project]
        );
        await q('select public.set_project_team($1, $2)', [
          state.project,
          JSON.stringify([
            { student_id: PEOPLE.learner, role_title: 'Animator' },
          ]),
        ]);
        const d = await one('select public.production_project_detail($1) d', [
          state.project,
        ]);
        state.milestone = d.d.milestones[0].id;
      }
    );
    await step(
      'learner',
      'hands in a version of the milestone',
      ['milestone'],
      async () => {
        await q(
          "select public.submit_milestone_version($1, 'https://drive.google.com/file/d/x/view', 'First pass')",
          [state.milestone]
        );
        state.version = true;
      }
    );
    await step('tutor', 'approves it', ['version'], async () => {
      const d = await one('select public.production_project_detail($1) d', [
        state.project,
      ]);
      const pending = d.d.milestones[0].versions.find(
        v => v.decision === 'pending'
      );
      await q("select public.review_milestone_version($1, true, 'Great')", [
        pending.id,
      ]);
    });
    await step(
      'admin',
      "sees the programme's analytics",
      ['version'],
      async () => {
        const d = await one('select public.programme_detail($1) d', [
          state.programme,
        ]);
        expect(
          d.d.totals.milestones_approved === 1,
          `${d.d.totals.milestones_approved} approved`
        );
      }
    );

    // --- Notifications --------------------------------------------------------
    await step(
      'learner',
      'has notifications for what happened',
      ['enrolled'],
      async () => {
        const n = await rows(
          'select type from public.notifications where user_id = $1',
          [PEOPLE.learner]
        );
        const types = new Set(n.map(x => x.type));
        for (const t of ['enrollment_approved', 'support_reply']) {
          expect(
            types.has(t),
            `no ${t} notification (got ${[...types].join(', ') || 'none'})`
          );
        }
        return `${n.length} notifications`;
      }
    );
  } finally {
    await q('ROLLBACK');
    await c.end();
  }

  const width = Math.max(...results.map(r => r.name.length + r.who.length + 3));
  for (const r of results) {
    const label = `${r.who}: ${r.name}`.padEnd(width);
    console.log(
      `${r.status.padEnd(4)} ${label} ${r.note ? `— ${r.note}` : ''}`
    );
  }
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  console.log(
    `\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped (rolled back)`
  );
  process.exit(failed || skipped ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
