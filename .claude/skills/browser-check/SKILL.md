---
name: browser-check
description: >
  Opening Shardfall in a real (Playwright) browser at desktop and phone size to check a change on
  screen: page errors, screenshots, driving a match, measuring animations or speed. Use for any
  change that shows on screen, before saying it works or opening a PR.
---

# Checking Shardfall in a browser

Cloud sessions can't start a local web server (`python3 -m http.server` is blocked). Instead,
`tools/serve.js` makes a Playwright browser load the game straight from disk at
`http://game.local/`. Playwright and Chromium are already installed: never run
`playwright install`.

## The quick check (most changes)

```bash
node tools/browser-check.js <scratchpad>/shots 4
```

It opens the menu at desktop (1280x800) and phone (iPhone 15 Pro Max, **landscape**) sizes,
plays a computer-vs-computer match to round 4, saves `desk-menu.png`, `desk-table.png`,
`phone-menu.png`, `phone-table.png`, and prints page errors. It must end with `NO PAGE ERRORS`.
**Look at the screenshots** (Read the png) before saying a visual change works. Missing card art
(404s for `assets/cards/*.png`) is expected and filtered out.

Screenshots and test scripts go in the session scratchpad, never in the repo.

## A custom check

For anything the quick check doesn't reach, write a short script in the scratchpad:

```js
const { chromium, devices } = require('playwright');
const serve = require('/home/user/Shardfall_TCG/tools/serve');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); // or devices['iPhone 15 Pro Max landscape']
  await serve(ctx);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://game.local/#menu');          // #menu skips the cold open; #tutorial starts the tutorial
  await pg.waitForSelector('#btn-campaign');
  await pg.evaluate(() => PREFS.set('welcomed', true));
  await pg.keyboard.press('Escape');                  // closes the welcome box if it showed
  // ... drive the page ...
  console.log(JSON.stringify({ errs }));
  await b.close();
})();
```

Handy things inside `pg.evaluate`:
- Start a match: `U.deckId = 'zombie_starter'; U.mode = 'ai'; startGame({ opponentDeckId: 'fighter_starter' });`
  Deck ids are in `data/decks.csv`. Turn off coach tips first: `PREFS.set('hints', false); U.hints = false;`
- Fast-forward: `S.players[0].isAI = true; while (!S.over && S.round < 6) aiDecide().run();`
  then hand back: `S.players[0].isAI = false; S.active = 0; S.phase = PHASE.SETUP; render();`
- Game state is `S` (players, round, phase, over); screen and settings are `U` and `PREFS`.
- Menu buttons: `#btn-campaign`, `#door-quick`, `#door-two`, `#btn-start`, `#btn-back`.
  Settings buttons use `data-set="hints|log|speed|readlog|fx|flow|passcheck"`.
- Effects: `html.light-fx` = Heavy effects off; `html.doze` = idle pause (after 20 s).
  Count running animations: `document.getAnimations().filter(a => a.playState === 'running').length`.
- Wait for card motion to settle before a screenshot: `await pg.waitForTimeout(1500)`.

## Speed tests

Slow the CPU 4x to imitate a phone:
`const cdp = await ctx.newCDPSession(pg); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });`
Measure frames with a `requestAnimationFrame` counter over 3 seconds. The test machine has no
graphics card, so GPU-only changes (for example `will-change`) can't be judged here: say so.

## Screenshot sizes

Use `deviceScaleFactor: 1` for screenshots only Claude looks at; 2 for ones shown to the owner.
Named phone presets already carry their own scale. Send ones the owner should see with
SendUserFile.
