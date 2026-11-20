# Shardfall

A two-player fantasy trading card game that runs in the browser. Pick one of five starter decks (Simple, Monkey, Zombie, Fighter, Digital), one from each fracture (Simple, Wild, Undead, Mortal, Cyber), and play against the computer or against a friend on the same device.

This is a port of the original LÖVE2D / Lua version (`original-lua/main.lua`, kept for reference).

## Play it

The game loads its cards from the `data/` folder, so it needs to be opened from a web address rather than by double-clicking `index.html`. Either:

- **GitHub Pages (recommended):** in this repository go to Settings → Pages, choose "Deploy from a branch", pick `main` and the root folder, and save. After a minute the game is at `https://dmolloy98-stack-stack.github.io/Shardfall_TCG/`. Every change merged into `main` (including CSV edits) goes live there automatically.
- **On your own computer:** open a terminal in this folder, run `python3 -m http.server`, then visit http://localhost:8000.

## How to play

New players have three kinds of help:

- **Tutorial** (main menu, or `index.html#tutorial`): a five-minute scripted game against a gentle Trainer using Simple cards. A coach box explains one idea at a time, dims the rest of the screen and points at what to tap or drag: reading a card, mana, the four turn steps, playing characters, abilities, equipment, combat, spells, skills (Signal, Rush, Challenge, Tower, Swift) and combining cards.
- **How to play guide** ([`guide.html`](guide.html)): an illustrated page with annotated screenshots of the table, a labelled card, turns, playing cards, battle and how cards work together, plus a skills glossary and beginner words. It's the same page the in-game "How to play" button opens, and it can be shared on its own: `https://dmolloy98-stack-stack.github.io/Shardfall_TCG/guide.html`.
- **Beginner hints**: during a game, a small panel says what you can do right now. Hide it with ✕, turn it off with "Turn off hints", or switch it back on in Settings (main menu or ☰ Menu). The choice is remembered on that device.

**The intro:** every time the game opens, a 20-second cold open of stained-glass panels tells how the Shardfall began (tap to go on, **Skip** to leave). First-time visitors are then offered the tutorial. Watch it again from Settings, or skip it with a link ending in `#menu`. The story, tone, champions and hidden clues are collected in [`docs/world.md`](docs/world.md).

**Campaign** (main menu): five matches in a row against the computer, one for each fracture's champion: The Simplistic, The Man Ape, IP Man, Boss Level and finally Soul Shepard. Each champion plays its faction's starter deck and starts with its champion card in hand. A short story card comes before each match and after each win. Beating a champion unlocks the next one; progress is saved in the browser on that device, and **Start over** locks them again. You play the deck chosen on the main menu.

**Your own decks:** on the main menu, **Create your own** opens the deck builder. Start from an empty deck or a copy of a starter, tap cards to add them (filter by fracture and type, tap **i** to read a card), and watch the deck panel: card count against the 35-card minimum, the mana curve, how many characters, spells, equipment and areas, and tips. Copy limits from `data/game_rules.csv` are enforced. A short walkthrough runs the first time and from **? How to build**. Decks are saved in the browser on that device, appear on the main menu with an Edit button, and can't be started until they reach the minimum size. The computer opponent always uses a starter deck.

