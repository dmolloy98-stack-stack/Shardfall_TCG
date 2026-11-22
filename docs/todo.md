# To do (later)

Ideas the owner has asked to keep for later. Nothing here is built yet. Design decisions
belong to the owner: Claude offers options and waits.

## Card levels and mastery (like Team Fight Tactics)

**The idea.** In Team Fight Tactics a player's little companion (the "avatar") has several
levels, and each level looks fancier. Shardfall copies the idea, but there is no avatar here.
It applies to **cards** and to **whole decks**, to show mastery of them. The words used are
"Level" and "Mastery".

**What a higher level unlocks** (the owner's list so far; more ideas to come):
- Different card animations.
- Different card-back art.
- A golden title for the card.
- Alternate art.
- Other things the owner has not thought of yet.

**How a level is earned.**
- A single card: it differs by card. Not decided yet. Set aside for now.
- A whole starter deck: simplest version is that the deck is **mastered once the player has
  beaten the campaign with it**.

**Saving.** Progress does not have to be saved between visits for now.

**Notes for when this is built.**
- Levels are about looks and bragging rights, not power (nobody's cards get stronger). The
  owner has not said otherwise; confirm before adding any bonus.
- The campaign already knows when a stage is won (`js/campaign.js`). A "deck beaten the
  campaign" flag could hang off that.
- Cards are drawn in `cardHTML` (`js/cards.js`), so extra looks (gold title, animation class)
  would go there and in `css/style.css`.
- Alternate art and card backs need art, which is outside what Claude makes. Claude can build
  the slot (a level picks which image to show); the owner supplies the images.
- Not paying for levels, as far as the owner has said so far. The first idea was "pay to
  upgrade" like Team Fight Tactics, but the later answers talk only about earning levels. Ask
  again before building anything that costs money.

## Champion abilities — built, first tuning done

All five champions have an ability, from the owner's choices: The Simplistic (Humble Beginnings),
The Man Ape (The Troop Remembers), IP Man (The Bow), Boss Level (LEVEL UP), and Soul Shepard
(Challenge, and +1 Health for every Undead that dies, either side, from turn one; no levels).
They work from turn one without the champion on the table. The tutorial explains them on two
pages near its end. Words: `data/champion_abilities.csv`. Rules: `js/engine.js`.

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

## Champion leveling (like Legends of Runeterra) — the owner chose "no champion is a real choice"

**The idea.** Each champion (Unknown card) levels up when its deck meets a condition, and it
changes into a stronger version. A deck may hold one kind of champion, or none.

**Decided by the owner.**
- A deck with **no champion gets nothing extra**. Skipping the champion is the player's choice.
- Each champion needs its own ability and level-up condition that fits its personality and play
  style (`docs/world.md` and `js/champions.js` hold the personalities). **The owner is working
  these out. Claude offers options and waits.** Nothing is built.

**TBD (to be decided later).**
- **Cards that reward a no-champion deck.** The owner will design these later. They are meant
  to make "no champion" a choice with its own upside, without any built-in bonus for it.

**Notes for when this is built.**
- Test every champion's balance on the computer players first (`tools/selftest.js`). The
  starter decks are already uneven (Monkey wins about 41%, Simple about 58%).
- Research said to make leveling happen often and keep it something the opponent can fight.

## Random events every 5 rounds — built

Built on the owner's decisions: an event every 5 rounds (rounds 6, 11, 16 ...; a round is one
player's turn), announced two rounds ahead with a one-line description, lasting one round.
The four events the owner chose: Spell Surge, Tremor, Windfall, Amplified Areas (names are
working names; the owner can rename them in `data/events.csv`). More events are the owner's
design; each needs code in `js/engine.js`.

**Open points.**
- A one-round event is one player's turn, so Spell Surge and Amplified Areas help only the
  player whose turn it is. Tremor and Windfall hit both sides at once. If this feels lopsided,
  an event can last two rounds (one turn each); this is a small change.
- The computer ignores events when it plans. It could learn to hold spells for a Spell Surge.
- Events are not in the owner's card sheet yet (no tab for them).

## More area cards — an idea the owner likes, not yet designed

- Areas that **change a rule for both players**, not only +stats (today only Whirlpool does).
- A general area that gives stats or bonuses **by tribe** played, so it works in mixed decks.
- Cards are the owner's design. Claude builds and tests them once they are written in the sheet.

## Protected look that hints at the Shardfall — the owner's idea, not designed yet

- The runes that circle a Protected card (`RUNES` and `runeRingHTML()` in `js/board.js`) should
  one day hint at what made the shards fall: the big event behind the Shardfall. The owner will
  design what that is, then it gets pulled into the runes.
- The shell of shards on a Protected player's health gem (`WARD` and `wardHTML()` in
  `js/board.js`) should carry the same hint, so the two Protected looks clearly belong together
  and nobody is confused.
- Today the runes are placeholder shapes. The shell has no runes yet.
- Keep the hint subtle, like the other clues; once it is designed, log it in the clue log in
  `docs/world.md`.
- Not now: the owner will raise it when ready.

## The big shard fall — built (17 Nov)

Built from the owner's design: once a match in round 8 a 10-health shard (15 at first; lowered to 10 after balance tests) falls into the middle of
the table; whoever breaks it draws a card (2 with no champion; it was +5 and +10 health at first) and gets their champion's bonus. The
random events became "mini shard falls" in rounds 4 and 12 only. The table cracks and glows after the
big fall. Chest Thump replaced The Troop Remembers and Boss Phases replaced LEVEL UP.

**Open points.**
- The Man Ape's free 2/2 Monkey is a Chimp with +1 Attack, because no 2/2 Monkey card exists. The
  owner could design a card for it.
- The big shard could carry the hint about what caused the Shardfall (see the Protected item above).
- Round 4 and round 12 are both the second player's turns, so events that help only the active
  player (Spell Surge, Amplified Areas) always help the second player.

## Art: remind the owner about ComfyUI next time art comes up

The owner put art aside for now (18 Nov) and asked to be reminded, the next time they ask about
art, of the ComfyUI plan and its step-by-step setup. The plan: ComfyUI on the owner's PC (RTX 4060,
8 GB) with an SDXL model, free per image. Steps: 1) download ComfyUI's Windows portable version from
its official GitHub releases page (github.com/comfyanonymous/ComfyUI), unzip it to a drive with about
30 GB free, run `run_nvidia_gpu.bat` (it opens at 127.0.0.1:8188); 2) download an SDXL model (SDXL 1.0
from Stability AI on Hugging Face, or an SDXL fantasy-art model whose license allows selling) into
`ComfyUI\models\checkpoints` and restart; 3) test with the default workflow (pick the model, type a
prompt, press Queue, check `ComfyUI\output`); 4) then connect Claude (Claude Code desktop app on the
PC, or Remote Control) and decide about the "art is out of scope" rule in CLAUDE.md. Nothing has been
downloaded from GitHub; Claude needs the owner's go-ahead before installing any ComfyUI tool.

