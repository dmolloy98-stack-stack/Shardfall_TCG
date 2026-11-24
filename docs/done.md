# Done

The history of finished work, newest first, moved here from `docs/todo.md` so the to-do list
stays short. Each entry keeps the owner's decisions, because they explain why things are the way
they are. (What changed for players is `data/whats_new.csv`; why the code is built as it is,
`docs/how-it-was-built.md`.)

## Protected look that hints at the Shardfall — owner's idea, built 24 Nov

The owner's idea: the Protected runes and the shell on the health gem should hint at what caused
the Shardfall, and clearly belong together. The look advisor offered three versions on
https://claude.ai/artifact/Dx8gNozoyzmjKntUztDwGK (A pixel runes, B loading ring, C level-up
marks). **The owner picked B**, because it cuts visual clutter. A band of light fills the ring
around a Protected card and stops at 99%; tick marks replace the runes; the shell's shards light
one by one and one never lights. Logged in the clue log (`docs/world.md`) and the look book
(`docs/look.md`).

## Round three — chosen by the owner (23 Nov), built

The owner picked 5 to 18 of the "what's next" list. Nothing here changes how the game plays.

5. **Built (23 Nov).** **Finish splitting the rules file**: combat, turns and phases, and playing cards in their own files.
6. **Built (23 Nov).** **Plain-English errors when card data is wrong**, on screen and in GitHub's tests.
7. **Built (23 Nov).** **An "explain this Effect" tool**: a card's Effect text in plain English.
8. **Built (23 Nov).** **A permanent "same play" check** for card changes (old and new versions side by side).
9. **Built (23 Nov).** **One command for "play is meant to change"**: fingerprints and recorded matches together.
10. **Built (23 Nov).** **Small upkeep**: GitHub's building blocks updated before they stop working.
11. **Built (23 Nov).** **A "project at a glance" page** (`docs/status.md`), rewritten by a tool with each pull request.
12. **Built (23 Nov).** **Split the to-do list**: finished work in `docs/done.md`, live items here.
13. **Built (23 Nov).** **A short summary when each session starts** (branch, tests, waiting on the owner).
14. **Built (23 Nov): https://claude.ai/artifact/VC8opzKwdKLh5srrGCBwcr.** **A "Shardfall dashboard" for the owner** (a claude.ai page), updated with each pull request.
15. **Built (23 Nov).** **`ability-words` skill**.
16. **Built (23 Nov).** **`move-words` skill**.
17. **Built (23 Nov).** **`bug-report` skill**.
18. **Built (23 Nov).** **`ci-check` skill**.

## Background improvements, round two — chosen by the owner (22 Nov), built

The owner picked all thirteen. Build order: 3, 7, 13, 12, 5, 6, 8, 4, 1, 2, 10, then 9 and 11,
which need the owner. Mark each one built as it lands.

1. **Built (22 Nov): js/ui.js split into ui.js, board.js and input.js.** **Split the screen code into smaller files** by job. Nothing on screen changes.
2. **Started (22 Nov).** **Player words move into the editable word table** (`data/ui_text.csv`), a screen at a time.
   Done: the start menu, Settings, the save code window, the game menu, What's new, the
   "Something went wrong" window, the "pass the device" screen and the end of a match.
   Still in the code, one screen at a time from here: the deck builder, the Almanac and card
   details, the battle log and hints, the board's buttons and prompts, the campaign and trophies,
   the champions' lines, the tutorial, and the intro.
3. **Built (22 Nov).** **A version number and "What's new" list in the game.**
4. **Built (22 Nov): five of seven; Simple Messenger and Digital Drainage stay as code.** **General ability words for the last seven one-off cards** where a pattern is reusable.
5. **Built (22 Nov).** **Automatic screen tests** on every pull request.
6. **Built (22 Nov).** **Picture comparison**: screenshots flagged when they change unexpectedly.
7. **Built (22 Nov).** **The card sheet checks itself against the game** (a tool listing differences).
8. **Built (22 Nov).** **A speed budget**: GitHub warns when loading or a turn gets noticeably slower.
9. **Prepared (22 Nov): `docs/real-phones.md`.** **Real phone testing.** Waiting on the owner to apply for
   BrowserStack's free open-source account. Automatic runs come after, from its current instructions.
10. **Built (22 Nov).** **Accessibility check** (contrast, sizes, keyboard), with simple fixes. Fixed: the
    What's new list and the battle log can be scrolled by keyboard, the computer's "thinking" dots
    speak properly, and the screens sit in one main area. Not checkable automatically: text
    contrast on gradients (most text); judge it by eye.
