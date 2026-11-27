// The champions: who they are, what they say, and how the computer plays them.
// Plain data and no screen code, so the rules self-test can load it too. The speech that
// shows these lines in a match is in js/campaign.js.
// The story bible is docs/world.md. Edit the text here; the clue log there lists which
// lines are hidden clues, so keep the two in step.
//
//   tag      one line shown on the story card before the match
//   lines    what the champion says. Each key holds one or more lines; one is picked at random
//            (the Simplistic always says the same line, on purpose. See the clue log.)
//              start     the match begins        champion  its champion card is played
//              hurt      it takes a big hit      low       its health drops below half
//              hit       it hits you hard        win / lose  the match ends
//              shardLost you break the big shard   shardWon  it breaks the big shard
//              fell      its champion card falls   brink     its health drops to 5 or less
//              outnumber its side has more characters than yours (The Man Ape only)
//              recallWin / recallLose  the end screen, after it wins / loses: remembers the match.
//                        {card} is your card that dealt the most damage, {n} how much
//            Champions speak in the campaign, and in normal matches against the computer as
//            the champion of the computer's deck.
//   campaign its campaign stage: stage (the order, 1 first), intro (the story card), scene, says
//            (its words to the Shardkeeper) and win (the line after you beat it). It plays its
//            card's fracture's starter deck. Leave campaign out for a champion not in the campaign.
//   guide    the Almanac's Champions tab: notes, status (sample status lines) and pairs (before
//            -> after pictures: a card with pick and change, or two labels from/to, each with a
//            caption). {goal}, {health}, {phase2} and {final} are filled in from the data, so the
//            Almanac stays right when the numbers change.
//   ai       how the computer plays it (js/ai.js reads these on top of its faction's style):
//              face board hand wild   as in AI_STYLES
//              depth     how many plays ahead it plans (default PLAN_DEPTH)
//              patience  an attack must gain at least this much to be worth making
//              champMargin  extra gain needed before the champion card itself attacks
//              sac       the gain a Monkey sacrifice must clear (lower = sacrifices readily)
//              gather    a bonus for returning a fallen Zombie to hand
//              late      { round, ...tweaks } changes from that round on
//              hurt      { below, ...tweaks } changes when its health fraction is below that

