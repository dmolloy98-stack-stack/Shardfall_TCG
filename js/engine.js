// Shardfall rules engine: a port of the game logic in main.lua.
// The engine holds all game state in S and never touches the DOM. The UI listens
// for events sent through emit() to play effects (damage numbers, shakes, banners).
// Cards on the battlefield store their owner as a player index (0 or 1) instead of
// a reference, so the whole state can be cloned for undo and for AI look-ahead.

const PHASE = { DRAW: 0, SETUP: 1, BATTLE: 2, END: 3 };
const RULES = {
  startingHealth: DATA.rules.starting_player_health ?? 20,
  startingHand: DATA.rules.starting_hand_size ?? 6,
  manaGrowth: DATA.rules.mana_growth_per_turn ?? 1,
  maxChars: DATA.rules.max_field_characters ?? 7,
  maxEquips: DATA.rules.max_field_equipment ?? 5,
  maxAreas: DATA.rules.max_field_areas ?? 5,
};

// Counter spells need a response window that the original game never had.
// They stay in the decks but cannot be cast until that system exists.
const UNIMPLEMENTED = new Set(["Nullify", "Nope for One", "Nope for All", "Return to Sender", "Try Again"]);

let S = null;              // live game state
let listeners = [];
let muted = 0;             // >0 while the AI simulates moves on a cloned state

function emit(type, data) { if (!muted) for (const fn of listeners) fn(type, data || {}); }
function onGameEvent(fn) { listeners.push(fn); }
function log(msg) { if (!muted) { S.log.push(msg); if (S.log.length > 60) S.log.shift(); emit("log", { msg }); } }

