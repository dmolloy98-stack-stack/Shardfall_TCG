# Shardfall

A two-player fantasy trading card game that runs in the browser. Pick one of four faction decks (Simple, Monkey, Zombie, Fighter) and play against the computer or against a friend on the same device.

This is a port of the original LÖVE2D / Lua version (`original-lua/main.lua`, kept for reference).

## Play it

Open `index.html` in any modern browser. No install, no build step, no server needed.

To put it online, turn on GitHub Pages for this repository (Settings → Pages → deploy from the `main` branch, root folder) and share the link.

## How to play

- Each player starts with 20 health and 6 cards from a 35-card deck. Reduce the other player to 0 health to win. Drawing from an empty deck loses.
- **Draw → Setup → Battle → End.** Your maximum mana grows by 1 each turn, with no cap. The player who goes first skips their first draw.
- **Setup:** drag cards from your hand onto the table, or tap a card and press Play.
- **Battle:** tap one of your characters, then an enemy character, or "Attack directly". The faster character strikes first.
- Tap or right-click any card to read it. Escape or right-click cancels a choice.

The in-game "How to play" button has the full rules.

## Editing cards, decks and rules

All game content lives in `js/data.js` as the same CSV tables the Lua version used (`cards`, `decks`, `skills`, `rarities`, `factions`, `game_rules`, `phases`, `ui_text`). Edit a row, save, and reload the page.

Card art is optional: add `assets/cards/<ArtKey>.png` and it replaces the faction symbol on that card.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `css/style.css` | All styling and animations |
| `js/data.js` | Card, deck and rule data (CSV) and loaders |
| `js/engine.js` | Game rules: turns, combat, skills, card effects |
| `js/ai.js` | Computer opponent |
| `js/ui.js` | Board rendering, input, menu, Almanac |
| `original-lua/main.lua` | The LÖVE2D source this was ported from |

## The starter decks

Each deck has 35 cards and follows the deck rules from the design sheet: at most 4 copies of a card, and at most 2 of an Unknown card.

| Deck | Plan | Cards costing 0–2 / 3–4 / 5+ | Characters |
|---|---|---|---|
| Simple | Flood the field with farmers and simple fighters, then back them with tools | 21 / 8 / 6 | 21 |
| Monkey | Swarm with Rally monkeys so they power each other up (20 Rally characters) | 20 / 3 / 12 | 25 |
| Zombie | Undead walls and corpses that keep coming back, then big payoffs like Plaguemancer and Midnight Madness | 13 / 4 / 18 | 22 |
| Fighter | Cheap martial artists that grow with every piece of equipment | 22 / 5 / 8 | 21 |

The lists were tuned over thousands of computer-vs-computer games. Simple, Monkey and Fighter each win about half their games; Zombie wins about 41%.

## Changes from the Lua version

- **The first player skips their first draw**, to offset the advantage of going first.
- **Rally** gives +1 Attack and Speed (not health), as in the Lua version. Play-testing showed +1 to all stats made Monkey decks too strong.
- **New:** a computer opponent, and a pass-the-device screen between turns in two-player mode.
- **Newly working cards** (they had text but no effect in Lua): Area Denial, Call Back, Disable, Simplicity, Simple Messenger, Ripen, Arboreal Intelligence, Call of the Jungle, Rise from the Dead, They Just Keep Coming, Rotten Finger (now lets you pick the discard), Baboon, The Man Ape (defending bonus) and Tree Branch (cost reduction).
- **Fix:** characters now die when their *displayed* health reaches 0, so area bonuses count toward survival.
- **Not playable yet:** the counter spells (Nullify, Nope for One, Nope for All, Return to Sender, Try Again) need a reaction window the game doesn't have. Kenshi's Blade, IP Man, Soul Shepard and The Simplistic play as normal cards without their special ability, the same as in Lua.
- The Undo and mana/draw testing tools are in the in-game menu under "Testing tools".
