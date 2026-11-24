// Look mock-ups: shows the owner two or three versions of a look on the real game screen, without
// changing the game. Each version is a little CSS and JavaScript injected into a test browser;
// the tool takes close-up pictures of the parts named in the plan, plus the whole table.
//   node tools/look-mockup.js <plan.js> <out folder> [one version's name]
// The plan (kept in the scratchpad, not in the game) is a Node module:
//   module.exports = {
//     screen: 'match',                 // 'match' (a quick match, default) or 'menu'
//     setup: '...',                    // optional JavaScript run in the page first (e.g. put cards on the table)
//     shots: [{ name: 'card', selector: '.field-card .rune-ring', pad: 14 }],
//     versions: {
//       today: {},                     // always include today's look to compare against
//       pixel: { css: '...', js: '...', frames: 2, gap: 300, moment: '...' },
//     },
//   };
// A version's `js` runs after `setup` and may replace drawing functions (window.name = ...);
// `frames` pictures are taken `gap` ms apart, and `moment` runs before the last one (to catch a
// rare effect, such as a glitch, on camera). Pictures: <out>/<version>-<shot>-<frame>.png and
// <out>/<version>-table.png, at twice the screen's sharpness. The look advisor
// (.claude/agents/look-advisor.md) uses this to build its options page.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const serve = require('./serve');

const [planFile, outDir, only] = process.argv.slice(2);
if (!planFile || !outDir) { console.log('Usage: node tools/look-mockup.js <plan.js> <out folder> [version]'); process.exit(1); }
const plan = require(path.resolve(planFile));
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const [name, v] of Object.entries(plan.versions)) {
    if (only && name !== only) continue;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await serve(ctx);
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem('shardfall.welcomed', 'true'); localStorage.setItem('shardfall.hints', 'false'); } catch {} });
    await pg.goto('http://game.local/#menu');
    await pg.waitForSelector('#btn-campaign', { state: 'attached' });
    if ((plan.screen || 'match') === 'match') {
      await pg.click('#door-quick'); await pg.click('[data-deck="simple_starter"]'); await pg.click('[data-opp="monkey_starter"]'); await pg.click('#btn-start');
      await pg.waitForFunction(() => U.screen === 'game' && S && S.players.length === 2);
      await pg.waitForTimeout(1800);   // the "Your turn" banner
    }
    if (plan.setup) await pg.evaluate(plan.setup);
    if (v.css) await pg.addStyleTag({ content: v.css });
    if (v.js) await pg.evaluate(v.js);
    await pg.evaluate(() => { if (typeof render === 'function' && U.screen === 'game') render(); });
    await pg.waitForTimeout(v.settle ?? 1500);
    const frames = v.frames || 1;
    for (let f = 0; f < frames; f++) {
      if (v.moment && f === frames - 1) await pg.evaluate(v.moment);
      for (const s of plan.shots || []) {
        const el = await pg.$(s.selector);
        if (!el) { errors.push(`nothing matches ${s.selector}`); continue; }
        const r = await el.boundingBox(), pad = s.pad ?? 12;
        await pg.screenshot({ path: path.join(outDir, `${name}-${s.name}-${f}.png`), clip: { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 } });
      }
      if (f < frames - 1) await pg.waitForTimeout(v.gap || 500);
    }
    await pg.screenshot({ path: path.join(outDir, `${name}-table.png`) });
    console.log(`${errors.length ? 'PROBLEM' : 'ok     '}  ${name}${errors.length ? '  ' + errors.join(' | ') : ''}`);
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
