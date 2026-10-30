# Shardfall

A two-player fantasy trading card game that runs in the browser. Pick one of five faction decks (Simple, Monkey, Zombie, Fighter, Digital) and play against the computer or against a friend on the same device.

This is a port of the original LÖVE2D / Lua version (`original-lua/main.lua`, kept for reference).

## Play it

The game loads its cards from the `data/` folder, so it needs to be opened from a web address rather than by double-clicking `index.html`. Either:

- **GitHub Pages (recommended):** in this repository go to Settings → Pages, choose "Deploy from a branch", pick `main` and the root folder, and save. After a minute the game is at `https://dmolloy98-stack-stack.github.io/Shardfall_TCG/`. Every change merged into `main` (including CSV edits) goes live there automatically.
- **On your own computer:** open a terminal in this folder, run `python3 -m http.server`, then visit http://localhost:8000.

## How to play

New players have three kinds of help:

- **Tutorial** (main menu, or `index.html#tutorial`): a five-minute scripted game against a gentle Trainer using Simple cards. A coach box explains one idea at a time, dims the rest of the screen and points at what to tap or drag: reading a card, mana, the four turn steps, playing characters, abilities, equipment, combat and Speed, spells, skills (Signal, Rush, Challenge, Tower) and combining cards.
- **How to play guide** ([`guide.html`](guide.html)): an illustrated page with annotated screenshots of the table, a labelled card, turns, playing cards, battle and how cards work together, plus a skills glossary and beginner words. It's the same page the in-game "How to play" button opens, and it can be shared on its own: `https://dmolloy98-stack-stack.github.io/Shardfall_TCG/guide.html`.
- **Beginner hints**: during a game, a small panel says what you can do right now. Hide it with ✕, turn it off with "Turn off hints", or switch it back on in Settings (main menu or ☰ Menu). The choice is remembered on that device.

First-time visitors are offered the tutorial when the game opens.

**Your own decks:** on the main menu, **Create your own** opens the deck builder. Start from an empty deck or a copy of a starter, tap cards to add them (filter by faction and type, tap **i** to read a card), and watch the deck panel: card count against the 35-card minimum, the mana curve, how many characters, spells, equipment and areas, and tips. Copy limits from `data/game_rules.csv` are enforced. A short walkthrough runs the first time and from **? How to build**. Decks are saved in the browser on that device, appear on the main menu with an Edit button, and can't be started until they reach the minimum size. The computer opponent always uses a starter deck.

**On phones** the game works best held sideways, and it asks you to turn the phone if it's upright (with a "Play upright anyway" option). Because the board is scaled down a lot on a phone, the space beside it is used for large buttons (Menu, Draw card / To battle / To end / Pass turn, Attack directly, Cancel), and in the tutorial for the coach panel, which repeats each step's button at full size. Page scrolling, zooming and long-press menus are switched off on the game screen, and the board stays clear of the notch.

The short version:

- Each player starts with 20 health and 6 cards from a 35-card deck. Reduce the other player to 0 health to win. Drawing from an empty deck loses.
- **Draw → Setup → Battle → End.** Your maximum mana grows by 1 each turn, with no cap. The player who goes first skips their first draw; the player who goes second gets a one-time **+1** mana token beside their mana, usable on any of their turns.
- **Setup:** drag cards from your hand onto the table, or tap a card and press Play.
- **Battle:** tap one of your characters, then an enemy character, or "Attack directly". The faster character strikes first.
- Tap or right-click any card to read it. Escape or right-click cancels a choice.

The guide has the full rules.

## Editing cards, decks and rules

All cards, decks, skills and balance numbers are CSV files in the [`data/`](data/) folder, one table per file:

| File | What's in it |
|---|---|
| [`data/cards.csv`](data/cards.csv) | Every card: cost, stats, skills, rarity, ability text |
| [`data/decks.csv`](data/decks.csv) | The starter decks and their card lists |
| [`data/skills.csv`](data/skills.csv) | Skill keywords and their descriptions |
| [`data/game_rules.csv`](data/game_rules.csv) | Starting health, hand size, mana growth, field limits, deck-building rules |
| [`data/rarities.csv`](data/rarities.csv), [`data/factions.csv`](data/factions.csv) | Colors, symbols, equipment attach costs |
| [`data/phases.csv`](data/phases.csv), [`data/ui_text.csv`](data/ui_text.csv) | Phase names, on-screen instructions, button labels |

