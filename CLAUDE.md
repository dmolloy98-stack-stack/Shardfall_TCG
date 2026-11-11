# Notes for Claude

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
`Attack+Health` in Stats; ArtKey is the CardID), Decks plus Deck cards → `data/decks.csv`
(one row per card becomes the `CardID:copies|…` CardList; skip rows with 0 copies, which mark a card taken out of a deck), Factions → `data/factions.csv`
(Color is hex; convert to 0–1 RGB), Skills → `data/skills.csv`.

When asked to add the sheet's rows to the game:
1. Read only rows whose Status is `Ready`. A Ready row with an existing ID replaces that row.
2. If Effect is empty but Ability describes something, write the Effect (or a `script` in
   `js/effects.js`). Read Notes for Claude. New skills and factions need code.
3. Load the game data and effects to check every card, run balance simulations, and run the
   browser tests, as for any other change.
4. After committing, set those rows' Status to `In game`. If cards change in code later,
   update the sheet to match: the game files are the master copy.
