// For a change that is MEANT to alter how the game plays (a card, a rule, the computer): updates
// everything that records "how the game plays" in one go, so nothing is forgotten.
//   node tools/update-expected.js            show what would change, and change nothing
//   node tools/update-expected.js --write    update them
// It updates:
//   - the play fingerprints in EXPECTED at the top of tools/test-all.js (computer games "ai 2" and
//     random-move games "rand 300")
//   - the "ai 2" fingerprint quoted in CLAUDE.md
//   - the recorded test matches (tools/recorded-matches.json, via tools/replay-test.js --update)
// Only use it when the play change is wanted, and say so in the pull request and to the owner.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');

const fingerprint = mode => {
  const out = execFileSync(process.execPath, ['tools/selftest.js', '.', mode, mode === 'ai' ? '2' : '300'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  const res = JSON.parse(out.slice(out.indexOf('{')));
  if (Object.keys(res.problems).length) throw new Error(`selftest ${mode} found problems; fix them first: ${JSON.stringify(res.problems)}`);
  return res.fingerprint;
};

const testAll = path.join(root, 'tools/test-all.js'), claude = path.join(root, 'CLAUDE.md');
const t = fs.readFileSync(testAll, 'utf8');
const m = t.match(/const EXPECTED = \{ ai: (-?\d+), rand: (-?\d+) \};/);
if (!m) throw new Error('EXPECTED not found in tools/test-all.js');
const old = { ai: Number(m[1]), rand: Number(m[2]) };
const now = { ai: fingerprint('ai'), rand: fingerprint('rand') };
let replayOk = true;
try { execFileSync(process.execPath, ['tools/replay-test.js', '.'], { cwd: root, stdio: 'pipe' }); } catch { replayOk = false; }

console.log(`computer games (ai 2):     ${old.ai} -> ${now.ai}${old.ai === now.ai ? '  (same)' : ''}`);
console.log(`random games (rand 300):   ${old.rand} -> ${now.rand}${old.rand === now.rand ? '  (same)' : ''}`);
console.log(`recorded matches:          ${replayOk ? 'play as recorded' : 'play differently now'}`);
const changes = old.ai !== now.ai || old.rand !== now.rand || !replayOk;
if (!changes) { console.log('\nNothing to update: the game plays exactly as recorded.'); process.exit(0); }
if (!WRITE) { console.log('\nRun again with --write to update them (only if this play change is meant).'); process.exit(0); }

fs.writeFileSync(testAll, t.replace(m[0], `const EXPECTED = { ai: ${now.ai}, rand: ${now.rand} };`));
const c = fs.readFileSync(claude, 'utf8');
const c2 = c.replace(/fingerprint \(currently -?\d+ for `ai 2`/, `fingerprint (currently ${now.ai} for \`ai 2\``);
if (c2 === c && old.ai !== now.ai) console.log('Note: the fingerprint line in CLAUDE.md was not found; update it by hand.');
fs.writeFileSync(claude, c2);
execFileSync(process.execPath, ['tools/replay-test.js', '.', '--update'], { cwd: root, stdio: 'inherit' });
console.log('\nUpdated. Run node tools/test-all.js, and tell the owner that play changed and why.');