GitHub displays each file as a table. Edit it with the pencil icon, or open it in Excel or Google Sheets, then save it as CSV and upload it back. [`data/README.md`](data/README.md) explains every column. In the game, the **Almanac** (on the main menu) shows every card as it currently reads in these files.

Card art is optional: add `assets/cards/<ArtKey>.png` and it replaces the faction symbol on that card.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `guide.html` | The illustrated How to play guide (also shown inside the game) |
| `guide/` | Pictures for the guide, made by `tools/guide-shots.js` |
| `css/style.css` | All styling and animations |
| `data/*.csv` | Cards, decks, skills and rules (see above) |
| `js/data.js` | Loads and checks the CSV files, then starts the game |
| `js/engine.js` | Game rules: turns, combat, skills, card effects |
| `js/ai.js` | Computer opponent |
| `js/ui.js` | Board rendering, input, menu, Settings, Almanac |
| `js/tutorial.js` | The tutorial: scripted steps, coach box, spotlight and arrows |
| `js/help.js` | Beginner hints, the first-visit welcome, the in-game guide screen |
| `js/decks.js` | The deck builder, saved custom decks and its walkthrough |
| `js/guide.js` | Fills the guide's rule numbers, skills, rarities and decks from the CSV files |
| `tools/guide-shots.js` | Retakes the annotated guide pictures: `node tools/guide-shots.js` (needs Node.js and Playwright) |
| `original-lua/main.lua` | The LÖVE2D source this was ported from |

## The starter decks

Every starter has 35 cards and follows the deck rules: at most 4 copies of a card, and at most 2 of an Unknown card. They are meant as introductions to each faction; custom decks are where the real strategy lives. In computer-vs-computer games (after the Tower rule and the balance changes listed under Changes from the Lua version), Monkey, Zombie and Digital win about half their games, Simple about 60% and Fighter about 45%. With the first-player draw skip and the second player's mana token, the first player wins about 54% of games.

| Deck | Style | Cards costing 0–2 / 3–4 / 5+ | Characters |
|---|---|---|---|
| Simple | Go wide with humble characters and basic tools | 21 / 6 / 8 | 21 |
| Monkey | Synergy: Rally monkeys power each other up | 20 / 5 / 10 | 25 |
| Zombie | Big cost, high reward, slightly spell reliant | 13 / 10 / 12 | 22 |
| Fighter | Martial artists that grow with equipment | 22 / 5 / 8 | 21 |
| Digital | Glass cannons that Level Up | 19 / 8 / 8 | 28 |

### Simple: a very simple way to play

The beginner's deck. Its cards do one clear thing each, so it's the best place to learn how combat, mana and equipment work.

**How it plays:** fill the table early with 1- and 2-mana characters, then make them hit harder with cheap equipment (Sword, Bow, Helm, Staff) and the Simpledom area (+2 to all stats for Simple characters).

**Key cards**
- **Simple Farmer** (4 copies): when played, it pulls another Simple Farmer from your deck into your hand. With three Farmers on the table, **Simpler Farmer** jumps onto the field from your deck, and it gets stronger for each Farmer beside it.
- **Herd** puts three Farmers on the table at once, often enough to call the Simpler Farmer by itself.
- **Simple Wizard** and **Slap** pick off small enemies. **Simplify** turns any big threat into a 1/1/1.
- **Simple Defender** (Challenge and Tower) forces enemies to attack it and grows +2 health every turn.
- Finishers: **Simplicity** shrinks the whole enemy side by 2 in every stat and heals you, and **The Simplistic** is a 10-mana 5/5/3.

**Strengths and weaknesses:** steady and forgiving, with an answer for most situations, but each card is modest on its own. Area damage like Flame Surge can wipe out a board of 1-health characters.

