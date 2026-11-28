# Shardfall data

Everything the game knows about cards, decks and rules lives in this folder as plain CSV files, one table per file. The game reads them every time it loads, so a change here shows up the next time you open or refresh the game.

GitHub shows each file as a table. To change one:

- **On GitHub:** open the file, click the pencil icon, edit the row, and commit.
- **In Excel or Google Sheets:** open the file, edit it, save or download it as **CSV**, and upload it back here with the same file name.

If a file has a mistake the game can't read (for example, a deck lists a CardID that doesn't exist, or an Effect uses a word the game doesn't know), the game shows a message naming the file, the row and the problem instead of starting. A mistake it can live with (a deck breaking the deck rules) shows as a note at the top of the menu. GitHub's tests fail with the same message, so a red mark on a change says what to fix.

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
| Tribes | A character's species, joined with `+` (`Human+Monkey`): `Villager`, `Human`, `Monkey`, `Zombie`, `Martial Artist`, `Program`, `Rat`, `Plant`, `Goblin`. `---` for anything that isn't a character. A new tribe only needs its name here. A tribe can also belong to a family (see `tribe_family_` in game_rules.csv): Zombie counts as Undead |
| Fracture | Where a card is from: a FactionID from factions.csv, or `N/A` for an Unbound card. A hybrid lists two, joined with `+` (`Mortal+Wild`); the first sets its color. (The column was called Faction; the file `factions.csv` keeps its name) |
| Stats | `Attack+Health`, or `---` |
| Skills | Skill names joined with `+`, or `---` |
| Ability | The card's rules text |
| Description | The card's story (flavor text, a few words to a few sentences). Hidden until the player has played the card once (see "Card stories" in docs/world.md). "Flavor text" in the card sheet |
| ArtKey | Picture name: the game shows `assets/cards/<ArtKey>.png` if that file exists |
| Effect | What the card does, written with the actions below. Leave empty for a card with no ability |
| Classes | A character's job, joined with `+` (`Master+Fighter`): `Warrior`, `Mage`, `Scout`, `Guardian`, `Worker`, `Student`, `Master`, `Fighter`. `---` for anything that isn't a character |

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
| `aura` | A lasting bonus while the character or area is on the field: `aura: buff <who> <attack> <health>`, or a skill: `aura: grant <who> <Skill>` (any skill checked during play: Swift, Parry, Protected, Pierce, Cloak, Challenge, Tower, Overwhelm, Flash). This is how an area boosts characters, for example `aura: buff allies.Monkey 1 0` |
| `grants` | Equipment only: the holder has these skills, for example `grants: Swift` (the same skills as `aura: grant`) |
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

**Who** an action affects: `self` (this card), `target`, `holder` (the character holding this equipment), `allies` (your characters), `enemies`, `everyone` (all characters), `me`, `foe` (the players) and `gear` (stored equipment on both backlines). For cards that aren't on the table there are four **piles**: `grave` (your graveyard), `graves` (both graveyards), `deck` and `hand`; they never hold tokens (cards made during play). Narrow a group with dots: a fracture (`allies.Monkey`), a tribe or tribe family (`allies.Zombie` is the fracture, `allies.tribe:Zombie` the tribe, `allies.Undead` the family), a class (`allies.Student`), a CardID (`allies.simple_farmer`), `other` (not this card), `leveler`, `swift`, `tower`, `strongest`, a kind of card (`character`, `spell`, `equipment`, `area`), a printed cost (`cost<=2`, `cost>=4`, `cost=3`), any skill with `has:` in front (`has:Reanimate`), and `not:` in front of any of these for the opposite (`not:primate`). Add the kind in front when one name is two things: Fighter is both a fracture and a class, so `allies.Fighter` means the fracture and `allies.class:Fighter` the class (`fracture:`, `tribe:` and `class:` all work). Filters add up: `allies.class:Student.class:Fighter` is your Students who are also Fighters.

**Numbers** can be whole numbers or these words, joined with `+` or `-`:

| Word | Means |
|---|---|
| `#allies.Monkey` | How many there are |
| `#allies.Monkey>=3` | 1 if there are at least 3, otherwise 0 |
| `boost` | +3 on Simple spells while The Simplistic is out |
| `statline` | This card's Attack plus Health |
| `2*#enemies` | Numbers can be multiplied with `*` (worked out before `+` and `-`): Simplicity heals `2*#enemies+boost*#enemies` |
| `ripen` | 1 after Ripen was cast |
| `amount` | The damage being redirected (IP Man) |

