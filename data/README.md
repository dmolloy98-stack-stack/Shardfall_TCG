# Shardfall data

Everything the game knows about cards, decks and rules lives in this folder as plain CSV files, one table per file. The game reads them every time it loads, so a change here shows up the next time you open or refresh the game.

GitHub shows each file as a table. To change one:

- **On GitHub:** open the file, click the pencil icon, edit the row, and commit.
- **In Excel or Google Sheets:** open the file, edit it, save or download it as **CSV**, and upload it back here with the same file name.

If a file has a mistake the game can't read (for example, a deck lists a CardID that doesn't exist), the game shows an error naming the problem instead of starting.

## Tips for editing

- **IDs are permanent.** `CardID`, `DeckID`, `SkillID` and `FactionID` link the files together. You can rename what players see (`Name`) any time, but don't change an ID once a deck uses it.
- **Commas inside a value** need the whole value in double quotes: `"When played, search your deck"`. Spreadsheet apps do this for you.
- **Stats** are written `Attack+Health`, for example `2+1`. Use `---` for cards without stats.
- **Skills** are joined with `+`, for example `Signal+Rally`. Use `---` for none. Skill names must match the `Name` column in `skills.csv`.
- **Ability text** is what players read. The **Effect** column is what the game actually does (see "Writing effects" below). Keep the two saying the same thing. Changing numbers in either works straight away; most new abilities can be built from the effect actions without any code.
- **Card and deck builder.** New cards and decks can also be designed in the Google Sheet "Shardfall – card and deck builder" and added by Claude; see CLAUDE.md.
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
| Stats | `Attack+Health`, or `---` |
| Skills | Skill names joined with `+`, or `---` |
| Ability | The card's rules text |
| Description | Optional flavor text |
| ArtKey | Picture name: the game shows `assets/cards/<ArtKey>.png` if that file exists |
| Effect | What the card does, written with the actions below. Leave empty for a card with no ability |

### Writing effects (the Effect column)

An effect is one or more **clauses** separated by `;`. A clause starts with **when** it happens, then a colon, then one or more **actions** separated by commas:

```
play: target character harm, damage target 1+boost
endTurn: buff self 0 2
cost: set 1 if #allies.Monkey>=3
```

If a value has a comma in it (any effect with two actions), the whole Effect cell needs double quotes. Spreadsheet apps add them for you. If an effect has a mistake, the game shows an error naming the card instead of starting.

**When**

