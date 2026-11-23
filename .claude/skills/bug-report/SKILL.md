---
name: bug-report
description: >
  What to do with a Shardfall bug report (the text from the game's "Something went wrong" window,
  or a description from the owner): replay the match, find the cause, fix it, and add a test so it
  can't come back. Use when the owner pastes a bug report or describes something that went wrong.
---

# Handling a bug report

A report from the "Something went wrong" window is one line of text (JSON) holding the version,
the error and where it happened, the screen, and the whole match so far (`match`: the setup and
every move). With it the match can be played again exactly.

## 1. Read it

- Save the text to a file in the scratchpad (never in the repository: it holds the player's
  browser details).
- `node tools/replay-report.js <file>`. It prints the version, the error, the screen, and replays
  the match:
  - **"Replay stopped at move N … the rules refused it"** or a crash: a rules bug (or a card or rule
    changed since that version). The move and the last log lines show where.
  - **"replays cleanly … the error was on the screen side"**: the rules are fine; the "where" lines
    name the screen file (`js/board.js`, `js/input.js`, `js/panels.js`…).
- Compare its version with `data/whats_new.csv`: a newer update may already have fixed it.
- A description without a report (from the owner): ask for the steps, or for the report text if
  the window appeared. Reproduce it with the screen tests' helpers (`tools/screen-test.js`).

## 2. Reproduce and fix

- Rules bug: replay the match in Node up to the move before (the code in `tools/replay-report.js`
  shows how), and inspect `S`. Fix the rule. Remember the trap in `docs/how-it-was-built.md`: a rule
  must never change the game and then report "refused".
- Screen bug: open the game in the test browser (`browser-check` skill), call
  `replayMatch(<the report's match>)` in the page, `render()`, and do what the player did on the
  screen named in the report.
- If the fix changes play, it is a play change (`node tools/update-expected.js --write`; say so).

## 3. Make sure it can't come back

- Rules bug: a focused check in the test file for that area (`add-feature` skill's table), set up
  from the report's position, failing before the fix and passing after.
- Screen bug: a test in `tools/screen-test.js`.
- A trap worth remembering goes in "Traps already fallen into" in `docs/how-it-was-built.md`.
- A line in `data/whats_new.csv` if players would notice ("Fixed: …").

## 4. Tell the owner

What went wrong in plain words, what was fixed, which update has the fix, and the wrap-up note.
