// Runs every rules test in one go and says plainly whether all of them passed.
//   node tools/test-all.js
// GitHub runs this on every push and pull request (.github/workflows/tests.yml), so a
// change that breaks something shows a red mark before it is merged.
//
// It checks:
//   - the focused tests (data, kinds, events, protected, shard, champions, replay, cards, saves, words) each say ALL PASSED
//   - the automatic games (selftest "ai 2" and "rand 300") find no problems, and each one
//     replays exactly from its move list
//   - those games still play exactly as before: their fingerprints match the numbers below.
//     When a change is meant to alter how the game plays, update these numbers (and the one
//     in CLAUDE.md) in the same change.
const EXPECTED = { ai: 1727378807, rand: 1933343540 };

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const run = args => {
  try { return { out: execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }), code: 0 }; }
  catch (e) { return { out: (e.stdout || '') + (e.stderr || ''), code: e.status || 1 }; }
};

let failed = 0;
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };

// Every tools/*-test.js runs, so a new test file is never forgotten: these first, in this order,
// then any others alphabetically. The browser tests (screen, picture) run on GitHub instead.
const FIRST = ['data', 'kinds', 'events', 'protected', 'shard', 'champions', 'replay', 'cards', 'saves', 'words'];
const BROWSER_TESTS = ['screen', 'picture'];
const found = fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith('-test.js')).map(f => f.slice(0, -8));
const TESTS = [...FIRST.filter(t => found.includes(t)), ...found.filter(t => !FIRST.includes(t) && !BROWSER_TESTS.includes(t)).sort()];
for (const t of FIRST.filter(t => !found.includes(t))) report(`${t}-test`, false, `tools/${t}-test.js is missing (renamed or deleted? update FIRST in tools/test-all.js)`);
for (const t of TESTS) {
  const { out, code } = run([`tools/${t}-test.js`, '.']);
  const ok = code === 0 && /ALL PASSED\s*$/.test(out.trim());
  report(`${t}-test`, ok, ok ? '' : '\n' + out.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 15).join('\n'));
}

{ // every card's Effect has a plain-English description (tools/explain-effect.js)
  const { out, code } = run(['tools/explain-effect.js', '--all']);
  report('every Effect explained in plain English', code === 0, code === 0 ? '' : '\n' + out.split('\n').filter(l => /PROBLEM/.test(l)).slice(0, 10).join('\n'));
}

for (const [mode, n] of [['ai', 2], ['rand', 300]]) {
  const { out, code } = run(['tools/selftest.js', '.', mode, String(n)]);
  let res = null;
  try { res = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* reported below */ }
  if (code !== 0 || !res) { report(`selftest ${mode} ${n}`, false, '\n' + out.slice(0, 2000)); continue; }
  const problems = Object.keys(res.problems);
  report(`selftest ${mode} ${n}: no problems`, !problems.length, problems.length ? '\n' + JSON.stringify(res.problems, null, 1) : '');
  report(`selftest ${mode} ${n}: plays as before`, res.fingerprint === EXPECTED[mode],
    res.fingerprint === EXPECTED[mode] ? '' : `fingerprint ${res.fingerprint}, expected ${EXPECTED[mode]} (if this change is meant to alter play: node tools/update-expected.js --write)`);
}

console.log(failed ? `\n${failed} CHECK${failed > 1 ? 'S' : ''} FAILED` : '\nEVERYTHING PASSED');
process.exit(failed ? 1 : 0);
