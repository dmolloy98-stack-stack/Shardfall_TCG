# Shardfall data

Everything the game knows about cards, decks and rules lives in this folder as plain CSV files, one table per file. The game reads them every time it loads, so a change here shows up the next time you open or refresh the game.

GitHub shows each file as a table. To change one:

- **On GitHub:** open the file, click the pencil icon, edit the row, and commit.
- **In Excel or Google Sheets:** open the file, edit it, save or download it as **CSV**, and upload it back here with the same file name.

If a file has a mistake the game can't read (for example, a deck lists a CardID that doesn't exist), the game shows an error naming the problem instead of starting.

## Tips for editing

- **IDs are permanent.** `CardID`, `DeckID`, `SkillID` and `FactionID` link the files together. You can rename what players see (`Name`) any time, but don't change an ID once a deck uses it.
- **Commas inside a value** need the whole value in double quotes: `"When played, search your deck"`. Spreadsheet apps do this for you.
- **Stats** are written `Attack+Health+Speed`, for example `2+1+1`. Use `---` for cards without stats.
- **Skills** are joined with `+`, for example `Signal+Rally`. Use `---` for none. Skill names must match the `Name` column in `skills.csv`.
- **Ability text** describes what a card does. Changing the numbers on a card (cost, stats, skills) works straight away. A brand-new *ability* also needs game code, so ask for that when you add one.
- **Changes are saved per file.** If you edit in a spreadsheet, export only the sheet you changed.

## The files

### cards.csv: every card in the game

| Column | Meaning |
|---|---|
| CardID | Permanent ID, lowercase with underscores (`simple_farmer`) |
| Cost | Mana cost |
| Name | Name shown on the card |
| Rarity | `Basic`, `Rare`, `Exotic`, `Divine` or `Unknown` (see rarities.csv) |
| Type | `Character`, `Spell`, `Equipment` or `Area` |
| Race | `Animal`, `Undead`, `Goblin`, or `N/A` |
| Faction | A FactionID from factions.csv, or `N/A` for neutral cards |
| Stats | `Attack+Health+Speed`, or `---` |
| Skills | Skill names joined with `+`, or `---` |
| Ability | The card's rules text |
| Description | Optional flavor text |
| ArtKey | Picture name: the game shows `assets/cards/<ArtKey>.png` if that file exists |

### decks.csv: the starter decks shown on the menu

| Column | Meaning |
|---|---|
| DeckID | Permanent ID |
| Name | Name on the deck picker |
| Faction | The deck's faction (sets its color and symbol) |
| Description | One line shown on the deck picker |
| IsPlayable | `true` to show the deck on the menu |
| IsAI | Reserved for computer-only decks; currently unused |
| CardList | `CardID:copies` pairs joined with `|`, for example `simple_farmer:4|sword:2` |

Deck rules (set in game_rules.csv): at least 35 cards, at most 4 copies of a card, and at most 2 copies of an Unknown card. A deck that breaks a rule still loads, and a warning appears in the browser console.

### skills.csv: skill keywords

| Column | Meaning |
|---|---|
| SkillID | Permanent ID |
| Name | Name used on cards and in cards.csv |
| IconKey | Symbol shown on cards |
| Description | Explanation shown in card details and the Almanac |
| DisplayOrder | Order in the Almanac's Skills tab |

### rarities.csv

| Column | Meaning |
|---|---|
| RarityID / Name | The rarity |
| EdgeR, EdgeG, EdgeB | Card edge color, each from 0 to 1 |
| EquipmentAttachCost | Mana to attach equipment of this rarity from the equipment row |
| DisplayOrder | Sort order |

### factions.csv

| Column | Meaning |
|---|---|
| FactionID / Name | The faction, as used in cards.csv and decks.csv |
| ColorR, ColorG, ColorB | Faction color, each from 0 to 1 |
| SymbolKey | Which medallion symbol to draw |
| Description | Short description |
| DisplayOrder | Sort order |

### game_rules.csv: balance numbers

| RuleID | Meaning |
|---|---|
| starting_player_health | Health each player starts with |
| starting_hand_size | Cards in the opening hand |
| mana_growth_per_turn | Maximum mana gained each turn |
| max_field_backline | Most cards on one side's backline (areas and stored equipment together) |
| max_field_characters | Optional. Leave it out for no limit on characters (the default) |
| min_deck_size, max_copies, max_unknown_copies, max_unknown_kinds | Deck-building rules (max_unknown_kinds: how many different Unknown cards, the champions, a deck may hold) |

### phases.csv and ui_text.csv

Phase names and the one-line instructions shown on the board, plus a few button labels and the names of the two rows on each side of the table (`zone_frontline` and `zone_backline`). Change the wording freely; the order of phases is fixed by the game.
