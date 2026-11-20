// Runs every rules test in one go and says plainly whether all of them passed.
//   node tools/test-all.js
// GitHub runs this on every push and pull request (.github/workflows/tests.yml), so a
// change that breaks something shows a red mark before it is merged.
//
// It checks:
//   - the five focused tests (kinds, events, protected, shard, champions) each say ALL PASSED
//   - the automatic games (selftest "ai 2" and "rand 300") find no problems
//   - those games still play exactly as before: their fingerprints match the numbers below.
//     When a change is meant to alter how the game plays, update these numbers (and the one
//     in CLAUDE.md) in the same change.
const EXPECTED = { ai: 1506290345, rand: 1933343540 };

const { execFileSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const run = args => {
  try { return { out: execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }), code: 0 }; }
  catch (e) { return { out: (e.stdout || '') + (e.stderr || ''), code: e.status || 1 }; }
};

let failed = 0;
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };

for (const t of ['kinds', 'events', 'protected', 'shard', 'champions']) {
  const { out, code } = run([`tools/${t}-test.js`, '.']);
  const ok = code === 0 && /ALL PASSED\s*$/.test(out.trim());
  report(`${t}-test`, ok, ok ? '' : '\n' + out.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 15).join('\n'));
}

for (const [mode, n] of [['ai', 2], ['rand', 300]]) {
  const { out, code } = run(['tools/selftest.js', '.', mode, String(n)]);
  let res = null;
  try { res = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* reported below */ }
  if (code !== 0 || !res) { report(`selftest ${mode} ${n}`, false, '\n' + out.slice(0, 2000)); continue; }
  const problems = Object.keys(res.problems);
  report(`selftest ${mode} ${n}: no problems`, !problems.length, problems.length ? '\n' + JSON.stringify(res.problems, null, 1) : '');
  report(`selftest ${mode} ${n}: plays as before`, res.fingerprint === EXPECTED[mode],
    res.fingerprint === EXPECTED[mode] ? '' : `fingerprint ${res.fingerprint}, expected ${EXPECTED[mode]} (update EXPECTED in tools/test-all.js if this change is meant to alter play)`);
}

console.log(failed ? `\n${failed} CHECK${failed > 1 ? 'S' : ''} FAILED` : '\nEVERYTHING PASSED');
process.exit(failed ? 1 : 0);
