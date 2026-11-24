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
  },
};

// The champion a player is, or null (the computer plays a champion only in the campaign).
const championOf = p => (p && p.champion && CHAMPIONS[p.champion]) || null;
