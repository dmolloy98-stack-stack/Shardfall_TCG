---
name: card-change
description: >
  Changing or adding a Shardfall card, skill, deck or game rule that the owner has decided on
  (cost, stats, ability text, effect, tribe/class/fracture, deck list, numbers in game_rules.csv).
  Use when the owner asks for a specific card or rule change. For bringing Ready rows from the
  card sheet, use sheet-sync; for measuring fairness, balance.
---

# Changing a card or rule

The owner decides what changes; Claude makes it exactly as asked ("make that the only change"
means only that). If the request is unclear, or the ability text could be read two ways,
ask or offer options first.

## Where a card lives

- `data/cards.csv`: one row per card (see `data/README.md` for every column). Stats are
  `Attack+Health`; Tribes/Classes/Fracture are `+`-joined lists, `---` when empty for a
  non-character, `N/A` for no fracture.
- **Ability** is the text players read; **Effect** names the code that makes it work: an entry
  in `EFFECTS` in `js/effects.js` (target, intent, filter, apply). Champion abilities are in
  `data/champion_abilities.csv` and "Champion abilities" in `js/engine.js`. Skills (Rush,
  Swift, Rally, Protected, Pierce…) are in `data/skills.csv` and the engine.
- Decks: `data/decks.csv` (`CardID:copies|…`). Deck rules: `data/game_rules.csv`.
- If the computer needs to understand a new effect (to use it well), check `js/ai.js`; the
  `intent` field in `EFFECTS` often covers it.

## Steps

1. Edit the data (and effect code if needed). Keep Ability text and Effect in agreement.
2. Run the focused test for what was touched (the `add-feature` skill lists them; `cards-test`
   plays every card once), then `node tools/test-all.js`. A real play change moves the
   fingerprints and the recorded matches: update `EXPECTED` in `tools/test-all.js` and the number
   in CLAUDE.md, re-record with `node tools/replay-test.js . --update`, and say so.
3. Measure with the `balance` skill (before and after) when the change could affect who wins.
4. Look at the card in the browser (`browser-check`): the name fits on one line (only Shadow-Stitched
   Soldier may take two), the text fits, the Almanac shows it right.
5. **Update the card sheet to match** (`sheet-sync`): the game files are the master copy, and
   the sheet row number is the cards.csv line number.
6. If the card's story or a clue is touched, `story-writing` (clue log in `docs/world.md`).
7. Commit and push (`pr-cycle`); `backup` runs once the pull request merges.