Any action can end with `if <number>`: it only happens when the number is more than 0, for example `if #allies.simple_farmer>=3`.

**Actions**

| Action | Does |
|---|---|
| `damage <who> <n>` | Deals n damage to characters or players |
| `damageAll <n> [other]` | n damage to every character and both players; `other` spares this card (Zombombadier: `damageAll statline other`) |
| `buff <who> <attack> <health>` | Adds to attack and health (use negative numbers to lower them) |
| `shrink <who> <n>` | Loses n attack and n health (all of them first, then any that fall die) |
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
| `summon <CardID or token> <n>` | Puts n new copies onto your field. Tokens are cards made during play, rows of `data/tokens.csv` (same columns as cards.csv; `turtle`: Master Rat's Turtles) |
| `summonFromDeck <CardID>` | Moves that card from your deck onto your field |
| `flag ripen` | Remembers that Ripen was cast |
| `say <who> "TEXT" <color>` | Shows a word over the card, like `"+1 ATK" #ffe066` |
| `pick <pile> <n> hand\|field ["question"]` | The player picks up to n cards from a pile (`grave.Monkey.character`, `graves.character`) and they go to the hand or back onto the field. Nothing happens if the pile has none. Example: Call of the Jungle, `pick grave.Monkey.character 3 hand "Pick up to 3 Monkey characters to return to your hand."` |
| `take deck.<narrowing> <n> hand\|field` | The top n matching cards of your deck go to your hand or the field, no choice. Example: Primate, `take deck.Monkey.character.cost<=2.not:primate 2 field` |
| `discardDraw ["question"]` | The player discards a card from their hand, then draws one (Rotten Finger) |
| `levelDown <who>` | Takes back one Level Up from a character that has one to give (Data Transfer) |
| `drainLife <who>` | You gain health equal to the character's Attack plus Health (Soul Suction: `drainLife target, damage target 99999`) |
| `script <name>` | Runs a one-off ability written in `js/effects.js` |

**Cards whose rules stay in code.** A few cards change how the game itself works, so their Effect is empty or a `script`: The Simplistic, IP Man (his redirect), The Man Ape, Soul Shepard, Boss Level, Pesky Programmer, Sensei, Weapons Enthusiast, Kenshi's Blade (the once-per-battle use), Black Belt Student, API Key (the Level Up it gives). Ask for code when a new card needs a rule like these.

**Checking an Effect.** `node tools/explain-effect.js "play: damage target 2"` (or a CardID, or `--all`) says in plain English what the game will do with it, or what is wrong. Ask Claude to run it on new cards.

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
| FactionID | The world (fracture), as written in cards.csv, decks.csv and ai_styles.csv |
| Name | The world's name as players read it on cards, filters and the Almanac |
| ColorR, ColorG, ColorB | Its color, each from 0 to 1 |
| SymbolKey | Its medallion symbol: `sprout`, `paw`, `skull`, `swords` or `chip` (a new symbol needs code) |
| Description | Short description |
| DisplayOrder | Sort order |
| Entrance | How its cards arrive on the table: `sprout`, `bounce`, `rise`, `stance` or `glitch` (empty: they assemble) |
| Death | How its characters leave the table: `shatter`, `tumble`, `sink`, `slash` or `pixel` |

A new world can reuse any symbol, entrance and death, so it needs no code. `tools/data-test.js`
fails if one of these words is unknown.

### tokens.csv

Cards made during play by another card's Effect (`summon turtle 4`, Master Rat's Turtles). The same
columns as cards.csv. Tokens never go in a deck, aren't shown in the Almanac or the deck builder,
never go back to a hand and never come back from a graveyard.

### game_rules.csv: balance numbers

