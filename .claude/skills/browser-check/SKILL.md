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

It also runs the **"can you read it?" check** (`tools/readability.js`) on the menu and the table:
- **small text:** board text under 10 px as designed (the board is 1440x1000 and shrinks to fit;
  `boardScale` says how much, 0.38 on a landscape iPhone), other text under 9 px on screen;
- **overlapping text:** the words of two separate pieces drawn on top of each other;
- **cut off:** text past the screen's edge that can't be scrolled to.
Decorations (`aria-hidden`), passing effects and moving pieces are left out. Hand cards are
summed up as `handSmallestText` instead, because they grow when hovered or tapped.
It ends `NO READABILITY WARNINGS` or a count. Compare with the count before the change: fix any
new warning, or tell the owner why it stays. Known today (Nov 2026): a card with two skills
(White Belt Student) shrinks its skill labels to 9.5 px; long names shrink to fit one line.
For any page, `const { readability } = require('/home/user/Shardfall_TCG/tools/readability')`
then `await readability(page)`.

Screenshots and test scripts go in the session scratchpad, never in the repo.

## Picture comparison (before and after a look change)

```bash
git worktree add <scratchpad>/main origin/main
node tools/picture-test.js <scratchpad>/main <scratchpad>/pics
```

It photographs 9 scenes at desktop and phone size from both versions, with animations off and
fixed seeds, and lists the scenes that changed; `<scratchpad>/pics/report.html` shows before,
after and the difference in red. GitHub does the same on every pull request (a warning, never a
red mark) and attaches the pictures as "picture-changes". To add a scene, add it to `SCENES`.

## Speed budget (did this change make it slower?)

`node tools/speed-budget.js <scratchpad>/main` (same `main` worktree as above) measures both
versions in turns, 5 times each, with the processor slowed 4x, and compares the middle results.
More than 15% slower (and more than 3 ms) is flagged; GitHub does the same on each pull request as
a warning. Use `tools/speed-check.js` for frames per second with Heavy effects on and off.

## Real phones

The pretend phone can't show heat, real touch or Safari quirks. Before a big release, point the
owner to `docs/real-phones.md` (a device cloud's Live mode and a checklist).

## Accessibility

`node tools/a11y-check.js` (install axe once: `npm install --no-save --no-package-lock axe-core@4.10.2`;
it lands in the git-ignored `node_modules/`). It must end `NO ACCESSIBILITY PROBLEMS FOUND`; `--all`
also shows milder problems. It can't judge text contrast on gradients and pictures (most of the
game's text), so look at new text against its background by eye in the screenshots. Scrolling
boxes need `tabindex="0"` and an `aria-label`, so keyboard players can scroll them.

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

```bash
node tools/speed-check.js
```

It slows the processor 4x to imitate a phone and prints frames per second on the menu and on a
settled table, with Heavy effects on and off, plus how long a table redraw takes (ms). Run it
before and after anything heavy and compare. Last reading (Nov 2026): menu 35 fps on / 60 off,
table about 15–23 on / 60 off, redraw 7–15 ms. The test machine has no graphics card, so
GPU-only changes (for example `will-change`) can't be judged here: say so.

## iPhone checks (problems the owner actually hit)

The owner plays on an iPhone 16 Pro Max, in Safari and in Chrome. For anything touching layout,
touch or the tutorial, check with `devices['iPhone 15 Pro Max landscape']` **and** the portrait
preset (`devices['iPhone 15 Pro Max']`, which should show the "turn your phone sideways" screen
with a "Play upright anyway" button):
- **Your own side of the board is visible** (once it was cut off at the bottom in Chrome).
- **Buttons can be reached while the tutorial coach box is open** (once dragging the screen
  didn't work, so buttons couldn't be pressed). Tap each button the tutorial points at.
- **Tap targets** are at least 44 px on screen; side buttons not oversized.
- **Text is readable** at phone size (card text was too small once).
- Nothing hides behind the notch or the home bar.
- Phones start with Heavy effects off; the game should not redraw constantly when idle
  (count running animations; it should drop to 0 once dozing).
Use `pg.tap()` / `pg.touchscreen.tap()` on phone presets (they have touch).

## Screenshot sizes

Use `deviceScaleFactor: 1` for screenshots only Claude looks at; 2 for ones shown to the owner.
Named phone presets already carry their own scale. Send ones the owner should see with
SendUserFile.
