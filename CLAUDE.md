# Notes for Claude

**Start here:** `docs/status.md` ("Shardfall at a glance", written by `tools/make-status.js`) has the
current version, what is being built, what waits on the owner, the numbers and every skill. A short
summary also prints at the start of each session (`.claude/hooks/session-start.sh`).

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

- **GitHub (owner's rules, Nov 2026):** push every commit to the work branch right away. Claude
  decides when a finished change or group of changes is ready for a pull request, opens it, and
  merges it as soon as GitHub's tests pass, then restarts the branch from the latest `main`. Never
  merge a red pull request. Steps: `pr-cycle` skill. The Stop hook's "please push" messages are
  automated; answer in one short line.
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

- `node tools/test-all.js` must end with `EVERYTHING PASSED` (GitHub runs it too). The play
  fingerprint (currently 1727378807 for `ai 2`, in `EXPECTED` in `tools/test-all.js`) changes only
  when play is meant to change; then run `node tools/update-expected.js --write` (it updates both
  fingerprints, this line and the recorded matches together) and say so. Which focused test covers
  what: `add-feature` skill.
- For anything on screen: `node tools/browser-check.js` at desktop and phone size, and look at a
  screenshot (`browser-check` skill).
- New script files go in `GAME_SCRIPTS` in `js/data.js` (order matters, `js/boot.js` last) and
  the README file table.

## Code map

`docs/code-map.md` shows how the files fit together. Update it when files are added, split or
renamed, or when the flow between them changes.

## How it was built (the "why" guide)

`docs/how-it-was-built.md` explains why the code is built the way it is, the owner's decisions
that shape it, and the traps already fallen into. **Check it with every change** before a pull
request: most changes add nothing, but a new pattern, a trade-off, a bug that could recur, or
something that replaces an entry must be written down. The top of the guide says exactly what
belongs there. Always update its "Last checked" line.

## Back up to Google Drive

Everything on GitHub is also kept in Drive with a full history: **once per merged pull request**,
a change-history entry, one patch file, a monthly full snapshot, and the republished claude.ai
page. Steps and ids: `backup` skill. Tell the owner when a step could not be done and why.

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
- `backup` (Drive backup after each merged pull request), `pr-cycle` (push, PR, merge)
- `browser-check` (desktop and phone checks, iPhone checks, `tools/speed-check.js`)
- `add-feature` (the building rules for any code change), `card-change` (a card or rule the
  owner decided), `sheet-sync` (the card sheet), `balance` (win rates, `tools/winrates.js`)
- `ability-words` (turning one-off card code into ability words, with the same-play check)
- `story-writing` (champion voices, card stories, clues), `ideas-menu` ("what's next?"),
  `code-map` (the written map and the claude.ai map pages), `worlds-and-tribes`
  (renaming or adding a world, tribe or champion), `tool-check` ("is this useful?")

## Links

- Play (GitHub Pages): https://dmolloy98-stack-stack.github.io/Shardfall_TCG/ (`#menu` skips the
  intro, `#tutorial` starts the tutorial; the guide is `guide.html`)
- Playable claude.ai copy: https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1
- Map pages (made with archify): Shardfall File Map https://claude.ai/artifact/DZGvMWEJF37CU9NkFJxXZ9
  and Shardfall Turn Flow https://claude.ai/artifact/RGLT4sVnTcqMgN4xTojwrL
- Card sheet: https://docs.google.com/spreadsheets/d/1RzePfEgUN4QJsLTDGnhU7xaTa0_snq2lVswEUy5JNX0
