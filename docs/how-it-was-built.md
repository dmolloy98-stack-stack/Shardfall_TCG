# How Shardfall was built, and why

For anyone who joins the project later: a programmer, a future Claude, or the owner looking back.
The code map (`docs/code-map.md`) shows **where** things are. This guide explains **why** they are
built that way, which choices belong to the owner, and the traps already fallen into, so nobody
has to rediscover them the hard way.

## Keeping this guide current (read this first)

**When:** check it with **every change**, as part of the routine before each pull request
(`pr-cycle` skill). Most changes add nothing here. Add or change an entry when a change:

1. **Picks a way of doing something** that future work must follow (a new pattern, a new kind of
   file, a new tool everyone should use). Example: "every move goes through `move()`".
2. **Makes a trade-off**: choosing one approach over another for a reason that isn't obvious from
   the code. Example: "the offline helper asks the network first, so updates show at once".
3. **Fixes a bug that could easily happen again**, or reveals a trap. Example: "a rule must not
   change the game and then say refused". Add it to "Traps" below.
4. **Undoes or replaces** something written here. Then edit or remove the old entry. This guide
   must never describe something the game no longer does.
5. Records an **owner decision** that shapes the code (not every design choice; those live in
   `docs/todo.md` and `docs/world.md`). Add one line under "The owner's decisions that shape the
   code" with the date.

