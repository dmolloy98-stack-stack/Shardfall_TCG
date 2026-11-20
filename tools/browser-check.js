// Quick browser check: opens the game at desktop and phone size, plays a computer-vs-computer
// match for a few rounds, and saves screenshots. Prints any page errors, and "can you read
// it?" warnings (tools/readability.js): text too small, text overlapping, text cut off.
//   node tools/browser-check.js [output folder] [rounds]
// Screenshots: <folder>/desk-menu.png, desk-table.png, phone-menu.png, phone-table.png.
// Missing card art (assets/cards/*.png) is expected and not counted as an error.
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const { readability } = require('./readability');
const outDir = path.resolve(process.argv[2] || 'shots');
const rounds = Number(process.argv[3] || 4);
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const report = {};
  for (const [label, opts] of [['desk', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 15 Pro Max landscape']]]) {
    const ctx = await browser.newContext(opts); await serve(ctx);
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/assets\/cards|404/.test(m.text())) errs.push(m.text()); });
    await pg.goto('http://game.local/#menu');
    await pg.waitForSelector('#btn-campaign');
    await pg.evaluate(() => PREFS.set('welcomed', true));
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(outDir, `${label}-menu.png`) });
    const readMenu = await readability(pg);
    const res = await pg.evaluate(r => {
      PREFS.set('hints', false); U.hints = false; U.deckId = 'zombie_starter'; U.mode = 'ai';
      startGame({ opponentDeckId: 'fighter_starter' });
      S.players[0].isAI = true; let n = 0;
      while (!S.over && S.round < r && n++ < 600) aiDecide().run();
      S.players[0].isAI = false; S.active = 0; render();
      return { round: S.round, over: S.over, health: S.players.map(p => p.health) };
    }, rounds);
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: path.join(outDir, `${label}-table.png`) });
    const readTable = await readability(pg);
    const warn = [];
    for (const [where, r] of [['menu', readMenu], ['table', readTable]]) {
      for (const k of ['small', 'overlap', 'offscreen']) for (const x of r[k]) warn.push(`${where}, ${k === 'small' ? 'small text' : k === 'overlap' ? 'overlapping text' : 'cut off'}: ${x}`);
    }
    report[label] = { ...res, boardScale: readTable.boardScale, handSmallestText: readTable.handSmallest, errors: errs, readability: warn };
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  console.log(Object.values(report).some(r => r.errors.length) ? 'PAGE ERRORS FOUND' : 'NO PAGE ERRORS');
  const nWarn = Object.values(report).reduce((n, r) => n + r.readability.length, 0);
  console.log(nWarn ? `${nWarn} READABILITY WARNING${nWarn > 1 ? 'S' : ''} (see "readability" above)` : 'NO READABILITY WARNINGS');
})();