### Monkey: reliant on synergy

**How it plays:** flood the table with cheap monkeys. Once you control three or more Rally characters of the same faction, each one gets **+1 Attack and +1 Speed**, so the swarm hits hard and strikes first. The deck has 20 Rally characters so Rally switches on in most games.

**Key cards**
- **Baby Monkey, Fat Monkey, Smart Monkey and Chimp** (3 copies each, 0–1 mana): the Rally swarm.
- **Monkey Apprentice** fetches a **Banana** (+1 health to a character), and each Banana fetches a **Peel** (1 damage, or 2 with three monkeys out).
- **Primate** puts two cheap monkeys from your deck straight onto the table. **Orangutan** gains health for every other monkey you control.
- **Jungle** (+1 Speed) and **Tree Branch** (costs 1 with three monkeys out) reward a full table.
- Finishers: **Arboreal Intelligence** gives every monkey +5 to all stats, **Gorilla** grows every time it survives damage, and **The Man Ape** defends with +10 to all stats. **Call of the Jungle** returns up to three Monkey cards from your graveyard to your hand.

**Strengths and weaknesses:** overwhelming when the swarm lands. Most monkeys are small, though, so losing a few characters can switch Rally off for the whole team, and area damage hurts.

### Zombie: big cost, high reward, slightly spell reliant

**How it plays:** survive the early turns behind walls and corpses that come back from the dead, then take over with expensive payoff cards. Zombie is the slowest starter. It wins long games.

**Key cards**
- **Breathing Wall** (0/5/0 with Challenge and Tower): enemies must attack it first, which shields the rest of your table.
- **Hungry Corpse** and **Reanimated Corpse** have **Reanimate**: they come back once after dying. Hungry Corpse returns stronger.
- **Sneaky Skinbag** makes a new Reanimated Corpse every turn. **Shadow-Stitched Soldier** comes back with +3 to all stats.
- **Midnight Madness** gives every Undead character +2 to all stats.
- Spells: **Flame Surge** clears small swarms (your walls survive it), **Infection** steals an enemy character, **Death's Grasp** destroys anything, and **Rise from the Dead** returns a fallen Zombie.
- Finishers: **Plaguemancer** steals an enemy and gives it Reanimate. **Zombombadier** deals damage to every character and player when it arrives, and Evolves (+3 to all stats) when it reanimates.

**Strengths and weaknesses:** very hard to grind down late in the game, but slow to start. A fast deck can do a lot of damage before the big cards come online.

### Fighter: combat and discipline

**How it plays:** cheap martial artists pick up weapons and grow stronger with every piece of equipment.

**Key cards**
- **White Belt Student** levels up each time equipment enters the field. After three level-ups it becomes a **Black Belt Student**, which becomes a **5th Degree Master** after surviving three combats.
- **Weapons Enthusiast** equips for free, and **Sensei** makes all your equipment free while it's on the table.
- **Nunchucks** and **Bo Staff** (4 copies each, 2 mana): efficient weapons with Flash, so you can equip them in the middle of Battle.
- **Seasoned Monk** and **Black Belt Student** have **Parry** and hit back twice as hard when defending. **Dojo** gives every Fighter Parry and +1 to all stats.
- **Fight Choreographer** gives every other Fighter +2 to all stats. **Master Rat** brings four Turtles that power each other up.
- Removal: **Bite the Ear** and **Crane Kick** (7 damage).

**Strengths and weaknesses:** strong in fights and punishing to attack into because of Parry. Removing a well-equipped character costs it a lot of investment, though.

### Digital: glass cannons that Level Up

**How it plays:** fragile, hard-hitting characters that grow with **Level Up** (+1 to all stats, up to 3 times). Get cheap characters out, level them quickly, and win before their low health catches up with them.

