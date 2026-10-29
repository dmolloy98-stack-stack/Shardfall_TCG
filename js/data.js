// Shardfall game data.
// These blocks are the same CSV files the Lua version read from data/*.csv.
// Edit them here to change cards, decks and balance; the game parses them at startup.
// Lines beginning with # are instructions and are ignored by the loader.
// If a value contains a comma, wrap the whole value in double quotes.

const CSV = {};

CSV.game_rules = `# GAME RULES
# Global balance and game setup values. Value is read according to ValueType.
RuleID,Value,ValueType,Description
starting_player_health,20,number,Initial health for each player
starting_hand_size,6,number,Cards drawn at the beginning of a game
mana_growth_per_turn,1,number,Mana maximum gained at the start of each turn
max_field_characters,7,number,Maximum characters on one battlefield
max_field_equipment,5,number,Maximum equipment cards on one battlefield
max_field_areas,5,number,Maximum area cards on one battlefield
min_deck_size,35,number,Smallest legal deck
max_copies,4,number,Most copies of one card a deck may hold
max_unknown_copies,2,number,Most copies of one Unknown-rarity card a deck may hold`;

CSV.phases = `# PHASES
# Turn phases are listed in order. The engine owns the phase behavior; this controls labels and help text.
PhaseID,Name,DisplayOrder,Instruction,AllowsCardPlay,AllowsAttack,RequiresDraw
Draw,Draw,1,Click DRAW CARD to draw from your deck,false,false,true
Setup,Setup,2,Drag cards from your hand to play them,true,false,false
Battle,Battle,3,Click your character then click an enemy to attack,false,true,false
End,End,4,Resolve end-of-turn effects and pass the turn,false,false,false`;

CSV.ui_text = `# UI TEXT
TextID,Text,Category
button_start_game,START GAME,Button
button_almanac,ALMANAC,Button
button_restart,RESTART,Button
button_main_menu,MAIN MENU,Button
tutorial_draw,Click DRAW CARD to begin,Tutorial
tutorial_setup,Drag cards with green glow onto the field to play them,Tutorial
tutorial_battle,Click one of your characters then click an enemy,Tutorial`;

CSV.skills = `# SKILLS
# One row per skill keyword. DisplayOrder controls the Almanac order.
SkillID,Name,IconKey,Description,DisplayOrder
flash,Flash,✦,Can be played during the Battle phase,10
cloak,Cloak,◉,Cannot be targeted by spells,20
reanimate,Reanimate,↺,Returns to the battlefield once after dying,30
rush,Rush,➜,Can attack on the turn it is played,40
overwhelm,Overwhelm,⚔,Excess damage hits the opposing player,50
parry,Parry,↯,Deals double damage when defending,60
tower,Tower,▰,Cannot attack but blocks,70
challenge,Challenge,!,Enemies must attack this character,80
signal,Signal,⌁,Triggers an ability when entering the field,90
rally,Rally,♜,+1 Attack and Speed while you control 3+ Rally characters of the same faction,100
level_up,Level Up,↑,Grows stronger when its condition is met,110
evolve,Evolve,✧,+3 to all stats once its condition is met,120
transform,Transform,⇄,Changes into another card,130`;

CSV.rarities = `# RARITIES
# Edge colors use RGB values from 0 to 1. EquipmentAttachCost is the cost to attach equipment already on the field.
RarityID,Name,EdgeR,EdgeG,EdgeB,EquipmentAttachCost,DisplayOrder
basic,Basic,0.56,0.59,0.64,1,10
rare,Rare,0.22,0.48,0.95,2,20
exotic,Exotic,0.68,0.28,0.88,3,30
divine,Divine,0.25,0.72,0.35,4,40
unknown,Unknown,0.95,0.68,0.18,5,50`;

CSV.factions = `# FACTIONS
FactionID,Name,ColorR,ColorG,ColorB,SymbolKey,Description,DisplayOrder
Simple,Simple,0.30,0.64,0.36,sprout,Nature and humble beginnings,10
Monkey,Monkey,0.84,0.58,0.17,paw,Agility and mischief,20
Zombie,Zombie,0.40,0.63,0.42,skull,Decay and resurrection,30
Fighter,Fighter,0.78,0.28,0.24,swords,Combat and discipline,40
Digital,Digital,0.18,0.68,0.86,chip,Glass cannons that level up,50`;

