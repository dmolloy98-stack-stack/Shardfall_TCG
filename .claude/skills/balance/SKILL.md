---
name: balance
description: >
  Measuring how fair Shardfall is: deck win rates, first-player advantage and game length from
  many computer-vs-computer games, before and after a rule, card or deck change. Use when a
  change could affect who wins, when the owner asks for win rates or simulations, or when tuning
  or optimizing decks.
---

# Balance testing

## The tool

```bash
node tools/winrates.js 10            # quick read (about 2 minutes)
node tools/winrates.js 50            # solid read (about 11 minutes; run in the background)
node tools/winrates.js 50 --pairs    # also every pairing
```

It plays every starter deck against every other with the computer on both sides
(`tools/selftest.js`, same seeds every time) and prints each deck's win rate, the first player's
win rate and the average game length. Each game per pairing adds about 13 seconds, so 50 per
pairing (~1,250 games) takes about 11 minutes: start it with `run_in_background` and keep working.

## Before and after at the same time

To compare the old rules with your uncommitted change, run the old version from a side copy:

```bash
SP=<scratchpad>; git worktree add -q $SP/before HEAD && cp tools/winrates.js $SP/before/tools/
(cd $SP/before && node tools/winrates.js 20 > $SP/wr_before.txt 2>&1 &)
(node tools/winrates.js 20 > $SP/wr_after.txt 2>&1 &)
```

Both finish in about 5 minutes for 20 per pairing. Wait with a background `until` loop (never a
foreground `sleep`), then `git worktree remove --force $SP/before`. Use the same game count for
both, and report them side by side.

## Targets (accepted by the owner so far)

- Every starter deck about 45–58%. The owner is **fine with some starters being stronger**:
  they are a baseline, and custom decks are the real test. Don't over-tune.
- First player wins about 54% (the second player has a one-time +1 mana token to offset it).
- A match lasts about 14–15 turns (both players' turns counted). The owner wanted matches
  "longer, but not dragging"; health is 25.

## How to run a balance change

1. **Measure before** with the same game count you'll use after.
2. Make the change.
3. **Measure after**. Report both in a small table in plain words ("Monkey went from 41% to
   47%"). Mention the game count, since small runs swing by ±5%.
4. Only the owner decides card and rule changes. When results suggest a fix, offer 2–3
   options with numbers, recommend one, wait.
5. A change meant to alter play changes the fingerprints. Run `node tools/test-all.js`, put the
   new numbers in `EXPECTED` at the top of `tools/test-all.js` **and** the `ai 2` number in
   CLAUDE.md, and say so in the commit and to the owner.
6. Update the win-rate sentence in README.md ("The starter decks" section) when the numbers move.

## Deck optimizing

When asked to tune a starter deck: keep it 35 cards and within the deck rules (max 4 copies, one
champion kind with max 2 copies; `data/game_rules.csv`); keep the deck's play style from
`docs/world.md` / the README; change a few cards at a time and re-measure. Owner history:
decks should have plenty of 0–2 cost cards; Monkey needs enough Rally characters.

## Odd states

`node tools/selftest.js . rand 1000` plays random legal moves to find crashes and stuck games
that the computer never reaches. Run it after any rules change.