**What does not belong here:** what changed for players (that's `data/whats_new.csv`), where a
function lives (`docs/code-map.md`), step-by-step recipes (`.claude/skills/`), story and clues
(`docs/world.md`), plans and ideas (`docs/todo.md`; finished work `docs/done.md`), or a list of every change (git history and
the Drive change history).

**How to write an entry:** a short bold name, then two to five plain sentences: what we do, why,
and what goes wrong if someone doesn't. Name the file, but keep function names few. Put the date
of the change in brackets at the end when it helps. Keep entries in the section where they fit;
don't add a new section for one entry.

**Then:** update the "Last checked" line at the bottom to today's date and the pull request
number, even when nothing else changed, so it is clear the guide was looked at.

---

## The foundations

**Plain web files, no build step, no libraries.** The game is HTML, CSS and JavaScript files that
run as they are. The owner isn't a professional programmer and edits data on GitHub; GitHub Pages
serves the files directly; and `tools/build-single.js` packs everything into one file for the
claude.ai copy and the Drive backups. A build step or a library would break at least one of these.
A new library needs a very good reason and the owner's agreement.

**Cards are data.** Every card, deck, skill, fracture, event and balance number lives in the CSV
files in `data/`, which mirror the owner's card sheet. What a card does is the Effect column,
written in a small ability language (`js/effects.js`). This way the owner designs cards without
code, and most new cards need no programming. Code is only for a genuinely new kind of ability.
When a one-off ability turns out to be a pattern, it becomes a general ability word (Nov 2026:
`pick`, `take`, `discardDraw`, `drainLife`; 22 Nov: `levelDown`, `statline`, `*`, `has:`, tokens
for `summon`). Only two cards still need one-off code: Simple Messenger and Digital Drainage.
Every such move is checked by playing each changed card on the same table in the old and new
versions and comparing the result exactly (`tools/card-equivalence.js`, `ability-words` skill); the big automatic games alone miss cards that no
starter deck holds.

**Words players read live in a table too.** `data/ui_text.csv` holds them, and the code asks with
`T("id")`, so the owner can reword anything without code, and other languages become possible
later. Screens are moved over one at a time; a moved screen is checked with the picture comparison
(the words must look exactly the same) and `tools/words-test.js`. (Nov 2026)

**Data mistakes are named, never hidden.** A mistake in `data/*.csv` that stops the game shows a
message naming the file and the row; one the game can live with (a deck breaking the deck rules)
shows as a note on the menu. `tools/data-test.js` fails GitHub's tests with the same sentence. A
new check of the data should add to `warnings` (in `buildData`) or throw a message starting
`data/<file>.csv, …`, so both reach the screen. (Nov 2026)

**The game files are the master copy.** If the card sheet and the game disagree, the game wins and
the sheet is fixed to match (`tools/sheet-check.js` lists the differences).

**The rules never draw anything.** `js/engine.js` and the other rules files hold the whole game in
one object, `S`, and never touch the screen. They tell the screen what happened through events
(`emit`), which the screen files listen to. Because of this, the computer can try moves on a copy
of the game, the tests run the rules without a browser, and the screen can be redesigned without
risking the rules.

**The whole game is one plain object.** `S` holds only numbers, words, lists and player indexes:
no functions and no screen parts. That makes it safe to copy (`structuredClone`), which Undo, the
computer's look-ahead and keeping a match alive across live page updates all depend on. A new
field in `S` needs a starting value in `baseState()`, so a match saved by an older version still
works.

## Randomness, moves and replays

**One seed per match.** All of a match's luck (shuffles, events) comes from its seed, through the
game's own random numbers (`rand()`), never `Math.random()`. The same seed and the same moves
always give the same match.

**Every move goes through one front door.** Anything a player does is `move(name, …)` in
`js/engine.js`, which writes it down in `S.moves`. With `S.setup` (the seed and both deck lists),
the notes replay a match exactly. Play a Friend will send these notes between browsers; recorded
test matches and bug reports already use them. Calling `playCard()` and friends directly from the
screen or the computer would make matches impossible to replay. (Nov 2026)

**Nothing outside a move may change the game.** The campaign's "champion starts in hand" used to
be done by the screen after the match began; it moved into the rules (`campaignChampion`) so
campaign matches replay too. The tutorial rigs its hands, so lessons are marked as not replayable.

**The computer has its own dice.** Its occasional surprise choice used to draw from the match's
random numbers, so its private thinking changed the match's luck and replays drifted. It now
uses `aiRand()`. (Nov 2026; this changed the play fingerprint once.)

**The computer's look-ahead must not learn secrets.** It tries moves on a copy of the game. The
counter window never opens on a copy, because that would let the computer learn whether you hold
a counter spell.

## How the rules are organised

**The rules are split by job, and tools load them from one list.** `js/engine.js` is the core;
combat, turns and playing cards have their own files (Nov 2026). Tests and tools load the rules
through `tools/rules-code.js`, which reads `GAME_SCRIPTS`, so a split or a new rules file never
means editing a dozen tools. A split like this is proven by identical fingerprints, every card
playing the same (`tools/card-equivalence.js --all`) and no picture changes.

**Champions, events and the big shard are add-ons.** Each champion is one entry in
`CHAMPION_RULES` (`js/rules-champions.js`) saying what it does at each moment (turn start, battle,
damage, the shard). The core rules never name a champion; they ask `champHook()`. Events and the
big shard have their own files too. A new champion or event is new entries, not edits all over the
core. (Nov 2026)

**Every "choose a card" window is one entry in a table.** What each kind of window does is its entry
in `CHOICES` (`js/rules-play.js`), and how the computer answers it is in `AI_CHOICES` (`js/ai.js`).
Before, the same list of kinds was repeated as if-chains in four files, so a new pick-one card could
easily miss one and leave the computer or the window doing the wrong thing. `tools/cards-test.js`
fails if a window opened anywhere in the code has no entry. (24 Nov 2026)

**One click handler per area, everywhere.** The Almanac's filter rows and the pop-up window
(`#modal`) each had two handlers; they were merged so that every area has exactly one (24 Nov 2026,
found by the `architect-review` agent). The window still had four after that (the deck builder,
the campaign and the "choose a card" window had each added their own), so the rule is now: the one
handler is in `js/panels.js`, and a window from another file gets a branch there that calls a named
function in its own file (`newDeckFrom()`, `builderChoice()`, `campaignClick()`). Calls happen at
click time, so the load order doesn't matter. `tools/screen-test.js` clicks through the choose
window to prove it works (25 Nov 2026).

**Special card rules are switched on by words, not names.** A card that bends the core rules has a
`rule:` clause, and the engine checks for that word, never for a card's name. Renaming a card then
can't break its rule. The same goes for champions: the campaign, the champions' lines
(`CHAMPIONS`), the computer's champion and the tutorial's hands all name cards by CardID, and show
the card's own name, so renaming a champion card changes it everywhere at once (25 Nov 2026).

**A skill counts wherever it comes from.** Every skill checked during play asks `skillNow()`
(`js/engine.js`): printed on the card, or given by equipment or an aura. Before, only Swift and Parry
looked at given skills, so a future card giving Pierce or Cloak would have done nothing (25 Nov 2026).

**One list of where a character's stats come from.** `statSources()` (`js/engine.js`) lists the parts
(the card, equipment, lord, Rally, aura, champion); the rules add them up and the wind-up on screen
names them. A new kind of bonus is added there once. A champion's own short-lived bonus (The Bow's
+2) lives in its entry in `js/rules-champions.js`, with a `turnEnd` moment to clear it, not in the
core turn code (25 Nov 2026).

