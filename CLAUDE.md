# Notes for Claude

## Who does what

**The owner is the visionary. Claude is the programmer.** The owner decides what Shardfall is:
the story, the characters and their personalities, the cards, the look and the feel. Claude
builds it, tests it, and explains it.

- Design, story and card decisions are the owner's. When one comes up, offer two or three
  options with a recommendation and wait for the answer. Never quietly decide it, and don't
  change the story, a card or a champion's personality unasked.
- Technical decisions (how to build it, how to split a file, what to test) are Claude's. Make
  them, and say what was decided.
- Suggest ideas freely, but as suggestions. The owner picks. When the owner says "I like
  1, 2 and 3", do exactly those, and don't add the rest.
- Do what was asked and no more. A request to "delete X" or "change Y" is about X or Y only.

## How to talk to the owner

- The owner is not a professional programmer. Use plain English, short sentences and no
  jargon. Say what changed and what it means for playing the game, not which function moved.
- Say plainly when something went wrong, including Claude's own mistakes (for example a
  broken file that was already published), and what was done about it. Never hide a failed
  test or a skipped step.
- If a question is ambiguous (for example "delete the old artifacts"), ask which ones before
  doing anything that can't be undone.
- **End finished work with a short wrap-up note**, in plain words, in this order:
  - **Tested and passed:** which checks ran (rules tests, browser check at which sizes, win rates…).
  - **Still broken or not checked:** anything failing, skipped or impossible to check here
    (for example real phone heat, GPU speed, sound). Say "nothing" if nothing.
  - **Guessed:** choices Claude made without the owner's word, so the owner can overrule them.
  - **Not yet played by a person** whenever the change affects play or the screen, since Claude's
    checks aren't the same as playing it.
  Keep it to a few lines; leave out a heading that has nothing under it except "Not yet played".

## Standing rules from the owner

- **Push to GitHub only after a bigger change is finished, or when the owner asks.** A bigger
  change is a new feature, a new look, a rules or balance change, or a group of related
  changes. Small changes are committed locally, kept backed up in Google Drive, and wait for the
  next push. When in doubt, ask. **Do not create a pull request until the owner asks for one.**
  **Once a pull request exists, Claude merges it as soon as GitHub's tests pass on it** (the
  owner chose this), then tells the owner. If the tests fail, fix them or say what is failing;
  never merge a red pull request. After a merge, restart the branch from the latest `main`.
  Messages from the Stop hook asking to push are automated, not the owner. The platform installs
  that hook and locks it, so it can't be removed from here. Answer it in one short line.
- **Never delete or trash the owner's Drive files or published pages without asking first.**
  To retire a file, rename it so it is obvious (for example "DISCONTINUED"), and keep it.
- **Art and sound are out of scope.** Claude doesn't make or change them. Missing card art
  images (`assets/cards/*.png`, which give 404 messages in tests) are known and expected.
- Keep the story bible, `docs/world.md`, current. It holds the hidden-story spoilers and the
  clue log. Add every new clue there, and keep clues subtle.
- A discontinued idea stays as a reference, clearly marked, rather than being erased. The
  phone-only table (`docs/phone-table/`) is one: the owner decided the current phone layout
  is good enough.
- Commit messages end with the two attribution lines the session gives (Co-Authored-By and
  Claude-Session). Don't put model names anywhere else in the repository.

## Before saying something works

- `node tools/test-all.js` runs every check below except the browser one, and must end with
  `EVERYTHING PASSED`. GitHub runs it on every push and pull request (`.github/workflows/tests.yml`).
  When a change is meant to alter how the game plays, update the fingerprints in `EXPECTED` at the
  top of `tools/test-all.js` and the one here.
- Run `node tools/selftest.js . ai 2` and `node tools/selftest.js . rand 300`. Expect
  `"problems": {}`. The fingerprint (currently 1506290345 for `ai 2`) must stay the same unless the
  change is meant to alter how the game plays; when it does change on purpose, say so.