// Keyed by the champion card's CardID (data/cards.csv), so the card can be renamed freely.
const CHAMPIONS = {
  the_simplistic: {
    tag: "A cheerful homebody who insists everything was fine before.",
    lines: {
      start: ["Nice turnips. Nice day. Why fight?"],
      champion: ["Keep it simple."],
      hurt: ["Hm. That was not in the plan."],
      low: ["Keep it simple. Keep it simple."],
      hit: ["Nice turnips. Nice day. Why fight?"],
      win: ["See? Simple."],
      lose: ["Keep it simple."],
      shardLost: ["Hm. That was not in the plan."],
      shardWon: ["See? Simple."],
      fell: ["Keep it simple. Keep it simple."],
      brink: ["Nice turnips. Nice day. Why fight?"],
      recallWin: ["See? Simple."],
      recallLose: ["Keep it simple."],
    },
    // Steady and unhurried: plans one play at a time, and does not chase the player.
    ai: { face: 0.85, board: 1, hand: 0.7, depth: 1 },
    // The campaign: its place in the order, and the story card before and after the match.
    campaign: {
      stage: 1,
      scene: "The turnip rows are perfectly straight, every one exactly the same.",
      says: "Nice turnips. Nice day. Why fight?",
      intro: "A shard comes down in a quiet turnip field. The Simplistic is already standing over it, insisting everything was fine before all this.",
      win: "The Simplistic shrugs and steps aside. \"Keep it simple,\" it says. \"Start small, then level up.\" It says it exactly as it said it before.",
    },
    // The Almanac's Champions tab: notes, sample status lines and before-and-after pictures.
    guide: {
      notes: ["Nothing happens until it levels up.", "It levels up at the start of the turn when you have {goal} mana crystals. That is the same turn for every match, so you can plan for it.", "After that, every Simple character you have gets the bonus, and so does every Simple character you play later."],
      status: ["Lv 1 · 4/{goal} max mana", "Lv 2 · Leveled up"],
      pairs: [{ caption: "When you reach {goal} mana crystals: every Simple character gets +1 Attack and +1 Health.", pick: c => c.id === "simple_farmer", change: { attack: 1, health: 1 } }],
    },
  },
  the_man_ape: {
    tag: "A loud troop boss who hoards shards like bananas.",
    lines: {
      start: ["My jungle. My shards."],
      champion: ["Ooh! Ha! Who's the boss now?"],
      hurt: ["Knock louder."],
      low: ["Ooh, ooh. Now I'm angry."],
      hit: ["Ha! Ha! Ha!"],
      win: ["Go home. Take your shards with you. Ha."],
      lose: ["Fine. Fine! The troop remembers."],
      shardLost: ["Hey! That one was MINE."],
      shardWon: ["Mine! Shiny. Mine."],
      fell: ["You hit the boss? You hit the BOSS?"],
      brink: ["Ooh. Ooh. The troop is watching. Get up."],
      outnumber: ["Look around. Count. Ha!"],
      recallWin: ["Your {card} hit hard. Not hard enough. Ha!"],
      recallLose: ["That {card}. The troop will talk about that {card}."],
    },
    // Territorial: keeps its troop around it, sacrifices cousins readily, and gets angrier
    // (and faster to attack) the more you hurt it.
    ai: { face: 0.85, board: 1.3, hand: 0.45, wild: 0.25, sac: -1.5, hurt: { below: 0.5, face: 1.5, board: 1.1 } },
    // The campaign: its place in the order, and the story card before and after the match.
    campaign: {
      stage: 2,
      scene: "The Man Ape peels a banana on top of its shard pile.",
      says: "My jungle. My shards. You want some? Earn them.",
      intro: "Deep in a jungle that wasn't there last week, The Man Ape sits on a pile of shards like a hoard of bananas. The troop watches from the trees. The ground still hums where the jungle first appeared.",
      win: "The troop scatters. The Man Ape lets the shard go, but keeps one eye on it.",
    },
    // The Almanac's Champions tab: notes, sample status lines and before-and-after pictures.
    guide: {
      notes: ["It counts the characters on each side. With more than your opponent, every character you have gets +1 Attack, Monkey or not.", "It only works on your turn, when you attack. Your characters don't get it while defending.", "It switches on and off by itself as characters come and go, even in the middle of your attacks."],
      status: ["4 vs 3 characters · +1 Attack", "2 vs 3 characters"],
      pairs: [{ caption: "With more characters than your opponent, on your turn: +1 Attack.", pick: c => c.group === "Wild" && c.type === "Character" && c.manaCost === 2, change: { attack: 1 } }],
    },
  },
  ip_man: {
    tag: "A calm, polite master who bows before every fight.",
    lines: {
      start: ["*bows* Please, begin."],
      champion: ["Your strength is mine to return."],
      hurt: ["A good strike. Again."],
      low: ["Patience. I am only beginning."],
      hit: ["Please, learn from it."],
      win: ["Again tomorrow."],
      lose: ["*bows* Thank you. A fine lesson."],
      shardLost: ["*bows* Well taken."],
      shardWon: ["The shard rewards patience."],
      fell: ["A clean strike. I felt it."],
      brink: ["Breathe. One more exchange."],
      recallWin: ["Your {card} has promise. Bring it back tomorrow."],
      recallLose: ["Your {card} fought with a clear mind. *bows*"],
    },
    // Patient: waits for a clean exchange, and keeps IP Man himself at home for his redirect.
    ai: { face: 0.7, board: 1.05, hand: 0.8, patience: 2, champMargin: 4, depth: 3 },
    // The campaign: its place in the order, and the story card before and after the match.
    campaign: {
      stage: 3,
      scene: "He is sweeping the courtyard. One stone is cracked in a perfect square.",
      says: "*bows* Every fight is a lesson. Shall we study?",
      intro: "Since his world broke, IP Man has trained on a cliff edge above the falling shards. He bows before every fight and expects a bow back. He swears the sky flickered, just once, a moment before the break.",
      win: "IP Man bows once more. \"Again tomorrow,\" he says, and he means it.",
    },
    // The Almanac's Champions tab: notes, sample status lines and before-and-after pictures.
    guide: {
      notes: ["The bow happens by itself when you press To battle. The game picks your strongest character that can attack this turn.", "The +2 Attack lasts until the end of your turn.", "A fight counts as won when your character survives and the enemy character is knocked out. Attacks on the player don't count. Fights you win while defending count too.", "After {goal} won fights, your two strongest attackers get the bow each turn."],
      status: ["Lv 1 · 3/{goal} fights won", "Lv 2 · Leveled up"],
      pairs: [{ caption: "At the start of your Battle phase: your strongest ready attacker gets +2 Attack this turn.", pick: c => c.group === "Mortal" && c.type === "Character" && c.manaCost === 2, change: { attack: 2 } }],
    },
  },
  boss_level: {
    tag: "A smug final boss that narrates its own phases.",
    lines: {
      start: ["LEVEL 1. BEGIN."],
      champion: ["PHASE 2 UNLOCKED."],
      hurt: ["CRITICAL HIT. Noted."],
      low: ["Health bar glitch... that's fine."],
      hit: ["COMBO!"],
      win: ["GAME OVER. Insert coin."],
      lose: ["CONTINUE? 3... 2... I only wanted to level up. All of it."],
      shardLost: ["LOOT STOLEN. Reporting player."],
      shardWon: ["RARE DROP ACQUIRED."],
      fell: ["Respawning in... no respawn?"],
      brink: ["WARNING: LOW HP. This is fine."],
      recallWin: ["{card} only dealt {n}. Insert coin."],
      recallLose: ["{card} dealt {n} damage. Logging that build."],
    },
    // Confident early (grows its team), scary late (goes for the player from round 5).
    ai: { face: 0.8, board: 1.35, hand: 0.4, late: { round: 5, face: 1.6, board: 1.0 } },
    // The campaign: its place in the order, and the story card before and after the match.
    campaign: {
      stage: 4,
      scene: "The air hums like a computer fan. For a blink, a progress bar hangs at 99%.",
      says: "PLAYER 2 HAS ENTERED. Difficulty: adjusting…",
      intro: "A shard has landed in a server room humming in the middle of nowhere. Boss Level loads in with a health bar nobody has seen the end of. Its desktop wallpaper is a quiet turnip field.",
      win: "Boss Level flickers. GAME OVER, the screens read, though nobody is sure for whom. Somewhere in the code, a turnip field keeps loading.",
    },
    // The Almanac's Champions tab: notes, sample status lines and before-and-after pictures.
    guide: {
      notes: ["It works from your starting health: with {health}, PHASE 2 starts at {phase2} health or less and FINAL PHASE at {final} or less.", "In PHASE 2 you draw 2 cards in your Draw phase instead of 1.", "FINAL PHASE keeps the extra card and gives every character you have +1 Attack and +1 Health, Digital or not.", "Healing never takes you back to an earlier phase."],
      status: ["Phase 1", "Phase 2", "Final phase"],
      pairs: [
        { caption: "PHASE 2: 1 extra card each turn.", from: "🂠 1", to: "🂠 2" },
        { caption: "FINAL PHASE: your characters also get +1 Attack and +1 Health.", pick: c => c.group === "Cyber" && c.type === "Character" && c.manaCost === 2, change: { attack: 1, health: 1 } },
      ],
    },
  },
  soul_shepard: {
    tag: "A gentle keeper of the fallen. It never argues.",
    lines: {
      start: ["Come in. There's room."],
      champion: ["Rest here. All of you."],
      hurt: ["It is all right."],
      low: ["Stay. Or go home. Your choice."],
      hit: ["Shh. It's over."],
      win: ["Rest now. All of you."],
      lose: ["Take them. They were never mine."],
      shardLost: ["Keep it. Something should be kept."],
      shardWon: ["Another light to tend."],
      fell: ["Ah. My turn to rest."],
      brink: ["Don't worry for me. I know the way down."],
      recallWin: ["Your {card} rests with mine now."],
      recallLose: ["Your {card} carried you home. Be kind to it."],
    },
    // A patient collector: builds a swarm, takes fallen Zombies back into hand, strikes late.
    ai: { face: 0.7, board: 1.25, hand: 0.6, gather: 1.5, late: { round: 6, face: 1.4 } },
    // The campaign: its place in the order, and the story card before and after the match.
    campaign: {
      stage: 5,
      scene: "Grey stones, quiet. Soul Shepard walks among them, humming.",
      says: "They say I started all this. I only tend what's left.",
      intro: "The other champions all say the Zombies caused the Shardfall. Soul Shepard waits among the graves, gathering the fallen, and does not argue.",
      win: "Soul Shepard lowers its crook. Among the souls it gathered are faces from every world, not only its own. The shards keep falling.",
    },
    // The Almanac's Champions tab: notes, sample status lines and before-and-after pictures.
    guide: {
      notes: ["This one has no levels. It makes the Soul Shepard card itself bigger.", "Every Undead character that dies counts: yours and your opponent's.", "It counts from the start of the match, wherever the card is: in your deck, in your hand or on the table. So the longer the match, the bigger Soul Shepard is when you play it.", "It gains Health only, never Attack."],
      status: ["3 undead fallen"],
      pairs: [{ caption: "After 3 Undead characters have died: Soul Shepard has +3 Health, even in your hand.", pick: c => c.id === "soul_shepard", change: { health: 3 } }],
    },
  },
};

// The campaign stages in order, built from the champions above: { champion, faction, stage, ... }.
const CAMPAIGN = Object.entries(CHAMPIONS).filter(([, c]) => c.campaign)
  .map(([id, c]) => ({ champion: id, faction: DATA.cardsById[id]?.group, ...c.campaign }))
  .sort((a, b) => a.stage - b.stage);
// The champion a player is, or null (the computer plays a champion only in the campaign).
const championOf = p => (p && p.champion && CHAMPIONS[p.champion]) || null;
