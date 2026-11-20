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
  - Attack and Health become `Attack+Health` in Stats; ArtKey is the CardID.
  - Tribes, Classes and Fracture hold names separated by ", " and become `+`-joined lists,
    `---` when empty for a non-character. A card from no fracture is `N/A` (shown as Unbound).
  - Column O, Flavor text = the Description column (the card's story; see docs/world.md).
- **Decks plus Deck cards → `data/decks.csv`.** One row per card becomes the
  `CardID:copies|…` CardList. Skip rows with 0 copies (a card taken out of a deck).
- **Fractures → `data/factions.csv`** (the tab was called Factions). Color is hex; convert to
  0–1 RGB.
- **Skills → `data/skills.csv`.**
- The three "DRAFT …" tabs are the owner's review notes, not game data.

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