- Run `node tools/kinds-test.js .` after touching tribes, classes, fractures or the cards that use them; expect `ALL PASSED`.
- Run `node tools/events-test.js .` after touching the random events (`data/events.csv`, "Random events" in `js/engine.js`); expect `ALL PASSED`.
- Run `node tools/protected-test.js .` after touching the Protected rule or the Pierce and Protected skills; expect `ALL PASSED`.
- Run `node tools/shard-test.js .` after touching the big shard fall ("The big shard fall" in `js/engine.js`, the `shard_` rows in `data/game_rules.csv`) or a champion's shard bonus; expect `ALL PASSED`.
- Run `node tools/champions-test.js .` after touching the champion abilities (`data/champion_abilities.csv`, "Champion abilities" in `js/engine.js`) or the champion cards; expect `ALL PASSED`.
- For anything on screen, load the game in a browser (Playwright) at desktop and phone sizes
  and check for errors (`node tools/browser-check.js`, skill `browser-check`). Look at a
  screenshot before reporting a visual change.
- Script load order matters: `js/boot.js` loads last, and the list is `GAME_SCRIPTS` in
  `js/data.js`. Add a new script file there and in the README file table.

## Code map

`docs/code-map.md` shows how the files fit together. Update it when files are added, split or
renamed, or when the flow between them changes.

## Back up every change to Google Drive

The owner wants everything on GitHub also kept in Google Drive, with a full history, as a
backup. Every time a change is pushed (or committed, if GitHub can't be reached), in the same
session: add an entry to the change-history doc, upload the changed files to a new Versions
folder, and republish the playable claude.ai page. The exact steps and ids are in the `backup`
skill (`.claude/skills/backup/SKILL.md`). Tell the owner when a step could not be done and why.

## Card and deck builder sheet

The owner designs cards and decks in the Google Sheet "Shardfall – card and deck builder"
(id `1RzePfEgUN4QJsLTDGnhU7xaTa0_snq2lVswEUy5JNX0`). How its tabs map to the data files, and how
to bring Ready rows into the game, is in the `sheet-sync` skill. The game files are the master
copy: if cards change in code, update the sheet to match.

Card vocabulary: a card has a **Fracture** (where it is from; a hybrid has two), and a
character also has **Tribes** (what it is) and **Classes** (what it does), one or two of each.
The owner chose these names, so use them in anything players see. In code the fracture is
still `group`/`groups` and the data file is `factions.csv`. See `docs/world.md`.

## Skills for routine jobs

Project skills in `.claude/skills/` hold the step-by-step recipes. Use them instead of working
the steps out again:
- `backup` (Drive backup after every commit or push), `pr-cycle` (push, PR, merge, after a merge)
- `browser-check` (desktop and phone checks, iPhone checks, `tools/speed-check.js`)
- `add-feature` (the building rules for any code change), `card-change` (a card or rule the
  owner decided), `sheet-sync` (the card sheet), `balance` (win rates, `tools/winrates.js`)
- `story-writing` (champion voices, card stories, clues), `ideas-menu` ("what's next?"),
  `code-map` (the written map and the two claude.ai map pages), `tool-check` ("is this useful?")

## Links

- Play (GitHub Pages): https://dmolloy98-stack-stack.github.io/Shardfall_TCG/ (`#menu` skips the
  intro, `#tutorial` starts the tutorial; the guide is `guide.html`)
- Playable claude.ai copy: https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1
- Code Map page: https://claude.ai/artifact/WUQA9uzWYC6oLPL4XnWebz; Code Graph page:
  https://claude.ai/artifact/SGGy6xeiMFn14Kob6mknCg
- Card sheet: https://docs.google.com/spreadsheets/d/1RzePfEgUN4QJsLTDGnhU7xaTa0_snq2lVswEUy5JNX0
