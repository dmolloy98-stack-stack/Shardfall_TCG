# Play a Friend: keeping cards hidden online

A plan, not built yet. Play a Friend was chosen with Firebase and waits on the owner creating the
Firebase project (`docs/todo.md`). This page is about one question: **how do we stop a browser
from peeking at the other player's hand?** It was written once the move list existed
(`docs/code-map.md`, "Moves"), because that is what two browsers will send each other.

## What has to stay secret

- The other player's **hand**.
- The **order of both decks** (what you and they will draw next).
- The **match seed**. The seed decides every shuffle and random event, so anyone who knows it
  can work out every deck's order. Today each match's seed is shown in the battle log. That
  line will have to be hidden in online matches.

Everything else (the table, health, mana, graveyards, how many cards are in a hand or a deck) is
public, as it is in hot-seat play today.

## The problem in one sentence

Today every browser holds the whole game (`S`), both hands included. The screen simply doesn't
draw the other hand. Someone who opens the browser's developer tools can read it.

## Three ways to do it

### A. Both browsers run the game and trust each other (simplest)

Both browsers hold the whole game and send each other only moves (the short notes, for example
`[0, "play", 41]`). Each browser plays every move through the same rules and stays in step.
Firebase needs only its database, no server code.

- Good: small to build, since the move list and replays already do most of it. Works on
  Firebase's free plan. Nothing on the screen changes.
- Bad: a player who knows how could peek at the other hand or work out the decks. Fine between
  friends; not fine for strangers or ranked play.

### B. One referee holds the secrets

A small program on Firebase (a "Cloud Function") holds the real game. Each browser sends its move
to the referee. The referee checks it, plays it, and sends each player only what that player may
see. The other hand arrives as card backs.

- Good: no peeking is possible. It also stops cheating, such as sending a move that isn't allowed.
- Bad: much more work. The game currently assumes it holds everything (the computer's
  look-ahead, the counter window, animations of the other player's plays). Cloud Functions need
  Firebase's pay-as-you-go plan (cheap at small sizes, but a card must be on file). Every move
  waits for a round trip to the server.

### C. Clever cryptography with no referee ("mental poker")

The two browsers shuffle together with locked boxes, so neither alone knows the order.

- Mentioned only to rule it out: very complex, slow on phones, and easy to get wrong.

## Recommendation

**Build A first, and build it so it can grow into B.** Play a Friend is for friends, and A gets it
into players' hands soonest. To keep the door to B open:
- Online moves go only through the front door (`move()`), which is already the rule.
- Each browser treats the other player's hand as unknown in everything it *shows*: the screen
  already does; the battle log must not name a card from the other hand before it is played,
  and the seed line is left out of online matches.
- The setup (seed and deck lists) is agreed at the start, then kept out of sight.
  A simple guard against one side choosing a "lucky" seed: each browser picks half of it.

## Decided by the owner (21 Nov): always pause when there is spare mana

**The counter window gives something away.** Today, when you play a card, the game pauses to ask
the other player "Respond?" only if they hold a counter spell they can pay for. So the pause
itself tells you they hold one. Online, that would be a real tell.

The owner chose to **pause briefly whenever the other player has spare mana**, whether or not they
hold a counter, so the pause tells nothing. (The two options not chosen: keep the tell as it is,
or pause sometimes as a bluff.)

Left to tune when Play a Friend is built (Claude's guesses, the owner can overrule):
- The pause is about a second, and the other player can skip it.
- "Spare mana" means enough unspent mana for the cheapest counter in the game, so a player with
  no mana to counter anything isn't slowed down for nothing.
- The pause is for online matches only. Matches against the computer keep today's behaviour,
  since the computer can't read a pause.

## What A needs, step by step (for when the Firebase project exists)

1. A "room" in the Firebase database: two players, the agreed setup, and the move list.
2. Each browser adds its own moves to the list and plays the other player's moves as they
   arrive, through `move()`. If a move is refused, the match stops with the bug report
   (the two browsers have fallen out of step).
3. Joining and rejoining: a returning player replays the move list (`replayMatch()`) to catch up.
4. Hide the seed line and the other hand in the battle log for online matches.
5. Undo and the Testing tools are switched off online.
6. Tests: two pretend browsers in Node play a match through a pretend database and must end in
   the same position.

- The Testing tools' moves (`testMana`, `testDraw` in `MOVES`, `js/engine.js`) are real moves, so a
  friend's browser could send them. Refuse them in online matches (found by the code review, Nov 2026).
