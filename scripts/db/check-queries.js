// Checks every Supabase query in the app against a database with the
// migrations replayed (npm run db:replay): tables, columns, filter columns,
// embedded relationships (a foreign key PostgREST can follow) and rpc names.
//
// Usage: node scripts/db/check-queries.js . postgres://postgres@127.0.0.1:54347/replay
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = process.argv[2];
const files = [];
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.next', '__tests__', '.git'].includes(e.name))
      continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|js)$/.test(e.name)) files.push(p);
  }
};
['app', 'components', 'lib', 'contexts', 'hooks'].forEach(d => {
  if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
});

function splitTop(s) {
  const out = [];
  let depth = 0,
    cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

(async () => {
  const c = new Client({ connectionString: process.argv[3] });
  await c.connect();
  const cols = {};
  (
    await c.query(
      "select table_name, column_name from information_schema.columns where table_schema='public'"
    )
  ).rows.forEach(r => (cols[r.table_name] ??= new Set()).add(r.column_name));
  const fks = (
    await c.query(`
    select tc.table_name src, kcu.column_name col, ccu.table_name dst, ccu.table_schema dst_schema
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)
  ).rows;
  const views = new Set(
    (
      await c.query(
        "select table_name from information_schema.views where table_schema='public'"
      )
    ).rows.map(r => r.table_name)
  );
  const fns = new Set(
    (
      await c.query(
        "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
      )
    ).rows.map(r => r.proname)
  );
  await c.end();

  const problems = [];
  const related = (a, b) =>
    fks.some(
      f =>
        (f.src === a && f.dst === b && f.dst_schema === 'public') ||
        (f.src === b && f.dst === a && f.dst_schema === 'public')
    );

  const checkSelect = (table, sel, where) => {
    if (!cols[table]) {
      problems.push(`${where}: table ${table} does not exist`);
      return;
    }
    for (let item of splitTop(sel.replace(/\s+/g, ' '))) {
      if (item === '*' || item === 'count' || item.startsWith('count('))
        continue;
      const m = item.match(
        /^(?:(\w+):)?([\w]+)(?:!(\w+))?(?:\s*\(([\s\S]*)\))?$/
      );
      if (!m) {
        problems.push(`${where}: can't parse "${item}" in ${table}`);
        continue;
      }
      const [, , name, hint, inner] = m;
      if (inner !== undefined) {
        // Embedded resource.
        let target = name;
        if (!cols[target] && cols[table].has(name)) {
          // alias:fk_column(...) form: find FK target.
          const fk = fks.find(f => f.src === table && f.col === name);
          target = fk ? fk.dst : name;
          if (!fk || fk.dst_schema !== 'public') {
            problems.push(
              `${where}: ${table}.${name} has no foreign key to a public table (can't embed)`
            );
            continue;
          }
        }
        if (!cols[target]) {
          problems.push(`${where}: embedded table ${target} does not exist`);
          continue;
        }
        if (hint && cols[table].has(hint)) {
          const fk = fks.find(f => f.src === table && f.col === hint);
          if (!fk || fk.dst !== target || fk.dst_schema !== 'public') {
            problems.push(
              `${where}: ${table}.${hint} has no foreign key to public.${target} (can't embed ${item.slice(0, 40)})`
            );
            continue;
          }
        } else if (!related(table, target)) {
          problems.push(
            `${where}: no foreign key between ${table} and ${target} (can't embed)`
          );
          continue;
        }
        if (inner.trim() && inner.trim() !== 'count')
          checkSelect(target, inner, where);
      } else {
        const col = name.replace(/::\w+$/, '');
        if (!cols[table].has(col) && !views.has(table))
          problems.push(`${where}: column ${table}.${col} does not exist`);
      }
    }
  };

  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    const re =
      /\.from\(\s*['"](\w+)['"]\s*\)([\s\S]{0,2000}?)(?=\.from\(|\n\s*\n|$)/g;
    let m;
    while ((m = re.exec(s))) {
      const table = m[1];
      if (
        ['submissions', 'materials', 'avatars'].includes(table) &&
        /\.(upload|createSignedUrl|remove|download|list)\(/.test(
          m[2].slice(0, 80)
        )
      )
        continue; // storage buckets
      const chain = m[2];
      const line = s.slice(0, m.index).split('\n').length;
      const where = `${rel}:${line}`;
      if (
        /^\s*\.(upload|createSignedUrl|createSignedUrls|remove|download|list|getPublicUrl)\(/.test(
          chain
        )
      )
        continue;
      const sm = chain.match(/^\s*\.select\(\s*([`'"])([\s\S]*?)\1/);
      if (sm) checkSelect(table, sm[2], where);
      else if (
        !cols[table] &&
        /^\s*\.(insert|update|upsert|delete|select)\(/.test(chain)
      )
        problems.push(`${where}: table ${table} does not exist`);
      // Filter / order columns on the top-level table.
      const filt =
        /\.(eq|neq|in|is|not|gt|gte|lt|lte|order|like|ilike|contains)\(\s*['"]([\w.]+)['"]/g;
      let fm;
      const upto = chain.split(/;\s*\n/)[0];
      while ((fm = filt.exec(upto))) {
        const col = fm[2];
        if (col.includes('.')) continue;
        if (cols[table] && !cols[table].has(col) && !views.has(table))
          problems.push(
            `${where}: filter column ${table}.${col} does not exist`
          );
      }
    }
    const rpc = /\.rpc\(\s*['"](\w+)['"]/g;
    while ((m = rpc.exec(s))) {
      if (!fns.has(m[1]))
        problems.push(
          `${rel}:${s.slice(0, m.index).split('\n').length}: function ${m[1]} does not exist`
        );
    }
  }
  console.log(problems.length ? problems.join('\n') : 'no problems found');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
