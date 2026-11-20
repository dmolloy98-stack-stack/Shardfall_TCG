---
name: add-feature
description: >
  The building rules for adding or changing anything in Shardfall's code: a new screen, panel,
  setting, effect, animation or rule. It covers where things go and the patterns the game
  depends on (fast redraws, events, saved settings, Heavy effects off, dozing), so a change
  doesn't break something else. Use before writing game code that isn't a pure card or data edit.
---

# Adding to Shardfall

Plain HTML, CSS and JavaScript; no build step, no libraries. `docs/code-map.md` is the map:
read "The big picture" and "Where to change things" first, and update it when files are
added, split or renamed, or the flow between them changes.

## Where things go

- **Rules** (`js/engine.js`, `js/effects.js`): no screen code, so `tools/selftest.js` can load
  them in Node. Game state is `S`; it must survive `structuredClone` (store owners as player
  indexes, no functions or DOM in `S`). `simulate()` runs moves on a clone with events muted,
  so the computer can think.
- **Screen**: `js/ui.js` (state `U`, the board, input), `js/cards.js` (how a card is drawn),
  `js/table-effects.js` (reactions to game events on the table), `js/panels.js` (pop-up windows,
  Settings). The computer is `js/ai.js`. A new top-level `const` used by another file at load time
  must be in a file that loads earlier (`GAME_SCRIPTS` order).
- **Data** goes in `data/*.csv`, not in code, when the owner might want to edit it.
- **New script file:** add it to `GAME_SCRIPTS` in `js/data.js` (order matters; `js/boot.js` is
  last), to the README file table, and to the code map.
- **Words players see** are plain English and use the owner's vocabulary (Fracture, Tribes,
  Classes; see CLAUDE.md).

## Patterns that must be kept

1. **Rules talk to the screen through events.** The engine calls `emit("name", data)`; the
   screen listens with `onGameEvent((type, data) => …)` (effects in `js/fx.js`, travel in
   `js/motion.js`, speech in `js/campaign.js`). Don't call screen code from the engine.
   Existing events include play, lunge, clash, death, charDamage, playerDamage, playerHeal,
   draw, handAdd, phase, turn, log, gameOver, shardFall, eventStart.
2. **Fast redraws.** `render()` describes the whole board as HTML, split into regions with
   `RG("name")`. `renderRegions()` skips any region whose HTML didn't change, and
   `patchChildren()` keeps unchanged pieces (matched by `data-uid` or kind and order). So:
   - put new board pieces inside an existing region, or add a new `RG()` region;
   - give per-card pieces `data-uid`;
   - **never put a changing value (time, random number, counter) in HTML that doesn't need
     it**, or that region redraws every time;
   - an animation started on an element survives redraws only if the element's HTML didn't change.
3. **Clicks** go through one handler per area: `#board` uses `data-act="…"`
   (`js/ui.js`, "board clicks"), Settings uses `data-set="…"` and the game menu `data-m="…"` (both in `js/panels.js`).
   **Add a new branch; don't add a second handler or a second branch for an existing act.**
   (A duplicate branch once stopped played cards from being counted.)
4. **Saved settings:** `PREFS.get(key, fallback)` / `PREFS.set(key, value)` (`js/help.js`; wrapped,
   so private browsing can't crash it). Load into `U` with a default in the `U` object; add the
   button to `showSettings()` with `aria-pressed` for on/off.
5. **Heavy effects off** (`html.light-fx`, `applyHeavyFx()`): any **looping** animation must be
   added to the `html.light-fx … { animation: none }` list in `css/style.css`. One-time effects
   are fine. Canvas loops check the class (see `storm.start()` in `js/storm.js`).
6. **Dozing** (`html.doze` after 20 s idle, `wake()`): looping CSS animations pause by
   themselves; a JavaScript loop (`requestAnimationFrame`) must stop on doze and restart on
   `wake()`.
7. **Phones:** the stage is a fixed 1440x1000 board scaled to the window. Tap targets of at least
   44 px on screen, readable text at phone size, nothing hidden behind iPhone notches
   (`env(safe-area-inset-*)`). Phones start with Heavy effects off.
8. **Reduced motion:** respect `prefers-reduced-motion` for anything big that moves.
9. **Moves go through the front door.** Anything a player does is `move(name, …)` (`MOVES` in
   `js/engine.js`), never a direct call to `playCard()` and friends, and nothing outside a move
   changes `S`. Otherwise recorded matches stop replaying (see "Moves" in `docs/code-map.md`).
10. **Match saving:** a match in progress survives live updates of the claude.ai page (`js/boot.js`
   restores `S` over `baseState()`). New fields in `S` need a default in `baseState()`.

## Which focused test covers what

`node tools/test-all.js` runs all of these; run one alone while working on its area:

| Area | Test |
|---|---|
| Tribes, classes, fractures and the cards that use them | `node tools/kinds-test.js .` |
| Random events (`data/events.csv`, "Random events" in `js/engine.js`) | `node tools/events-test.js .` |
| The Protected rule, Pierce and Protected skills | `node tools/protected-test.js .` |
| The big shard fall, champion shard bonuses | `node tools/shard-test.js .` |
| Champion abilities and champion cards | `node tools/champions-test.js .` |
| Recorded matches; which move first plays differently | `node tools/replay-test.js .` (`--update` when play is meant to change) |
| Whole games, crashes, stuck states | `node tools/selftest.js . ai 2` and `. rand 300` (`"problems": {}`) |

The selftest fingerprints (in `EXPECTED` at the top of `tools/test-all.js`, and the `ai 2` one in
CLAUDE.md) only change when a change is meant to alter play; update both, re-record the matches
(`node tools/replay-test.js . --update`), and say so.

## Before calling it done

- `node tools/test-all.js` → `EVERYTHING PASSED` (fingerprints change only if play changed).
- `browser-check` skill: desktop and phone, look at the screenshots; for anything heavy, run
  `node tools/speed-check.js` before and after.
- Update `docs/code-map.md`, and the README if players or the file table are affected.
- Commit and push (`pr-cycle`); the `backup` skill runs once the pull request merges.
