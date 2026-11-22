---
name: sheet-sync
description: >
  Bringing cards, decks, fractures and skills from the owner's Google Sheet "Shardfall – card and
  deck builder" into the game's data files, and writing game changes back to the sheet. Use when
  the owner says cards are Ready in the sheet, asks to add/update cards or decks from the sheet,
  or when cards change in code and the sheet must match.
---

# Card and deck builder sheet

The owner designs cards and decks in the Google Sheet "Shardfall – card and deck builder"
(id `1RzePfEgUN4QJsLTDGnhU7xaTa0_snq2lVswEUy5JNX0`, in the "Shardfall _ CardGame" folder).
The game files are the master copy: if cards change in code, update the sheet to match.

## Tab → file mapping

- **Cards → `data/cards.csv`.** A card's sheet row number is its line number in cards.csv.
  - Attack and Health become `Attack+Health` in Stats; ArtKey is the CardID. **Characters and
    Equipment both have Attack and Health** (equipment adds them to its holder; 0 means none);
    Spells and Areas leave them empty and get `---`.
  - Tribes, Classes and Fracture hold names separated by ", " and become `+`-joined lists,
    `---` when empty for a non-character. A card from no fracture is `N/A` (shown as Unbound).
  - Column O, Flavor text = the Description column (the card's story; see docs/world.md).
- **Decks plus Deck cards → `data/decks.csv`.** One row per card becomes the
  `CardID:copies|…` CardList. Skip rows with 0 copies (a card taken out of a deck).
- **Fractures → `data/factions.csv`** (the tab was called Factions). Color is hex; convert to
  0–1 RGB.
- **Skills → `data/skills.csv`.**
- The three "DRAFT …" tabs are the owner's review notes, not game data.

- **Lists** holds the dropdown choices and deck rules (cells H2–H5, read by the Decks check),
  plus reference lists of the tribes and classes in use. Keep those two lists current when a
  card adds a new tribe or class.
- **Start here** and **Effects guide** explain the sheet; update them when the rules for writing
  cards or the effect words change (`js/effects.js`: `WHEN`, `ACTIONS`, the narrowing words).

## Checking the whole sheet ("is it up to date?")

Do it with the tool, not by eye:
1. Download the whole sheet: `mcp__Google_Drive__download_file_content`, `fileId` = the sheet's
   id, `exportMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`.
   The result names the saved `.xlsx` file.
2. `node tools/sheet-check.js <that file>`. It ends `THE SHEET MATCHES THE GAME`, or lists each
   difference in plain words (Draft and Ready rows are listed as waiting, not compared).
3. Fix the sheet to match the game (the game files win), download again and re-run until it
   matches. Run it after every change to cards, decks, fractures or skills.

Watch out: a cell starting with `+`, `-` or `=` is taken as a sum by Google Sheets and shows
`#ERROR!`. Write it with a leading `'` (for example `'+1 Attack ...`).

What the tool compares, for reference: Cards (all columns, row = cards.csv line), Decks and Deck
cards (0-copy rows are deliberate), Fractures (hex vs 0–1 colours), Skills, Lists, and the two
guide tabs. The game files win. The sheet's Check columns must all say OK afterwards.

## Many cards changed at once (a rename, a new tribe list)

Rewrite whole columns from the game files instead of row by row: build the column from
`data/cards.csv` in sheet form (`+` → ", ", `---` → empty, row = cards.csv line number) and
write it with one `update_values` call per column (for example `Cards!G2:G114` for Tribes,
`Cards!I2:I114` for Fracture). Then read back `Cards!Q2:Q114` and `Decks!H2:H6`: every row must
say OK. Fix single changed cells (an Ability, an Effect) separately. Leave the DRAFT tabs alone.

## Card vocabulary

A card has a **Fracture** (where it is from; a hybrid has two). A character also has **Tribes**
(what it is) and **Classes** (what it does), one or two of each. Use these names in anything
players see. In code the fracture is still `group`/`groups` and the file is `factions.csv`.
See `docs/world.md`.

## Adding the sheet's rows to the game

1. Read only rows whose Status is `Ready` (`mcp__Google_Sheets__get_values`, a bounded range
   such as `Cards!A1:P200`). A Ready row with an existing ID replaces that row.
2. If Effect is empty but Ability describes something, write the Effect (or a `script` in
   `js/effects.js`). Read the Notes for Claude column. New skills and fractures need code.
3. Check every card loads (js/data.js warns about unknown skills, rarities and types), run
   balance simulations with `tools/selftest.js`, `node tools/test-all.js`, and the browser
   check, as for any other change. New cards change play, so expect new fingerprints: update
   `EXPECTED` in tools/test-all.js and the number in CLAUDE.md, and say so.
4. After committing, set those rows' Status to `In game` (`mcp__Google_Sheets__update_values`).
5. Story or card decisions stay the owner's: if a Ready row is unclear, ask with 2–3 options.
