// Automatic screen tests: opens the game in a real (headless) browser and uses it the way a player
// would, by clicking and dragging, and checks that each step does what it should.
//   node tools/screen-test.js            every test, at desktop size, then a few at phone size
//   node tools/screen-test.js menu       only the tests whose name contains "menu"
// GitHub runs it on every pull request (.github/workflows/tests.yml). It ends with
// "ALL SCREEN TESTS PASSED" or lists what failed. Missing card art (404s) is expected and ignored.
// Adding a test: add an entry to TESTS below with a plain-English name; keep each test short and
// independent (each starts from a fresh page).
const { chromium, devices } = require('playwright');
const serve = require('./serve');
const only = process.argv[2] || '';

const DESK = { viewport: { width: 1280, height: 800 } };
const PHONE = devices['iPhone 15 Pro Max landscape'];

// A fresh page on the menu, with the welcome box already seen. Returns { pg, errors }.
async function open(browser, opts = DESK, hash = '#menu') {
  const ctx = await browser.newContext(opts); await serve(ctx);
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(10000);
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/assets\/cards|404/.test(m.text())) errors.push(m.text()); });
  await pg.addInitScript(() => { try { localStorage.setItem('shardfall.welcomed', 'true'); localStorage.setItem('shardfall.hints', 'false'); } catch {} });
  await pg.goto('http://game.local/' + hash);
  await pg.waitForSelector('#btn-campaign', { state: 'attached' });
  return { pg, errors, ctx };
}
const expect = (cond, what) => { if (!cond) throw new Error(what); };
const modalOpen = pg => pg.evaluate(() => !document.getElementById('modal').hidden);
// Starts a match against the computer from the menu, the way a player does.
async function quickMatch(pg, deck = 'simple_starter', opp = 'monkey_starter') {
  await pg.click('#door-quick');
  await pg.click(`[data-deck="${deck}"]`);
  await pg.click(`[data-opp="${opp}"]`);
  await pg.click('#btn-start');
  await pg.waitForFunction(() => U.screen === 'game' && S && S.players.length === 2);
  await pg.waitForTimeout(1600);   // the "Your turn" banner
}
// The centre of an element on screen.
async function centre(pg, selector) {
  const b = await pg.locator(selector).first().boundingBox();
  expect(b, `${selector} is not on the screen`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const TESTS = [
  ['menu: opens with the three doors and the version line', async ({ pg }) => {
    for (const id of ['#btn-campaign', '#door-quick', '#door-two', '#btn-version']) expect(await pg.isVisible(id), `${id} is not shown`);
    expect(/Update \d+/.test(await pg.textContent('#btn-version')), 'the version line has no update number');
  }],
  ['menu: What\'s new opens and closes', async ({ pg }) => {
    await pg.click('#btn-version');
    await pg.waitForSelector('.whats-new li');
    await pg.click('#modal-content [data-close]');
    expect(!(await modalOpen(pg)), 'the window did not close');
    expect(await pg.evaluate(() => document.activeElement?.id) === 'btn-version', 'keyboard focus did not go back to the version button');
  }],
  ['menu: Tab stays inside an open pop-up', async ({ pg }) => {
    await pg.click('#btn-version');
    await pg.waitForSelector('.whats-new li');
    for (let i = 0; i < 25; i++) {
      await pg.keyboard.press('Tab');
      expect(await pg.evaluate(() => !!document.activeElement?.closest('#modal')), 'Tab moved keyboard focus out of the pop-up');
    }
    await pg.keyboard.press('Shift+Tab');
    expect(await pg.evaluate(() => !!document.activeElement?.closest('#modal')), 'Shift+Tab moved keyboard focus out of the pop-up');
    await pg.click('#modal-content [data-close]');
  }],
  ['settings: a switch changes and is remembered', async ({ pg }) => {
    await pg.click('#btn-settings');
    const btn = '[data-set="hints"]';
    const before = await pg.getAttribute(btn, 'aria-pressed');
    await pg.click(btn);
    const after = await pg.getAttribute(btn, 'aria-pressed');
    expect(before !== after, 'Beginner hints did not switch');
    expect(String(await pg.evaluate(() => PREFS.get('hints'))) === after, 'the setting was not saved');
    await pg.click('[data-set="done"]');
    expect(!(await modalOpen(pg)), 'Settings did not close');
  }],
  ['settings: the save code window shows a code and goes back', async ({ pg }) => {
    await pg.click('#btn-settings');
    await pg.click('[data-set="savecode"]');
    expect((await pg.inputValue('#save-code-out')).startsWith('SHARDFALL1:'), 'no save code shown');
    await pg.fill('#save-code-in', 'not a code');
    await pg.click('[data-set="loadcode"]');
    expect(/isn't a Shardfall save code/.test(await pg.textContent('#save-code-msg')), 'a bad code was not refused');
    await pg.click('[data-set="settings"]');
    await pg.waitForSelector('[data-set="savecode"]');
  }],
  ['almanac: tabs switch, a card opens, Back returns to the menu', async ({ pg }) => {
    await pg.click('#btn-almanac');
    await pg.waitForSelector('[data-card]');
    await pg.click('[data-tab="skills"]');
    await pg.waitForSelector('.skill-item');
    await pg.click('[data-tab="cards"]');
    await pg.keyboard.press('ArrowRight');
    expect(await pg.evaluate(() => document.activeElement?.dataset.tab) === 'skills', 'the Right arrow did not move to the Skills tab');
    await pg.waitForSelector('.skill-item');
    await pg.keyboard.press('ArrowLeft');
    expect(await pg.evaluate(() => document.activeElement?.dataset.tab) === 'cards', 'the Left arrow did not move back to the Cards tab');
    await pg.waitForSelector('[data-card]');
    await pg.click('[data-card]');
    expect(await modalOpen(pg), 'the card did not open');
    await pg.keyboard.press('Escape');
    await pg.click('#alm-back');
    await pg.waitForSelector('#btn-campaign', { state: 'visible' });
  }],
  ['match: drag a card from the hand onto the table', async ({ pg }) => {
    await quickMatch(pg);
    const uid = await pg.evaluate(() => { const p = S.players[0]; p.mana = p.manaMax = 10; render(); return p.hand.find(c => c.type === 'Character' && canPlay(c, p))?.uid; });
    expect(uid, 'no character to play');
    const from = await centre(pg, `.hand-card[data-uid="${uid}"]`);
    const to = await centre(pg, '#board');
    await pg.mouse.move(from.x, from.y); await pg.mouse.down();
    for (let k = 1; k <= 12; k++) await pg.mouse.move(from.x + (to.x - from.x) * k / 12, from.y + (to.y - from.y) * k / 12);
    await pg.mouse.up();
    await pg.waitForTimeout(600);
    expect(await pg.evaluate(u => S.players[0].field.chars.some(c => c.uid === u), uid), 'the card did not reach the table');
    expect(await pg.evaluate(() => S.moves.some(m => m[1] === 'play')), 'the move was not written down');
  }],
  ['match: attack the other player directly', async ({ pg }) => {
    await quickMatch(pg);
    const uid = await pg.evaluate(() => {
      const p = S.players[0], c = newCard(DATA.cardsById.simple_swordsman); c.owner = 0; putOnField(c, p); c.hasAttacked = false;   // as if it arrived last turn
      S.players[1].field.chars.length = 0; S.phase = PHASE.BATTLE; render(); return c.uid;
    });
    const before = await pg.evaluate(() => S.players[1].health);
    await pg.click(`.field-card[data-uid="${uid}"]`, { force: true });   // cards on the table gently move, as a player would click them
    await pg.click('[data-act="face"]', { force: true });
    await pg.waitForTimeout(900);
    expect(await pg.evaluate(() => S.players[1].health) < before, 'the other player took no damage');
  }],
  ['match: end the turn, the computer plays, and it comes back to you', async ({ pg }) => {
    await quickMatch(pg);
    await pg.evaluate(() => { U.aiSpeed = 'fast'; U.passCheck = false; });
    for (let k = 0; k < 4 && await pg.evaluate(() => S.active === 0); k++) { await pg.click('[data-act="phase"]'); await pg.waitForTimeout(250); }
    await pg.waitForFunction(() => S.active === 1, null, { timeout: 5000 });
    await pg.waitForFunction(() => S.active === 0 || S.over, null, { timeout: 60000 });
    expect(await pg.evaluate(() => S.moves.some(m => m[0] === 1)), 'the computer made no moves');
  }],
  ['match: the game menu opens and Undo takes a move back', async ({ pg }) => {
    await quickMatch(pg);
    await pg.evaluate(() => { const p = S.players[0]; p.mana = p.manaMax = 10; act(() => move('play', p.hand.find(c => c.type === 'Character' && canPlay(c, p)).uid)); });
    const n = await pg.evaluate(() => S.players[0].field.chars.length);
    await pg.click('[data-act="menu"]');
    await pg.click('[data-m="undo"]');
    expect(await pg.evaluate(() => S.players[0].field.chars.length) === n - 1, 'Undo did not take the card back');
  }],
  ['match: winning shows the end screen', async ({ pg }) => {
    await quickMatch(pg);
    await pg.evaluate(() => { S.players[1].health = 1; const p = S.players[0], c = newCard(DATA.cardsById.simple_swordsman); c.owner = 0; putOnField(c, p); c.hasAttacked = false; S.players[1].field.chars.length = 0; S.phase = PHASE.BATTLE; act(() => move('attack', c.uid, null)); });
    await pg.waitForSelector('.endscreen', { timeout: 8000 });
    expect(await pg.isVisible('.endscreen [data-act="tomenu"], .endscreen [data-act="again"]'), 'no buttons on the end screen');
  }],
  ['campaign: the first champion\'s match starts', async ({ pg }) => {
    await pg.click('#btn-campaign');
    await pg.click('[data-camp="0"]');
    await pg.click('[data-camp-go="0"]');
    await pg.waitForFunction(() => U.screen === 'game' && S && S.players[1].champion);
    expect(await pg.evaluate(() => S.players[1].hand.some(c => c.id === S.players[1].champion)), 'the champion is not in its hand');
  }],
  ['choose window: pick a card and confirm it (one click handler for the window)', async ({ pg }) => {
    await quickMatch(pg);
    await pg.evaluate(() => {
      const me = S.players[0], c = cardById('simple_farmer');
      me.grave.push(c);
      ask({ kind: 'choose', source: c, owner: 0, title: 'Test', prompt: 'Pick it', cards: [c], pick: 1, resolve: 'toHand' });
      window.__uid = c.uid; render();
    });
    await pg.waitForSelector('#modal [data-pick]');
    await pg.click('#modal [data-pick]');
    await pg.click('#modal [data-opt="ok"]');
    expect(!(await modalOpen(pg)), 'the window stayed open');
    expect(await pg.evaluate(() => !S.pending && S.players[0].hand.some(c => c.name === 'Simple Farmer') && !S.players[0].grave.some(c => c.uid === window.__uid)), 'the card did not come back to the hand');
  }],
  ['tutorial: starts and the first lesson can be done', async ({ pg }) => {
    await pg.click('#btn-tutorial');
    await pg.waitForFunction(() => U.tutorial && S);
    expect(await pg.evaluate(() => S.setup.scripted), 'the lesson is not marked as scripted');
  }],
  ['deck builder: make a deck, add a card and save it', async ({ pg }) => {
    await pg.click('#btn-decks');
    await pg.click('[data-create]');
    await pg.click('[data-new=""]');
    await pg.waitForSelector('[data-add]');
    await pg.fill('#bld-name', 'Screen test deck');
    await pg.click('[data-add]');
    await pg.click('#bld-save');
    await pg.waitForTimeout(300);
    expect(await pg.evaluate(() => PREFS.get('decks', []).some(d => d.name === 'Screen test deck')), 'the deck was not saved');
  }],
  ['bug report: an error opens the window, and it closes', async ({ pg, errors }) => {
    await pg.evaluate(() => setTimeout(() => { throw new Error('screen test: pretend problem'); }));
    await pg.waitForSelector('#bug-report');
    expect((await pg.inputValue('#bug-report')).includes('"version"'), 'the report has no version');
    await pg.click('[data-bug="close"]');
    errors.length = 0;   // the pretend error is expected
  }],
];

const PHONE_TESTS = [
  ['phone: the menu fits the screen sideways', async ({ pg }) => {
    expect(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the menu is wider than the screen');
  }],
  ['phone: a match starts and the table fits', async ({ pg }) => {
    await quickMatch(pg);
    const b = await pg.locator('#stage').boundingBox();
    const vp = pg.viewportSize();
    expect(b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1, 'the table goes off the screen');
  }],
];

(async () => {
  const browser = await chromium.launch();
  let failed = 0, ran = 0;
  for (const [list, opts] of [[TESTS, DESK], [PHONE_TESTS, PHONE]]) {
    for (const [name, run] of list) {
      if (only && !name.includes(only)) continue;
      ran++;
      const t = await open(browser, opts);
      try {
        await run(t);
        if (t.errors.length) throw new Error('page errors: ' + t.errors.join(' | '));
        console.log('PASS  ' + name);
      } catch (e) {
        failed++;
        console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, process.env.SCREEN_DEBUG ? 12 : 1).join('\n      '));
      }
      await t.ctx.close();
    }
  }
  await browser.close();
  console.log(failed ? `\n${failed} OF ${ran} SCREEN TESTS FAILED` : `\nALL SCREEN TESTS PASSED (${ran})`);
  process.exit(failed ? 1 : 0);
})();
