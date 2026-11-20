// Speed check: imitates a phone by slowing the test computer's processor 4x, then measures
// frames per second on the menu and on a settled table (Heavy effects on and off), and how
// long a redraw of the table takes.
//   node tools/speed-check.js
// Higher fps is better (60 is perfectly smooth). The test machine has no graphics card, so
// the numbers are for comparing before and after a change, not real phone numbers.
const { chromium } = require('playwright');
const serve = require('./serve');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await serve(ctx);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const fps = () => pg.evaluate(() => new Promise(done => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else done(Math.round(frames / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(tick);
  }));
  const setFx = on => pg.evaluate(on => { U.heavyFx = on; PREFS.set('heavyFx', on); applyHeavyFx(); if (U.screen === 'menu') { storm.stop(); storm.start(); } }, on);   // same as the Settings button

  await pg.goto('http://game.local/#menu'); await pg.waitForSelector('#btn-campaign');
  await pg.evaluate(() => PREFS.set('welcomed', true)); await pg.keyboard.press('Escape');
  const out = {};
  await setFx(true); await pg.waitForTimeout(800); out.menuFpsHeavyOn = await fps();
  await setFx(false); await pg.waitForTimeout(800); out.menuFpsHeavyOff = await fps();

  await pg.evaluate(() => {
    PREFS.set('hints', false); U.hints = false; U.deckId = 'monkey_starter'; U.mode = 'ai';
    startGame({ opponentDeckId: 'fighter_starter' });
    S.players[0].isAI = true; let n = 0;
    while (!S.over && S.round < 10 && n++ < 600) aiDecide().run();
    S.players[0].isAI = false; S.active = 0; S.phase = PHASE.SETUP; render();
  });
  await setFx(true); await pg.waitForTimeout(2000); out.tableFpsHeavyOn = await fps();
  await setFx(false); await pg.waitForTimeout(800); out.tableFpsHeavyOff = await fps();
  out.redrawMs = await pg.evaluate(() => {
    const t0 = performance.now(); for (let i = 0; i < 10; i++) render(); return +((performance.now() - t0) / 10).toFixed(1);
  });
  out.errors = errs;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
