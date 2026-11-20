// Win rates: plays every starter deck against every other (the computer on both sides) and
// prints each deck's win rate, the first player's win rate and the average game length.
//   node tools/winrates.js [games per pairing]      (default 10; 50 gives a solid read)
// Uses tools/selftest.js, so the games are the same ones every time for the same rules.
// Targets the owner has accepted so far: every starter between about 45% and 58%, the first
// player around 54%, and a match of about 14 turns (both players' turns counted).
// Add --check to warn when a starter deck's win rate leaves CHECK_RANGE (GitHub runs this on every
// pull request and shows the warning on it; the warning never blocks a merge).
const { execFile } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
const n = process.argv.slice(2).find(a => /^\d+$/.test(a)) || '10';
const CHECK_RANGE = [40, 60];

// One selftest per deck going first, run side by side (the games are the same as one big run).
const csv = fs.readFileSync(path.join(root, 'data/decks.csv'), 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).slice(1);
const decks = csv.map(l => l.split(',')[0]);
const runOne = deck => new Promise((resolve, reject) => {
  const file = path.join(os.tmpdir(), `winrates-${process.pid}-${deck}.txt`);
  execFile(process.execPath, ['tools/selftest.js', '.', 'ai', n, file], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, SELFTEST_DECK: deck } }, (err, out) => {
    if (err) return reject(err);
    const res = JSON.parse(out.slice(out.indexOf('{')));
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
    if (fs.existsSync(file)) fs.unlinkSync(file);
    resolve({ res, lines });
  });
});
(async () => {
// An older copy of the game (a before-and-after check) has a selftest that can't do one deck at a
// time: then it is one run of everything.
const sideBySide = fs.readFileSync(path.join(root, 'tools/selftest.js'), 'utf8').includes('SELFTEST_DECK');
const parts = sideBySide ? await Promise.all(decks.map(runOne)) : [await runOne('')];
const res = { problems: Object.assign({}, ...parts.map(p => p.res.problems)) };
const rows = parts.flatMap(p => p.lines).map(l => l.split(','));
const won = {}, played = {}, pair = {};
let firstWins = 0, games = 0, rounds = 0;
for (const [a, b, , winner, round] of rows) {
  if (a === b) continue;   // mirror matches say nothing about a deck's strength
  games++; rounds += +round;
  for (const d of [a, b]) played[d] = (played[d] || 0) + 1;
  const w = winner === '0' ? a : winner === '1' ? b : null;
  if (w) won[w] = (won[w] || 0) + 1;
  if (winner === '0') firstWins++;
  const k = a + ' vs ' + b; pair[k] = pair[k] || [0, 0]; pair[k][1]++; if (winner === '0') pair[k][0]++;
}
const pct = (x, y) => (100 * x / y).toFixed(1) + '%';
console.log(`${games} games (${n} per pairing, mirror matches left out)${Object.keys(res.problems).length ? '  PROBLEMS: ' + JSON.stringify(res.problems) : ''}\n`);
console.log('Deck win rates:');
for (const d of Object.keys(played).sort((x, y) => (won[y] || 0) / played[y] - (won[x] || 0) / played[x]))
  console.log('  ' + d.padEnd(20) + pct(won[d] || 0, played[d]).padStart(7) + `  (${won[d] || 0}/${played[d]})`);
console.log(`\nFirst player wins: ${pct(firstWins, games)}`);
console.log(`Average game: ${(rounds / games).toFixed(1)} turns (both players' turns counted)`);
if (process.argv.includes('--pairs')) {
  console.log('\nEach pairing (first deck went first; its win rate):');
  for (const [k, [w, t]] of Object.entries(pair)) console.log('  ' + k.padEnd(40) + pct(w, t));
}
if (process.argv.includes('--check')) {
  const off = Object.keys(played).filter(d => { const r = 100 * (won[d] || 0) / played[d]; return r < CHECK_RANGE[0] || r > CHECK_RANGE[1]; });
  for (const d of off) console.log(`::warning title=Balance::${d} wins ${pct(won[d] || 0, played[d])} of its games, outside ${CHECK_RANGE[0]}-${CHECK_RANGE[1]}%.`);
  if (Object.keys(res.problems).length) console.log(`::warning title=Balance::the balance games found problems: ${JSON.stringify(res.problems)}`);
  console.log(off.length ? `\n${off.length} deck(s) outside ${CHECK_RANGE[0]}-${CHECK_RANGE[1]}%` : `\nEvery starter deck is within ${CHECK_RANGE[0]}-${CHECK_RANGE[1]}%`);
}
})().catch(e => { console.error(e.message); process.exit(1); });
