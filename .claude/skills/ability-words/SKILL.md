---
name: ability-words
description: >
  Turning a one-off card ability (a "script" in js/effects.js) into general words of the card
  ability language, or adding a new ability word, without changing how any card plays: the design
  rules, the side-by-side "same play" check, and updating data/README.md and the card sheet. Use
  when a new card needs an ability the words can't express yet, or when tidying one-off code.
---

# Ability words

What a card does is its Effect column in `data/cards.csv`, written in the ability language that
`js/effects.js` reads (`WHEN`, `ACTIONS`, selectors, numbers). A card that needs something the
words can't say gets a `script` (one-off code in `SCRIPTS`). Every script that is really a
pattern should become words, so future cards need no code. Only two scripts remain (Simple
Messenger, Digital Drainage); keep truly one-of-a-kind abilities as scripts.

## 1. Design the word

- **General, plain, short.** Name it for what it does (`pick`, `take`, `drainLife`), not the
  card. Prefer widening something that exists (a new narrowing word like `has:Reanimate`, a
  number word like `statline`, an optional extra like `damageAll … other`) over a new action.
- **Same behaviour, same order.** The new words must do exactly what the script did, in the
  same order: who is hit first, when deaths are checked, what is counted before or after. Read
  the script line by line. (Example: Zombombadier's damage goes player 1's characters, player 1,
  player 2's characters, player 2; `damageAll` already does that, so it was widened rather than
  rebuilt from `damage me` and `damage foe`.)
- **Words players see stay the same.** Keep a question's text by passing it in quotes, as `pick`
  does.
- **Checks when the Effect is read, not when the card is played.** An action can give a third
  item in its `ACTIONS` entry, a check that throws a plain-English message naming the card
  (see `pick` and `take`).
- Changing a word other cards already use (as `shrink` was) changes those cards too: check them
  all (step 3, `--all`).

## 2. Build it

- `js/effects.js`: the action in `ACTIONS` (signature letters: s who, n number, w word, c card,
  `?` optional), or the filter in `selectorFilter`, or the number in `parseNumber`. Keep the
  comments at the top of each table current.
- `data/cards.csv`: rewrite the card's Effect. A value with commas or quotes is wrapped in `"…"`
  with inner quotes doubled (`""like this""`).
- Remove the script from `SCRIPTS` by hand, one function at a time. (A pattern search once
  removed the next script too; check the remaining list after.)

## 3. Prove nothing changed

Make a copy of `main` to compare with: `git worktree add <scratchpad>/main origin/main`.
1. `node tools/test-all.js`: EVERYTHING PASSED, same fingerprints.
2. `node tools/card-equivalence.js <scratchpad>/main`: every card whose Effect changed plays the
   same, after the card and after five more turns. Add `--all` if an existing word or rule
   changed. This matters most for cards no starter deck holds, which the big games never meet.
3. For extra certainty on starter-deck cards: `node tools/selftest.js . rand 1500` and
   `ai 6` here and in the main copy (run in parallel), same fingerprints.
4. If a card plays differently, either fix the words or, if the change is wanted, it is a card
   change for the owner to decide (`card-change` skill).

## 4. Tell the sheet and the docs

- `data/README.md`, "Writing effects": the new word in its table, with an example.
- The card sheet: the Effects guide tab (insert rows with `insert_dimension` so the formatting
  stays; a cell starting with `+`, `-` or `=` needs a leading `'`), and the changed cards' Effect
  cells (column N, row = cards.csv line). Then the sheet check: download the sheet as .xlsx and
  run `node tools/sheet-check.js <file>` (`sheet-sync` skill); it must say it matches.
- `docs/how-it-was-built.md`: add the new words to the "Cards are data" entry.
- `tools/explain-effect.js` describes every word in plain English: add the new word there too.