**Numbers a designer tunes live in data files, and the sheet shows them.** Trophy goals and words
(`data/trophies.csv`), mastery titles (`data/mastery.csv`) and points (`mastery_*` rows), and how the
computer plays each world (`data/ai_styles.csv`) moved out of the code. Each has a read-only "mirror"
tab in the card sheet that `tools/sheet-check.js` compares with the file. What a trophy checks, and
the campaign's story text and the champions' lines, stay in code: story text has its own routine
(`story-writing`) and changes with the story bible (owner left this to Claude, 24 Nov 2026).

**The data tables are read by column name.** `csvTable()` (`js/data.js`) names each value by its
header, so a column can be moved or added in the card sheet without the game reading the wrong one;
a missing column stops the game with a message naming it. Rule numbers a designer might tune (Evolve,
Level Up's limit, Rally, the mana token) are rows in `data/game_rules.csv` (25 Nov 2026).

## The screen

**Fast redraws.** `render()` describes the whole table, split into regions; regions whose HTML
didn't change are skipped, and unchanged pieces are kept. So a value that changes all the time (a
timer, a random number) must never go into the HTML, or that region redraws on every frame and
phones heat up.

**Phones decide many choices.** The table is a fixed 1440x1000 board scaled to the screen, so the
layout is the same everywhere. Tap targets are at least 44 pixels on screen. Looping effects are
listed under "Heavy effects", which start off on touch screens, and everything rests ("dozes")
after 20 seconds with nothing happening. These keep phones cool and the battery alive.

**The screen code is split by job.** `js/ui.js` is the core (state, redraws, actions, screens),
`js/board.js` draws the table, `js/input.js` handles taps, drags and keys. A split like this is
proven safe by the picture comparison (no picture changes), the screen tests and the speed budget,
all run against the version before the split. (Nov 2026)

**One click handler per area.** Each area of the screen has one handler that reads a `data-…`
attribute and picks a branch. A second handler, or a second branch for the same action, causes
double actions.

## Saving and loading

**Everything saved is listed in one place.** `SAVE_KEYS` in `js/saves.js` lists every item kept in
the browser. The save code carries exactly those, and a test fails if code saves something not on
the list. When the form of something saved changes, `SAVE_VERSION` goes up and an upgrade step is
added, so nobody's progress breaks. (Nov 2026)

**The offline helper asks the network first.** `sw.js` keeps a copy of every game file but always
tries the network first, falling back to the copy after 2 seconds or with no internet. Updates
therefore show at once, and an old cached copy can never be mixed with new files (that caused the
"frozen menu" bug in October 2026, see Traps). Its file list is read from `js/data.js`, so it
never needs editing for a new file.

## Testing and safety nets

**Several nets, each catching a different kind of mistake:**
- `tools/test-all.js` runs every rules test; GitHub runs it on each push and pull request.
- The play fingerprints (computer games and random-move games) prove a change didn't alter play
  when it wasn't meant to. They change only on purpose, and then CLAUDE.md, `tools/test-all.js`
  and the recorded matches are updated together.
- Recorded matches (`tools/replay-test.js`) say which move first plays differently.
- `tools/cards-test.js` plays every card at least once.
- The browser check looks at the real screen at desktop and phone size, and the screen tests
  (`tools/screen-test.js`) click and drag through the game on every pull request. They click
  table pieces even while they gently move, as a player would.
- The balance check warns on a pull request if a starter deck leaves 40–60% wins.

**The Drive backups are proven, not assumed.** `tools/restore.js` rebuilds the game from a
monthly snapshot plus the patches after it and runs every test (tried 22 Nov 2026: identical to
update 29). Images aren't in the backups, because the Drive connector can't carry them.

**Picture comparison photographs both versions on the same machine.** Two computers draw fonts
slightly differently, so stored pictures would raise false alarms. Instead, each pull request
photographs `main` and itself side by side (`tools/picture-test.js`), with animations off and fixed
seeds. A change is a warning, not a failure, because many look changes are on purpose. (Nov 2026)

**Speed is measured the same way, side by side.** `tools/speed-budget.js` measures `main` and the
pull request in turns on the same machine and compares the middle results, because one machine's
speed varies too much from run to run to compare with a stored number. Over budget is a warning:
a feature may be worth some speed, and a person decides. (Nov 2026)

**Accessibility is checked with axe on every pull request** (`tools/a11y-check.js`), plus a
keyboard walk through the menu. The screens live inside one `<main>` area, scrolling boxes can be
scrolled by keyboard, and icons that speak have a role. Text contrast on gradients can't be
checked automatically and is judged by eye. (Nov 2026)

