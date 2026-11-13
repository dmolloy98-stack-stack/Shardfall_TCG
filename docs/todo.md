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
