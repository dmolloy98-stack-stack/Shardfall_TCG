# Code map

How Shardfall's files fit together. Update this page when files are added, split or renamed.
It doesn't need updating for ordinary changes inside a file. For a one-line summary of
every file, see the file table in the [README](../README.md).

## The big picture

All the rules and the whole game state live in `js/engine.js`. The state is a single object
called `S`: hands, board, health, mana, whose turn it is. The engine never draws anything.
Moves come in from three places, card data comes in from the tables, and the result goes out
to the screen.

```mermaid
flowchart LR
  csv["Card tables<br/>data/*.csv"] -->|read once at start| data["Loader<br/>js/data.js"]
  data -->|Effect column| fx_text["Card abilities<br/>js/effects.js"]
  data -->|DATA| engine
  fx_text -->|when a card does something| engine

  you["You<br/>js/ui.js · act()"] -->|play a card, attack| engine
  ai["The computer<br/>js/ai.js · aiStep()"] -->|picks a move| engine
  tut["The tutorial<br/>js/tutorial.js"] -->|blocks wrong moves| engine

  engine[["The rules<br/>js/engine.js<br/>S = the whole game"]]

  engine -->|reads S| render["Board drawing<br/>js/ui.js · render()"]
  engine -->|"emit('damage', …)"| fx["Effects<br/>js/fx.js"]
  render --> screen(["The screen<br/>1440×1000 board, scaled to fit"])
  fx --> screen
```

Because the engine never draws, the computer can copy `S`, try a move on the copy
(`simulate()`), and throw the copy away. Undo works the same way: `act()` saves a copy of
`S` before every move.

Kept in the player's browser: settings and hints (`js/help.js`), custom decks
(`js/decks.js`) and campaign progress (`js/campaign.js`).

## When you play a card

Every move takes the same route, whether it's a card, an attack or an area.

```mermaid
flowchart LR
  a["1. You drag a card<br/>ui.js"] --> b["2. Save a copy for Undo<br/>ui.js · act()"]
  b --> c[["3. Check mana, place card<br/>engine.js"]]
  c --> d["4. Its ability runs<br/>effects.js"]
  d --> e["5. Hits shake, numbers pop<br/>fx.js"]
  e --> f["6. Board is redrawn<br/>ui.js · render()"]
  f --> g["7. Computer's turn? It moves<br/>ai.js"]
  g -.->|back through the rules| c
```

Step 3 is the only place the rules live. If a card does the wrong thing, the fix is in
`engine.js` or the card's Effect text. If it looks wrong, the fix is in `ui.js`, `fx.js` or
`css/style.css`.

## How the screens connect

```mermaid
flowchart LR
  intro["Intro<br/>intro.js"] --> menu[["Main menu<br/>ui.js"]]
  menu -->|Start game| pick["Pick decks<br/>ui.js"]
  pick -->|Create your own| builder["Deck builder<br/>decks.js"]
  pick -->|starter or saved deck| match(["The match<br/>engine + ui + fx"])
  menu --> campaign["Campaign<br/>campaign.js"] --> match
  menu --> tutorial["Tutorial<br/>tutorial.js"] --> match
  menu --> guide["How to play<br/>help.js · guide.js"]
  menu --> almanac["Almanac<br/>ui.js"]
  menu --> settings["Settings<br/>ui.js · help.js"]
```

The campaign and the tutorial are wrappers around a normal match. They pick the decks and add
their own story or coaching, then hand over to the same engine.

## Where to change things

| To change… | Go to |
|---|---|
| Card stats, costs, abilities, deck lists, rule numbers | `data/*.csv` (or the card and deck builder sheet) |
| A new column in a table | `js/data.js` |
| A new kind of card ability | `js/effects.js` |
| How the game plays: turns, phases, combat, winning | `js/engine.js` |
| How smart or aggressive the computer is | `js/ai.js` |
| Layout, card look, menus, phone layout | `js/ui.js` |
| Animations and feedback | `js/fx.js` and `css/style.css` |
| Colours and sizes | `css/style.css` |
| A new menu button | `index.html`, then `js/ui.js` |
| Intro wording | `js/intro.js` |
| Tutorial steps | `js/tutorial.js` |
| Campaign order and story | `js/campaign.js` |
| Deck-building rules | `js/decks.js` and `data/game_rules.csv` |
| Hint wording and settings | `js/help.js` |
| The playable single-file copy | `tools/build-single.js` |

## Size and shape

About 4,900 lines of JavaScript in 12 files (November 2026). The largest is `js/ui.js` at about
1,375 lines. It mixes the menu, the Almanac, board drawing and input, so it is the first
candidate to split if it passes about 2,000 lines.

An automatic tool, [Graphify](https://github.com/Graphify-Labs/graphify), found the same
structure. Its busiest functions were `emit()`, `render()`, `playCard()` and `attack()`. A
tool like that becomes worth running regularly once the code is around 20,000 lines.
