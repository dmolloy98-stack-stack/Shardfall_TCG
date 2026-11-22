// Accessibility check: runs axe (the usual free checker for websites) on the main screens at
// desktop and phone size, and tries the menu with the keyboard alone. It reports what would get in
// the way of players with poor eyesight, colour blindness, a screen reader or no mouse.
//   npm install --no-save --no-package-lock axe-core@4.10.2   (once; a test tool, not part of the game)
//   node tools/a11y-check.js [--all]
// Lists each problem once with the screens it appears on and an example. The card game's table is
// a drawn board, so a few checks (like reading order) matter less there than on the menus.
// --all also lists "moderate" and "minor" problems, not just "serious" and "critical".
const { chromium, devices } = require('playwright');
const serve = require('./serve');
let axePath;
try { axePath = require.resolve('axe-core/axe.min.js'); } catch { console.log('axe-core is not installed. Run: npm install --no-save --no-package-lock axe-core@4.10.2'); process.exit(1); }
const ALL = process.argv.includes('--all');

const match = `newGame({ deckId: 'zombie_starter', opponentDeckId: 'fighter_starter', mode: 'ai', seed: 7 });
  U.curtain = false; S.players[0].isAI = true; let n = 0; while (!S.over && S.round < 4 && n++ < 600) aiDecide().run();
  S.players[0].isAI = false; showScreen('game'); render();`;
const SCENES = [
  ['menu', ''], ['settings', 'showSettings()'], ['save code', 'showSaveCode()'], ["what's new", 'showWhatsNew()'],
  ['almanac', "showScreen('almanac'); renderAlmanac()"], ['card details', 'showDetail(DATA.cardsById.simple_farmer)'],
  ['campaign', 'showCampaign()'], ['deck builder', "openBuilder({ id: null, name: 'My deck', cards: {} })"],
  ['match', match], ['game menu', match + ' showGameMenu();'],
];

(async () => {
  const browser = await chromium.launch();
  const found = new Map();   // rule -> { impact, help, url, where: Set, example }
  let unsureContrast = 0;    // text axe couldn't judge: on a gradient or a picture
  for (const [size, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 15 Pro Max landscape']]]) {
    for (const [name, setup] of SCENES) {
      const ctx = await browser.newContext(opts); await serve(ctx);
      const pg = await ctx.newPage();
      await pg.addInitScript(() => { try { localStorage.setItem('shardfall.welcomed', 'true'); localStorage.setItem('shardfall.hints', 'false'); } catch {} });
      await pg.goto('http://game.local/#menu');
      await pg.waitForSelector('#btn-campaign', { state: 'attached' });
      if (setup) await pg.evaluate(setup);
      await pg.waitForTimeout(600);
      await pg.addScriptTag({ path: axePath });
      const out = await pg.evaluate(async () => { const r = await axe.run(document, { resultTypes: ['violations', 'incomplete'] }); return { unsure: (r.incomplete.find(v => v.id === 'color-contrast')?.nodes.length) || 0, v: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, url: v.helpUrl, example: v.nodes[0]?.target.join(' ') + ' ' + (v.nodes[0]?.failureSummary || '').split('\n').slice(1, 2).join(' '), n: v.nodes.length })) }; });
      unsureContrast += out.unsure;
      const res = out.v;
      for (const v of res) {
        if (!ALL && !['serious', 'critical'].includes(v.impact)) continue;
        const f = found.get(v.id) || { ...v, where: new Map() };
        f.where.set(`${name} (${size})`, v.n);
        found.set(v.id, f);
      }
      await ctx.close();
    }
  }
  // Keyboard: from the top of the menu, Tab must reach every main button, and show where it is.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await serve(ctx);
  const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem('shardfall.welcomed', 'true'); } catch {} });
  await pg.goto('http://game.local/#menu'); await pg.waitForSelector('#btn-campaign');
  const reached = new Set(), unseen = [];
  for (let i = 0; i < 40; i++) {
    await pg.keyboard.press('Tab');
    const r = await pg.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const st = getComputedStyle(el); return { id: el.id || el.textContent.trim().slice(0, 30), visible: st.outlineStyle !== 'none' || st.boxShadow !== 'none' }; });
    if (!r) continue;
    reached.add(r.id);
    if (!r.visible) unseen.push(r.id);
  }
  await browser.close();
  const want = ['btn-campaign', 'door-quick', 'door-two', 'btn-decks', 'btn-tutorial', 'btn-rules', 'btn-almanac', 'btn-trophies', 'btn-settings', 'btn-version'];
  const missed = want.filter(id => !reached.has(id));

  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const list = [...found.values()].sort((a, b) => order[a.impact] - order[b.impact]);
  for (const f of list) {
    console.log(`\n${f.impact.toUpperCase()}  ${f.help}  [${f.id}]`);
    console.log(`  on: ${[...f.where].map(([w, n]) => `${w}${n > 1 ? ` x${n}` : ''}`).join(', ')}`);
    console.log(`  e.g. ${f.example.trim()}`);
    console.log(`  more: ${f.url}`);
  }
  console.log(`\nKeyboard: ${missed.length ? `Tab never reached ${missed.join(', ')}` : 'Tab reaches every main menu button'}${unseen.length ? `; no visible focus on ${[...new Set(unseen)].join(', ')}` : ', and you can always see where you are'}.`);
  console.log(`Colour contrast: ${unsureContrast} spots of text sit on gradients or pictures, which axe can't judge; look at those by eye (screenshots).`);
  const n = list.length + (missed.length ? 1 : 0) + (unseen.length ? 1 : 0);
  if (process.env.GITHUB_ACTIONS) for (const f of list) console.log(`::warning title=Accessibility::${f.help} (${[...f.where.keys()].join(', ')})`);
  console.log(n ? `\n${n} ACCESSIBILITY PROBLEM${n > 1 ? 'S' : ''}` : '\nNO ACCESSIBILITY PROBLEMS FOUND');
})();