CSV.cards = `# CARDS
# One row per card. CardID is the permanent internal ID; never change it after using it in a deck.
# Cost is mana. Stats use Attack+Health+Speed. Skills are separated with +. Use --- for none.
# ArtKey maps to assets/cards/<ArtKey>.png (optional; cards without art show their faction symbol).
CardID,Cost,Name,Rarity,Type,Race,Faction,Stats,Skills,Ability,Description,ArtKey
flame_surge,3,Flame Surge,Basic,Spell,N/A,N/A,---,---,Deal 1 damage to all characters and players,,flame_surge
fire_storm,5,Fire Storm,Rare,Spell,N/A,N/A,---,---,Deal 3 damage to all characters and players,,fire_storm
whirlpool,4,Whirlpool,Basic,Area,N/A,N/A,---,---,All characters take 1 damage upon entering the field and have their speed reduced by 1,,whirlpool
call_back,4,Call Back,Rare,Spell,N/A,N/A,---,---,Return target character from a graveyard to your hand,,call_back
nullify,4,Nullify,Rare,Spell,N/A,N/A,---,Flash,Counter target character or spell,,nullify
disable,3,Disable,Divine,Spell,N/A,N/A,---,---,Choose a character. That character now has no abilities,,disable
nope_for_one,2,Nope for One,Basic,Spell,N/A,N/A,---,Flash,Counter target spell which targets a single character,,nope_for_one
nope_for_all,2,Nope for All,Basic,Spell,N/A,N/A,---,Flash,Counter target spell which targets more than 1 character,,nope_for_all
return_to_sender,3,Return to Sender,Basic,Spell,N/A,N/A,---,Flash,Counter target character,,return_to_sender
try_again,3,Try Again,Basic,Spell,N/A,N/A,---,Flash,Counter target spell,,try_again
mana_horder,7,Mana Horder,Exotic,Character,Goblin,N/A,2+2+1,Signal,Steal a mana from an opposing player and add it to your own maximum mana,,mana_horder
area_denial,3,Area Denial,Basic,Spell,N/A,N/A,---,---,Destroy target Area,,area_denial
simple_farmer,1,Simple Farmer,Basic,Character,N/A,Simple,1+1+1,---,"When played, search your deck for a Simple Farmer and add it to your hand. Once you control 3 Simple Farmers on the field, search your deck for a Simpler Farmer and put him on the field",,simple_farmer
simple_barkeep,1,Simple Barkeep,Basic,Character,N/A,Simple,1+1+1,Signal,Add +1 health to target character,,simple_barkeep
simple_swordsman,2,Simple Swordsman,Basic,Character,N/A,Simple,2+1+1,---,---,,simple_swordsman
simple_bowman,2,Simple Bowman,Basic,Character,N/A,Simple,1+1+2,Rush,---,,simple_bowman
simple_wanderer,2,Simple Wanderer,Basic,Character,N/A,Simple,1+2+1,---,---,,simple_wanderer
sword,1,Sword,Basic,Equipment,N/A,Simple,1+0+0,---,---,,sword
bow,1,Bow,Basic,Equipment,N/A,Simple,0+0+1,---,---,,bow
helm,1,Helm,Basic,Equipment,N/A,Simple,0+1+0,---,---,,helm
slap,1,Slap,Basic,Spell,N/A,Simple,---,Signal,Target character loses 1 Health.,,slap
simple_wizard,4,Simple Wizard,Rare,Character,N/A,Simple,3+1+2,Signal,Choose target player or character - deal 2 damage to the target,,simple_wizard
simple_messenger,3,Simple Messenger,Rare,Character,N/A,Simple,1+2+1,Signal,Look at the top card of your opponent's deck - choose to place it on the top of your deck or discard it,,simple_messenger
staff,2,Staff,Rare,Equipment,N/A,Simple,3+1+0,---,---,,staff
herd,4,Herd,Rare,Spell,N/A,Simple,---,---,Add 3 Simple Farmers to the field under your control,,herd
simplify,3,Simplify,Rare,Spell,N/A,Simple,---,---,Target character's stats become 1+1+1,,simplify
simpler_farmer,5,Simpler Farmer,Exotic,Character,N/A,Simple,2+4+2,Signal,Simpler Farmer gets +1 Attack and Speed for each other Simple Farmer on the field,,simpler_farmer
simple_defender,5,Simple Defender,Exotic,Character,N/A,Simple,1+6+0,Challenge+Tower,Add +2 health to this character during your End Phase,,simple_defender
simpledom,5,Simpledom,Exotic,Area,N/A,Simple,---,---,Simple characters gain +2 in all stats,,simpledom
sabre,4,Sabre,Divine,Equipment,N/A,Simple,5+0+5,---,---,,sabre
simplicity,7,Simplicity,Divine,Spell,N/A,Simple,---,---,Reduce all target player's character's stats by -2 in all categories. You gain +2 HP for each character effected,,simplicity
the_simplistic,10,The Simplistic,Unknown,Character,N/A,Simple,5+5+3,Signal,"Simple cards gain immunity from targeted spells and +5 each stat for characters/equipment/spells.",,the_simplistic
fat_monkey,1,Fat Monkey,Basic,Character,Animal,Monkey,1+3+0,Rally,---,,fat_monkey
smart_monkey,1,Smart Monkey,Basic,Character,Animal,Monkey,1+1+2,Rally,---,,smart_monkey
baby_monkey,0,Baby Monkey,Basic,Character,Animal,Monkey,0+1+0,Rally,---,,baby_monkey
monkey_apprentice,2,Monkey Apprentice,Basic,Character,Animal,Monkey,2+1+1,Signal,Add a Banana from your deck to your hand. Shuffle your deck,,monkey_apprentice
chimp,1,Chimp,Basic,Character,Animal,Monkey,1+2+1,Rally,---,,chimp
tree_branch,3,Tree Branch,Basic,Equipment,N/A,Monkey,2+1+0,---,If there are 3 or more monkeys on the field this costs 1,,tree_branch
banana,1,Banana,Basic,Spell,N/A,Monkey,---,---,Target character gains +1 health. Add a Peel from your deck to your hand shuffle your deck,,banana
peel,1,Peel,Basic,Spell,N/A,Monkey,---,---,Target character loses -1 health. If you control 3 or more monkeys it loses 2 health instead,,peel
jungle,3,Jungle,Basic,Area,N/A,Monkey,---,---,All Monkey cards gain +1 speed,,jungle
orangutan,5,Orangutan,Rare,Character,Animal,Monkey,1+4+0,Signal+Rally,Gain +1 health for each other Monkey you control on the field,,orangutan
baboon,5,Baboon,Rare,Character,Animal,Monkey,0+2+3,Rush+Overwhelm,Gain +1 attack for each character on the field,,baboon
banana_tree,5,Banana Tree,Rare,Character,Animal,Monkey,0+5+0,Tower,During your end phase add a Banana to your hand,,banana_tree
ape,5,Ape,Rare,Character,N/A,Monkey,3+3+0,Rally,---,,ape
ripen,3,Ripen,Rare,Spell,N/A,Monkey,---,---,For the rest of the game Banana also adds +1 attack,,ripen
primate,6,Primate,Exotic,Character,Animal,Monkey,2+2+2,Signal+Rally,Search your deck for 2 other Monkey cards that cost 2 or less and put them on the field,,primate
gorilla,6,Gorilla,Exotic,Character,Animal,Monkey,3+4+1,Rally,Each time Gorilla survives damage gain +1 Attack and +1 Speed,,gorilla
arboreal_intelligence,8,Arboreal Intelligence,Exotic,Spell,N/A,Monkey,---,---,Give all Monkey character cards +5 to all stats,,arboreal_intelligence
call_of_the_jungle,6,Call of the Jungle,Divine,Spell,N/A,Monkey,---,---,Select 3 or less Monkey cards from your Graveyard return them to your hand,,call_of_the_jungle
primeval_forest,7,Primeval Forest,Divine,Area,N/A,Monkey,---,---,All Monkey character cards have +3 to all stats,,primeval_forest
the_man_ape,7,The Man Ape,Unknown,Character,Animal,Monkey,4+4+4,Challenge+Cloak,When defending gain +10 to all stats. After each battle you may sacrifice a Monkey you control to permanently give Tarzan +1 to all stats and fully heal,,the_man_ape
reanimated_corpse,0,Reanimated Corpse,Basic,Character,Undead,Zombie,0+1+0,Reanimate,---,,reanimated_corpse
lurker,1,Lurker,Basic,Character,Undead,Zombie,1+1+0,---,---,,lurker
patched_husk,1,Patched Husk,Basic,Character,Undead,Zombie,0+1+1,---,---,,patched_husk
hungry_corpse,2,Hungry Corpse,Basic,Character,Undead,Zombie,1+1+1,Reanimate,Gain +1 to all stats when brought from the Graveyard to the Field,,hungry_corpse
extra_arm,2,Extra Arm,Basic,Equipment,N/A,Zombie,2+0+0,---,---,,extra_arm
haunt_the_living,3,Haunt the Living,Basic,Spell,N/A,Zombie,---,---,Target character gains Reanimate,,haunt_the_living
rotten_finger,3,Rotten Finger,Basic,Spell,N/A,Zombie,---,---,Discard a card in your hand draw a card,,rotten_finger
rotten_hand,5,Rotten Hand,Basic,Spell,N/A,Zombie,---,---,Discard all the cards in your hand draw 3 cards,,rotten_hand
rise_from_the_dead,3,Rise from the Dead,Basic,Spell,N/A,Zombie,---,---,Return target Undead character from your graveyard to your hand. Pay 2 more to bring it to the Field instead,,rise_from_the_dead
plaguemancer,8,Plaguemancer,Rare,Character,Undead,Zombie,2+2+1,Signal,Turn target character into a Zombie and gain control of it. That character gains Reanimate,,plaguemancer
breathing_wall,2,Breathing Wall,Rare,Character,Undead,Zombie,0+5+0,Tower+Challenge,---,,breathing_wall
sneaky_skinbag,5,Sneaky Skinbag,Rare,Character,Undead,Zombie,1+2+1,Cloak,During your End Phase create a Reanimated Corpse on your side of the field. Gain +1 health for each other Zombie on the field,,sneaky_skinbag
midnight_madness,6,Midnight Madness,Rare,Area,N/A,Zombie,---,---,Undead characters gain +2 to all stats,,midnight_madness
infection,5,Infection,Rare,Spell,N/A,Zombie,---,---,Turn target character into a Zombie and gain control of it,,infection
shadow_stitched_soldier,5,Shadow-Stitched Soldier,Exotic,Character,Undead,Zombie,3+2+2,Reanimate+Evolve,After returning from the Graveyard to the Field Evolve,,shadow_stitched_soldier
zombombadier,7,Zombombadier,Exotic,Character,Undead,Zombie,1+1+1,Reanimate+Evolve,Deal damage to all characters and players equal to this Zombombadier's stat line. After returning from the Graveyard to the Field Evolve,,zombombadier
soul_suction,6,Soul Suction,Exotic,Spell,Undead,Zombie,---,Flash,Destroy target character gain HP based on that character's stat-line,,soul_suction
they_just_keep_coming,15,They Just Keep Coming,Divine,Spell,N/A,Zombie,---,---,This costs 1 less for each Zombie on the field. Every Zombie gains Reanimate. If a Zombie already has Reanimate give them +3 health,,they_just_keep_coming
deaths_grasp,6,Death's Grasp,Divine,Spell,N/A,Zombie,---,---,Destroy target character. Ignore skills and abilities,,deaths_grasp
soul_shepard,5,Soul Shepard,Unknown,Character,Undead,Zombie,3+3+3,---,Each time a Zombie is sent to your graveyard gain the stats of that Zombie OR return the Zombie to your hand,,soul_shepard
seasoned_monk,2,Seasoned Monk,Basic,Character,N/A,Fighter,1+1+2,Parry,---,,seasoned_monk
white_belt_student,1,White Belt Student,Basic,Character,N/A,Fighter,0+1+0,Level Up+Transform,Level Up whenever an equipment enters the Field. After Level Up is triggered 3 times Transform into Black Belt Student. Keep stats from Level Up,,white_belt_student
weapons_enthusiast,1,Weapons Enthusiast,Basic,Character,N/A,Fighter,1+1+1,---,Equip costs become 0 when equipping to Weapons Enthusiast,,weapons_enthusiast
sensei,5,Sensei,Basic,Character,N/A,Fighter,2+2+2,---,While Sensei is on the field all equip costs become 0,,sensei
sparring_gear,4,Sparring Gear,Basic,Equipment,N/A,Fighter,0+3+0,---,---,,sparring_gear
zippy_shoes,4,Zippy Shoes,Basic,Equipment,N/A,Fighter,0+0+3,---,---,,zippy_shoes
mc_knuckle_dusters,4,McKnuckle Dusters,Basic,Equipment,N/A,Fighter,3+0+0,---,---,,mc_knuckle_dusters
bite_the_ear,1,Bite the Ear,Basic,Spell,N/A,Fighter,---,---,Target character loses 1 health,,bite_the_ear
sweep_the_leg,2,Sweep the Leg,Basic,Spell,N/A,Fighter,---,---,Target character loses 1 speed,,sweep_the_leg
black_belt_student,4,Black Belt Student,Rare,Character,N/A,Fighter,2+2+2,Parry+Transform,Transform into 5th Degree Master after surviving 3 combat phases,,black_belt_student
fight_choreographer,6,Fight Choreographer,Rare,Character,N/A,Fighter,1+2+1,---,Each other Fighter character on the field gains +2 to all stats,,fight_choreographer
nunchucks,2,Nunchucks,Rare,Equipment,N/A,Fighter,2+0+2,Flash,Can be equipped anytime as long as you have the mana,,nunchucks
bo_staff,2,Bo Staff,Rare,Equipment,N/A,Fighter,2+2+0,Flash,Can be equipped anytime as long as you have the mana,,bo_staff
dojo,4,Dojo,Rare,Area,N/A,Fighter,---,---,Each Fighter character gains Parry and +1 to all stats,,dojo
fifth_degree_master,7,5th Degree Master,Exotic,Character,N/A,Fighter,3+3+2,Parry,,,fifth_degree_master
master_rat,10,Master Rat,Exotic,Character,N/A,Fighter,5+5+5,Parry,Summon 4 1+1+1 turtles who each have Gain +1 to each stat for every other turtle on the field,,master_rat
crane_kick,5,Crane Kick,Exotic,Spell,N/A,Fighter,---,---,Target character loses 7 health,,crane_kick
shaolin_warrior,20,Shaolin Warrior,Divine,Character,N/A,Fighter,10+10+10,Challenge,Each character and equipment on the field makes this card cost 1 less,,shaolin_warrior
kenshis_blade,7,Kenshi's Blade,Divine,Equipment,N/A,Fighter,8+0+2,---,Once per Battle Phase on your turn choose to deal 3 damage to target character,,kenshis_blade
ip_man,6,IP Man,Unknown,Character,N/A,Fighter,4+6+3,Parry,Once per turn redirect the first instance of damage that would be caused to you to another source including players,,ip_man
noob,0,Noob,Basic,Character,N/A,Digital,1+1+0,Level Up,---,,noob
glitch,1,Glitch,Basic,Character,N/A,Digital,2+1+1,Level Up+Rush,---,,glitch
spam_bot,1,Spam Bot,Basic,Character,N/A,Digital,1+1+1,Signal,Trigger target character's Level Up,,spam_bot
gaming_headset,1,Gaming Headset,Basic,Equipment,N/A,Digital,1+0+1,---,---,,gaming_headset
speedrunner,2,Speedrunner,Basic,Character,N/A,Digital,2+1+2,Rush,---,,speedrunner
beta_tester,2,Beta Tester,Basic,Character,N/A,Digital,1+2+1,Level Up,Levels Up during your End Phase,,beta_tester
upgrade,2,Upgrade,Basic,Spell,N/A,Digital,---,---,Trigger target character's Level Up,,upgrade
digital_girlfriend,3,Digital Girlfriend,Basic,Character,N/A,Digital,2+1+0,Signal,Trigger target character's Level Up,,digital_girlfriend
catfish,3,Catfish,Basic,Spell,N/A,Digital,---,Flash,Target character loses -1 to all stats,,catfish
secure_the_data,3,Secure the Data,Basic,Spell,N/A,Digital,---,Flash,Target character gains Cloak until the start of your next turn,,secure_the_data
pro_gamer,3,Pro Gamer,Rare,Character,N/A,Digital,3+1+1,Level Up,Levels Up each time it destroys a character in battle and survives,,pro_gamer
pesky_programmer,4,Pesky Programmer,Rare,Character,N/A,Digital,2+1+2,Level Up,When this character Levels Up it gains +2 Attack and +2 Speed but +0 Health,,pesky_programmer
hacker,4,Hacker,Rare,Character,N/A,Digital,3+1+3,Cloak,---,,hacker
gymfluencer,5,Gymfluencer,Rare,Character,N/A,Digital,1+2+2,Signal,Trigger target character's Level Up twice,,gymfluencer
api_key,5,API Key,Rare,Equipment,N/A,Digital,1+1+0,---,This character gains Level Up. The character holding this Levels Up during your End Phase,,api_key
overclocker,5,Overclocker,Exotic,Character,N/A,Digital,7+1+0,Level Up,---,,overclocker
data_collector,6,Data Collector,Exotic,Character,N/A,Digital,2+2+2,Level Up+Challenge,When your other characters Level Up the Level Up stats go to Data Collector instead,,data_collector
server_farm,6,Server Farm,Exotic,Character,N/A,Digital,1+6+1,Tower,Your characters Level Up during your End Phase,,server_farm
data_transfer,6,Data Transfer,Divine,Area,N/A,Digital,---,---,Once during each of your Setup phases you may remove a Level from one of your characters to gain 2 HP. During your End Phase your strongest Level Up character Levels Up,,data_transfer
digital_drainage,12,Digital Drainage,Divine,Spell,N/A,Digital,---,---,Your Level Up characters Level Up 3 times. Each opposing character loses Attack equal to the number of Levels of your highest-Attack Level Up character,,digital_drainage
boss_level,10,Boss Level,Unknown,Character,N/A,Digital,6+2+2,Level Up,This character has no limit to Level Up,,boss_level`;

