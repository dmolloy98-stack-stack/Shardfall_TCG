# Shardfall at a glance

Written by `node tools/make-status.js` from the project's own files: don't edit it by hand.
Read this first in a new session; then CLAUDE.md, and the files it points to as the task needs.

## Version
Update 31: **Update 31** (2026-11-23): If the card tables have a mistake, the game now says what it is and where, instead of failing to load or blaming old files.

**Update 30** (2026-11-22): The menu shows which update you have; tap it to see what changed. Keyboard players can scroll the What's new list and the battle log, and screen readers announce the computer thinking.

**Update 29** (2026-11-20): Save code in Settings: copy your progress and load it on another device. If the game hits a problem, a window offers a bug report to copy and send. Plays offline after one visit, and can be added to a phone's home screen. The computer's surprise moves no longer change a match's luck.

## Waiting on the owner
- **Real phone testing** (round two, step 9). The owner applies for BrowserStack's free open-source account (steps in `docs/real-phones.md`), then does the 15-minute phone checklist there before big releases. Once the account exists, Claude can add automatic runs.
- **Anonymous play numbers** (round two, step 11). Three decisions in `docs/play-numbers.md`: ask players first or count by default, which numbers to count, and who sees them; plus the draft privacy note to reword. Also needs the Firebase project (the same one as Play a Friend). Nothing is collected until then.

## Being built now
Nothing: no round is open in docs/todo.md.

## The game in numbers
- **Cards:** 113 (Spell 34, Area 7, Character 57, Equipment 15).
- **By fracture:** N/A 12, Simple 21, Wild 21, Undead 20, Mortal 20, Cyber 21.
- **Champions:** The Simplistic, The Man Ape, Soul Shepard, IP Man, Boss Level.
- **Starter decks:** Simple Starter (Simple), Monkey Starter (Wild), Zombie Starter (Undead), Fighter Starter (Mortal), Digital Starter (Cyber).
- **Ability words:** 85 cards have an Effect; only 2 use one-off code (messenger, digitalDrainage).
- **Rules:** a match starts with 25 health and 6 cards; the big shard falls in round 8.

## Balance
<!-- winrates -->
Measured 2026-11-23 with `node tools/winrates.js 20` (20 games per pairing):

```
monkey_starter        56.9%  (91/160)
digital_starter       53.8%  (86/160)
fighter_starter       50.6%  (81/160)
zombie_starter        45.6%  (73/160)
simple_starter        43.1%  (69/160)
First player wins: 54.0%
Average game: 13.9 turns (both players' turns counted)
```
<!-- /winrates -->

## Safety nets
- `node tools/test-all.js` must end EVERYTHING PASSED. It runs: data, kinds, events, protected, shard, champions, replay, cards, saves, words, every Effect explained, and the automatic games.
- Play fingerprints: computer games (ai 2) **1727378807**, random games (rand 300) **1933343540**. They change only when play is meant to change (`node tools/update-expected.js --write`).
- On every pull request GitHub also runs the balance check, screen tests, picture comparison, speed budget and accessibility check (`ci-check` skill to read them).

## Code
- 29 game scripts, loaded in this order: saves.js, engine.js, rules-combat.js, rules-turns.js, rules-play.js, rules-champions.js, rules-events.js, rules-shard.js, effects.js, ai.js, tutorial.js, help.js, guide.js, decks.js, fx.js, motion.js, intro.js, cards.js, ui.js, board.js, board-marks.js, input.js, table-effects.js, panels.js, menu.js, storm.js, champions.js, campaign.js, boot.js.
- 36 tools in `tools/` (the README's file table lists them).
- Map: `docs/code-map.md` (where things are); why: `docs/how-it-was-built.md`.

## Skills (`.claude/skills/`)
- **ability-words**: Turning a one-off card ability (a "script" in js/effects.js) into general words of the card ability language, or adding a new ability word, without changing how any card plays: the design rules, the side-by-side "same play" check, and updating data/README.md and the card sheet.
- **add-feature**: The building rules for adding or changing anything in Shardfall's code: a new screen, panel, setting, effect, animation or rule.
- **backup**: Shardfall's Google Drive backup, done once per merged pull request: one change-history doc entry, one patch file in a new Versions folder, a full snapshot once a month, and the rebuilt claude.ai playable page.
- **balance**: Measuring how fair Shardfall is: deck win rates, first-player advantage and game length from many computer-vs-computer games, before and after a rule, card or deck change.
- **browser-check**: Opening Shardfall in a real (Playwright) browser at desktop and phone size to check a change on screen: page errors, screenshots, driving a match, measuring animations or speed.
- **bug-report**: What to do with a Shardfall bug report (the text from the game's "Something went wrong" window, or a description from the owner): replay the match, find the cause, fix it, and add a test so it can't come back.
- **card-change**: Changing or adding a Shardfall card, skill, deck or game rule that the owner has decided on (cost, stats, ability text, effect, tribe/class/fracture, deck list, numbers in game_rules.csv).
- **ci-check**: Reading GitHub's results for a Shardfall pull request properly: not just the green or red mark, but the logs of every check (rules tests, balance, screen tests, accessibility, picture comparison, speed budget, status page), what each warning means, and when it is safe to merge.
- **code-map**: Keeping Shardfall's code maps current: docs/code-map.md (the written map) and the "Shardfall File Map" and "Shardfall Turn Flow" pages on claude.ai.
- **ideas-menu**: Answering Shardfall "what's next / what can be improved / look at other games for ideas" questions: the format the owner likes, the games to draw from, and the list of ideas already turned down or on hold so they aren't offered again.
- **move-words**: Moving one Shardfall screen's words (buttons, titles, messages, hints) out of the code into the editable word table data/ui_text.csv, with T("id"), so the owner can reword them; proven by the picture comparison showing no change.
- **pr-cycle**: Shardfall's GitHub routine: push every commit to the work branch, decide when a group of changes is ready for a pull request, open it, merge it once GitHub's tests pass, then restart the branch and back up.
- **sheet-sync**: Bringing cards, decks, fractures and skills from the owner's Google Sheet "Shardfall – card and deck builder" into the game's data files, and writing game changes back to the sheet.
- **story-writing**: Writing Shardfall's story text: champion lines and reactions, campaign scenes, card stories (flavor text), the intro, and hidden clues about the Shardfall.
- **tool-check**: Judging whether an outside website, library, GitHub project, AI agent or skill the owner found would help Shardfall (for example animation libraries, code-mapping tools, art generators).
- **worlds-and-tribes**: Renaming or adding a Shardfall fracture (world), tribe, class or champion: every place a name lives (data, rules, computer play style, card entrances and deaths, board colours, symbols, menus, campaign, tests, guide, docs, story bible, card sheet) and the owner's design rules for them.

General game-making skills, not Shardfall's own: audio-design, card-game, create-game-assets, game-ai, game-feel, game-ui-ux, performance-optimization.

## Documents (`docs/`)
- `docs/code-map.md`
- `docs/done.md`
- `docs/how-it-was-built.md`
- `docs/online-play.md`
- `docs/play-numbers.md`
- `docs/real-phones.md`
- `docs/status.md`
- `docs/todo.md`
- `docs/world.md`