**A test is never switched off to get a green mark.** A red test means something changed; find out
what.

## Working together

**One page to start from.** `docs/status.md` is written by `tools/make-status.js` from the
project's own files (it can't drift), and `.claude/hooks/session-start.sh` prints a short summary
when a session starts: branch, what's being built, what waits on the owner, quick checks. Long
history lives in `docs/done.md`, so `docs/todo.md` stays short to read. (Nov 2026)


**The owner decides what the game is; Claude decides how it's built.** Story, cards, characters,
look and feel are the owner's: Claude offers two or three options and waits. How to build, split,
test and name things in code are Claude's, and Claude says what was decided. See CLAUDE.md.

**A code health review before structural pull requests.** The `architect-review` agent
(`.claude/agents/architect-review.md`) reads a change and reports whether the layers stay apart,
the patterns are kept, files are growing too big or tangled, and the docs are still true. It only
reports and never edits. The owner picked it from buildwithclaude.com for the game's long-term
health, and it was rebuilt around Shardfall's rules because the original was generic (24 Nov 2026).

**Look choices are shown, not described.** The owner decides the look but wants options and
inspiration, so the `look-advisor` agent builds two or three versions on the real game screen with
`tools/look-mockup.js`, which injects each version into a test browser and photographs it; the game
files are not touched until the owner picks. The owner's vision and decisions are kept in the look
book, `docs/look.md`, so new options stay consistent (24 Nov 2026).

**Every change goes through a pull request,** merged once GitHub's tests pass, then backed up to
Drive (`pr-cycle` and `backup` skills). The work branch is restarted from `main` after each merge.

## The owner's decisions that shape the code

- Card vocabulary: **Fracture** (where a card is from), **Tribes** (what it is), **Classes** (what
  it does). In code the fracture is still `group` and the file is `factions.csv` (Nov 2026).
- Art and sound are out of Claude's scope; the code leaves slots for them (Nov 2026).
- The current phone layout is good enough; the phone-only table is kept as a reference only.
- Play a Friend will use Firebase; the counter window will always pause briefly online when the
  other player has spare mana, so the pause gives nothing away (21 Nov 2026).
- Claude merges a pull request once GitHub's tests pass (Nov 2026).

## Traps already fallen into

- **A duplicate click branch** stopped played cards from being counted. One branch per action.
- **Stale cached files froze the menu** after an update (pull request #9). The stylesheet and
  loader are fetched fresh, and the offline helper asks the network first.
- **A rule that changes the game and then reports "refused"** breaks replays: drawing from an empty
  deck ended the match but said refused (fixed Nov 2026). If a rule changes anything, it must
  report success.
- **The computer used the match's random numbers** for its own choices (fixed Nov 2026).
- **A card-sheet cell starting with `+`, `-` or `=`** is read as a sum by Google Sheets and shows
  `#ERROR!`. Write it with a leading `'`.
- **Words on the screen that repeat a card's numbers** ("Strike 3", "you gain 2 HP") go stale when
  the card changes. Screen words that depend on a card take the number from its play clause
  (`playAmount()` in `js/effects.js`) and their wording from `data/ui_text.csv` (Nov 2026).
- **The rules choosing the words and colours on screen.** Floating words ("EVOLVE!") were written in
  the rules with their colours, so they couldn't be reworded and the screen matched skills by their
  words. The rules now send which one (`emit("text", { uid, say: "evolve" })`); the words are
  `float_<say>` rows in `data/ui_text.csv` and the colours are `FLOATS` in `js/table-effects.js`.
- **A misspelt word in an Effect matched nothing**, silently ("allies.Monky"). Each narrowing word
  is now checked when the cards are read, and a mistake stops the game naming the card.
- **Code that listens for the words shown on screen** breaks when they are reworded: the Grave Robber
  trophy counted the floating word "REANIMATE". Listen for a game event instead (`reanimate`).
- **Renaming a world or tribe** leaves old names in many places (pull request #27 found
  leftovers). Use the `worlds-and-tribes` skill's full list.
- **A green GitHub check can hide a crash** when a step sends its output through `tee`: only the
  last command counts. Such steps use `shell: bash`, which fails on any part of the pipe. And a
  second `npm install --no-save` removes what an earlier one added, so the test tools are
  installed in one command (found on pull request #30, before merging).
- **Looping animations** must be added to the Heavy effects list in `css/style.css`, or phones run
  hot.
- **An old saved match** can lack a newer field and crash (fixed Nov 2026). Every field in `S`
  needs a default in `baseState()`.

---

Last checked: 2026-11-25, pull request #38.
