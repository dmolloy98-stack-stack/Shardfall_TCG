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

## Standing rules from the owner

- **Push to GitHub only after a bigger change is finished, or when the owner asks.** A bigger
  change is a new feature, a new look, a rules or balance change, or a group of related
  changes. Small changes are committed locally, kept backed up in Google Drive, and wait for the
  next push. When in doubt, ask. **Do not create a pull request until the owner asks for one.**
  After a pull request is merged, restart the branch from the latest `main`.
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

- Run `node tools/selftest.js . ai 2` and `node tools/selftest.js . rand 300`. Expect
  `"problems": {}`. The fingerprint (currently -514826555 for `ai 2`) must stay the same unless the
  change is meant to alter how the game plays; when it does change on purpose, say so.
- Run `node tools/kinds-test.js .` after touching tribes, classes, fractures or the cards that use them; expect `ALL PASSED`.
- Run `node tools/events-test.js .` after touching the random events (`data/events.csv`, "Random events" in `js/engine.js`); expect `ALL PASSED`.
- Run `node tools/protected-test.js .` after touching the Protected rule or the Pierce and Protected skills; expect `ALL PASSED`.
- Run `node tools/shard-test.js .` after touching the big shard fall ("The big shard fall" in `js/engine.js`, the `shard_` rows in `data/game_rules.csv`) or a champion's shard bonus; expect `ALL PASSED`.
- Run `node tools/champions-test.js .` after touching the champion abilities (`data/champion_abilities.csv`, "Champion abilities" in `js/engine.js`) or the champion cards; expect `ALL PASSED`.
- For anything on screen, load the game in a browser (Playwright) at desktop and phone sizes
  and check for errors. Look at a screenshot before reporting a visual change.
- Script load order matters: `js/boot.js` loads last, and the list is `GAME_SCRIPTS` in
  `js/data.js`. Add a new script file there and in the README file table.

## Code map

`docs/code-map.md` shows how the files fit together. Update it when files are added, split or
renamed, or when the flow between them changes.

## Back up every change to Google Drive

The owner wants everything on GitHub also kept in Google Drive, with a full history,
as a backup. Every time a change is pushed to this repository (or committed, if GitHub
can't be reached), in the same session:

1. **Change history.** Add an entry at the top of the Google Doc
   "Shardfall – change history" (Drive folder "Shardfall _ CardGame" → "GitHub mirror"):
   date, PR number and commit ids, what changed in plain words, and the files touched.
   Doc id: `1VgEvb0g2XFoKijpIuHbUGW3qd4rwSltwpoT-HX3rNyc`.
2. **Changed files.** Upload the new version of every text file the change touched to a
   new folder in "GitHub mirror" → "Versions", named `YYYY-MM-DD · <short title>`, keeping
   each file's repository path in its name (for example `js__engine.js`). Older versions
   stay in their earlier folders, so the folders are the file history.
   Folder ids: "GitHub mirror" `1wGnqPjK3m_GWr2FIwBJ8dd1sKn0-tubD`,
   "Versions" `1l1zWvI4KZCiJUaEmxoQcwoSO2TP-TlX6`.
3. **Playable copy.** Rebuild the page with `node tools/build-single.js --page <file>` and
   republish it to the claude.ai page https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1.

Tell the owner when a backup step could not be done and why. Binary files (images) and
the git history file can't be uploaded through the Drive connector; say so rather than
skipping them silently.

## Card and deck builder sheet

The owner designs cards and decks in the Google Sheet "Shardfall – card and deck builder"
(id `1RzePfEgUN4QJsLTDGnhU7xaTa0_snq2lVswEUy5JNX0`, in the "Shardfall _ CardGame" folder).
Its tabs mirror the data files: Cards → `data/cards.csv` (Attack and Health become
`Attack+Health` in Stats; ArtKey is the CardID; the sheet's Tribes, Classes and Fracture
columns hold names separated by ", " and become `+`-joined lists, `---` when empty for a
non-character; a card from no fracture is `N/A`, shown as Unbound), Decks plus Deck cards → `data/decks.csv`
(one row per card becomes the `CardID:copies|…` CardList; skip rows with 0 copies, which mark a card taken out of a deck), Fractures → `data/factions.csv`
(the tab was called Factions; Color is hex; convert to 0–1 RGB), Skills → `data/skills.csv`.
The three draft tabs ("DRAFT …") are the owner's review notes and are not game data.

Card vocabulary: a card has a **Fracture** (where it is from; a hybrid has two), and a
character also has **Tribes** (what it is) and **Classes** (what it does), one or two of each.
The owner chose these names, so use them in anything players see. In code the fracture is
still `group`/`groups` and the data file is `factions.csv`. See `docs/world.md`.

When asked to add the sheet's rows to the game:
1. Read only rows whose Status is `Ready`. A Ready row with an existing ID replaces that row.
2. If Effect is empty but Ability describes something, write the Effect (or a `script` in
   `js/effects.js`). Read Notes for Claude. New skills and factions need code.
3. Load the game data and effects to check every card, run balance simulations, and run the
   browser tests, as for any other change.
4. After committing, set those rows' Status to `In game`. If cards change in code later,
   update the sheet to match: the game files are the master copy.
