---
name: move-words
description: >
  Moving one Shardfall screen's words (buttons, titles, messages, hints) out of the code into the
  editable word table data/ui_text.csv, with T("id"), so the owner can reword them; proven by the
  picture comparison showing no change. Use when the owner asks to make a screen's words editable,
  or when working through the remaining screens listed in docs/todo.md.
---

# Moving a screen's words into the word table

Words players read live in `data/ui_text.csv` (TextID, Text, Category). The code asks for them with
`T("id")`, or `T("id", { name: p.name })` to fill `{name}`; static words in `index.html` use
`data-t="id"` and are filled by `fillWords()` at start-up. `tools/words-test.js` checks every id the
code asks for has its row. Screens still to move are listed in `docs/todo.md` ("Still to do from
earlier rounds"). Do one screen per change.

## Steps

1. **Find every word on the screen.** Read its code (`js/menu.js`, `js/panels.js`, `js/board.js`,
   `js/decks.js`, `js/campaign.js`, `js/tutorial.js`…): text inside HTML templates, `title=` and
   `aria-label=` attributes, `textContent =` lines, messages passed to `banner()`, and static text
   in `index.html`. Card names, ability text and story text already come from the data files:
   leave them.
2. **Add the rows** to `data/ui_text.csv`, at the end, with the screen's name as Category. TextIDs:
   lowercase with `_`, starting with the screen (`builder_save`, `almanac_tab_cards`). Copy the
   words **exactly** as they are now: changing wording is the owner's decision, not part of a move.
   A value with a comma goes in double quotes. Parts the game fills in become `{name}`, `{n}`…
3. **Point the code at them:** `${esc(T("id"))}` inside HTML templates (always `esc`), `T("id")`
   for `textContent`, `data-t="id"` in `index.html`. Shared words (On, Off, Close) already exist:
   reuse them.
4. **Check:**
   - `node tools/words-test.js .` and `node tools/test-all.js`.
   - Picture comparison against main: `git worktree add <scratchpad>/main origin/main`, then
     `node tools/picture-test.js <scratchpad>/main <scratchpad>/pics`. It must say **NO PICTURE
     CHANGES** for the scenes that show this screen. If the screen isn't one of its scenes, add a
     scene to `SCENES` in `tools/picture-test.js` first (in the same change).
   - `node tools/screen-test.js`.
5. **Tell the docs:** tick the screen off the list in `docs/todo.md`; add it to the list of moved
   screens in `data/README.md` ("ui_text.csv").

## Traps

- `T("id")` inside a `//` comment is ignored by the test, but `T("...")` in a string the code builds
  at run time is not checked: prefer literal ids.
- Some old rows are written in capitals (`button_restart` is `RESTART`); keep them as they are.
- A word that changes with the game (a count, a name) must be a `{placeholder}`, never glued on
  with `+`, so the owner can move it within the sentence.
