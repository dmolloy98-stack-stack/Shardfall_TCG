---
name: story-writing
description: >
  Writing Shardfall's story text: champion lines and reactions, campaign scenes, card stories
  (flavor text), the intro, and hidden clues about the Shardfall. Use whenever new words for
  players are needed that carry personality or story, or when a clue is added or changed.
---

# Writing Shardfall's story text

**Story is the owner's.** Claude drafts; the owner approves. Never change a champion's
personality, a card's story or the hidden story unasked. For new lines, show drafts (2–3
options where there's a real choice, with a recommendation) and wait. Only put approved words
in the game.

## Read first

`docs/world.md` is the story bible: the setting, each fracture, the tone, **the hidden truth
(spoilers)** and the **clue log**. Read the parts that matter before drafting.

Tone: playful on the surface, with a dark story underneath (touchstone: *Adventure Time*).
Darker decks (the Undead world first) show more of the dark side. Clues are **very hard to notice**
(like One Piece). Early campaign fights get subtler clues than late ones.

## The champions' voices

A champion is the strongest of its tribe, known across every world. A tribe may have more than
one champion; a deck holds only one. Worlds (fractures) are broad; tribes and classes tell cards
apart (see "Fractures, tribes and classes" in `docs/world.md`).

The full personalities are in `js/champions.js` (`CHAMPIONS`, with the line keys explained at the
top) and `docs/world.md`. Short version:
- **The Simplistic** (Simple world; leads the Villagers): calm, plain, "why fight?". **Repeats its lines word for word, and
  every new line must reuse an old one exactly.** That's a clue that it's robotic (made by Boss
  Level). Never give it a fresh line.
- **The Man Ape** (Wild world; leads the Monkeys): loud, possessive, bananas and shards ("My jungle. My shards.").
- **IP Man** (Mortal world; leads the Martial Artists): polite and calm, a teacher; bows (`*bows*`); every fight is a lesson.
- **Boss Level** (Cyber world; leads the Programs): video-game talk (levels, continues, final boss); its motive is
  "level up". Being fight four, it can carry bolder clues.
- **Soul Shepard** (Undead world; leads the Zombies): gentle and sad; tends the fallen; blamed for the Shardfall but a
  victim.

## Where words live

| What | File |
|---|---|
| Champion in-match lines, tag, AI style | `js/champions.js` (`CHAMPIONS[...].lines`, keys: start, champion, hurt, low, hit, win, lose, shardLost, shardWon, fell, brink, outnumber, recallWin, recallLose) |
| Campaign story card (intro, scene, says) and the line after a win | `js/champions.js` (each champion's `campaign` entry; `stage` is its place in the order) |
| Card stories (flavor text) | `data/cards.csv` Description column **and** the card sheet's column O "Flavor text" (row = cards.csv line number); keep both the same |
| Intro panels | `js/intro.js` (`INTRO_PANELS`) |

Rules for card stories: a few words up to a few sentences; no rules text; plain English.
Champions speak in the campaign and in normal matches against the computer. They stay quiet
on the killing blow when the line would sound odd (see the `foe.health > 0` guard in
`js/campaign.js`).

## Every new clue

1. Draft it with the plain meaning *and* the hidden meaning, so the owner can judge both.
2. Once approved and in the game, add a row to the **clue log** in `docs/world.md`:
   where | the clue | what it hints at.
3. Never state the truth outright. Check the "truth" section before writing anything about
   Boss Level, the Simplistic or the Zombies.

## Checking

`node tools/champions-test.js .` after changing `js/champions.js`; `node tools/test-all.js`
always. Look at long lines in the browser at phone size (`browser-check`) so speech bubbles
and story cards don't overflow.