11. **Planned (22 Nov): `docs/play-numbers.md`.** **Anonymous play numbers.** Needs the owner's decisions
    on what to collect (three questions in the plan), and the Firebase project. Nothing is collected.
12. **Built (22 Nov).** **One-button restore** from the Drive backups, proven by running every test.
13. **Built (22 Nov).** **A "how this was built" guide** (`docs/how-it-was-built.md`): the why behind the code. Kept
    current with every change that involves a "why" (CLAUDE.md, `pr-cycle`).

## Behind-the-scenes groundwork for long-term growth — chosen by the owner (20 Nov), built

The owner picked all twelve. Nothing here changes how the game plays. Build order: 1+2, 9, 6, 7,
8, 10, 4, 5, 3, 11, 12. Mark each one built as it lands.

1. **Built (20 Nov).** **Every move written down as a short note** (a move list). With the match seed it replays a
   match exactly. Needed for Play a Friend, recorded test matches and bug reports.
2. **Built (20 Nov).** **One front door for moves.** Taps, the computer and the tutorial all send moves through one
   entrance into the rules; a friend's moves online will use it too.
3. **Written (20 Nov): `docs/online-play.md`.** **A written plan for hidden cards online**, so a browser can't peek at the other hand.
4. **Built (20 Nov).** **Champions, events and shard bonuses in their own files**, so a new one is "add a file".
5. **Built (20 Nov).** **More words in the card ability language**, so fewer future cards need custom code.
6. **Built (20 Nov).** **A test that plays every card at least once.**
7. **Built (20 Nov).** **A version number on saved progress**, with an upgrade step for old saves.
8. **Built (20 Nov).** **Save code: export and import progress** (copy a code, paste it on another device).
9. **Built (20 Nov).** **Recorded test matches** (needs 1), replayed in every test run.
10. **Built (20 Nov).** **"Copy bug report" button** when the game hits an error (seed and moves).
11. **Built (20 Nov).** **Balance check on every pull request** (warn if a starter deck leaves about 40–60% wins).
12. **Built (20 Nov).** **Quicker loading and offline play** (one bundled file; add to home screen).

## The big shard fall — built (17 Nov)

Built from the owner's design: once a match in round 8 a 10-health shard (15 at first; lowered to 10 after balance tests) falls into the middle of
the table; whoever breaks it draws a card (2 with no champion; it was +5 and +10 health at first) and gets their champion's bonus. The
random events became "mini shard falls" in rounds 4 and 12 only. The table cracks and glows after the
big fall. Chest Thump replaced The Troop Remembers and Boss Phases replaced LEVEL UP.

## Random events every 5 rounds — built

Built on the owner's decisions: an event every 5 rounds (rounds 6, 11, 16 ...; a round is one
player's turn), announced two rounds ahead with a one-line description, lasting one round.
The four events the owner chose: Spell Surge, Tremor, Windfall, Amplified Areas (names are
working names; the owner can rename them in `data/events.csv`). More events are the owner's
design; each needs code in `js/rules-events.js` (it was `js/engine.js` when this was written).

## Champion abilities — built, first tuning done

All five champions have an ability, from the owner's choices: The Simplistic (Humble Beginnings),
The Man Ape (The Troop Remembers), IP Man (The Bow), Boss Level (LEVEL UP), and Soul Shepard
(Challenge, and +1 Health for every Undead that dies, either side, from turn one; no levels).
They work from turn one without the champion on the table. The tutorial explains them on two
pages near its end. Words: `data/champion_abilities.csv`. Rules: `js/rules-champions.js` (first in `js/engine.js`).

**Decided by the owner (16 Nov).**
- Second tuning: Humble Beginnings has no starting part any more, only the level-up at 6 mana.
  In a 1,250-game test this put Simple at about 51% (it was 65% with the starting part).
- First tuning: Humble Beginnings only for Simple characters costing 1 (was 2 or less), and The
  Troop Remembers' level 2 gives +1 Attack (was +2). The first version made Simple win 69%.
- The Bow picks automatically (the strongest ready attacker).
- The Troop Remembers does not stack: two fallen Monkeys before the next is played is one discount.
- A won fight for IP Man: its character survives and the enemy character is knocked out.
  Fights against the player's face don't count.
- The name "Humble Beginnings" stays. ("Start small, then level up" is a hidden clue in
  `docs/world.md`, so it is not used.)
