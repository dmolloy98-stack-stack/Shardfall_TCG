// Win rates: plays every starter deck against every other (the computer on both sides) and
// prints each deck's win rate, the first player's win rate and the average game length.
//   node tools/winrates.js [games per pairing]      (default 10; 50 gives a solid read)
// Uses tools/selftest.js, so the games are the same ones every time for the same rules.
// Targets the owner has accepted so far: every starter between about 45% and 58%, the first
// player around 54%, and a match of about 14 turns (both players' turns counted).
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
const n = process.argv[2] || '10';
const file = path.join(os.tmpdir(), `winrates-${process.pid}.txt`);
const out = execFileSync(process.execPath, ['tools/selftest.js', '.', 'ai', n, file], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
const res = JSON.parse(out.slice(out.indexOf('{')));
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split(','));
fs.unlinkSync(file);
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
