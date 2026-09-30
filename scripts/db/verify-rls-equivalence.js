// Proves a policy migration doesn't change visibility: for every user, records
// which rows of each table they can SELECT under the current policies, applies
// the migration inside a transaction, records again, compares, and ROLLS BACK.
//
// Usage: node scripts/db/verify-rls-equivalence.js supabase/migrations/<file>.sql
// (reads SUPABASE_DATABASE_URL from .env.local; nothing is persisted)
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const fs = require('fs');

const TABLES = [
  'users',
  'classes',
  'assignments',
  'enrollments',
  'submissions',
];
const file = process.argv[2];
if (!file) {
  console.error(
    'Usage: node scripts/db/verify-rls-equivalence.js <migration.sql>'
  );
  process.exit(1);
}
const sql = fs
  .readFileSync(file, 'utf8')
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '');

(async () => {
  const c = new Client({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  c.on('error', e => console.log('connection error:', e.message));
  await c.connect();
  // If this script dies mid-transaction, the server ends the orphaned session
  // (and releases its locks) instead of blocking the app's queries.
  await c.query(
    "SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'"
  );
  const q = (s, p) => c.query(s, p);

  const snapshot = async users => {
    const out = {};
    for (const uid of users) {
      await q(
        "select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: uid, role: 'authenticated' })]
      );
      // One round trip per user: every table's visible ids at once.
      const row = (
        await q(
          `select ${TABLES.map(t => `(select coalesce(string_agg(id::text, ',' order by id), '') from public.${t}) as ${t}`).join(', ')}`
        )
      ).rows[0];
      for (const t of TABLES) out[`${uid}:${t}`] = row[t];
      await q("reset role; select set_config('request.jwt.claims','',true)");
    }
    return out;
  };

  let failures = 0;
  try {
    await q('BEGIN');
    await q("SET LOCAL statement_timeout = '5min'");
    await q("SET LOCAL lock_timeout = '20s'");
    const users = (await q('select id from public.users order by id')).rows.map(
      r => r.id
    );
    let t0 = Date.now();
    const before = await snapshot(users);
    console.log(`snapshot with current policies: ${Date.now() - t0} ms`);
    t0 = Date.now();
    await q(sql);
    console.log(`migration applied: ${Date.now() - t0} ms`);
    t0 = Date.now();
    const after = await snapshot(users);
    console.log(`snapshot with new policies: ${Date.now() - t0} ms`);

    const totals = Object.fromEntries(TABLES.map(t => [t, 0]));
    for (const key of Object.keys(before)) {
      const t = key.split(':')[1];
      totals[t] += before[key] ? before[key].split(',').length : 0;
      if (before[key] !== after[key]) {
        failures++;
        if (failures <= 10)
          console.log(
            `DIFF ${key}\n  before: ${before[key].slice(0, 120)}\n  after:  ${after[key].slice(0, 120)}`
          );
      }
    }
    console.log(
      `checked ${users.length} users x ${TABLES.length} tables = ${Object.keys(before).length} visibility sets`
    );
    console.log('visible rows (summed over users):', totals);
  } catch (e) {
    failures++;
    console.log('FATAL', e.message);
  } finally {
    await q('ROLLBACK').catch(() => {});
    console.log(
      failures === 0
        ? '\nIDENTICAL visibility. Rolled back.'
        : `\n${failures} DIFFERENCES. Rolled back.`
    );
    await c.end();
    process.exit(failures === 0 ? 0 : 1);
  }
})();