## Behind-the-scenes groundwork for long-term growth — chosen by the owner (20 Nov), being built

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

## Background improvements, round two — chosen by the owner (22 Nov), being built

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
11. **Anonymous play numbers.** Needs the owner's decisions on what to collect, and somewhere to
    send them (the Firebase project). Nothing is collected until then.
12. **Built (22 Nov).** **One-button restore** from the Drive backups, proven by running every test.
13. **Built (22 Nov).** **A "how this was built" guide** (`docs/how-it-was-built.md`): the why behind the code. Kept
    current with every change that involves a "why" (CLAUDE.md, `pr-cycle`).

## Not doing for now

- **A solo run mode** (a Slay the Spire style roguelike deckbuilder). The owner is wary of
  Shardfall trying to be both a head-to-head game and a solo deckbuilder. The campaign already
  covers solo play. Revisit only if the owner raises it again.

## Turned down or on hold

A short record so the same ideas aren't offered again (see the `ideas-menu` skill). On hold
means "not now"; the owner may pick it up later.

- **Sound and music:** on hold; the owner will handle sound later.
- **Art:** out of scope for Claude; the owner plans to make it with ComfyUI (see "Art: remind the owner about ComfyUI" above).
- **Campaign gifts** (a reward after each campaign win): on hold (Nov 2026).
- **Challenges** (special goals for a match): on hold (Nov 2026).
- **Phone-only table layout:** discontinued; the current phone layout is good enough. Kept as a reference in `docs/phone-table/`.
- **Card-sheet "card lab" and other early tools** (options 2 and 3 when the data moved to CSV files): on hold since the start; the My Decks builder exists now.
- **Champion leveling:** waiting on the owner's designs (see "Champion leveling" above).
- **Play a Friend:** chosen (Firebase), waiting on the owner to create the Firebase project. The plan for hiding cards is `docs/online-play.md`; the owner decided (21 Nov) that the counter window always pauses briefly when the other player has spare mana.
