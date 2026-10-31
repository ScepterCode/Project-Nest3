// Stops new hard-coded Tailwind colours (bg-blue-600, text-gray-500…).
// Pages should use the theme tokens instead (bg-primary, text-muted-foreground,
// bg-warning…) so the whole product changes colour from app/globals.css.
//
// Existing uses are recorded per file in scripts/colour-baseline.json and are
// cleaned up over time. A file may only go down: more uses than its baseline,
// or any use in a file not in the baseline, fails.
//
// Usage: node scripts/check-colours.js           check (CI)
//        node scripts/check-colours.js --update  rewrite the baseline after a
//                                                 cleanup (counts may only drop)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const baselineFile = path.join(__dirname, 'colour-baseline.json');
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PATTERN = new RegExp(
  `\\b(?:text|bg|border|ring|from|via|to|fill|stroke|divide|outline|placeholder|decoration|shadow|accent|caret)-(?:${PALETTE})-\\d{2,3}\\b`,
  'g'
);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

function count() {
  const counts = {};
  for (const d of ['app', 'components']) {
    for (const f of walk(path.join(root, d), [])) {
      const n = (fs.readFileSync(f, 'utf8').match(PATTERN) || []).length;
      if (n > 0) counts[path.relative(root, f).split(path.sep).join('/')] = n;
    }
  }
  return counts;
}

const counts = count();
const baseline = fs.existsSync(baselineFile)
  ? JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
  : {};

const worse = Object.entries(counts).filter(([f, n]) => n > (baseline[f] ?? 0));

if (process.argv.includes('--update')) {
  if (worse.length && Object.keys(baseline).length) {
    console.error('Not updating: these files gained hard-coded colours:');
    for (const [f, n] of worse)
      console.error(`  ${f}: ${baseline[f] ?? 0} -> ${n}`);
    process.exit(1);
  }
  const sorted = Object.fromEntries(Object.entries(counts).sort());
  fs.writeFileSync(baselineFile, JSON.stringify(sorted, null, 2) + '\n');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `Baseline written: ${total} uses in ${Object.keys(counts).length} files.`
  );
  process.exit(0);
}

if (worse.length) {
  console.error('New hard-coded Tailwind colours. Use theme tokens instead');
  console.error('(bg-primary, text-muted-foreground, bg-warning, border…):');
  for (const [f, n] of worse)
    console.error(`  ${f}: ${baseline[f] ?? 0} -> ${n}`);
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
const was = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(`Colours OK: ${total} hard-coded uses left (baseline ${was}).`);
if (total < was) {
  console.log('Some were removed: run with --update to lower the baseline.');
}
