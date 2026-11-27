# The world of Shardfall

Notes on the story, tone and characters, to keep the game consistent as it grows.
Edit this file whenever the story changes. Open questions are listed at the end.

## The Shardfall

- Once there were many separate worlds, each one whole.
- The worlds collided. The universe shattered, and its pieces, the **shards**, now fall
  everywhere. That is why the factions, which come from different worlds, meet at all.
- **What caused it is a mystery.** The other champions believe the Zombies had
  something to do with it. In truth the Zombies are just another victim (see "The hidden
  story").

## Shards are cards

- Every card is a shard, and each shard holds a power of its own. Every card should
  feel meaningful.
- The more shards a faction holds, the better its chances of survival. That is what the
  factions fight over.
- In the story and flavor text, cards can be called shards. **In the rules and on
  buttons, they stay "cards"**, so new players aren't confused.

## Shardkeepers

- A **Shardkeeper** is someone who can command shards: the player, and each faction's
  champion.
- Shards fall everywhere. A battle happens when two or more Shardkeepers meet.
- Shards keep falling during a battle too: one big shard in round 8 that crashes into the middle of the table. The table cracks open
  and glows purple, blue and green, and both Shardkeepers fight to break the shard and claim it.
  What the big shard is, and whether it hints at what caused the Shardfall, is the owner's to
  decide (see `docs/todo.md`).
- On hold: two mini shard falls (the random events, rounds 4 and 12). The owner switched them off
  in normal play (27 Nov 2026) and will bring them back in a later "shake-up" mode.
- The player's goal: use creativity and knowledge of the shards to make the universe
  whole again, so the shards stop falling.
- The story is told from a distance (no "you" in narration), for now.

## Fractures, tribes and classes

Every card has three kinds of label, so cards can work together in more than one way.

- **Fracture** is where a card is from: the shattered world it came out of. **A fracture is broad,
  a whole world where many tribes and classes live**; tribes and classes are what tell cards apart.
  Today's five are **Simple** (the quiet village world), **Wild** (beasts and jungles), **Undead**
  (anything that should be dead but is living), **Mortal** (people who train past human limits)
  and **Cyber** (hackers, gamers and living software). Card art will be what sets Mortal apart from
  Simple. A card from none is **Unbound**. A few cards are from two fractures (Master Rat is Mortal
  and Wild; Weapons Enthusiast is Mortal and Simple): a shard where two worlds fused. In the data
  this column was once called Faction. (Renamed Nov 2026: Monkey became Wild, Zombie became
  Undead, Fighter became Mortal, Digital became Cyber.)
- **Tribe** is what a character is: Villager, Human, Monkey, Zombie, Martial Artist, Program,
  Rat, Plant or Goblin (Turtle for Master Rat's tokens). A character can have two (The Man Ape is
  Human and Monkey; The Simplistic is Program and Villager). Future tribes slot into a world: a
  Skeleton or Vampire tribe in Undead, a Cat or Dog tribe in Wild.
- **Infection** (Infection, Plaguemancer) adds the Zombie tribe to the tribes a character already
  has. The character keeps its own world: it becomes a Zombie, but not Undead.
- Cards that say **Undead** (Soul Shepard, Midnight Madness, Rise from the Dead) mean the Undead
  world, so a future Skeleton deck and the Zombie deck help each other. Cards that say **Zombie**
  (Sneaky Skinbag, They Just Keep Coming) mean the Zombie tribe only, and cards that say
  **Monkey** mean the Monkey tribe only.
- **Class** is what a character does: Warrior, Mage, Scout, Guardian, Worker, Student, Master
  or Fighter. A character can have two. The Mortal world's martial artists are also the Fighter
  class, so "Fighter" cards (Dojo, Fight Choreographer) reach them by class.
- Only characters have tribes and classes. Spells, equipment and areas may care about them
  ("your Students", "Humans") but don't have their own.
- Big bonuses stay tied to a fracture (Jungle, Simpledom, Primeval Forest, Arboreal
  Intelligence); small ones can reach a tribe or class.
- The labels are in `data/cards.csv` (Tribes, Fracture, Classes) and shown on the card with
  placeholder symbols, until the art is made. The owner reviews them in the card sheet.

## The champions and their worlds

Each starter deck comes from a different world (a fracture). More worlds can join at any time,
so the story never fixes how many there are.

**A champion is the strongest of its tribe**, recognized across every fracture and throughout
the Shardfall. A tribe can have more than one champion (a second Villager champion could come
later), but **a deck holds only one champion card** (one kind, at most 2 copies).

| World (deck) | Champion (Unknown card), and the tribe it leads | Personality | How the computer plays it |
|---|---|---|---|
| Simple | The Simplistic (Villager) | A cheerful, stubborn homebody who insists everything was fine before the Shardfall. Short, calm sentences, and it repeats itself word for word | Steady: plans one play at a time and does not chase the player |
| Wild (Monkey deck) | The Man Ape (Monkey) | A loud, boasting troop boss who hoards shards like bananas. Loyal to the troop, yet sacrifices cousins without guilt | Territorial: keeps a big board, sacrifices readily, and attacks harder once below half health |
| Undead (Zombie deck) | Soul Shepard (Zombie) | A gentle, sad keeper of the fallen who never argues. Kind first, unsettling second | Patient collector: builds a swarm, takes fallen Zombies back into hand, strikes late |
| Mortal (Fighter deck) | IP Man (Martial Artist) | A calm, polite master who bows before and after every fight. Treats a loss as a lesson. Grieving under the calm | Patient: waits for a clean exchange and keeps IP Man at home for his redirect |
| Cyber (Digital deck) | Boss Level (Program) | A smug final boss that narrates its own phases ("LEVEL UP", "CRITICAL HIT") | Confident early (grows its team), dangerous late (goes for the player from round 5) |

- The champion is the "top dog" of its tribe, a card of Unknown rarity.
- **Deck rule:** a deck holds only one kind of Unknown card (its champion), with up to
  2 copies. This is `max_unknown_kinds` and `max_unknown_copies` in
  `data/game_rules.csv`.
- Champions speak during campaign matches: a line in the match log and a speech bubble by
  their health plate, at most one every 7 seconds and 8 a match. The lines, the one-line
  tag on the story card and the computer's play style are in `js/champions.js`.
- A deck that holds a champion also gets that champion's **ability** from turn one, and it levels
  up once in a match (The Simplistic, The Man Ape, IP Man, Boss Level), or grows (Soul Shepard).
  The words are in `data/champion_abilities.csv`. Each fits its champion: the Man Ape remembers
  fallen cousins, IP Man bows before a fight, Boss Level raises the level cap, Soul Shepard grows
  with every soul that is lost. The Simplistic's is Humble Beginnings, chosen by the owner; the hidden-clue phrase "Start small,
  then level up" was kept out of it.
- Their art is still to come.

## Tone

- **Playful on the surface, with a deep, dark story hidden underneath.**
- Touchstone: *Adventure Time*. It's mostly playful, with dark twists for those who
  look closely.
- Darker decks, starting with Zombie, are where the dark side shows most.

## The hidden story

- Clues are scattered **everywhere, but hidden well enough that they're very hard to
  notice**, like the clues to the One Piece in *One Piece*.
- Places for clues: card descriptions (flavor text, mostly empty today), small art
  details, the intro, names, champion lines, and the order of things.
- Keep a log of every clue below, so the story stays consistent.

### The truth (spoilers, never stated outright in the game yet)

- **Boss Level** caused the Shardfall, together with other factions that are not in the game
  yet. It was trying to make its own universe "level up", but the attempt broke its universe
  and the others it touched.
- **The Simplistic**, and the Simple deck, were created by Boss Level: a deliberately small,
  simple "level one" world. That is why the Simplistic repeats itself word for word and
  says "Start small, then level up". It is a little robotic, but the player should not
  notice that early.
- The Zombies are victims, blamed because they were the first to be found among the wreckage.
- Boss Level is fight four, so the late clues can be bolder than the early ones. The campaign
  ends with the shards still falling, so the truth is not told yet.

### Clue log

| Where | Clue | What it hints at |
|---|---|---|
| Cards, The Simplistic's tribes | It is Program and Villager. Program is the tribe of Boss Level, Glitch, Spam Bot, Data Collector, Server Farm and Digital Girlfriend, and no other Simple card has it | Boss Level made the Simple world. Nothing in the game says so |
| Intro, first window ("each one was whole") | One green glass pane in the second ring is already cracked, before the worlds collide | Something was broken before the collision. Green is the Zombie color, which points suspicion their way |
| Campaign, after beating Soul Shepard | The souls Soul Shepard gathered come from every world, not only its own, and the shards keep falling | The Zombies are victims too, and beating every champion does not end the Shardfall |
| The Simplistic, every match | It says the same lines word for word, and repeats a line twice when hurt | It is a little robotic: made, not born |
| The Simplistic, its reactions and end-screen lines (added Nov 2026) | Even its new lines for the shard, its champion falling, being near defeat and the end screen are its old lines, repeated word for word. Every other champion got new lines | Same clue: it has a fixed set of lines, like a program |
| Campaign, after beating The Simplistic | "Start small, then level up." It says it exactly as it said it before | Boss Level's word "level up", in the mouth of its creation |
| Campaign, The Man Ape's story card | The ground still hums where the jungle first appeared | The jungle was put there, not grown |
| Campaign, IP Man's story card | He swears the sky flickered, just once, a moment before the break | The break was a glitch: it came from something like a screen |
| Campaign, Boss Level's story card | Its desktop wallpaper is a quiet turnip field | Boss Level made the Simplistic's world |
| Campaign, after beating Boss Level | Somewhere in the code, a turnip field keeps loading | The same, a little louder |
| Boss Level, when it loses | "CONTINUE? 3... 2... I only wanted to level up. All of it." | Its motive |
| Card stories (Nov 2026): Simple Farmer, Simple Barkeep, Simple Defender, Simpledom | The same row every morning and never wondering why; the same drink for everyone; guarding without being told against what; the sun rising at the same minute every day | The Simple world runs like a program: made, not grown |
| Card story: The Simplistic | "Everything was fine before. Everything will be fine again. Everything is fine." | It repeats itself, like the rest of its lines |
| Card stories: Jungle, Primeval Forest | The jungle "wasn't here last week"; the oldest trees in a jungle "only a week old" | The jungle was put there (matches The Man Ape's story card) |
| Card stories: Hungry Corpse, Soul Shepard | The first thing found in the wreckage, so everyone decided it was to blame; it gathers the fallen and never asks whose fault it was | The Zombies are victims, blamed for being found first |
| Card story: Glitch | "Some say it was here before the break." | Cyber was involved before the Shardfall |
| Card story: Data Collector | Collecting since long before the worlds collided, and never says for whom | Boss Level was preparing |
| Card story: Server Farm | From above, its racks look a lot like turnip fields | Boss Level made the Simplistic's world |
| Card story: Boss Level | "Every world needs a final boss. Boss Level made sure of it." | Bolder, as befits fight four: it shaped the worlds |
| Campaign, The Simplistic's scene | The turnip rows are perfectly straight, every one exactly the same | Made, not grown |
| Campaign, IP Man's scene | One stone in the courtyard is cracked in a perfect square | A pixel: the break came from something digital |
| Campaign, Boss Level's scene | For a blink, a progress bar hangs at 99% | The "level up" it was attempting |
| The Protected look, every match (24 Nov 2026, owner's pick) | The ring of light around a Protected card fills like a progress bar and always stops at 99%; in the shell on a Protected player's health gem, one shard never lights | The same unfinished "level up": Protection itself carries Boss Level's failed attempt |
| Campaign, Soul Shepard's scene | "They say I started all this. I only tend what's left." | The Zombies are blamed, and are victims |

## Card stories

- Every card has a short story (flavor text): the Description column of `data/cards.csv`, which
  is "Flavor text" in the card sheet. A card's story stays hidden until the player plays it once;
  the end screen lists the stories a match unlocked, and the Almanac counts them.
- Stories carry many of the hidden clues (see the clue log). Keep them short: a few words to a
  few sentences.

## The intro (cold open)

- About 20 seconds of still stained-glass panels with on-screen text, before the main
  menu, **every time the game opens**, with a Skip button. Tap to move on.
- First-time players are then offered the tutorial.
- Watch it again: Settings → Watch the intro. To open the game without it, use a link
  ending in `#menu`.
- The text lives in `js/intro.js` (`INTRO_PANELS`). It is a placeholder to be rewritten.

## The campaign

- One match per champion, in this order: The Simplistic, The Man Ape, IP Man, Boss Level,
  Soul Shepard. Zombie comes last because the other champions blame it.
- Each match has a short story card before it (with the champion's one-line tag, a short scene
  and the champion's words to the Shardkeeper) and a line after a win, in `js/campaign.js`
  (`CAMPAIGN`). Gifts after a win were discussed and are on hold. The champions' in-match lines and play
  styles are in `js/champions.js`. Narration stays at a distance (no "you").
- Nothing in the code assumes five champions. To add one, add a stage to `CAMPAIGN`, an entry
  to `CHAMPIONS` and a starter deck for its faction.

## Open questions

- Champion art.
- Which other factions helped Boss Level, and what do their champions say about it?
- Do rarities mean something in the story? One idea: Unknown shards are fragments from
  the moment of the break, which would explain why there is only one per deck.
- Is there a place at the center of it all, for example the altar on the board?
- Who makes the art.