| RuleID | Meaning |
|---|---|
| starting_player_health | Health each player starts with |
| starting_hand_size | Cards in the opening hand |
| max_hand_size | Most cards a hand can hold; a card drawn or returned to a full hand goes to the graveyard |
| mana_growth_per_turn | Maximum mana gained each turn |
| max_field_backline | Most cards on one side's backline (areas and stored equipment together) |
| max_field_characters | Optional. Leave it out for no limit on characters (the default) |
| event_rounds | The rounds a random event (a mini shard fall) hits the table, separated by `\|`, for example `4\|12` (a round is one player's turn, shown as Round). Empty turns events off |
| event_warning_rounds | How many rounds ahead the next event is announced |
| event_length | How many rounds a random event lasts; 2 is one turn for each player |
| shard_round | The round the big shard falls into the middle of the table, once a match. 0 turns it off |
| shard_health | Health of the big shard |
| shard_draw | Cards the player who breaks the big shard draws, on top of their champion's shard bonus |
| shard_draw_no_champion | Cards the player who breaks the big shard draws when their deck has no champion |
| tribe_family_<Name> | (None in use.) A wider name for several tribes, separated by `\|`. Undead used to be one; it is now a fracture. Cards that say Undead (Soul Shepard, Midnight Madness, Rise from the Dead) then reach them all. Another family is another `tribe_family_<Name>` row |
| min_deck_size, max_copies, max_unknown_copies, max_unknown_kinds | Deck-building rules (max_unknown_kinds: how many different Unknown cards, the champions, a deck may hold) |

### events.csv: random events

**Switched off for now** (27 Nov 2026): the campaign, Play vs Computer and Two players have no random events. They are kept for a later "shake-up" mode. In a match that has them, in the rounds listed in `event_rounds` in game_rules.csv (4 and 12), one of these hits the table for both players and lasts `event_length` rounds (2: one turn each): a mini shard fall. The next one is announced two rounds ahead. (The big shard fall in round 8 is separate; see `shard_round`.)

| Column | Meaning |
|---|---|
| EventID | Permanent ID. The game's rules key on it, so don't change it |
| Name | Name shown on the warning card |
| Description | One short sentence shown under the name |

You can rename an event or reword its description here. What an event *does* is written in `js/rules-events.js`, so a new event needs code. The four today: `spell_surge` (spells cost 1 less), `tremor` (every character takes 1 damage), `windfall` (each player draws an extra card; a full hand or empty deck is skipped) and `amplified_areas` (area bonuses are doubled).

### champion_abilities.csv: the champions' abilities

A deck that holds a champion (an Unknown card) gets that champion's ability from turn one, even before the champion card is drawn. Every ability is always on. Some level up once in a match (they have a Goal); the others leave LevelUpWhen, Then, Goal and Counts empty.

| Column | Meaning |
|---|---|
| ChampionID | The champion's CardID. The game's rules key on it, so don't change it |
| AbilityName | Name shown under the player's name |
| Now | What the ability does at the start (level 1) |
| LevelUpWhen | What makes it level up (empty for an ability with no levels) |
| Then | What it does after leveling up |
| Goal | The number the progress counts up to (the code uses this number, so change it here, not in the text only) |
| Counts | What the progress counts, in a few words ("Fights won") |

You can reword the text freely. What each ability does is written in `js/rules-champions.js` (one entry per champion), so a new ability needs code. Each champion's bonus for breaking the big shard is in the same entry. Soul Shepard's growth is a `rule: grieve Any 10` on its own card in cards.csv: +1 Health for each of the first 10 characters that die (are sent to a graveyard from the table, either side), then +1 Attack for each one after. Its Goal here must be the same number (`tools/champions-test.js` checks).

### whats_new.csv: the "What's new" list

One row per update, newest first: **Update** (the pull request number), **Date** (YYYY-MM-DD) and
**Changes**, what a player would notice in plain words, separated by `|`. The top row is the
version the menu shows ("Update 30 · What's new") and the one a bug report names. Changes nobody
playing would notice (tests, tools, tidying) are left out.

### phases.csv and ui_text.csv

Phase names and the one-line instructions shown on the board (phases.csv), and the words players read (ui_text.csv). Change the wording freely; the order of phases is fixed by the game.

**ui_text.csv** holds the words of the start menu, Settings, the save code window, the game menu, What's new, the "Something went wrong" window, the "pass the device" screen and the end of a match, plus the names of the table's two rows (`zone_frontline`, `zone_backline`). The **Category** column says where each appears. Words in curly brackets, like `{name}` or `{round}`, are filled in by the game: keep them, but you may move them around the sentence. Other screens (the tutorial, the campaign, champions' lines, help) still have their words in the code and are being moved here a screen at a time.
