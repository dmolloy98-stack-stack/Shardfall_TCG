// Champion abilities: the rules. (Who the champions are, what they say and how the computer plays
// them is js/champions.js; the words players read are data/champion_abilities.csv.)
//
// A deck that holds a champion (an Unknown card with a row in data/champion_abilities.csv) gets that
// champion's ability from turn one, whether or not the champion card has been drawn. Every ability
// is always on. Two level up once in a match (a Goal in the csv); Boss Level moves through phases.
// Progress lives in p.champ = { id, level, n } (for Boss Level, level is the phase: 1, 2 or 3).
//
// ADDING A CHAMPION: add a row to data/champion_abilities.csv and an entry to CHAMPION_RULES below,
// keyed by the champion card's CardID. An entry uses only the moments it needs:
//   bonus(c, p, ch)     extra { a, h } for one of this player's characters (asked all the time)
//   turnStart(p, ch)    at the start of this player's turn, after mana refills
//   battleStart(p, ch)  at the start of this player's Battle phase
//   attacking(p, a, ch) one of this player's characters attacks (before the blow)
//   fightWon(p, ch)     this player's character survived a fight and knocked the other one out
//   hurt(p, ch)         this player just took damage
//   extraDraws(p, ch)   how many extra cards to draw in the Draw phase
//   shard(p, ch)        claiming the big shard: do the bonus and return what happened in words
//   shardText           the shard bonus as the big shard's info window describes it
//   status(p, ch)       for an ability with no levels: { text, lit } under the player's name
//   count(p, ch)        for an ability with levels: progress toward its goal (default ch.n)
// The engine never names a champion; it asks champHook(p, "moment", ...) and champion helpers here.

const champOf = (p, id) => (p && p.champ && p.champ.id === id ? p.champ : null);

// Runs a player's champion's rule for one moment. Returns what the rule returns, or undefined.
function champHook(p, moment, ...args) {
  const ch = p && p.champ;
  const fn = ch && CHAMPION_RULES[ch.id]?.[moment];
  return fn ? fn(p, ...args, ch) : undefined;
}

function champLevelUp(p) {
  const ch = p.champ;
  if (!ch || ch.level >= 2) return;
  ch.level = 2;
  const info = DATA.championAbilities[ch.id];
  log(`${p.name}'s ${info.name} levels up. ${info.then}`);
  emit("champLevel", { player: p.idx, id: ch.id });
}
// Add to a champion's progress counter; at its goal the ability levels up.
function champProgress(p, add) {
  const ch = p.champ;
  if (!ch || ch.level >= 2) return;
  ch.n += add;
  if (ch.n >= DATA.championAbilities[ch.id].goal) champLevelUp(p);
}

// Extra Attack and Health a character gets from its owner's champion ability, and from its own
// "rule: grieve <Kind>" (Soul Shepard: Undead, a fracture).
function championBonus(c) {
  let a = 0, h = 0;
  if (c.type !== "Character") return { a, h };
  const p = S.players[c.owner];
  const b = p && p.champ ? CHAMPION_RULES[p.champ.id]?.bonus?.(c, p, p.champ) : null;
  if (b) { a += b.a || 0; h += b.h || 0; }
  a += c.bow || 0;   // The Bow, this turn
  h += grieveBonus(c);
  return { a, h };
}
// "rule: grieve <Kind>": Health gained from every character of that fracture or tribe that has died. Counted
// from the start of the match, so it is already there when the card is still in the hand.
function grieveBonus(c) {
  const r = S && cardRule(c, "grieve");
  return r ? S.died[r[0]] || 0 : 0;
}

// What an ability with no levels shows under the player's name, and whether it is "lit" (working
// right now, or in a later phase).
const champStatus = p => champHook(p, "status") || { text: "", lit: false };
// Progress toward an ability's goal, for one with levels.
const champCount = p => champHook(p, "count") ?? p.champ.n;

// Chest Thump (The Man Ape): on, while this player has more characters than the opponent.
function chestThump(p) {
  return !!champOf(p, "the_man_ape") && p.field.chars.length > S.players[1 - p.idx].field.chars.length;
}

// Boss Phases (Boss Level): the phase this player's health has reached. 2/3 of the starting
// health or less is PHASE 2, 1/3 or less is FINAL PHASE. Phases never go back down.
const BOSS_PHASES = ["", "PHASE 1", "PHASE 2", "FINAL PHASE"];
function bossPhase(p, phase) {
  const ch = champOf(p, "boss_level");
  if (!ch || phase <= ch.level) return;
  ch.level = Math.min(3, phase);
  log(`${p.name}'s Boss Level enters ${BOSS_PHASES[ch.level]}: ${ch.level >= 3 ? "its characters get +1 Attack and +1 Health, and it draws 1 extra card each turn" : "it draws 1 extra card each turn"}.`);
  emit("champPhase", { player: p.idx, id: ch.id, phase: ch.level });
}

