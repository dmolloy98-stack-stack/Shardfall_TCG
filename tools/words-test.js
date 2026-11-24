// Checks the words players read (data/ui_text.csv): node tools/words-test.js .
//   - every T("id") and data-t="id" in the code has its row in the file (otherwise players see [id])
//   - no TextID appears twice
//   - rows nothing uses are listed (not a failure: they may be on their way in or out)
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || '.';
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };

const lines = fs.readFileSync(path.join(dir, 'data/ui_text.csv'), 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).slice(1);
const ids = lines.map(l => l.split(',')[0]);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
ok('no TextID appears twice', !dupes.length, dupes.join(', '));
const have = new Set(ids);

const files = [...fs.readdirSync(path.join(dir, 'js')).map(f => 'js/' + f), 'index.html'];
const asked = new Map(), mentioned = new Set();
for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');   // comments don't count
  for (const m of text.matchAll(/\bT\(\s*"([A-Za-z0-9_]+)"/g)) asked.set(m[1], f);
  for (const m of text.matchAll(/data-t="([A-Za-z0-9_]+)"/g)) asked.set(m[1], f);
  for (const m of text.matchAll(/"([a-z][a-z0-9_]+)"/g)) if (have.has(m[1])) mentioned.add(m[1]);   // ids passed around, e.g. SETUP
  for (const m of text.matchAll(/DATA\.text\(\s*"([A-Za-z0-9_]+)"/g)) mentioned.add(m[1]);
}
const missing = [...asked].filter(([id]) => !have.has(id));
ok('every word the code asks for is in data/ui_text.csv', !missing.length, missing.map(([id, f]) => `${id} (${f})`).join(', '));
// "target_<CardID>" rows are one card's target prompt (renderPrompt in js/board.js).
const cardIds = new Set(fs.readFileSync(path.join(dir, 'data/cards.csv'), 'utf8').split(/\r?\n/).map(l => l.split(',')[0]));
for (const id of ids) if (id.startsWith('target_') && cardIds.has(id.slice(7))) mentioned.add(id);
const unused = ids.filter(id => !asked.has(id) && !mentioned.has(id));
if (unused.length) console.log(`note: rows nothing uses yet: ${unused.join(', ')}`);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
