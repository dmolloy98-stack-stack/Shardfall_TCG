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
- Cards are drawn in `cardHTML` (`js/ui.js`), so extra looks (gold title, animation class)
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

## Not doing for now

- **A solo run mode** (a Slay the Spire style roguelike deckbuilder). The owner is wary of
  Shardfall trying to be both a head-to-head game and a solo deckbuilder. The campaign already
  covers solo play. Revisit only if the owner raises it again.