const CHAMPION_RULES = {
  // Humble Beginnings: nothing at first; at max mana 6 every Simple character gets +1/+1.
  the_simplistic: {
    turnStart(p, ch) { ch.n = p.manaMax; if (ch.n >= DATA.championAbilities.the_simplistic.goal) champLevelUp(p); },
    bonus: (c, p, ch) => (ch.level >= 2 && inGroup(c, "Simple") ? { a: 1, h: 1 } : null),
    count: p => p.manaMax,
    shard(p) {   // back to how it was: every character is fully healed
      for (const c of p.field.chars) healFully(c);
      return "all its characters are fully healed";
    },
    shardText: "all your characters are fully healed.",
  },

  // Chest Thump: while you have more characters than your opponent, your characters get +1 Attack
  // on your turn.
  the_man_ape: {
    bonus: (c, p) => (S.active === c.owner && chestThump(p) ? { a: 1 } : null),
    attacking(p, a) { if (chestThump(p)) emit("text", { uid: a.uid, text: "CHEST THUMP +1", color: "#ffd27a" }); },
    status(p) {
      const foe = S.players[1 - p.idx];
      return { text: `${p.field.chars.length} vs ${foe.field.chars.length} characters${chestThump(p) ? " · +1 Attack" : ""}`, lit: chestThump(p) };
    },
    shard(p) {   // a free 2/2 Monkey: a Chimp (1/2) with +1 Attack
      const c = newCard(DATA.cardsById.chimp);
      c.owner = p.idx;
      if (!putOnField(c, p)) return "";
      c.attack += 1; c.baseAttack += 1;
      emit("text", { uid: c.uid, text: "+1 ATTACK", color: "#ffd27a" });
      return `a 2/2 ${c.name} joins its side`;
    },
    shardText: "a free 2/2 Monkey (a Chimp with +1 Attack).",
  },

  // The Bow: at the start of Battle the strongest ready attacker, or two once the ability has
  // leveled up (after 5 fights won), gets +2 Attack until the end of the turn.
  ip_man: {
    battleStart(p, ch) {
      const ready = p.field.chars.filter(canAttack).sort((x, y) => stats(y).a - stats(x).a || x.uid - y.uid).slice(0, ch.level >= 2 ? 2 : 1);
      for (const c of ready) { c.bow = 2; emit("text", { uid: c.uid, text: "THE BOW +2", color: "#ffd27a" }); }
      if (ready.length) log(`${p.name} bows: ${ready.map(c => c.name).join(" and ")} gets +2 Attack this turn.`);
    },
    fightWon(p) { champProgress(p, 1); },
    shard(p) {   // its strongest character gets Swift for the rest of the match
      const c = p.field.chars.slice().sort((x, y) => stats(y).a - stats(x).a || x.uid - y.uid)[0];
      if (!c) return "";
      if (!hasSkill(c, "Swift")) c.skills.push("Swift");
      emit("text", { uid: c.uid, text: "» SWIFT", color: "#9fe7ff" });
      return `${c.name} gets Swift for the rest of the match`;
    },
    shardText: "your strongest character gets Swift for the rest of the match.",
  },

  // Boss Phases: at 2/3 health or less PHASE 2 (draw 1 extra card each turn); at 1/3 or less
  // FINAL PHASE (also +1/+1 for all its characters). A phase, once reached, stays.
  boss_level: {
    bonus: (c, p, ch) => (ch.level >= 3 ? { a: 1, h: 1 } : null),
    hurt(p, ch) {
      if (S.over) return;
      const want = p.health <= p.maxHealth / 3 ? 3 : p.health <= p.maxHealth * 2 / 3 ? 2 : 1;
      if (want > ch.level) bossPhase(p, want);
    },
    extraDraws: (p, ch) => (ch.level >= 2 ? 1 : 0),
    status: (p, ch) => ({ text: ch.level >= 3 ? "Final phase" : `Phase ${ch.level}`, lit: ch.level >= 2 }),
    shard(p, ch) {   // straight to the next phase
      if (ch.level >= 3) return "";
      bossPhase(p, ch.level + 1);
      return `Boss Level jumps to ${BOSS_PHASES[ch.level]}`;
    },
    shardText: "Boss Level jumps to its next phase.",
  },

  // Soul Shepard: "rule: grieve Undead" on the card itself (+1 Health for every Undead that dies,
  // grieveBonus above), and Challenge.
  soul_shepard: {
    status: () => ({ text: `${S.died.Undead || 0} undead fallen`, lit: false }),
    shard(p) {   // its last fallen character comes back to the hand
      const i = p.grave.map(c => c.type).lastIndexOf("Character");
      if (i < 0) return "";
      const dead = p.grave.splice(i, 1)[0];
      const c = newCard(DATA.cardsById[dead.id] || dead);
      c.owner = p.idx;
      if (!addToHand(p, c)) return "";   // a full hand: it goes back to the graveyard
      return `${c.name} returns to its hand from the graveyard`;
    },
    shardText: "your last fallen character comes back to your hand.",
  },
};