// Run fn against a cloned copy of the state without emitting events.
function simulate(fn) {
  const saved = S;
  S = structuredClone(saved);
  muted++;
  try { return fn(S); } finally { muted--; S = saved; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const hasSkill = (c, n) => (c.skills || []).includes(n);
const named = (c, n) => c.name === n && !c.disabled;   // Disable switches off name-based abilities
const removeSkill = (c, n) => { const i = (c.skills || []).indexOf(n); if (i >= 0) c.skills.splice(i, 1); };
const active = () => S.players[S.active];
const opponent = () => S.players[1 - S.active];
const ownerOf = c => S.players[c.owner];
const foeOf = p => S.players[1 - p.idx];

function newCard(template) {
  const c = structuredClone(template);
  c.uid = S.nextUid++;
  return c;
}
function cardByName(name) { return DATA.cardsByName[name] ? newCard(DATA.cardsByName[name]) : null; }

function findChar(uid) {
  for (const p of S.players) {
    const i = p.field.chars.findIndex(c => c.uid === uid);
    if (i >= 0) return { c: p.field.chars[i], p, i };
  }
  return null;
}
function findArea(uid) {
  for (const p of S.players) {
    const i = p.field.areas.findIndex(c => c.uid === uid);
    if (i >= 0) return { c: p.field.areas[i], p, i };
  }
  return null;
}
function allChars() { return S.players.flatMap(p => p.field.chars); }
function countChars(pred) { return allChars().filter(pred).length; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function takeFromDeck(p, pred) {
  const i = p.deck.findIndex(pred);
  return i >= 0 ? p.deck.splice(i, 1)[0] : null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function equipBonuses(c) {
  let a = 0, h = 0, s = 0;
  for (const e of c.equipped || []) { a += e.attack; h += e.health; s += e.speed; }
  return { a, h, s };
}

// Area bonuses read from the area's ability text, exactly like getAreaEffectTotals in Lua.
function areaBonuses(p, c) {
  let a = 0, h = 0, s = 0, parry = false;
  for (const area of p.field.areas) {
    const text = (area.ability + " " + area.name).toLowerCase();
    if (area.group === c.group || text.includes("all characters")) {
      const m = text.match(/([+-]\d+)\s+to all stats/) || text.match(/([+-]\d+)\s+in all stats/);
      const n = m ? Number(m[1]) : 0;
      a += n; h += n; s += n;
      const sp = text.match(/([+-]\d+)\s+speed/);
      if (sp) s += Number(sp[1]);
      if (text.includes("parry")) parry = true;
    }
  }
  return { a, h, s, parry };
}

// Effective stats including equipment, areas, synergies and Rally. Health can be
// negative here; display code clamps it.
function rawStats(c) {
  const p = ownerOf(c);
  const e = equipBonuses(c), ar = areaBonuses(p, c);
  let buff = 0;
  if (c.group === "Fighter") buff += 2 * p.field.chars.filter(x => named(x, "Fight Choreographer") && x !== c).length;
  if (c.name === "Turtle") buff += p.field.chars.filter(x => x.name === "Turtle" && x !== c).length;
  let extraA = 0;
  if (named(c, "Baboon")) extraA += countChars(x => x !== c);   // +1 attack per other character on the field
  const rally = c.rallyBonus || 0;
  return {
    a: c.attack + e.a + ar.a + buff + rally + extraA,
    h: c.currentHealth + ar.h + buff,
    s: c.speed + e.s + ar.s + buff + rally,
    parry: hasSkill(c, "Parry") || ar.parry,
  };
}
function stats(c) {
  const r = rawStats(c);
  return { a: Math.max(0, r.a), h: Math.max(0, r.h), s: Math.max(0, r.s), parry: r.parry };
}

function updateRally(p) {
  const count = {};
  for (const c of p.field.chars) if (hasSkill(c, "Rally")) count[c.group] = (count[c.group] || 0) + 1;
  for (const c of p.field.chars) c.rallyBonus = hasSkill(c, "Rally") && (count[c.group] || 0) >= 3 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Skills that change a character
// ---------------------------------------------------------------------------
function triggerEvolve(c) {
  if (hasSkill(c, "Evolve") && !c.hasEvolved) {
    c.attack += 3; c.currentHealth += 3; c.speed += 3; c.hasEvolved = true; removeSkill(c, "Evolve");
    emit("text", { uid: c.uid, text: "EVOLVE!", color: "#b98cff" });
  }
}

function transformCharacter(c, newName) {
  const t = DATA.cardsByName[newName];
  if (!t) return;
  const n = structuredClone(t);
  n.currentHealth = Math.max(1, c.currentHealth + (n.health - c.health));
  n.equipped = c.equipped || [];
  n.hasAttacked = c.hasAttacked;
  n.levelUpCount = c.levelUpCount || 0;
  n.combatSurvived = 0;
  Object.assign(c, n);
  c.baseAttack = c.attack; c.baseHealth = c.health; c.baseSpeed = c.speed;
  emit("text", { uid: c.uid, text: "TRANSFORM!", color: "#6fe3ff" });
  log(`${t.name} appears through Transform.`);
}

function levelUp(c) {
  if (hasSkill(c, "Level Up") && (c.levelUpCount || 0) < 3) {
    c.attack++; c.currentHealth++; c.speed++; c.levelUpCount = (c.levelUpCount || 0) + 1;
    emit("text", { uid: c.uid, text: "LEVEL UP", color: "#ffd25e" });
    if (c.levelUpCount >= 3) {
      removeSkill(c, "Level Up");
      if (named(c, "White Belt Student")) transformCharacter(c, "Black Belt Student");
    }
  }
}

// ---------------------------------------------------------------------------
// Damage and death
// ---------------------------------------------------------------------------
function dealDamageToPlayer(p, amount) {
  if (amount <= 0 || S.over) return;
  p.health = Math.max(0, p.health - amount);
  emit("playerDamage", { player: p.idx, amount });
  checkHealthWin();
}

function healPlayer(p, amount) {
  if (amount <= 0) return;
  p.health = Math.min(p.maxHealth, p.health + amount);
  emit("playerHeal", { player: p.idx, amount });
}

function sendToGraveyard(p, c) {
  const i = p.field.chars.indexOf(c);
  if (i >= 0) p.field.chars.splice(i, 1);
  p.grave.push(c);
  updateRally(p);
  emit("death", { uid: c.uid });
  log(`${c.name} was destroyed.`);
}

// A character dies when its effective health (including area and synergy bonuses) reaches 0.
function checkDeath(c) {
  if (rawStats(c).h > 0) return;
  const p = ownerOf(c);
  if (!p.field.chars.includes(c)) return;
  if (hasSkill(c, "Reanimate") && !c.reanimated) {
    c.reanimated = true; removeSkill(c, "Reanimate");
    c.currentHealth = c.baseHealth; c.attack = c.baseAttack; c.speed = c.baseSpeed;
    if (named(c, "Hungry Corpse")) { c.attack++; c.currentHealth++; c.speed++; }
    triggerEvolve(c); // "After returning from the Graveyard to the Field, Evolve"
    emit("text", { uid: c.uid, text: "REANIMATE", color: "#8dff8d" });
    log(`${c.name} reanimates.`);
    if (rawStats(c).h <= 0) sendToGraveyard(p, c);
  } else sendToGraveyard(p, c);
}

function dealDamageToCharacter(c, amount) {
  if (!c || amount <= 0) return;
  c.currentHealth -= amount;
  emit("charDamage", { uid: c.uid, amount });
  if (rawStats(c).h <= 0) checkDeath(c);
  else if (named(c, "Gorilla")) {
    c.attack++; c.speed++;
    emit("text", { uid: c.uid, text: "+1 ATK/SPD", color: "#ffe066" });
  }
}

// After areas or synergy sources change, characters whose health dropped to 0 die.
function sweepDeaths() {
  for (const c of allChars().slice()) checkDeath(c);
}

function destroyCharacter(c) {   // Death's Grasp: ignores Reanimate
  const p = ownerOf(c);
  if (p.field.chars.includes(c)) sendToGraveyard(p, c);
}

function checkHealthWin() {
  if (S.over) return;
  const dead = S.players.filter(p => p.health <= 0);
  if (dead.length) {
    S.over = true;
    S.winner = dead.length === 2 ? null : 1 - dead[0].idx;
    emit("gameOver", { winner: S.winner });
  }
}

function deckOut(p) {
  if (S.over) return;
  S.over = true; S.winner = 1 - p.idx;
  log(`${p.name} has no cards left to draw.`);
  emit("gameOver", { winner: S.winner, reason: "deck" });
}

// ---------------------------------------------------------------------------
// Entering the field
// ---------------------------------------------------------------------------
function putOnField(c, p) {
  if (p.field.chars.length >= RULES.maxChars) return false;
  p.field.chars.push(c);
  initBattlefieldCharacter(c, p);
  return true;
}

function initBattlefieldCharacter(c, p) {
  c.baseAttack = c.attack; c.baseHealth = c.health; c.baseSpeed = c.speed;
  c.currentHealth = c.health; c.equipped = []; c.hasAttacked = !hasSkill(c, "Rush");
  c.owner = p.idx; c.levelUpCount = 0; c.combatSurvived = 0; c.reanimated = false;
  emit("enter", { uid: c.uid, cost: c.manaCost || 0 });

  if (named(c, "Zombombadier")) {
    const d = c.attack + c.health + c.speed;
    for (const q of S.players) {
      for (const x of q.field.chars.filter(x => x !== c)) dealDamageToCharacter(x, d);
      dealDamageToPlayer(q, d);
    }
  }
  if (named(c, "Master Rat")) {
    for (let k = 0; k < 4; k++) {
      if (p.field.chars.length >= RULES.maxChars) break;
      const turtle = {
        uid: S.nextUid++, id: "turtle", name: "Turtle", rarity: "Basic", type: "Character", race: "Animal", group: "Fighter",
        manaCost: 0, attack: 1, health: 1, speed: 1, skills: [], ability: "Gain +1 to each stat for every other Turtle on the field",
        description: "", artKey: "turtle", token: true,
      };
      putOnField(turtle, p);
    }
  } else if (named(c, "Simple Farmer")) {
    const extra = takeFromDeck(p, x => x.name === "Simple Farmer");
    if (extra) { p.hand.push(extra); emit("handAdd", { player: p.idx }); }
    const farmers = p.field.chars.filter(x => x.name === "Simple Farmer").length;
    if (farmers >= 3 && p.field.chars.length < RULES.maxChars) {
      const big = takeFromDeck(p, x => x.name === "Simpler Farmer");
      if (big) { putOnField(big, p); log("Three farmers call the Simpler Farmer to the field."); }
    }
  }
  updateRally(p);
  triggerSignal(c, p);
}

// Equipment entering the field levels up White Belt Students.
function equipmentEntered(p) {
  for (const x of p.field.chars) if (named(x, "White Belt Student")) levelUp(x);
}

// ---------------------------------------------------------------------------
// Card effects
// Each entry may define:
//   target: "char" | "charOrPlayer" | "area"  (the player then picks a target)
//   intent: "harm" | "help"                   (used by the computer player)
//   apply(ctx, target)                        (run once a target is chosen)
//   now(ctx)                                  (run immediately, no target)
// ctx = { card, owner, spell }
// ---------------------------------------------------------------------------
const loseHealth = n => (ctx, t) => dealDamageToCharacter(t, n);

const EFFECTS = {
  // Simple
  "Simple Barkeep": { target: "char", intent: "help", apply: (ctx, t) => { t.currentHealth += 1; } },
  "Slap": { target: "char", intent: "harm", apply: loseHealth(1) },
  "Simple Wizard": { target: "charOrPlayer", intent: "harm", apply: (ctx, t) => t.isPlayer ? dealDamageToPlayer(S.players[t.idx], 2) : dealDamageToCharacter(t, 2) },
  "Simplify": { target: "char", intent: "harm", apply: (ctx, t) => { t.attack = 1; t.currentHealth = 1; t.speed = 1; } },
  "Simple Messenger": {
    now: ctx => {
      const foe = foeOf(ctx.owner);
      const top = foe.deck[foe.deck.length - 1];
      if (!top) return;
      S.pending = {
        kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: `Top of ${foe.name}'s deck`,
        prompt: "Put this card on top of your deck, or discard it.",
        cards: [top], options: [{ id: "take", label: "Put on my deck" }, { id: "discard", label: "Discard it" }],
        resolve: "messenger",
      };
    },
  },
  "Herd": {
    now: ctx => {
      for (let k = 0; k < 3; k++) { const f = cardByName("Simple Farmer"); if (!f || !putOnField(f, ctx.owner)) break; }
    },
  },
  "Simplicity": {
    now: ctx => {
      const foe = foeOf(ctx.owner);
      const hit = foe.field.chars.slice();
      for (const c of hit) { c.attack -= 2; c.speed -= 2; c.currentHealth -= 2; }
      healPlayer(ctx.owner, 2 * hit.length);
      for (const c of hit) { emit("charDamage", { uid: c.uid, amount: 2 }); checkDeath(c); }
    },
  },
  "Orangutan": { now: ctx => { ctx.card.currentHealth += ctx.owner.field.chars.filter(x => x.group === "Monkey" && x !== ctx.card).length; } },
  "Simpler Farmer": { now: ctx => { const n = ctx.owner.field.chars.filter(x => x.name === "Simple Farmer").length; ctx.card.attack += n; ctx.card.speed += n; } },
  "Mana Horder": {
    now: ctx => {
      const foe = foeOf(ctx.owner);
      ctx.owner.manaMax++; ctx.owner.mana++;
      foe.manaMax = Math.max(0, foe.manaMax - 1); foe.mana = Math.min(foe.mana, foe.manaMax);
    },
  },

  // Monkey
  "Monkey Apprentice": {
    now: ctx => {
      const b = takeFromDeck(ctx.owner, x => x.name === "Banana");
      if (b) { ctx.owner.hand.push(b); emit("handAdd", { player: ctx.owner.idx }); }
      shuffle(ctx.owner.deck);
    },
  },
  "Banana": {
    target: "char", intent: "help",
    apply: (ctx, t) => {
      t.currentHealth += 1;
      if (ctx.owner.ripen) t.attack += 1;
      const peel = takeFromDeck(ctx.owner, x => x.name === "Peel");
      if (peel) { ctx.owner.hand.push(peel); emit("handAdd", { player: ctx.owner.idx }); }
      shuffle(ctx.owner.deck);
    },
  },
  "Peel": { target: "char", intent: "harm", apply: (ctx, t) => dealDamageToCharacter(t, ctx.owner.field.chars.filter(x => x.group === "Monkey").length >= 3 ? 2 : 1) },
  "Ripen": { now: ctx => { ctx.owner.ripen = true; } },
  "Primate": {
    now: ctx => {
      const picks = ctx.owner.deck.filter(n => n.group === "Monkey" && n.type === "Character" && n.name !== "Primate" && n.manaCost <= 2).slice(-2);
      for (const n of picks) {
        if (ctx.owner.field.chars.length >= RULES.maxChars) break;
        ctx.owner.deck.splice(ctx.owner.deck.indexOf(n), 1);
        putOnField(n, ctx.owner);
      }
    },
  },
  "Arboreal Intelligence": {
    now: ctx => { for (const c of ctx.owner.field.chars) if (c.group === "Monkey") { c.attack += 5; c.currentHealth += 5; c.speed += 5; } },
  },
  "Call of the Jungle": {
    now: ctx => {
      const cards = ctx.owner.grave.filter(c => c.group === "Monkey" && !c.token);
      if (!cards.length) return;
      S.pending = { kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Call of the Jungle", prompt: "Pick up to 3 Monkey cards to return to your hand.", cards, pick: 3, resolve: "toHand" };
    },
  },

  // Zombie
  "Haunt the Living": { target: "char", intent: "help", apply: (ctx, t) => { if (!hasSkill(t, "Reanimate")) { t.skills.push("Reanimate"); t.reanimated = false; } } },
  "Plaguemancer": { target: "char", intent: "steal", apply: (ctx, t) => convertToZombie(ctx, t, true) },
  "Infection": { target: "char", intent: "steal", apply: (ctx, t) => convertToZombie(ctx, t, false) },
  "Soul Suction": {
    target: "char", intent: "harm",
    apply: (ctx, t) => {
      const st = stats(t);
      healPlayer(ctx.owner, st.a + st.h + st.s);
      dealDamageToCharacter(t, 99999);
    },
  },
  "Death's Grasp": { target: "char", intent: "harm", apply: (ctx, t) => destroyCharacter(t) },
  "Rotten Hand": {
    now: ctx => {
      const p = ctx.owner;
      while (p.hand.length) p.grave.push(p.hand.pop());
      for (let k = 0; k < 3; k++) drawCard(p);
    },
  },
  "Rotten Finger": {
    now: ctx => {
      if (!ctx.owner.hand.length) return;
      S.pending = { kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Rotten Finger", prompt: "Pick a card from your hand to discard. Then you draw a card.", cards: ctx.owner.hand.slice(), pick: 1, required: true, resolve: "discardDraw" };
    },
  },
  "Rise from the Dead": {
    now: ctx => {
      const cards = ctx.owner.grave.filter(c => c.race === "Undead" && c.type === "Character");
      if (!cards.length) return;
      const options = [{ id: "hand", label: "Return to hand" }];
      if (ctx.owner.mana >= 2 && ctx.owner.field.chars.length < RULES.maxChars) options.push({ id: "field", label: "Bring to the field (+2 mana)" });
      S.pending = { kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Rise from the Dead", prompt: "Pick an Undead character from your graveyard.", cards, pick: 1, options, resolve: "rise" };
    },
  },
  "They Just Keep Coming": {
    now: () => {
      for (const c of allChars()) if (c.group === "Zombie") {
        if (hasSkill(c, "Reanimate")) c.currentHealth += 3;
        else { c.skills.push("Reanimate"); c.reanimated = false; }
      }
    },
  },

  // Fighter
  "Sweep the Leg": { target: "char", intent: "harm", apply: (ctx, t) => { t.speed = Math.max(0, t.speed - 1); } },
  "Bite the Ear": { target: "char", intent: "harm", apply: loseHealth(1) },
  "Crane Kick": { target: "char", intent: "harm", apply: loseHealth(7) },

  // Neutral
  "Flame Surge": { now: () => damageEverything(1) },
  "Fire Storm": { now: () => damageEverything(3) },
  "Area Denial": { target: "area", intent: "harm", apply: (ctx, t) => { const f = findArea(t.uid); if (f) { f.p.field.areas.splice(f.i, 1); f.p.grave.push(t); log(`${t.name} was destroyed.`); sweepDeaths(); } } },
  "Disable": {
    target: "char", intent: "harm",
    apply: (ctx, t) => { t.skills = []; t.disabled = true; t.ability = ""; updateRally(ownerOf(t)); emit("text", { uid: t.uid, text: "DISABLED", color: "#c9c9c9" }); },
  },
  "Call Back": {
    now: ctx => {
      const cards = S.players.flatMap(p => p.grave).filter(c => c.type === "Character" && !c.token);
      if (!cards.length) return;
      S.pending = { kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Call Back", prompt: "Pick a character from either graveyard to add to your hand.", cards, pick: 1, resolve: "toHand" };
    },
  },
};

function damageEverything(n) {
  for (const q of S.players) {
    for (const x of q.field.chars.slice()) dealDamageToCharacter(x, n);
    dealDamageToPlayer(q, n);
  }
}

function convertToZombie(ctx, t, givesReanimate) {
  const foe = foeOf(ctx.owner);
  if (t.owner !== foe.idx || ctx.owner.field.chars.length >= RULES.maxChars) {
    if (givesReanimate || t.owner === ctx.owner.idx) { t.group = "Zombie"; }
    return;
  }
  foe.field.chars.splice(foe.field.chars.indexOf(t), 1);
  t.owner = ctx.owner.idx; t.group = "Zombie"; t.rallyBonus = 0;
  if (givesReanimate && !hasSkill(t, "Reanimate")) { t.skills.push("Reanimate"); t.reanimated = false; }
  ctx.owner.field.chars.push(t);
  updateRally(ctx.owner); updateRally(foe);
  emit("text", { uid: t.uid, text: "INFECTED", color: "#8dff8d" });
  log(`${ctx.owner.name} takes control of ${t.name}.`);
}

function effectFor(c) { return c.disabled ? null : EFFECTS[c.name] || null; }

// Signal abilities fire when the character enters the field.
function triggerSignal(c, owner) {
  if (!hasSkill(c, "Signal")) return;
  const fx = effectFor(c);
  if (!fx) return;
  const ctx = { card: c, owner, spell: false };
  if (fx.target) {
    if (validTargets(fx, ctx).length) S.pending = { kind: "target", source: c, owner: owner.idx, spell: false, targetType: fx.target, intent: fx.intent };
  } else if (fx.now) fx.now(ctx);
}

// Valid targets for a targeted effect. Spells cannot target Cloak characters.
function validTargets(fx, ctx) {
  if (fx.target === "area") return S.players.flatMap(p => p.field.areas);
  const chars = allChars().filter(c => !(ctx.spell && hasSkill(c, "Cloak")) && !(c === ctx.card && fx.intent !== "help"));
  if (fx.target === "charOrPlayer") return [...chars, ...S.players.map(p => ({ isPlayer: true, idx: p.idx }))];
  return chars;
}

function isValidTarget(target) {
  const pd = S.pending;
  if (!pd || pd.kind !== "target") return false;
  const fx = effectFor(pd.source) || EFFECTS[pd.source.name];
  const ctx = { card: pd.source, owner: S.players[pd.owner], spell: pd.spell };
  return validTargets(fx, ctx).some(t => t.isPlayer ? target.isPlayer && target.idx === t.idx : t.uid === target.uid);
}

// ---------------------------------------------------------------------------
// Players, decks, turns
// ---------------------------------------------------------------------------
function makePlayer(idx, deckId, isAI) {
  const def = DATA.decks[deckId];
  return {
    idx, name: isAI ? "Computer" : `Player ${idx + 1}`, isAI: !!isAI, deckId, faction: def.faction,
    mana: 0, manaMax: 0, turnsPlayed: 0, hasDrawn: false, ripen: false,
    deck: [], hand: [], grave: [],
    health: RULES.startingHealth, maxHealth: RULES.startingHealth,
    field: { chars: [], areas: [], equips: [] },
  };
}

function buildDeck(deckId) {
  const d = [];
  for (const entry of DATA.decks[deckId].cards) for (let k = 0; k < entry.quantity; k++) d.push(newCard(DATA.cardsById[entry.cardId]));
  return shuffle(d);
}

function drawCard(p) {
  if (!p.deck.length) { deckOut(p); return null; }
  const c = p.deck.pop();
  p.hand.push(c);
  emit("draw", { player: p.idx, uid: c.uid });
  return c;
}

function startTurn(p) {
  p.turnsPlayed++;
  p.manaMax += RULES.manaGrowth;
  p.mana = p.manaMax;
  p.hasDrawn = false;
  for (const c of p.field.chars) c.hasAttacked = false;
}

function newGame({ deckId, opponentDeckId, mode }) {
  S = { players: [], active: 0, phase: PHASE.DRAW, round: 1, over: false, winner: null, pending: null, mode, nextUid: 1, log: [] };
  let opp = opponentDeckId;
  if (!opp) {
    const others = DATA.deckOrder.filter(id => id !== deckId);
    opp = others.length ? others[Math.floor(Math.random() * others.length)] : deckId;
  }
  S.players = [makePlayer(0, deckId, false), makePlayer(1, opp, mode === "ai")];
  for (const p of S.players) {
    p.deck = buildDeck(p.deckId);
    for (let k = 0; k < RULES.startingHand; k++) drawCard(p);
  }
  startTurn(S.players[0]);
  log(`${S.players[0].name} (${S.players[0].faction}) vs ${S.players[1].name} (${S.players[1].faction})`);
  emit("newGame", {});
  return S;
}

// ---------------------------------------------------------------------------
// Costs and playing cards
// ---------------------------------------------------------------------------
function equipCost(c, owner, target, fromField) {
  if (owner && owner.field.chars.some(x => named(x, "Sensei"))) return 0;
  if (target && named(target, "Weapons Enthusiast")) return 0;
  if (fromField) return DATA.rarities[c.rarity]?.attachCost ?? 1;
  return playCost(c, owner);
}

function playCost(c, p) {
  p = p || active();
  if (c.name === "Shaolin Warrior") return Math.max(0, c.manaCost - S.players.reduce((n, q) => n + q.field.chars.length + q.field.equips.length, 0));
  if (c.name === "Tree Branch" && p.field.chars.filter(x => x.group === "Monkey").length >= 3) return 1;
  if (c.name === "They Just Keep Coming") return Math.max(0, c.manaCost - countChars(x => x.group === "Zombie"));
  return c.manaCost;
}

// Returns null when the card can be played, otherwise a short reason.
function playBlocker(c, p) {
  p = p || active();
  if (S.over) return "The game is over";
  if (S.pending) return "Finish the current choice first";
  if (UNIMPLEMENTED.has(c.name)) return "Counter spells are not in the game yet";
  if (!p.hasDrawn) return "Draw a card first";
  const inSetup = S.phase === PHASE.SETUP;
  const inBattleFlash = S.phase === PHASE.BATTLE && hasSkill(c, "Flash");
  if (!inSetup && !inBattleFlash) return S.phase === PHASE.BATTLE ? "Only Flash cards can be played in Battle" : "Cards are played in the Setup phase";
  const cost = playCost(c, p);
  if (c.type === "Equipment") {
    const cheapest = Math.min(cost, ...p.field.chars.map(t => equipCost(c, p, t, false)));
    if (p.mana < cheapest) return `Needs ${cost} mana`;
    if (!p.field.chars.length && p.field.equips.length >= RULES.maxEquips) return "Equipment row is full";
    return null;
  }
  if (p.mana < cost) return `Needs ${cost} mana`;
  if (c.type === "Character" && p.field.chars.length >= RULES.maxChars) return "Your battlefield is full";
  if (c.type === "Area" && p.field.areas.length >= RULES.maxAreas) return "Area row is full";
  const fx = effectFor(c);
  if (c.type === "Spell" && fx && fx.target && !validTargets(fx, { card: c, owner: p, spell: true }).length) return "No valid targets";
  return null;
}
const canPlay = (c, p) => !playBlocker(c, p);

// Play a card from the active player's hand.
// opts.target: a battlefield character (for equipment)
// opts.toField: place equipment in the equipment row
function playCard(uid, opts = {}) {
  const p = active();
  const index = p.hand.findIndex(c => c.uid === uid);
  const c = p.hand[index];
  if (!c || !canPlay(c, p)) return false;

  if (c.type === "Equipment") {
    if (opts.toField) {
      const cost = playCost(c, p);
      if (p.field.equips.length >= RULES.maxEquips || p.mana < cost) return false;
      p.mana -= cost; p.hand.splice(index, 1); p.field.equips.push(c);
      emit("play", { card: c, player: p.idx });
      log(`${p.name} places ${c.name} in the equipment row.`);
      equipmentEntered(p);
      return true;
    }
    if (!opts.target) return false;
    const t = findChar(opts.target.uid ?? opts.target);
    if (!t || t.p !== p) return false;
    const cost = equipCost(c, p, t.c, false);
    if (p.mana < cost) return false;
    p.mana -= cost; p.hand.splice(index, 1);
    attach(c, t.c);
    emit("play", { card: c, player: p.idx });
    log(`${p.name} equips ${c.name} to ${t.c.name}.`);
    equipmentEntered(p);
    return true;
  }

  p.mana -= playCost(c, p);
  p.hand.splice(index, 1);
  emit("play", { card: c, player: p.idx });

  if (c.type === "Character") {
    log(`${p.name} summons ${c.name}.`);
    putOnField(c, p);
  } else if (c.type === "Area") {
    p.field.areas.push(c);
    log(`${p.name} plays the area ${c.name}.`);
    if (c.name === "Whirlpool") {
      for (const x of allChars().slice()) { dealDamageToCharacter(x, 1); if (allChars().includes(x)) x.speed -= 1; }
    }
    sweepDeaths();
  } else {
    p.grave.push(c);
    log(`${p.name} casts ${c.name}.`);
    const fx = effectFor(c);
    const ctx = { card: c, owner: p, spell: true };
    if (fx?.target) S.pending = { kind: "target", source: c, owner: p.idx, spell: true, targetType: fx.target, intent: fx.intent };
    else if (fx?.now) fx.now(ctx);
  }
  return true;
}

function attach(e, target) {
  target.equipped.push(e);
  target.currentHealth += e.health || 0;   // equipment health is current health, not max
  emit("text", { uid: target.uid, text: "EQUIP", color: "#7fd6ff" });
}

// Equip a card sitting in the equipment row onto one of your characters.
function attachFieldEquipment(equipUid, targetUid) {
  const p = active();
  const i = p.field.equips.findIndex(e => e.uid === equipUid);
  const e = p.field.equips[i];
  const t = findChar(targetUid);
  if (!e || !t || t.p !== p || !p.hasDrawn || S.pending) return false;
  if (!(S.phase === PHASE.SETUP || (S.phase === PHASE.BATTLE && hasSkill(e, "Flash")))) return false;
  const cost = equipCost(e, p, t.c, true);
  if (p.mana < cost) return false;
  p.mana -= cost;
  p.field.equips.splice(i, 1);
  attach(e, t.c);
  log(`${p.name} equips ${e.name} to ${t.c.name}.`);
  return true;
}

function canAttachFromField(e, p) {
  p = p || active();
  if (!p.hasDrawn || S.pending || S.over || !p.field.chars.length) return false;
  if (!(S.phase === PHASE.SETUP || (S.phase === PHASE.BATTLE && hasSkill(e, "Flash")))) return false;
  return p.field.chars.some(t => p.mana >= equipCost(e, p, t, true));
}

// ---------------------------------------------------------------------------
// Pending choices (targets and pick-a-card dialogs)
// ---------------------------------------------------------------------------
function chooseTarget(target) {
  const pd = S.pending;
  if (!pd || pd.kind !== "target" || !isValidTarget(target)) return false;
  const fx = effectFor(pd.source) || EFFECTS[pd.source.name];
  const owner = S.players[pd.owner];
  const t = target.isPlayer ? target : (pd.targetType === "area" ? findArea(target.uid)?.c : findChar(target.uid)?.c);
  if (!t) return false;
  S.pending = null;
  log(`${pd.source.name} targets ${t.isPlayer ? S.players[t.idx].name : t.name}.`);
  fx.apply({ card: pd.source, owner, spell: pd.spell }, t);
  return true;
}

function cancelPending() {
  if (!S.pending || S.pending.required) return false;
  S.pending = null;
  return true;
}

// Resolve a "choose" dialog. picks = array of card uids, option = option id.
function resolveChoice(picks, option) {
  const pd = S.pending;
  if (!pd || pd.kind !== "choose") return false;
  const owner = S.players[pd.owner];
  const picked = pd.cards.filter(c => picks.includes(c.uid)).slice(0, pd.pick || 1);
  S.pending = null;
  const removeFromGrave = c => { for (const q of S.players) { const i = q.grave.indexOf(q.grave.find(x => x.uid === c.uid)); if (i >= 0) q.grave.splice(i, 1); } };
  const fresh = c => { const n = newCard(DATA.cardsById[c.id] || c); return n; };

  if (pd.resolve === "messenger") {
    const foe = foeOf(owner);
    const top = foe.deck.pop();
    if (top) {
      if (option === "take") { owner.deck.push(top); log(`${owner.name} takes ${top.name} onto their deck.`); }
      else { foe.grave.push(top); log(`${top.name} is discarded from ${foe.name}'s deck.`); }
    }
  } else if (pd.resolve === "toHand") {
    for (const c of picked) { removeFromGrave(c); owner.hand.push(fresh(c)); emit("handAdd", { player: owner.idx }); log(`${c.name} returns to ${owner.name}'s hand.`); }
  } else if (pd.resolve === "discardDraw") {
    const c = picked[0];
    if (c) { owner.hand.splice(owner.hand.findIndex(x => x.uid === c.uid), 1); owner.grave.push(c); }
    drawCard(owner);
  } else if (pd.resolve === "rise") {
    const c = picked[0];
    if (c) {
      removeFromGrave(c);
      const n = fresh(c);
      if (option === "field" && owner.mana >= 2 && owner.field.chars.length < RULES.maxChars) {
        owner.mana -= 2; log(`${c.name} rises onto the field.`); putOnField(n, owner);
      } else { owner.hand.push(n); emit("handAdd", { player: owner.idx }); log(`${c.name} returns to ${owner.name}'s hand.`); }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Combat (port of resolveCharacterAttack)
// ---------------------------------------------------------------------------
function canAttack(c) {
  return S.phase === PHASE.BATTLE && !S.over && !S.pending && c.owner === S.active && !c.hasAttacked && !hasSkill(c, "Tower") && stats(c).a >= 0;
}

// Characters with Challenge must be attacked first.
function forcedTarget(defender) { return defender.field.chars.find(c => hasSkill(c, "Challenge")) || null; }

function attack(attackerUid, targetUid) {
  const p = active();
  const a = p.field.chars.find(c => c.uid === attackerUid);
  if (!a || !canAttack(a)) return false;
  const defender = opponent();
  let target = targetUid != null ? defender.field.chars.find(c => c.uid === targetUid) : null;
  const forced = forcedTarget(defender);
  if (forced) target = forced;

  a.hasAttacked = true;
  emit("lunge", { uid: a.uid });
  const as = stats(a);
  if (!target) {
    log(`${a.name} attacks ${defender.name} for ${as.a}.`);
    dealDamageToPlayer(defender, as.a);
    return true;
  }
  log(`${a.name} attacks ${target.name}.`);
  const ts = stats(target);
  let ta = ts.a, tspd = ts.s, shield = 0;
  if (named(target, "The Man Ape")) { ta += 10; tspd += 10; shield = 10; }   // when defending gain +10 to all stats
  if (ts.parry) ta *= 2;                                                      // Parry: double damage when defending

  const hitTarget = () => {
    const hpBefore = rawStats(target).h + shield;
    dealDamageToCharacter(target, Math.max(0, as.a - shield));
    if (hasSkill(a, "Overwhelm") && as.a > hpBefore) dealDamageToPlayer(defender, as.a - hpBefore);
  };
  const alive = c => ownerOf(c).field.chars.includes(c);

  if (as.s >= tspd) {
    hitTarget();
    if (alive(target) && alive(a)) dealDamageToCharacter(a, ta);
  } else {
    dealDamageToCharacter(a, ta);
    if (alive(a)) hitTarget();
  }
  recordCombatSurvival(a); recordCombatSurvival(target);
  return true;
}

function recordCombatSurvival(c) {
  if (c && ownerOf(c).field.chars.includes(c) && named(c, "Black Belt Student")) {
    c.combatSurvived = (c.combatSurvived || 0) + 1;
    if (c.combatSurvived >= 3) transformCharacter(c, "5th Degree Master");
  }
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------
function doDraw() {
  const p = active();
  if (S.phase !== PHASE.DRAW || S.over) return false;
  const c = drawCard(p);
  if (!c) return false;
  p.hasDrawn = true;
  S.phase = PHASE.SETUP;
  emit("phase", {});
  return true;
}

function advancePhase() {
  if (S.over || S.pending || S.phase === PHASE.DRAW) return false;
  if (S.phase < PHASE.END) S.phase++;
  emit("phase", {});
  return true;
}

// End-of-turn abilities (port of endPhase in Lua)
function endPhaseEffects(p) {
  for (const c of p.field.chars.slice()) {
    if (named(c, "Simple Defender")) c.currentHealth += 2;
    if (named(c, "Banana Tree")) { const b = takeFromDeck(p, x => x.name === "Banana"); if (b) { p.hand.push(b); emit("handAdd", { player: p.idx }); } }
    if (named(c, "Sneaky Skinbag")) {
      c.currentHealth += p.field.chars.filter(x => x.group === "Zombie" && x !== c).length;
      const corpse = cardByName("Reanimated Corpse");
      if (corpse && p.field.chars.length < RULES.maxChars) putOnField(corpse, p);
    }
  }
}

function endTurn() {
  if (S.over) return false;
  if (S.pending && S.pending.kind === "target") S.pending = null;
  if (S.pending) return false;
  endPhaseEffects(active());
  S.active = 1 - S.active;
  S.phase = PHASE.DRAW;
  S.round++;
  startTurn(active());
  emit("turn", { player: S.active });
  return true;
}
