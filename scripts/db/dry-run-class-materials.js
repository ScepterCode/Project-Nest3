// Applies 20261009120000_class_materials.sql inside a transaction, seeds
// throwaway users and classes, checks who can add, see, change and remove
// materials and their storage files (RLS on), then ROLLBACK. Nothing
// persists. Meant for a throwaway database with the migrations replayed
// (npm run db:replay).
//
// Usage: DATABASE_URL=postgres://... node scripts/db/dry-run-class-materials.js
const { Client } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || process.env.REPLAY_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL.');
  process.exit(1);
}
const strip = file =>
  fs
    .readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replace(/^BEGIN;\s*$/m, '')
    .replace(/^COMMIT;\s*$/m, '')
    .replace(/^NOTIFY .*$/m, '');
const MIGRATION =
  strip('20261009120000_class_materials.sql') +
  strip('20261009130000_notify_class_materials.sql');

const id = n => `eeeeeeee-0000-0000-0000-${String(n).padStart(12, '0')}`;
const TEACHER = id(1);
const OTHER_TEACHER = id(2);
const STUDENT = id(3);
const OUTSIDER = id(4); // student, not in the class
const ADMIN = id(5); // admin of the class's institution
const QUIET_STUDENT = id(6); // enrolled, announcements turned off
const INSTITUTION = id(10);
const CLASS = id(20);
const OTHER_CLASS = id(21);

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
  let sp = 0;
  // Runs sql; returns the error message, or null if it worked.
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
  const count = async (sql, params) =>
    (await q(`select count(*)::int n from (${sql}) x`, params)).rows[0].n;
  const addLink = (cls, title, link) =>
    q(
      "insert into public.class_materials (class_id, title, kind, url) values ($1, $2, 'link', $3) returning id",
      [cls, title, link]
    );

  await q('BEGIN');
  try {
    await q(MIGRATION);

    // --- seed (as owner) ---
    for (const [uid, role] of [
      [TEACHER, 'teacher'],
      [OTHER_TEACHER, 'teacher'],
      [STUDENT, 'student'],
      [OUTSIDER, 'student'],
      [ADMIN, 'institution_admin'],
      [QUIET_STUDENT, 'student'],
    ]) {
      await q(
        'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
        [uid, `${uid}@dry-run.test`, { role }]
      );
    }
    await q(
      "insert into public.institutions (id, name, status, created_by) values ($1, 'Materials U', 'active', $2)",
      [INSTITUTION, ADMIN]
    );
    await q(
      'update public.users set institution_id = $1 where id in ($2, $3)',
      [INSTITUTION, ADMIN, TEACHER]
    );
    await q(
      "insert into public.classes (id, name, code, teacher_id, institution_id) values ($1, 'Biology', 'MATDRY01', $2, $3), ($4, 'Other', 'MATDRY02', $5, null)",
      [CLASS, TEACHER, INSTITUTION, OTHER_CLASS, OTHER_TEACHER]
    );
    await q(
      "insert into public.enrollments (class_id, student_id, status) values ($1, $2, 'enrolled'), ($1, $3, 'active')",
      [CLASS, STUDENT, QUIET_STUDENT]
    );
    await q(
      `insert into public.notification_preferences (user_id, announcement_notifications)
       values ($1, false)
       on conflict (user_id) do update set announcement_notifications = false`,
      [QUIET_STUDENT]
    );

    const bucket = (
      await q(
        "select public, file_size_limit from storage.buckets where id = 'class-materials'"
      )
    ).rows[0];
    check('bucket is private with a 50 MB limit', bucket, {
      public: false,
      file_size_limit: '52428800',
    });

    // --- teacher adds materials ---
    await as(TEACHER);
    const linkId = (
      await addLink(
        CLASS,
        'Cell structure video',
        'https://www.youtube.com/watch?v=abc'
      )
    ).rows[0].id;
    check('teacher adds a link', typeof linkId, 'string');
    check(
      'teacher uploads into their class folder',
      await error(
        "insert into storage.objects (bucket_id, name, owner) values ('class-materials', $1, $2)",
        [`${CLASS}/r1/notes.pdf`, TEACHER]
      ),
      null
    );
    check(
      'teacher records the uploaded file',
      await error(
        "insert into public.class_materials (class_id, title, kind, file_path, file_name) values ($1, 'Notes', 'file', $2, 'notes.pdf')",
        [CLASS, `${CLASS}/r1/notes.pdf`]
      ),
      null
    );
    check(
      'a non-http link is refused',
      /check constraint/.test(
        await error(
          "insert into public.class_materials (class_id, title, kind, url) values ($1, 'x', 'link', 'javascript:alert(1)')",
          [CLASS]
        )
      ),
      true
    );
    check(
      "a file path in another class's folder is refused",
      /check constraint/.test(
        await error(
          "insert into public.class_materials (class_id, title, kind, file_path) values ($1, 'x', 'file', $2)",
          [CLASS, `${OTHER_CLASS}/r/x.pdf`]
        )
      ),
      true
    );
    check(
      'teacher edits a title',
      await error(
        "update public.class_materials set title = 'Cells (video)' where id = $1",
        [linkId]
      ),
      null
    );
    check(
      'moving a material to another class is refused',
      /Only the title/.test(
        await error(
          'update public.class_materials set class_id = $2 where id = $1',
          [linkId, OTHER_CLASS]
        )
      ),
      true
    );

    // --- notifications for the two materials just added ---
    await asOwner();
    const notes = (
      await q(
        'select user_id, type, title, action_url from public.notifications where user_id = any($1) order by created_at',
        [[STUDENT, QUIET_STUDENT, OUTSIDER, TEACHER, ADMIN]]
      )
    ).rows;
    const first = notes.find(n => n.user_id === STUDENT);
    check(
      'enrolled student is notified of each new material',
      notes.filter(n => n.user_id === STUDENT).length,
      2
    );
    check(
      'notification names the class and links to its materials tab',
      first && {
        type: first.type,
        title: first.title,
        action_url: first.action_url,
      },
      {
        type: 'class_announcement',
        title: 'New material in Biology',
        action_url: `/dashboard/student/classes/${CLASS}?tab=materials`,
      }
    );
    check(
      'nobody else is notified (announcements off, outsider, teacher, admin)',
      notes.filter(n => n.user_id !== STUDENT).length,
      0
    );
    await as(TEACHER);

    // --- other teacher ---
    await as(OTHER_TEACHER);
    check(
      "another teacher can't add to the class",
      /row-level security/.test(
        await error(
          "insert into public.class_materials (class_id, title, kind, url) values ($1, 'x', 'link', 'https://x.test')",
          [CLASS]
        )
      ),
      true
    );
    check(
      "another teacher can't upload into the class folder",
      /row-level security/.test(
        await error(
          "insert into storage.objects (bucket_id, name, owner) values ('class-materials', $1, $2)",
          [`${CLASS}/r2/evil.pdf`, OTHER_TEACHER]
        )
      ),
      true
    );
    check(
      "another teacher sees none of the class's materials",
      await count('select * from public.class_materials where class_id = $1', [
        CLASS,
      ]),
      0
    );

    // --- enrolled student ---
    await as(STUDENT);
    check(
      'enrolled student sees both materials',
      await count('select * from public.class_materials where class_id = $1', [
        CLASS,
      ]),
      2
    );
    check(
      'enrolled student can read the file',
      await count(
        "select * from storage.objects where bucket_id = 'class-materials' and name = $1",
        [`${CLASS}/r1/notes.pdf`]
      ),
      1
    );
    check(
      "student can't add materials",
      /row-level security/.test(
        await error(
          "insert into public.class_materials (class_id, title, kind, url) values ($1, 'x', 'link', 'https://x.test')",
          [CLASS]
        )
      ),
      true
    );
    check(
      "student can't upload",
      /row-level security/.test(
        await error(
          "insert into storage.objects (bucket_id, name, owner) values ('class-materials', $1, $2)",
          [`${CLASS}/r3/x.pdf`, STUDENT]
        )
      ),
      true
    );
    await q('delete from public.class_materials where id = $1', [linkId]);
    await q("delete from storage.objects where bucket_id = 'class-materials'");
    await as(TEACHER);
    check(
      "student's delete removed nothing",
      [
        await count(
          'select * from public.class_materials where class_id = $1',
          [CLASS]
        ),
        await count(
          "select * from storage.objects where bucket_id = 'class-materials'"
        ),
      ],
      [2, 1]
    );

    // --- outsider and admin ---
    await as(OUTSIDER);
    check(
      'student not in the class sees nothing',
      [
        await count(
          'select * from public.class_materials where class_id = $1',
          [CLASS]
        ),
        await count(
          "select * from storage.objects where bucket_id = 'class-materials'"
        ),
      ],
      [0, 0]
    );
    await as(ADMIN);
    check(
      "institution admin can view the class's materials",
      await count('select * from public.class_materials where class_id = $1', [
        CLASS,
      ]),
      2
    );

    // --- teacher removes ---
    await as(TEACHER);
    await q('delete from public.class_materials where id = $1', [linkId]);
    await q(
      "delete from storage.objects where bucket_id = 'class-materials' and name = $1",
      [`${CLASS}/r1/notes.pdf`]
    );
    check(
      'teacher removes a material and its file',
      [
        await count(
          'select * from public.class_materials where class_id = $1',
          [CLASS]
        ),
        await count(
          "select * from storage.objects where bucket_id = 'class-materials'"
        ),
      ],
      [1, 0]
    );

    await asOwner();
    await q("select set_config('role','anon',true)");
    check(
      'signed-out visitors cannot read materials',
      /permission denied/.test(
        (await error('select * from public.class_materials')) ?? ''
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