CSV.decks = `# DECKS
# One row per deck. CardList format: CardID:Quantity|CardID:Quantity
# Deck rules (from game_rules): at least 35 cards, at most 4 copies of a card, at most 2 of an Unknown card.
# Lists were tuned with computer-vs-computer games. Win rates: Simple ~58%, Monkey ~51%, Fighter ~52%, Digital ~49%, Zombie ~40%.
DeckID,Name,Faction,Description,IsPlayable,IsAI,CardList
simple_starter,Simple Starter,Simple,"A straightforward deck: flood the field with farmers and simple fighters, then back them up with tools",true,false,"simple_farmer:4|simple_barkeep:3|simple_swordsman:3|simple_bowman:2|simple_wanderer:1|sword:2|bow:1|helm:1|slap:2|staff:2|simple_messenger:2|simplify:1|simple_wizard:2|herd:2|sabre:1|simpler_farmer:2|simple_defender:1|simpledom:1|simplicity:1|the_simplistic:1"
monkey_starter,Monkey Starter,Monkey,"A synergy deck: swarm the field with Rally monkeys so they power each other up",true,false,"baby_monkey:3|fat_monkey:3|smart_monkey:3|chimp:3|monkey_apprentice:3|banana:3|peel:2|tree_branch:2|jungle:1|orangutan:2|ape:2|primate:2|gorilla:2|banana_tree:1|arboreal_intelligence:1|call_of_the_jungle:1|the_man_ape:1"
zombie_starter,Zombie Starter,Zombie,"A big-cost, high-reward deck: undead walls and corpses that keep coming back, sweeping spells, and heavy hitters late",true,false,"breathing_wall:3|hungry_corpse:4|lurker:1|reanimated_corpse:2|sneaky_skinbag:3|shadow_stitched_soldier:3|soul_shepard:2|zombombadier:2|plaguemancer:2|extra_arm:3|rise_from_the_dead:2|infection:2|deaths_grasp:1|midnight_madness:3|flame_surge:2"
fighter_starter,Fighter Starter,Fighter,"A combat deck: cheap martial artists that grow stronger with every piece of equipment",true,false,"white_belt_student:4|weapons_enthusiast:4|seasoned_monk:4|black_belt_student:3|sensei:2|fight_choreographer:1|ip_man:1|fifth_degree_master:1|master_rat:1|nunchucks:4|bo_staff:4|mc_knuckle_dusters:1|bite_the_ear:2|crane_kick:1|dojo:1|kenshis_blade:1"
digital_starter,Digital Starter,Digital,"A glass-cannon deck: fragile, hard-hitting characters that Level Up again and again",true,false,"noob:2|glitch:4|spam_bot:4|beta_tester:4|speedrunner:2|upgrade:2|digital_girlfriend:2|gaming_headset:1|catfish:1|pro_gamer:2|pesky_programmer:2|hacker:1|gymfluencer:1|api_key:1|overclocker:1|data_collector:1|server_farm:1|data_transfer:1|boss_level:1|digital_drainage:1"`;