**Key cards**
- **Glitch** (Level Up and Rush) and **Speedrunner** (Rush) attack the turn they arrive.
- Level Up triggers: **Spam Bot**, **Digital Girlfriend**, **Upgrade**, **Gymfluencer** (twice), **API Key** and **Server Farm** (every End Phase), **Beta Tester** (levels itself every End Phase), **Pro Gamer** (after winning a fight) and the **Data Transfer** area.
- **Pesky Programmer** gains +2 Attack and +2 Speed per level. **Overclocker** is a 7/1/0 that can level up too.
- **Data Collector** takes the Level Up stats of your other characters and becomes a huge Challenge wall.
- Finishers: **Boss Level** has no limit on Level Up, and **Digital Drainage** levels up your whole team three times and weakens every enemy.

**Strengths and weaknesses:** explosive if your characters survive long enough to level, but nearly all of them have 1 health. Area damage and fast removal hit Digital hardest.

The design sheet left some Digital slots blank; these were filled in to fit the deck's style: Noob, Glitch, Spam Bot, Gaming Headset, Speedrunner, Beta Tester, Pro Gamer, Hacker, the name and cost of Overclocker (7+1+0), and the name Server Farm (1+6+1 Tower). Rarities were assigned to all Digital cards. Three cards were interpreted where the sheet's wording left a choice:
- **Secure the Data** grants Cloak until the start of your next turn, since spells cannot be cast on the other player's turn yet.
- **Digital Drainage** lowers each opposing character's Attack by the number of Levels on your highest-Attack Level Up character.
- **Data Transfer** levels up your strongest Level Up character at the end of your turn. Its once-per-turn "remove a Level for 2 HP" is used by tapping the area during Setup.

## Changes from the Lua version

- **The first player skips their first draw**, to offset the advantage of going first.
- **Rally** gives +1 Attack and Speed (not health), as in the Lua version. Play-testing showed +1 to all stats made Monkey decks too strong.
- **New:** a computer opponent, and a pass-the-device screen between turns in two-player mode.
- **Tower blocks:** a Tower character must be attacked first, like Challenge. With several Challenge or Tower characters, the attacker picks which one.
- **Balance changes** (tested in computer-vs-computer games): Zombie's Sneaky Skinbag and Shadow-Stitched Soldier cost 4 instead of 5, and Hungry Corpse is 2/1/1 instead of 1/1/1. Monkey's Ape costs 4 instead of 5, Gorilla 5 instead of 6, and Baby Monkey is 1/1/0 instead of 0/1/0. Simple's Staff is 2/1/0 instead of 3/1/0, and Herd costs 5 instead of 4.
- **Frontline and backline:** characters stand on the frontline, with no limit on how many. Areas and stored equipment share the backline behind it (up to 10 cards, set by `max_field_backline` in `game_rules.csv`) instead of two separate rows of 5. The row names come from `zone_frontline` and `zone_backline` in `ui_text.csv`.
- **Board skins:** the main board is the Crystal Altar. Settings (on the main menu or in ☰ Menu) also offers Shattered Battlefield (floating islands over a shard rift, each side styled after its deck) and War Map. Mana is a row of 10 crystals (lit, spent, or not earned yet), health is a life crystal that is green from 75% health, orange down to 35%, then red and cracked, card backs carry a shard emblem, played cards sparkle, defeated characters shatter, and a shard falls into the turn crystal when the turn passes.
- **Main menu:** purple and white crystal shards fall like meteors instead of the original rain and lightning.
- **Newly working cards** (they had text but no effect in Lua): Area Denial, Call Back, Disable, Simplicity, Simple Messenger, Ripen, Arboreal Intelligence, Call of the Jungle, Rise from the Dead, They Just Keep Coming, Rotten Finger (now lets you pick the discard), Baboon, The Man Ape (defending bonus) and Tree Branch (cost reduction).
- **Fix:** characters now die when their *displayed* health reaches 0, so area bonuses count toward survival.
- **Not playable yet:** the counter spells (Nullify, Nope for One, Nope for All, Return to Sender, Try Again) need a reaction window the game doesn't have. Kenshi's Blade, IP Man, Soul Shepard and The Simplistic play as normal cards without their special ability, the same as in Lua.
- The Undo and mana/draw testing tools are in the in-game menu under "Testing tools".
