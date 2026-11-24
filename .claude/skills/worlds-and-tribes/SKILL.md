---
name: worlds-and-tribes
description: >
  Renaming or adding a Shardfall fracture (world), tribe, class or champion: every place a name
  lives (data, rules, computer play style, card entrances and deaths, board colours, symbols,
  menus, campaign, tests, guide, docs, story bible, card sheet) and the owner's design rules for
  them. Use for "rename X to Y", a new tribe (Skeleton, Vampire, Cat, Dog), a new world, or a new
  champion.
---

# Worlds, tribes and champions

## The owner's design rules (Nov 2026)

- **A fracture is a broad world** where many tribes and classes live. Tribes and classes are what
  tell cards apart. Today: Simple, Wild, Undead, Mortal, Cyber (and Unbound = none).
- **Tribe** = what a character is (Villager, Monkey, Zombie, Martial Artist, Program, Human, Rat,
  Plant, Goblin; Turtle tokens). **Class** = what it does (Warrior, Mage, Scout, Guardian, Worker,
  Student, Master, Fighter).
- Card text: "Undead" means the Undead **world**; "Zombie" and "Monkey" mean those **tribes**
  only; "Fighter" means the **class**; "Simple" means the world.
- **A champion is the strongest of its tribe**, known across all worlds. A tribe may have several
  champions (a second Villager champion is planned), but **a deck holds only one champion card**
  (`max_unknown_kinds` 1, at most 2 copies). Today: The Simplistic (Villager), The Man Ape (Monkey),
  IP Man (Martial Artist), Boss Level (Program), Soul Shepard (Zombie).
- Infection adds the Zombie tribe but keeps the character's own world.
- Names are the owner's: offer 2–3 options with a recommendation and wait (see `ideas-menu`).
- Names in the fracture, tribe and class lists must not clash (a plain word in an Effect is
  read as fracture first, then tribe, then class; `js/effects.js` `selectorFilter`).

## Every place a fracture name lives (rename all, in one change)

Find them first: `grep -rnI "\bOldName\b" --exclude-dir=.git --exclude-dir=phone-table --exclude-dir=original-lua .`
(deck names like "Monkey Starter" and card names like "Smart Monkey" are not fracture names).

| Where | What |
|---|---|
| `data/factions.csv` | FactionID, Name, colour, SymbolKey, Description |
| `data/cards.csv` | Fracture column (hybrids `Mortal+Wild`) |
| `data/decks.csv` | Faction column of each starter |
| `data/ai_styles.csv` | the Fracture column (how that world's deck plays) |
| `js/campaign.js` | `faction:` of each campaign stage |
| `js/fx.js` | `FACTION_ENTRANCE` (how its cards enter the table) |
| `js/cards.js` | `GLYPHS` (world medallion symbols) |
| `js/table-effects.js` | `DEATHS` (how its cards die) |
| `js/menu.js` | champion ability examples (`c.group === "…"`) |
| `css/style.css` | `.skin-battlefield .side[data-faction="…"]` board colours |
| `js/engine.js` / `js/effects.js` | any script or rule naming it (`inGroup(c, "…")`) |
| `tools/*-test.js` | tests that pick cards by `c.group` |
| `guide.html`, `README.md`, `data/README.md`, `docs/code-map.md` | player and builder docs |
| `docs/world.md` | "Fractures, tribes and classes", the champions table, the clue log |
| Card sheet | Cards column I, Decks column D, Fractures tab, Lists tab, Start here |

## Every place a tribe name lives

`data/cards.csv` Tribes column; `TAG_GLYPHS` in `js/cards.js` (a placeholder symbol; a missing one
shows the first letter, which is fine until art); scripts using `hasTribe(c, "…")` in
`js/effects.js`, `js/engine.js`, `js/campaign.js` (trophies), `js/fx.js` (card reactions); token
tribes in `js/effects.js` (Master Rat's turtles); `tools/kinds-test.js`; the guide's Tribe line;
`data/README.md`; `docs/world.md`; the sheet's Cards column G and Lists tab.

## Adding a new tribe to a world (e.g. Skeleton in Undead)

1. The owner designs the cards (sheet rows marked Ready → `sheet-sync`).
2. The tribe needs no code unless a card says "your Skeletons" (then `hasTribe`). Add a
   `TAG_GLYPHS` placeholder only if a letter isn't clear enough.
3. Cards that say Undead reach it automatically (it is in the Undead world).
4. Update the lists above (guide, data README, world.md, Lists tab).

## Adding a new world

Needs, besides cards: a `factions.csv` row (colour, symbol, description, order), a `GLYPHS`
symbol, a `FACTION_ENTRANCE` animation, a `DEATHS` style (or it shatters like crystal), an
`data/ai_styles.csv` row, a battlefield board colour, and a starter deck. Ask the owner for the name,
colour and feel; Claude proposes the animations.

## Adding a new champion

Needs: the card (Unknown rarity, its tribe), an ability (`data/champion_abilities.csv` +
an entry in `CHAMPION_RULES` in `js/rules-champions.js`, which also holds its shard bonus), voice lines and play style in
`js/champions.js` (`story-writing` for the words), a campaign stage if the owner wants one
(`js/campaign.js`), and tests in `tools/champions-test.js`. Two champions of one tribe can't
share a deck (the one-champion rule already enforces it).
Everything names a champion by its card's CardID (`CHAMPIONS`, `CAMPAIGN`'s `champion`, the
Almanac's `CHAMP_GUIDE`), so **renaming a champion is only a change to its Name in
`data/cards.csv`** (plus the story text that mentions it).

## Checking a rename or addition

1. `node tools/test-all.js`. A real play change moves the fingerprints: update `EXPECTED` and
   CLAUDE.md, and say why.
2. `balance` skill: win rates before and after.
3. `browser-check`: the Almanac's Fracture and Tribe filters, the board, deaths and entrances.
4. Search again for the old name; only deck and card names should remain.
5. Update the card sheet, check its Check columns say OK.
6. `pr-cycle` (push, pull request, merge), then `backup`.