// ---------------------------------------------------------------------------
// Loaders (port of the DATA.load* functions in main.lua)
// ---------------------------------------------------------------------------

// CSV parser that handles quoted fields, e.g. "field,with,comma"
function parseCSVLine(line) {
  const out = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { out.push(field.trim()); field = ""; }
    else field += c;
  }
  out.push(field.trim());
  return out;
}

// Rows of a CSV block, skipping # comments, blank lines and the header row.
function csvRows(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  return lines.slice(1).map(parseCSVLine);
}

function rgb(r, g, b) {
  const to = v => Math.round((parseFloat(v) || 0) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

const DATA = (() => {
  const rules = {};
  for (const [id, value, kind] of csvRows(CSV.game_rules)) rules[id] = kind === "number" ? Number(value) : value;

  const phases = csvRows(CSV.phases)
    .map(c => ({ id: c[0], name: c[1], order: Number(c[2]), instruction: c[3] || "" }))
    .sort((a, b) => a.order - b.order);

  const uiText = {};
  for (const [id, text] of csvRows(CSV.ui_text)) uiText[id] = text || "";

  const skills = {};
  const skillOrder = [];
  for (const c of csvRows(CSV.skills)) {
    skills[c[1]] = { id: c[0], name: c[1], icon: c[2] || "•", desc: c[3] || "", order: Number(c[4]) || 9999 };
    skillOrder.push(c[1]);
  }
  skillOrder.sort((a, b) => skills[a].order - skills[b].order);

  const rarities = {};
  const rarityOrder = [];
  for (const c of csvRows(CSV.rarities)) {
    rarities[c[1]] = { name: c[1], color: rgb(c[2], c[3], c[4]), attachCost: Number(c[5]) || 1, order: Number(c[6]) };
    rarityOrder.push(c[1]);
  }

  const factions = {};
  for (const c of csvRows(CSV.factions)) {
    factions[c[0]] = { id: c[0], name: c[1], color: rgb(c[2], c[3], c[4]), symbol: c[5], desc: c[6], order: Number(c[7]) };
  }

  const statsOf = s => {
    const m = (s || "").match(/(-?\d+)\+(-?\d+)\+(-?\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const skillsOf = s => (s || "").split("+").map(x => x.trim()).filter(x => x && x !== "---");

  const cardsById = {}, cardsByName = {}, cardList = [];
  for (const c of csvRows(CSV.cards)) {
    if (c.length < 8 || !c[0] || !c[2]) continue;
    const [attack, health, speed] = statsOf(c[7]);
    const ability = c[9] && c[9] !== "---" ? c[9] : "";
    const card = {
      id: c[0], manaCost: Number(c[1]) || 0, name: c[2], rarity: c[3] || "Basic", type: c[4],
      race: c[5], group: c[6], attack, health, speed, skills: skillsOf(c[8]),
      ability, description: c[10] || "", artKey: c[11] || c[0],
    };
    cardsById[card.id] = card;
    cardsByName[card.name] = card;
    cardList.push(card);
  }

  const decks = {}, deckOrder = [];
  for (const c of csvRows(CSV.decks)) {
    const id = c[0];
    if (!id) continue;
    const deck = { id, name: c[1], faction: c[2], description: c[3], isPlayable: c[4] === "true", isAI: c[5] === "true", cards: [] };
    for (const token of (c[6] || "").split("|").filter(Boolean)) {
      const m = token.match(/^([^:]+):(\d+)$/);
      if (!m || !cardsById[m[1]] || Number(m[2]) <= 0) throw new Error(`Invalid CardList entry in decks for ${id}: ${token}`);
      deck.cards.push({ cardId: m[1], quantity: Number(m[2]) });
    }
    if (!deck.cards.length) throw new Error(`Deck ${id} has no cards`);
    // Deck-building rules from the design sheet. Problems are reported, not fatal.
    const size = deck.cards.reduce((n, e) => n + e.quantity, 0);
    if (size < (rules.min_deck_size ?? 0)) console.warn(`Deck ${id} has ${size} cards; the minimum is ${rules.min_deck_size}`);
    for (const e of deck.cards) {
      const limit = cardsById[e.cardId].rarity === "Unknown" ? rules.max_unknown_copies : rules.max_copies;
      if (limit && e.quantity > limit) console.warn(`Deck ${id} has ${e.quantity} copies of ${e.cardId}; the limit is ${limit}`);
    }
    decks[id] = deck;
    deckOrder.push(id);
  }

  return {
    rules, phases, uiText, skills, skillOrder, rarities, rarityOrder, factions,
    cardsById, cardsByName, cardList, decks, deckOrder,
    text: (id, fallback) => uiText[id] ?? fallback ?? id,
  };
})();