| When | Happens |
|---|---|
| `play` | A spell is cast, a Signal character enters, an area is played, or an ability is used (IP Man, Kenshi's Blade, Data Transfer) |
| `enter` | The character enters the field |
| `endTurn` | At the end of its owner's turn. On equipment: at the end of the holder's owner's turn |
| `attack` | The character attacks |
| `hurt` | The character takes damage and survives |
| `reanimate` | The character comes back through Reanimate |
| `allyLevelUp` | Another of its owner's characters levels up |
| `gearEnters` | Equipment enters its owner's field |
| `maxLevel` | The character reaches its last level |
| `cost` | Changes the card's mana cost: `reduce <number>` or `set <number>` |
| `aura` | A lasting bonus while the character or area is on the field: `aura: buff <who> <attack> <health>`, or a skill: `aura: grant <who> <Skill>` (Parry and Swift). This is how an area boosts characters, for example `aura: buff allies.Monkey 1 0` |
| `grants` | Equipment only: the holder has these skills, for example `grants: Swift` |
| `counter` | Makes the card a counter spell and says what it can stop: `character`, `spell`, `spellSingle` (a spell aimed at one character or area) or `spellMany` (a spell not aimed at one thing). For example `counter: character spell`. A counter is not played on your own turn: when the other player plays a card it can stop, the game asks you, and it costs mana you left unspent |
| `rule` | Switches on one of the game's special rules for this card (table below), for example `rule: redirect` |

**Special rules.** A few cards, mostly the champions, bend the core rules. Each of those rules has a name, and any card can be given one in a `rule:` clause. The game never looks at a card's name, so you can rename a card freely, and a new card can reuse a rule.

| Rule | What it does | Used by |
|---|---|---|
| `lord <Faction> <n>` | While it's on the field (either side), that faction's cards get +n to each stat, its spells deal or give n more, and curse spells can't target its cards | The Simplistic |
| `redirect` | Once per turn, the first damage to it or its player goes to an enemy of its player's choice | IP Man |
| `shepherd <Faction>` | When another of your cards of that faction dies: absorb its stats, or return it to your hand | Soul Shepard |
| `defend <n>` | +n to all stats while defending | The Man Ape |
| `sacrifice <Faction>` | After your Battle phase you may sacrifice one of that faction for +1 to all stats and a full heal | The Man Ape |
| `freeEquip` | Your equipment costs nothing | Sensei |
| `equipCostMax <n>` | Equipping this character costs at most n | Weapons Enthusiast |
| `levelGain <attack> <health>` | What each Level Up gives it | Pesky Programmer |
| `levelCap <n or none>` | How many times it can Level Up | Boss Level |
| `survive <fights> <CardID>` | Transforms into that card after living through that many fights | Black Belt Student |
| `activate` | An area whose play effect you may use once in each of your Setup phases | Data Transfer |
| `strike` | Equipment whose play effect its holder may use once per Battle phase | Kenshi's Blade |
| `teach <Skill>` | Equipment that gives its holder the skill for good | API Key |

**Picking a target.** In a `play` clause, start with `target <kind> <intent>`, then use `target` as the "who" in the actions:

- kind: `character`, `characterOrPlayer` or `area`. Narrow it with dots: `character.enemy`, `character.mine`, `character.leveler` (has Level Up), `character.mine.levels` (has kept levels).
- intent: `harm`, `help` or `steal`. This tells the computer player how to use it.

**Who** an action affects: `self` (this card), `target`, `holder` (the character holding this equipment), `allies` (your characters), `enemies`, `everyone` (all characters), `me`, `foe` (the players) and `gear` (stored equipment on both backlines). Narrow a group with dots: a faction (`allies.Monkey`), a race from the Race column (`allies.Undead`), a CardID (`allies.simple_farmer`), `other` (not this card), `leveler`, `strongest`.

**Numbers** can be whole numbers or these words, joined with `+` or `-`:

| Word | Means |
|---|---|
| `#allies.Monkey` | How many there are |
| `#allies.Monkey>=3` | 1 if there are at least 3, otherwise 0 |
| `boost` | +3 on Simple spells while The Simplistic is out |
| `ripen` | 1 after Ripen was cast |
| `amount` | The damage being redirected (IP Man) |

Any action can end with `if <number>`: it only happens when the number is more than 0, for example `if #allies.simple_farmer>=3`.

**Actions**

| Action | Does |
|---|---|
| `damage <who> <n>` | Deals n damage to characters or players |
| `damageAll <n>` | n damage to every character and both players |
| `buff <who> <attack> <health>` | Adds to attack and health (use negative numbers to lower them) |
| `shrink <who> <n>` | Loses n attack and n health |
| `setStats <who> <attack> <health>` | Stats become exactly these |
| `loseAttack <who> <n>` | Loses n attack (not below 0) |
| `grow <who> <n>` | Gains n health for good (raises its full health too) |
| `levelUp <who> <n>` | Levels up n times |
| `destroy <who>` | Destroys the character, ignoring Reanimate |
| `destroyArea <who>` | Destroys an area |
| `grant <who> <Skill> [temp]` | Gives a skill; `temp` = until its owner's next turn |
| `removeSkill <who> <Skill>` | Takes a skill away |
| `disable <who>` | Removes all skills and abilities |
| `convert <who> [reanimate]` | Turns it into a Zombie under your control |
| `transform <who> <CardID>` | Becomes another card |
| `heal <me/foe> <n>` | The player gains n health |
| `maxMana <me/foe> <n>` | Changes maximum mana (negative to take it away) |
| `draw <me/foe> <n>` | Draws n cards |
| `discardHand <me/foe>` | Discards the whole hand |
| `fetch <CardID>` | Takes that card from your deck into your hand |
| `shuffle` | Shuffles your deck |
| `summon <CardID> <n>` | Puts n new copies onto your field |
| `summonFromDeck <CardID>` | Moves that card from your deck onto your field |
| `flag ripen` | Remembers that Ripen was cast |
| `say <who> "TEXT" <color>` | Shows a word over the card, like `"+1 ATK" #ffe066` |
| `script <name>` | Runs a one-off ability written in `js/effects.js` |

**Cards whose rules stay in code.** A few cards change how the game itself works, so their Effect is empty or a `script`: The Simplistic, IP Man (his redirect), The Man Ape, Soul Shepard, Boss Level, Pesky Programmer, Sensei, Weapons Enthusiast, Kenshi's Blade (the once-per-battle use), Black Belt Student, API Key (the Level Up it gives). Ask for code when a new card needs a rule like these.

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
| Frame | Card frame shape: `chip` (rounded), `cut` (cut corners), `faceted` (uneven cuts and a shaded edge), `crystal` (crystals past the corners) or `shard` (jagged edge, spikes, cracks and a glint). Rarer cards should get spikier frames. |

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
| max_hand_size | Most cards a hand can hold; a card drawn or returned to a full hand goes to the graveyard |
| mana_growth_per_turn | Maximum mana gained each turn |
| max_field_backline | Most cards on one side's backline (areas and stored equipment together) |
| max_field_characters | Optional. Leave it out for no limit on characters (the default) |
| min_deck_size, max_copies, max_unknown_copies, max_unknown_kinds | Deck-building rules (max_unknown_kinds: how many different Unknown cards, the champions, a deck may hold) |

### phases.csv and ui_text.csv

Phase names and the one-line instructions shown on the board, plus a few button labels and the names of the two rows on each side of the table (`zone_frontline` and `zone_backline`). Change the wording freely; the order of phases is fixed by the game.
