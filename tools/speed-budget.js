// Speed budget: measures an older version of the game and this one, on the same computer at the
// same time, and warns when this one is noticeably slower. The processor is slowed 4x to act like
// a phone. Measuring both side by side matters: a computer's speed varies from run to run, so only
// the comparison means anything.
//   node tools/speed-budget.js <older game folder>
// The older folder is usually main: git worktree add /tmp/main origin/main
// What it measures (lower is better), each the middle of several tries:
//   load     opening the game until the menu is ready
//   match    starting a match until the table is drawn
//   redraw   drawing a busy table again (what every tap and every animation step costs)
//   think    the computer playing one whole turn
//   size     how much the game downloads (exact, no tries needed)
// A measure more than BUDGET slower (and by more than a few milliseconds) gives a warning line,
// and "SPEED BUDGET EXCEEDED" at the end; GitHub shows it on the pull request. It never blocks a
// merge: a new feature may be worth some speed, and that's for a person to judge.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const serve = require('./serve');
const here = path.join(__dirname, '..');
const before = process.argv[2] && path.resolve(process.argv[2]);
if (!before || !fs.existsSync(path.join(before, 'index.html'))) { console.log('Usage: node tools/speed-budget.js <older game folder>'); process.exit(1); }
const BUDGET = 0.15;      // 15% slower
const MIN_MS = 3;         // ...and at least this many milliseconds, so tiny numbers don't jitter into warnings
const TRIES = 5;

// How much the game downloads: index.html, the stylesheet, the loader and everything it lists.
function size(root) {
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const data = read('js/data.js');
  const list = name => JSON.parse(data.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1]);
  const files = ['index.html', 'css/style.css', 'css/skins.css', 'js/data.js', ...list('DATA_FILES').map(n => `data/${n}.csv`), ...list('GAME_SCRIPTS')];
  return files.reduce((n, f) => n + (fs.existsSync(path.join(root, f)) ? fs.statSync(path.join(root, f)).size : 0), 0) / 1024;
}

async function measure(browser, root) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await serve(ctx, root);
  const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem('shardfall.welcomed', 'true'); localStorage.setItem('shardfall.hints', 'false'); } catch {} });
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await pg.goto('http://game.local/#menu');
  await pg.waitForFunction(() => window.shardfallStarted && document.getElementById('btn-campaign').offsetWidth > 0);
  const load = Date.now() - t0;
  const r = await pg.evaluate(() => {
    const t = () => performance.now();
    let a = t();
    newGame({ deckId: 'monkey_starter', opponentDeckId: 'fighter_starter', mode: 'ai', seed: 11 });
    U.curtain = false; showScreen('game'); render();
    const match = t() - a;
    S.players[0].isAI = true; let n = 0;
    while (!S.over && S.round < 6 && n++ < 600) aiDecide().run();   // round 6 of this seed: a busy table, the match still going
    S.players[0].isAI = false; render();
    // A full redraw: every region drawn again (the same work as the first draw of a table).
    a = t();
    const board = document.getElementById('board');
    for (let i = 0; i < 20; i++) { board.innerHTML = ''; delete board.dataset.regions; render(); }
    const redraw = (t() - a) / 20;
    // The computer playing a whole turn from this position (on a copy of the game, ten times: one
    // turn alone varies a lot with whatever else the computer is doing).
    a = t();
    for (let i = 0; i < 10; i++) simulate(() => {
      const me = S.active; S.players[me].isAI = true; let k = 0;
      while (!S.over && S.active === me && k++ < 80) aiStep();
    });
    const think = (t() - a) / 10;
    return { match, redraw, think };
  });
  await ctx.close();
  return { load, ...r };
}

const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

(async () => {
  const browser = await chromium.launch();
  const runs = { before: [], now: [] };
  for (let i = 0; i < TRIES; i++) {   // taking turns, so a busy moment hits both versions alike
    runs.before.push(await measure(browser, before));
    runs.now.push(await measure(browser, here));
  }
  await browser.close();
  const rows = [];
  for (const [key, label] of [['load', 'load'], ['match', 'match'], ['redraw', 'redraw'], ['think', 'think']]) {
    const b = median(runs.before.map(r => r[key])), n = median(runs.now.map(r => r[key]));
    rows.push({ label, b, n, unit: 'ms', over: n > b * (1 + BUDGET) && n - b > MIN_MS });
  }
  const sb = size(before), sn = size(here);
  rows.push({ label: 'size', b: sb, n: sn, unit: 'KB', over: sn > sb * 1.10 });   // size is exact: 10% more is a lot
  console.log('measure   before     now   change');
  for (const r of rows) {
    const ch = r.b ? ((r.n - r.b) / r.b * 100) : 0;
    console.log(`${r.label.padEnd(8)} ${r.b.toFixed(1).padStart(7)} ${r.n.toFixed(1).padStart(7)} ${r.unit}  ${(ch >= 0 ? '+' : '') + ch.toFixed(0)}%${r.over ? '   <- slower than the budget allows' : ''}`);
  }
  const over = rows.filter(r => r.over);
  if (process.env.GITHUB_ACTIONS) for (const r of over) console.log(`::warning title=Speed budget::${r.label} went from ${r.b.toFixed(1)} to ${r.n.toFixed(1)} ${r.unit}, more than the budget allows.`);
  console.log(over.length ? `\nSPEED BUDGET EXCEEDED: ${over.map(r => r.label).join(', ')}` : '\nWITHIN THE SPEED BUDGET');
})();