**On phones** the game works best held sideways, and it asks you to turn the phone if it's upright (with a "Play upright anyway" option). Held sideways, the strips along the top and bottom of the board are left off so the rest of the board is drawn bigger: each player's health, mana and card counts move to panels at the left (tap the opponent's panel to target or attack them), and the buttons (Menu, Full screen, Draw card / To battle / To end / Pass turn, Attack directly, Cancel) sit in a slim column at the right. Full screen hides the browser's bars where the phone allows it (not on iPhones; there, adding the game to the home screen does the same). In the tutorial the space beside the board holds the coach panel instead, which repeats each step's button at full size. Page scrolling, zooming and long-press menus are switched off on the game screen, and the board stays clear of the notch.

The short version:

- Each player starts with 25 health and 6 cards from a 35-card deck. Reduce the other player to 0 health to win. Drawing from an empty deck loses.
- A hand holds at most 8 cards. A card drawn or returned to a full hand goes to the graveyard instead.
- A spell that needs a target is only paid for once you pick the target, so cancelling leaves it in your hand.
- **Draw → Setup → Battle → End.** Your maximum mana grows by 1 each turn, with no cap. The player who goes first skips their first draw; the player who goes second gets a one-time **+1** mana token beside their mana, usable on any of their turns.
- **Setup:** drag cards from your hand onto the table, or tap a card and press Play.
- **Battle:** tap one of your characters, then an enemy character, or "Attack directly". Both characters hit at the same time, unless one has **Swift** (»): it strikes first.
- Tap or right-click any card to read it. Escape or right-click cancels a choice.

The guide has the full rules.

## Editing cards, decks and rules

All cards, decks, skills and balance numbers are CSV files in the [`data/`](data/) folder, one table per file:

| File | What's in it |
|---|---|
| [`data/cards.csv`](data/cards.csv) | Every card: cost, stats, skills, rarity, ability text, and the Effect that makes it work |
| [`data/decks.csv`](data/decks.csv) | The starter decks and their card lists |
| [`data/skills.csv`](data/skills.csv) | Skill keywords and their descriptions |
| [`data/game_rules.csv`](data/game_rules.csv) | Starting health, hand size, mana growth, field limits, deck-building rules |
| [`data/events.csv`](data/events.csv) | The random events: their names and descriptions (what they do is in `js/engine.js`) |
| [`data/champion_abilities.csv`](data/champion_abilities.csv) | The champions' abilities: names, what they do, when they level up (the rules are in `js/engine.js`) |
| [`data/rarities.csv`](data/rarities.csv), [`data/factions.csv`](data/factions.csv) | Colors, symbols, equipment attach costs |
| [`data/phases.csv`](data/phases.csv), [`data/ui_text.csv`](data/ui_text.csv) | Phase names, on-screen instructions, button labels |

GitHub displays each file as a table. Edit it with the pencil icon, or open it in Excel or Google Sheets, then save it as CSV and upload it back. [`data/README.md`](data/README.md) explains every column, and how to write a card's **Effect** from a set of building blocks (damage, buff, levelUp, fetch, summon and so on), so most new cards need no code. In the game, the **Almanac** (on the main menu) shows every card as it currently reads in these files.

Card art is optional: add `assets/cards/<ArtKey>.png` and it replaces the fracture symbol on that card.

**Fractures, tribes and classes.** Every card is from a *fracture* (a whole shattered world where many tribes live: Simple, Wild, Undead, Mortal, Cyber, or Unbound for none; a few are from two). Characters also have *tribes* (what they are: Villager, Human, Monkey, Zombie, Martial Artist, Program, Rat, Plant, Goblin) and *classes* (what they do: Warrior, Mage, Scout, Guardian, Worker, Student, Master, Fighter), one or two of each. Cards can reward any of the three, so characters from different worlds can still work together. They are shown on the card with placeholder symbols and listed in the Almanac, which can filter by all three. The story behind them is in `docs/world.md`.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `guide.html` | The illustrated How to play guide (also shown inside the game) |
| `guide/` | Pictures for the guide, made by `tools/guide-shots.js` |
| `css/style.css` | All styling and animations |
| `data/*.csv` | Cards, decks, skills and rules (see above) |
| `js/data.js` | Loads and checks the CSV files, then starts the game |
| `js/engine.js` | Game rules: turns, combat, skills. Shuffles come from a seed per match (shown in the game log), so a game can be replayed exactly |
| `js/effects.js` | Reads each card's Effect from cards.csv, checks it, and runs it; also holds the few one-off card scripts |
| `js/ai.js` | Computer opponent: plans its Setup plays and its attacks a few steps ahead, checks for a winning attack, and plays each faction in its own style. `aiDecide()` says what it will do before doing it, so the screen can show it aiming |
| `js/ui.js` | Board rendering, input, dialogs, Settings |
| `js/menu.js` | The start menu: three doors (Campaign, Quick Match, Two Players) and the smaller buttons, then a step for picking your deck and the opponent's (or just looking after your decks); and the Almanac |
| `js/storm.js` | The falling-shards animation behind the main menu |
| `js/boot.js` | Starts the game once every script has loaded |
| `js/champions.js` | The five champions: their one-line tags, their spoken lines (including reactions to the shard, near defeat, and the end-screen line that remembers the match) and how the computer plays each (plain data) |
| `js/tutorial.js` | The tutorial: scripted steps, coach box, spotlight and arrows |
| `js/help.js` | Beginner hints, the first-visit welcome, the in-game guide screen |
| `js/decks.js` | The deck builder, saved custom decks and its walkthrough |
| `js/intro.js` | The stained-glass cold open before the main menu |
| `js/campaign.js` | The campaign: one match against each faction's champion, with its story text, saved progress and the champions' speech bubbles (in normal matches too, as the champion of the computer's deck); deck mastery points and titles |
| `docs/code-map.md` | How the files fit together: diagrams of the big picture, one move's path and the screens, plus where to change things |
| `docs/world.md` | The story bible: the Shardfall, Shardkeepers, factions and champions, tone, and the hidden-clue log |
| `js/fx.js` | Game feel: aiming line and fight previews, impacts sized small, medium or large (shake, hit-stop, rings), Swift blows landing before the reply, big entrances, skill spotlights, the final blow and end-screen stats |
| `js/motion.js` | Cards that travel: drawn cards slide out of the deck, played cards fly from the hand to the table (the computer's from its hidden hand), cards drift into the graveyard, the hand closes up smoothly, a cast spell is shown in the middle of the table, and health counts down instead of jumping |
| `js/guide.js` | Fills the guide's rule numbers, skills, rarities and decks from the CSV files |
| `tools/test-all.js` | Runs every test below in one go and says whether all passed: `node tools/test-all.js`. GitHub runs it on every push and pull request (`.github/workflows/tests.yml`) |
| `tools/selftest.js` | Plays many automatic games and reports anything broken: `node tools/selftest.js . ai 4` and `node tools/selftest.js . rand 1000` (needs Node.js). Run it after changing rules or cards |
| `tools/kinds-test.js` | Checks the fracture, tribe and class rules and the cards built on them (Sensei, Speedrunner, hybrids, infection): `node tools/kinds-test.js .` |
| `tools/events-test.js` | Checks the random events: `node tools/events-test.js .` |
| `tools/champions-test.js` | Checks the champion abilities: `node tools/champions-test.js .` |
| `tools/protected-test.js` | Checks the Protected rule and the Pierce and Protected skills: `node tools/protected-test.js .` |
| `tools/shard-test.js` | Checks the big shard fall: when it lands, attacking it, who claims it and each champion's shard bonus: `node tools/shard-test.js .` |
| `tools/make-glass.js` | Redraws the stained-glass window behind the Stained Glass board into `css/style.css`: `node tools/make-glass.js` |
| `tools/make-crystal.js` | Redraws the long glowing cracks across the Shattered Crystal board into `css/style.css`: `node tools/make-crystal.js` |
| `tools/browser-check.js` | Opens the game in a test browser at desktop and phone size, plays a few rounds, saves screenshots and checks the text is readable: `node tools/browser-check.js <folder>` (needs Node.js and Playwright) |
| `tools/winrates.js` | Plays every starter deck against every other and prints win rates and game length: `node tools/winrates.js 50` |
| `tools/speed-check.js` | Measures how smoothly the game runs on a slowed-down computer (like a phone), with Heavy effects on and off: `node tools/speed-check.js` |
| `tools/readability.js` | Used by the browser check: finds text that is too small, overlapping or cut off |
| `tools/serve.js` | Lets a test browser load the game straight from this folder, without a web server |
| `.claude/skills/` | Step-by-step recipes Claude follows for routine jobs (Drive backup, pull requests, browser checks, balance tests, card changes, story writing and more) |
| `tools/guide-shots.js` | Retakes the annotated guide pictures: `node tools/guide-shots.js` (needs Node.js and Playwright) |
| `original-lua/main.lua` | The LÖVE2D source this was ported from |

## The starter decks

Every starter has 35 cards and follows the deck rules: at most 4 copies of a card, and one champion (an Unknown card) with at most 2 copies. They are meant as introductions to each faction; custom decks are where the real strategy lives. In computer-vs-computer games with 25 starting health and the finished champions, all five starters win 46–56% of their games. A game lasts about 14 turns in total (both players' turns counted). With the first-player draw skip and the second player's mana token, the first player wins about 54% of games.

| Deck | Style | Cards costing 0–2 / 3–4 / 5+ | Characters |
|---|---|---|---|
| Simple | Go wide with humble characters and basic tools | 23 / 5 / 7 | 22 |
| Monkey | Synergy: Rally monkeys power each other up | 20 / 5 / 10 | 25 |
| Zombie | Big cost, high reward, slightly spell reliant | 13 / 10 / 12 | 22 |
| Fighter | Martial artists that grow with equipment | 22 / 6 / 7 | 20 |
| Digital | Glass cannons that Level Up | 19 / 8 / 8 | 28 |

### Simple: a very simple way to play

The beginner's deck. Its cards do one clear thing each, so it's the best place to learn how combat, mana and equipment work.

**How it plays:** fill the table early with 1- and 2-mana characters, then make them hit harder with cheap equipment (Sword, Bow, Helm, Staff) and the Simpledom area (+2 to all stats for Simple characters).

**Key cards**
- **Simple Farmer** (4 copies): when played, it pulls another Simple Farmer from your deck into your hand. With three Farmers on the table, **Simpler Farmer** jumps onto the field from your deck, and it gets stronger for each Farmer beside it.
- **Herd** puts three Farmers on the table at once, often enough to call the Simpler Farmer by itself.
- **Simple Wizard** and **Slap** pick off small enemies. **Simplify** turns any big threat into a 1/1.
- **Simple Defender** (Challenge and Tower) forces enemies to attack it and grows +2 health every turn.
- Finishers: **Simplicity** shrinks the whole enemy side by 2 in every stat and heals you. **The Simplistic** (8 mana, 5/5) gives every Simple card on the table +3 to each stat, makes Simple spells deal or give 3 more, and stops curse spells from targeting Simple cards.

**Strengths and weaknesses:** steady and forgiving, with an answer for most situations, but each card is modest on its own. Area damage like Flame Surge can wipe out a board of 1-health characters.

### Monkey: reliant on synergy

**How it plays:** flood the table with cheap monkeys. Once you control three or more Rally characters of the same faction, each one gets **+1 Attack**, so the swarm hits hard. The deck has 20 Rally characters so Rally switches on in most games.

**Key cards**
- **Baby Monkey, Fat Monkey, Smart Monkey and Chimp** (3 copies each, 0–1 mana): the Rally swarm.
- **Monkey Apprentice** fetches a **Banana** (+1 health to a character), and each Banana fetches a **Peel** (1 damage, or 2 with three monkeys out).
- **Primate** puts two cheap monkeys from your deck straight onto the table. **Orangutan** gains health for every other monkey you control.
- **Jungle** (+1 Attack) and **Tree Branch** (costs 1 with three monkeys out) reward a full table.
- Finishers: **Arboreal Intelligence** gives every monkey +5 to all stats, **Gorilla** grows every time it survives damage, and **The Man Ape** defends with +10 to all stats and, after each of your Battle phases, can sacrifice another Monkey to grow +1 to all stats and heal fully. **Call of the Jungle** returns up to three Monkey cards from your graveyard to your hand.

**Strengths and weaknesses:** overwhelming when the swarm lands. Most monkeys are small, though, so losing a few characters can switch Rally off for the whole team, and area damage hurts.

### Zombie: big cost, high reward, slightly spell reliant

**How it plays:** survive the early turns behind walls and corpses that come back from the dead, then take over with expensive payoff cards. Zombie is the slowest starter. It wins long games.

**Key cards**
- **Breathing Wall** (0/5 with Challenge and Tower): enemies must attack it first, which shields the rest of your table.
- **Hungry Corpse** and **Reanimated Corpse** have **Reanimate**: they come back once after dying. Hungry Corpse returns stronger.
- **Sneaky Skinbag** makes a new Reanimated Corpse every turn. **Shadow-Stitched Soldier** comes back with +3 to all stats.
- **Midnight Madness** gives every Undead-world character +2 to all stats.
- Spells: **Flame Surge** clears small swarms (your walls survive it), **Infection** steals an enemy character, **Death's Grasp** destroys anything, and **Rise from the Dead** returns a fallen Zombie.
- **Soul Shepard** feeds on the fallen: each time another of your Undead characters goes to the graveyard, it absorbs its stats or returns it to your hand.
- Finishers: **Plaguemancer** steals an enemy and gives it Reanimate. **Zombombadier** deals damage to every character and player when it arrives, and Evolves (+3 to all stats) when it reanimates.

**Strengths and weaknesses:** very hard to grind down late in the game, but slow to start. A fast deck can do a lot of damage before the big cards come online.

### Fighter: combat and discipline

**How it plays:** cheap martial artists pick up weapons and grow stronger with every piece of equipment.

**Key cards**
- **White Belt Student** levels up each time equipment enters the field. After three level-ups it becomes a **Black Belt Student**, which becomes a **5th Degree Master** after surviving three combats.
- **Weapons Enthusiast** equips anything for 1 mana, and **Sensei** makes all your equipment free while it's on the table.
- **Nunchucks** and **Bo Staff** (4 copies each, 2 mana): efficient weapons with Flash, so you can equip them in the middle of Battle.
- **Seasoned Monk** and **Black Belt Student** have **Parry** and hit back twice as hard when defending. **Dojo** gives every Fighter Parry and +2 to all stats.
- **Fight Choreographer** gives every other Fighter +2 to all stats. **Master Rat** brings four Turtles that power each other up.
- Removal: **Bite the Ear** and **Crane Kick** (7 damage).
- **IP Man** turns the first hit each turn (on you or on him) back onto an enemy character or player. **Kenshi's Blade** lets the character holding it strike an enemy for 3 once per Battle Phase.

**Strengths and weaknesses:** strong in fights and punishing to attack into because of Parry. Removing a well-equipped character costs it a lot of investment, though.

### Digital: glass cannons that Level Up

**How it plays:** fragile, hard-hitting characters that grow with **Level Up** (+1 to all stats, up to 3 times, and each Level Up heals the character fully). Get cheap characters out, level them quickly, and win before their low health catches up with them.

**Key cards**
- **Glitch** (Level Up, Rush and Swift) and **Speedrunner** (Rush and Swift) attack the turn they arrive and strike first.
- Level Up triggers: **Spam Bot**, **Digital Girlfriend**, **Upgrade**, **Gymfluencer** (twice), **API Key** and **Server Farm** (every End Phase), **Beta Tester** (levels itself every End Phase), **Pro Gamer** (each time it attacks) and the **Data Transfer** area.
- **Pesky Programmer** gains +2 Attack per level. **Overclocker** is a 7/1 that can level up too.
- **Data Collector** gains +1 Health each time another of your characters levels up, growing into a Challenge wall.
- Finishers: **Boss Level** (7 mana, 6/4) has no limit on Level Up, and **Digital Drainage** (9 mana) levels up your whole team three times and weakens every enemy.

**Strengths and weaknesses:** explosive if your characters survive long enough to level, but nearly all of them have 1 health. Area damage and fast removal hit Digital hardest.

The design sheet left some Digital slots blank; these were filled in to fit the deck's style: Noob, Glitch, Spam Bot, Gaming Headset, Speedrunner, Beta Tester, Pro Gamer, Hacker, the name and cost of Overclocker (7+1), and the name Server Farm (1+6 Tower). Rarities were assigned to all Digital cards. Three cards were interpreted where the sheet's wording left a choice:
- **Secure the Data** grants Cloak until the start of your next turn, since spells cannot be cast on the other player's turn yet.
- **Digital Drainage** lowers each opposing character's Attack by the number of Levels on your highest-Attack Level Up character.
- **Data Transfer** levels up your strongest Level Up character at the end of your turn. Its once-per-turn "remove a Level for 2 HP" is used by tapping the area during Setup.

## Changes from the Lua version

- **The first player skips their first draw**, to offset the advantage of going first.
- **No Speed stat.** Cards have Attack and Health only. Fights are simultaneous, and the **Swift** skill (») strikes first and takes no damage back if its blow is lethal. Swift is on Speedrunner, Hacker, Glitch, Smart Monkey, Seasoned Monk and Simple Bowman, and Zippy Shoes (now +2 Health) and the Bow give it. Jungle gives Monkeys +1 Attack, Sweep the Leg removes Swift and 1 Attack, and Zombombadier is 1/2 so its blast still deals 3. In 4,800 computer games, every starter won 46–53% and games got slightly shorter.
- **Rally** gives +1 Attack (not health). Play-testing showed +1 to all stats made Monkey decks too strong.
- **New:** a computer opponent, and a pass-the-device screen between turns in two-player mode.
- **Tower blocks:** a Tower character must be attacked first, like Challenge. With several Challenge or Tower characters, the attacker picks which one.
- **Balance changes** (tested in computer-vs-computer games): Zombie's Sneaky Skinbag and Shadow-Stitched Soldier cost 4 instead of 5, and Hungry Corpse is 2/1 instead of 1/1. Monkey's Ape costs 4 instead of 5, Gorilla 5 instead of 6, and Baby Monkey is 1/1 instead of 0/1. Simple's Staff is 2/1 instead of 3/1, and Herd costs 5 instead of 4. Fighter's Seasoned Monk is 2/1 instead of 1/1, and Black Belt Student costs 3 instead of 4.
- **Starter decks tuned** (about 100 deck versions tried over roughly 27,000 computer-vs-computer games, each change kept only when it helped against the other four decks). Simple: 2 Simple Messengers out, 2 Simple Wizards in. Monkey, a cheaper swarm: Orangutans, Tree Branches and Banana Tree out; one more each of Smart Monkey, Baby Monkey, Chimp and Fat Monkey, and a second Man Ape. Digital, a faster glass cannon: Server Farm, API Key, Data Collector, Gaming Headset, Digital Drainage and Catfish out; 2 more each of Speedrunner, Noob and Digital Girlfriend. Fighter: Crane Kicks out, 2 more Bite the Ear; and Seasoned Monk is now 2/2 (was 2/1) and White Belt Student 1/1 (was 0/1). Zombie is unchanged. Changing how the computer plays each deck made almost no difference, so the play styles stay as they were.
- **Frontline and backline:** characters stand on the frontline, with no limit on how many. Areas and stored equipment share the backline behind it (up to 10 cards, set by `max_field_backline` in `game_rules.csv`) instead of two separate rows of 5. The row names come from `zone_frontline` and `zone_backline` in `ui_text.csv`.
- **The look: shattered crystal.** Shardfall is a world that broke into shards, and the whole game now looks like it: cool ice-blue on near-black. Cards are frosted crystal tinted by their fracture, with pale facets and one fine glowing crack; buttons are faceted blue glass with a bright rim (the main button stays amber); panels are dark crystal with an ice rim; the menu backdrop is falling ice-blue shards. The main board (the Shattered Crystal skin) is dark slabs with glowing seams and long cracks. The earlier violet Stained Glass look is still a board in Settings, and the window behind it is drawn by `tools/make-glass.js`. A card played from no particular fracture assembles out of light.
- **Board skins:** the main board is **Shattered Crystal**: dark crystal slabs with chipped corners (one for each player's half, lit in their deck's colour, with seams that glow and slowly breathe), a bright crack where the two halves meet, long glowing cracks across the table, and a few shards drifting down. Its cracks are drawn by `tools/make-crystal.js` (change `SEED` there for a new arrangement). Settings (on the main menu or in ☰ Menu) also offers Stained Glass (the earlier window look), Crystal Altar, Shattered Battlefield (floating islands over a shard rift, each side styled after its deck) and War Map. Mana is a row of 10 crystals (lit, spent, or not earned yet), health is a life crystal that is green from 75% health, orange down to 35%, then red and cracked, card backs carry a shard emblem, played cards sparkle, defeated characters shatter, and a shard falls into the turn crystal when the turn passes.
- **Shard falls.** **Mini shard falls** (the random events) hit the table in rounds 4 and 12 (a round is one player's turn) for both players and last one round: Spell Surge (spells cost 1 less), Tremor (every character takes 1 damage), Windfall (each player draws an extra card) or Amplified Areas (area bonuses are doubled). Each is announced two rounds ahead on a small card in the middle of the table. The names and descriptions are in `data/events.csv`; the rounds are `event_rounds` in `data/game_rules.csv` (empty turns events off). **The big shard fall** comes in round 8, once a match: a purple, blue and green crystal with 10 health crashes into the middle of the table, and the table cracks open and glows for the rest of the match. Characters can attack it in Battle (it never hits back, Challenge and Tower don't protect it, spells can't touch it). Its health is shared, and whoever breaks it claims it: they draw a card and get their champion's shard bonus (The Simplistic: all its characters fully healed; The Man Ape: a free 2/2 Monkey, a Chimp with +1 Attack; IP Man: its strongest character gets Swift for good; Boss Level: its next phase; Soul Shepard: its last fallen character returns to its hand). A deck with no champion draws 2 cards instead. Tap the shard to read this in a match. The numbers are the `shard_` rows in `data/game_rules.csv`. The tutorial has neither.
- **Protected.** A player with 3 or more characters on their side (or with a character that has the **Protected** skill, ▣) takes half damage, rounded up. Every Challenge character has the Protected skill. The **Pierce** skill (↠) ignores it; Sensei, 5th Degree Master, Hacker and Overclocker have it. The number is `protected_min_characters` in `data/game_rules.csv` (0 turns it off). In 1,250 test games it made matches about one turn longer (13.2 to 14.2) with every deck between 45% and 53%. The Almanac's Skills tab explains it. On the table, a Protected player's health gem sits inside a shell of light-blue shards (it snaps together, chips when a hit is halved, and breaks apart when lost), and a ring of glowing blue runes travels around each card with the Protected skill.
- **Champion abilities.** A deck that holds a champion (its Unknown card) gets that champion's ability from turn one, even before the champion is drawn. A deck with no champion gets nothing. Every ability is always on; two of them **level up once** in a match. Progress is shown under the player's name, and tapping it explains the ability. **The Simplistic** (Humble Beginnings): nothing at first; when your maximum mana reaches 6, all Simple characters get +1/+1. **The Man Ape** (Chest Thump): while you have more characters than your opponent, your characters get +1 Attack on your turn. **IP Man** (The Bow): at the start of your Battle phase your strongest ready attacker gets +2 Attack for the turn; after you win 5 fights (your character survives, the enemy is knocked out), your two strongest do. **Boss Level** (Boss Phases): at 2/3 of the starting health or less (16 of 25) it enters PHASE 2 and draws 1 extra card each turn; at 1/3 or less (8) FINAL PHASE also gives its characters +1 Attack and +1 Health; a phase never goes back. **Soul Shepard** has Challenge and gets +1 Health each time any Undead character dies, on either side, counted from the start of the match (so it is already bigger when drawn). The words are in `data/champion_abilities.csv`. The tutorial match has none switched on, but it explains them near the end. The Almanac has a **Champions** tab that explains each ability in full, with before-and-after pictures drawn from the real cards.
- **Main menu:** purple and white crystal shards fall like meteors instead of the original rain and lightning.
- **Game feel:**
  - **Aiming:** choosing an attacker draws an aiming line to your finger or mouse, and you can drag straight onto a target. Each enemy you could attack shows how the fight would end (Defeats it, Both fall, Yours falls, or the damage dealt; ⚡ means you strike first).
  - **Impacts:** attackers swoop into their target, and hits land with a flash, a ring, and a screen shake sized to the damage. Damage numbers get bigger with the hit and say OVERKILL. Chips fly off a player's life crystal when it's hit.
  - **Level Up on the table:** characters that can level show stars for their levels (★★☆), Boss Level shows its level number, and the card glows brighter with each level.
  - **Deaths by world:** Undead cards sink back into the ground, Cyber cards break into pixels and glitch out, Wild cards tumble off the table, Mortal cards are cut in two by a clean strike, and everything else shatters like crystal.
  - **Big moments:** cards costing 6 or more are shown large in the middle before they land with a shockwave. A skill's icon pops when it takes effect (Level Up, Evolve, Transform, Reanimate, Rally). Each world's cards enter the table their own way.
  - **A living board:** cards breathe, playable cards shimmer, and each side of the Crystal Altar glows in its deck's color, brighter as its mana grows. When someone drops into red health, the edges pulse and the shards fall faster.
  - **The finale:** slow motion on the winning blow and a shattering crystal. The end screen shows cards played, damage dealt, the biggest hit, and badges like Flawless, Comeback, First win with a deck and Massive hit.
  - All of this respects the device's "reduce motion" setting.
- **Newly working cards** (they had text but no effect in Lua): Area Denial, Call Back, Disable, Simplicity, Simple Messenger, Ripen, Arboreal Intelligence, Call of the Jungle, Rise from the Dead, They Just Keep Coming, Rotten Finger (now lets you pick the discard), Baboon, The Man Ape (defending bonus) and Tree Branch (cost reduction).
- **Fix:** characters now die when their *displayed* health reaches 0, so area bonuses count toward survival.
- **Champions finished:** The Simplistic, The Man Ape's sacrifice, Soul Shepard, IP Man and Kenshi's Blade now do what their cards say (they had no effect in Lua). Spells are either **buff spells** (they help) or **curse spells** (they hurt or steal); a spell's details say which.
- **Counter spells:** Nullify, Nope for One, Nope for All, Return to Sender and Try Again answer a card the other player plays. When the computer (or the other player) plays a character or spell that one of your counters can stop, and you left enough mana unspent on your turn, the game asks whether to counter it. A countered card is paid for and goes to the graveyard without doing anything. The computer does the same to you when it holds one. They are in no starter deck; add them in the deck builder.
- The Undo and mana/draw testing tools are in the in-game menu under "Testing tools".
