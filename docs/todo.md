# To do

What is still to do, decided or waiting. Finished work moves to `docs/done.md` (the history), so
this list stays short. Design decisions belong to the owner: Claude offers options and waits.
Keep it that way: when an item is built, move it to `docs/done.md` in the same change.

## Waiting on the owner (added 22 Nov)

Things Claude has prepared that need the owner before they can go further. The owner will get to
them; nothing is lost while they wait.

- **Real phone testing** (round two, step 9). The owner applies for BrowserStack's free
  open-source account (steps in `docs/real-phones.md`), then does the 15-minute phone checklist
  there before big releases. Once the account exists, Claude can add automatic runs.
- **Anonymous play numbers** (round two, step 11). Three decisions in `docs/play-numbers.md`: ask
  players first or count by default, which numbers to count, and who sees them; plus the draft
  privacy note to reword. Also needs the Firebase project (the same one as Play a Friend).
  Nothing is collected until then.

## Still to do from earlier rounds

- **Player words into the word table** (round two, step 2): done for the start menu, Settings, the
  save code window, the game menu, What's new, the "Something went wrong" window, the "pass the
  device" screen and the end of a match. Still in the code, one screen at a time: the deck
  builder, the Almanac and card details, the battle log and hints, the board's buttons and
  prompts, the campaign and trophies, the champions' lines, the tutorial, and the intro.
- **Simple Messenger and Digital Drainage** keep their own code (round two, step 4): truly
  one-of-a-kind. Nothing to do unless a future card shares their pattern.

## Open points on built features

### Random events (switched off in normal play, 27 Nov)
- The owner switched them off in the campaign, Play vs Computer and Two players, and will bring
  them back later in a **"shake-up" mode** (not designed yet). When on, an event now lasts two
  rounds, one turn for each player. Building the mode means a menu choice that starts matches
  with `newGame({ events: true })`.
- The computer ignores events when it plans. It could learn to hold spells for a Spell Surge.
- Events are not in the owner's card sheet yet (no tab for them).

### The big shard fall
- The Man Ape's free 2/2 Monkey is a Chimp with +1 Attack, because no 2/2 Monkey card exists. The
  owner could design a card for it.
- The big shard could carry the hint about what caused the Shardfall (see the Protected item below).

## Offered, not picked yet (23 Nov)

From the "what's next" list; the owner may pick them later.
- **Watch your last match again** (a replay on the end screen, from the move list).
- **Computer difficulty: Easy / Normal / Hard.**

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

## Champion leveling — the owner decided what it means (27 Nov)

**Decided by the owner (27 Nov).** Leveling is about the champions' **passive abilities**, the ones
active all match long (`data/champion_abilities.csv`). The ability levels up; **the champion
card itself never levels up or changes** (the Legends of Runeterra style card level-up was turned
down). A deck with **no champion gets nothing extra**; skipping the champion is the player's choice.

**Where each ability stands today.**
- Level up once already: The Simplistic (Humble Beginnings, at 6 max mana) and IP Man (The Bow,
  after 5 fights won).
- No level-up yet: The Man Ape (Chest Thump), Boss Level (Boss Phases: it has phases instead) and
  Soul Shepard (Keeper of the Fallen: it grows instead). Whether these get a level-up, and what it
  is, is the owner's to design. Claude offers options when asked and waits.

**TBD (to be decided later).**
- **Cards that reward a no-champion deck.** The owner will design these later. They are meant
  to make "no champion" a choice with its own upside, without any built-in bonus for it.

**Notes for when more is built.** Test every change on the computer players first
(`node tools/winrates.js`). Research said to make leveling happen often and keep it something the
opponent can fight.

## More area cards — an idea the owner likes, not yet designed

- Areas that **change a rule for both players**, not only +stats (today only Whirlpool does).
- A general area that gives stats or bonuses **by tribe** played, so it works in mixed decks.
- Cards are the owner's design. Claude builds and tests them once they are written in the sheet.

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
- **Champion cards leveling up** (a Legends of Runeterra style change of the card itself): turned down 27 Nov; the passive abilities level up instead (see "Champion leveling" above).
- **Play a Friend:** chosen (Firebase), waiting on the owner to create the Firebase project. The plan for hiding cards is `docs/online-play.md`; the owner decided (21 Nov) that the counter window always pauses briefly when the other player has spare mana.
