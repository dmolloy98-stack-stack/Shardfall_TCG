# Anonymous play numbers: a plan (nothing is collected yet)

The idea: learn from real players' games, the way Marvel Snap and Hearthstone tune balance, instead
of only computer-vs-computer games. **Nothing is built and nothing is collected.** It needs the
owner's decisions below and somewhere to send the numbers (the Firebase project that Play a Friend
will use).

## What could be counted

Grouped so the owner can pick:

1. **Balance:** for each finished match, the two decks (starter or custom), who won, how many
   rounds, which cards were played and which were on the table at the end. This answers "which
   cards are too strong or never played?"
2. **New players:** how far people get in the tutorial and the campaign, and where they stop.
   This answers "where do new players give up?"
3. **Problems:** the "Something went wrong" reports, sent automatically instead of copied by hand.
4. **Devices:** phone or computer, screen size, whether Heavy effects are on. This answers "what
   do players really use?"

Never collected, whatever is chosen: names, emails, exact locations, anything typed (deck names
included), or anything that could pick out one person. There would be no account and no ID that
follows a player. Each match is sent alone, so matches can't be strung together into one person's
history.

## Decisions for the owner

1. **Ask first, or on by default?** Recommendation: **ask first** (a one-time question: "Help
   improve Shardfall by sharing anonymous match numbers?" with Yes and No, changeable in
   Settings). It is the respectful choice, and in Europe it is the safe one legally.
2. **Which of the four groups above?** Recommendation: 1 and 2 to start; 3 once Play a Friend
   exists; 4 only if phone speed becomes a question.
3. **Who sees the numbers?** Recommendation: only the owner, as a simple private page Claude
   builds from them (win rate per card and deck, where tutorials stop).

## Draft privacy note (the owner's words to change)

> **Anonymous match numbers.** If you say yes, Shardfall sends a few numbers about each finished
> match: which decks played, who won, how long it took and which cards were used. It never sends
> your name, anything you type, or anything that identifies you or your device, and matches can't
> be linked to each other. The numbers are only used to make the game fairer. You can switch this
> off at any time in Settings.

## How it would be built (for later)

- A Settings switch saved in the browser (`js/saves.js`), off until the player says yes.
- At the end of a match, one small message to Firebase with only the chosen numbers. If the
  message fails (offline), it is dropped, never stored to send later.
- The match's move list already holds everything needed to count cards, so nothing extra has to
  be tracked during play.
- Tests: no message is sent while the switch is off; a message holds only the listed fields.
