# The world of Shardfall

Notes on the story, tone and characters, to keep the game consistent as it grows.
Edit this file whenever the story changes. Open questions are listed at the end.

## The Shardfall

- Once there were many separate worlds, each one whole.
- The worlds collided. The universe shattered, and its pieces, the **shards**, now fall
  everywhere. That is why the factions, which come from different worlds, meet at all.
- **What caused it is a mystery.** The other champions believe the Zombie faction had
  something to do with it. In truth the Zombies are just another victim (see "The hidden
  story").

## Shards are cards

- Every card is a shard, and each shard holds a power of its own. Every card should
  feel meaningful.
- The more shards a faction holds, the better its chances of survival. That is what the
  five factions fight over.
- In the story and flavor text, cards can be called shards. **In the rules and on
  buttons, they stay "cards"**, so new players aren't confused.

## Shardkeepers

- A **Shardkeeper** is someone who can command shards: the player, and each faction's
  champion.
- Shards fall everywhere. A battle happens when two or more Shardkeepers meet.
- The player's goal: use creativity and knowledge of the shards to make the universe
  whole again, so the shards stop falling.
- The story is told from a distance (no "you" in narration), for now.

## The five factions

Each faction comes from a different world.

| Faction | Champion (Unknown card) | Personality |
|---|---|---|
| Simple | The Simplistic | TBD |
| Monkey | The Man Ape | TBD |
| Zombie | Soul Shepard | TBD |
| Fighter | IP Man | TBD |
| Digital | Boss Level | TBD |

- The champion is each faction's "top dog" card, of Unknown rarity.
- **Deck rule:** a deck holds only one kind of Unknown card (its champion), with up to
  2 copies. This is `max_unknown_kinds` and `max_unknown_copies` in
  `data/game_rules.csv`.
- Champions' personalities, and the art that shows them, are still to be decided.
- Later, champions may speak during matches (taunts, reactions).

## Tone

- **Playful on the surface, with a deep, dark story hidden underneath.**
- Touchstone: *Adventure Time*. It's mostly playful, with dark twists for those who
  look closely.
- Darker decks, starting with Zombie, are where the dark side shows most.

## The hidden story

- Clues are scattered **everywhere, but hidden well enough that they're very hard to
  notice**, like the clues to the One Piece in *One Piece*.
- Places for clues: card descriptions (flavor text, mostly empty today), small art
  details, the intro, names, and the order of things.
- Keep a log of every clue below, so the story stays consistent.

### Clue log

| Where | Clue | What it hints at |
|---|---|---|
| Intro, first window ("each one was whole") | One green glass pane in the second ring is already cracked, before the worlds collide | Something was broken before the collision. Green is the Zombie color, which points suspicion their way |

## The intro (cold open)

- About 20 seconds of still stained-glass panels with on-screen text, before the main
  menu, **every time the game opens**, with a Skip button. Tap to move on.
- First-time players are then offered the tutorial.
- Watch it again: Settings → Watch the intro. To open the game without it, use a link
  ending in `#menu`.
- The text lives in `js/intro.js` (`INTRO_PANELS`). It is a placeholder to be rewritten.

## Open questions

- Champion personalities and art.
- Do rarities mean something in the story? One idea: Unknown shards are fragments from
  the moment of the break, which would explain why there is only one per deck.
- Is there a place at the center of it all, for example the altar on the board?
- Who makes the art.
