// Shardfall rules engine: a port of the game logic in main.lua.
// The engine holds all game state in S and never touches the DOM. The UI listens
// for events sent through emit() to play effects (damage numbers, shakes, banners).
// Cards on the battlefield store their owner as a player index (0 or 1) instead of
// a reference, so the whole state can be cloned for undo and for AI look-ahead.
//
// Short names used all through the game code:
//   S        the whole game right now: both players, whose turn, the phase, the log
//   p        a player (S.players[0] or S.players[1])     c   a card
//   pd       S.pending: a choice the game is waiting on (pick a target, or pick from a list)
//   fx       a card's play effect from EFFECTS (js/effects.js). (js/fx.js is visual effects.)
//   ctx      who is doing something: { card, owner, spell } (plus target, holder, amount)
//   stats(c) a character's attack and health as shown, with every bonus counted

const PHASE = { DRAW: 0, SETUP: 1, BATTLE: 2, END: 3 };
const RULES = {
  startingHealth: DATA.rules.starting_player_health ?? 20,
  startingHand: DATA.rules.starting_hand_size ?? 6,
  manaGrowth: DATA.rules.mana_growth_per_turn ?? 1,
  maxChars: DATA.rules.max_field_characters ?? Infinity,   // no limit unless game_rules.csv sets one
  // Characters stand on the frontline; areas and stored equipment share the backline.
  maxBackline: DATA.rules.max_field_backline ?? 10,
  // A card that would go to a full hand goes to the graveyard instead.
  maxHand: DATA.rules.max_hand_size ?? 8,
  // A random event hits the board every eventEvery rounds (0 = never) and is announced eventWarn rounds ahead.
  eventEvery: DATA.rules.event_every_rounds ?? 0,
  eventWarn: DATA.rules.event_warning_rounds ?? 2,
  // A player with this many characters (or one with the Protected skill) takes half damage, rounded up. 0 = off.
  protectAt: DATA.rules.protected_min_characters ?? 0,
};
const BACKLINE = () => DATA.text("zone_backline", "Backline");
const backlineCount = p => p.field.areas.length + p.field.equips.length;

// Counter spells. A card with a "counter:" clause in its Effect is not played on your own
// turn. When the other player plays a character or casts a spell, the game stops and asks
// whether you want to answer with a counter you hold and can pay for (with mana you left
// unspent on your turn). A countered card is paid for and goes to its owner's graveyard
// without doing anything. Each word after "counter:" is a kind of play the card can stop:
const COUNTER_KINDS = {
  character: h => h.card.type === "Character",
  spell: h => h.card.type === "Spell",
  spellSingle: h => h.card.type === "Spell" && !!h.target && !h.target.isPlayer,   // aimed at one character or area
  spellMany: h => h.card.type === "Spell" && !h.target,                            // not aimed at one thing
};

let S = null;              // live game state
let listeners = [];
let muted = 0;             // >0 while the AI simulates moves on a cloned state

// Optional check run before each player action. The tutorial sets it to keep the
// player on the current step; returning false refuses the action.
let actionGuard = null;
const allowed = (name, ...args) => muted || !actionGuard || actionGuard(name, ...args);

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
// Where a card is from (its Fracture; a hybrid has two), what it is (tribes) and what it does
// (classes). A card can have one or two of each. c.group is the first fracture: it sets the color.
const groupsOf = c => c.groups || [c.group];
const inGroup = (c, g) => groupsOf(c).includes(g);
const hasTribe = (c, t) => (c.tribes || []).includes(t);
const hasClass = (c, k) => (c.classes || []).includes(k);
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
// The game's own random numbers. They come from the match seed (S.seed), and the generator's
// state lives in S.rng, so the same seed and the same moves always replay the same game.
// AI look-ahead runs on a copy of S, so it never changes the real game's draws.
function rand() {
  let t = (S.rng = (S.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const newSeed = () => (Math.random() * 4294967296) >>> 0;
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function takeFromDeck(p, pred) {
  const i = p.deck.findIndex(pred);
  return i >= 0 ? p.deck.splice(i, 1)[0] : null;
}

// A choice for a player. If another one is already waiting, this one waits its turn.
function ask(pd) {
  if (S.pending) S.queue.push(pd);
  else S.pending = pd;
}
// After a choice is made: show the next waiting one, or finish a turn that was paused for it.
function settle() {
  if (!S.pending && S.queue.length) S.pending = S.queue.shift();
  if (!S.pending && S.passAfterChoice && !S.over) { S.passAfterChoice = false; finishTurn(); }
}

// Special rules. A few cards bend the core rules (the champions, mostly). Each such rule has a
// name, and a card gets it from its Effect column: "rule: redirect", "rule: lord Simple 3".
// The engine asks cardRule(card, "redirect") and never looks at a card's name, so a card can be
// renamed freely and a new card can reuse a rule. js/effects.js lists every rule (RULE_WORDS).

// "rule: lord <Faction> <n>" (The Simplistic): while it is on the field (either side), every
// card of that faction gains +n to each stat (characters, and equipment on a character), the
// faction's spells deal or give n more, and curse spells can't target its cards. Buff spells
// still can. Two lords of one faction don't add up.
function lordBonus(group) {
  let best = 0;
  for (const c of allChars()) { const r = cardRule(c, "lord"); if (r && r[0] === group) best = Math.max(best, Number(r[1])); }
  return best;
}
const lordBonusOf = c => Math.max(0, ...groupsOf(c).map(lordBonus));   // a hybrid takes its best lord
const spellBoost = ctx => (ctx.spell ? lordBonusOf(ctx.card) : 0);
const isBuff = fx => fx.intent === "help";
const shieldedFromCurses = c => lordBonusOf(c) > 0;

// A play waiting for an answer is described by "held": { owner, card, target }. target is
// only there for a spell that was aimed: { isPlayer, idx } or { uid, area }.
const countersFor = (p, held) => p.hand.filter(c => {
  const kinds = counterKinds(c);
  return kinds && p.mana >= playCost(c, p) && kinds.some(k => COUNTER_KINDS[k](held));
});
// Give the other player the chance to counter a card that was just played. Returns true when
// the game is now waiting for their answer. The computer's look-ahead never opens this
// window: it must not learn what the other player holds by trying its plays on a copy.
function offerCounter(held) {
  if (muted) return false;
  const foe = S.players[1 - held.owner];
  const cards = countersFor(foe, held);
  if (!cards.length) return false;
  S.pending = {
    kind: "choose", resolve: "counter", source: held.card, owner: foe.idx, title: `${foe.name}: respond?`,
    prompt: `${S.players[held.owner].name} plays ${held.card.name}. Pick a counter spell to stop it, or skip to let it happen.`,
    cards, pick: 1, options: [{ id: "counter", label: "Counter it" }], held,
  };
  return true;
}
// Carry out a character or spell that was played and not countered.
function finishPlay(held) {
  const p = S.players[held.owner], c = held.card, fx = effectFor(c) || EFFECTS[c.id];
  if (c.type === "Character") { putOnField(c, p); return; }
  if (!held.target) { if (fx?.now) fx.now({ card: c, owner: p, spell: true }); return; }
  const t = held.target.isPlayer ? held.target : (held.target.area ? findArea(held.target.uid) : findChar(held.target.uid))?.c;
  if (!t) return;   // the target left the table while the answer was awaited
  log(`${c.name} targets ${t.isPlayer ? S.players[t.idx].name : t.name}.`);
  fx.apply({ card: c, owner: p, spell: true }, t);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function equipBonuses(c) {
  let a = 0, h = 0;
  for (const e of c.equipped || []) { a += e.attack; h += e.health; }
  return { a, h };
}

// Effective stats including equipment, areas, synergies and Rally. Health can be
// negative here; display code clamps it.
function rawStats(c) {
  const p = ownerOf(c);
  const e = equipBonuses(c);
  let buff = 0;
  // "aura:" effects from this side's characters and areas (js/effects.js). An area's bonus
  // is written in its Effect column, like "aura: buff allies.Monkey 1 0".
  const aura = auraBonus(c, p);
  const extraA = aura.a, extraH = aura.h;
  buff += lordBonusOf(c);
  // A lord's faction's equipment is boosted too. Its own health is already in currentHealth, so the bonus is added here.
  const simpleGear = (c.equipped || []).reduce((n, x) => n + lordBonusOf(x), 0);
  const rally = c.rallyBonus || 0;
  const ch = championBonus(c);   // a champion's ability, and Soul Shepard's growing health
  return {
    a: c.attack + e.a + buff + rally + extraA + simpleGear + ch.a,
    h: c.currentHealth + buff + extraH + simpleGear + ch.h,
    parry: hasSkill(c, "Parry") || grantsSkill(c, "Parry"),
  };
}
function stats(c) {
  const r = rawStats(c);
  return { a: Math.max(0, r.a), h: Math.max(0, r.h), parry: r.parry };
}

function updateRally(p) {
  const count = {};
  for (const c of p.field.chars) if (hasSkill(c, "Rally")) for (const g of groupsOf(c)) count[g] = (count[g] || 0) + 1;
  for (const c of p.field.chars) c.rallyBonus = hasSkill(c, "Rally") && groupsOf(c).some(g => (count[g] || 0) >= 3) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Skills that change a character
// ---------------------------------------------------------------------------
function triggerEvolve(c) {
  if (hasSkill(c, "Evolve") && !c.hasEvolved) {
    c.attack += 3; c.currentHealth += 3; c.hasEvolved = true; removeSkill(c, "Evolve");
    emit("text", { uid: c.uid, text: "EVOLVE!", color: "#b98cff" });
  }
}

function transformCharacter(c, newId) {
  const t = DATA.cardsById[newId];
  if (!t) return;
  const n = structuredClone(t);
  n.currentHealth = Math.max(1, c.currentHealth + (n.health - c.health));
  n.equipped = c.equipped || [];
  n.hasAttacked = c.hasAttacked;
  n.levelUpCount = c.levelUpCount || 0;
  n.combatSurvived = 0;
  Object.assign(c, n);
  c.baseAttack = c.attack; c.baseHealth = c.health;
  emit("text", { uid: c.uid, text: "TRANSFORM!", color: "#6fe3ff" });
  log(`${t.name} appears through Transform.`);
}

// Level Up: +1 to all stats, up to 3 times, then the skill is used up. Each Level Up also
// heals the character fully. "rule: levelCap none" lifts the limit (Boss Level) and
// "rule: levelGain <attack> <health>" changes what a level gives (Pesky Programmer: 2 0).
// A Data Collector gains +1 Health when another of your characters levels up.
const levelCap = c => {
  const r = cardRule(c, "levelCap");
  const base = !r ? 3 : r[0] === "none" ? Infinity : Number(r[0]);
  // LEVEL UP (Boss Level's deck): the player's Digital characters can level up 1 more time.
  return base + (c.type === "Character" && inGroup(c, "Digital") && champOf(S?.players?.[c.owner], "boss_level") ? 1 : 0);
};
const levelGains = c => { const r = cardRule(c, "levelGain"); return r ? [Number(r[0]), Number(r[1])] : [1, 1]; };
function levelUp(c, times = 1) {
  for (let k = 0; k < times; k++) {
    if (!hasSkill(c, "Level Up") || (c.levelUpCount || 0) >= levelCap(c)) return;
    c.levelUpCount = (c.levelUpCount || 0) + 1;
    if (champOf(S.players[c.owner], "boss_level")) champProgress(S.players[c.owner], 1);   // LEVEL UP counts every level gained
    const gains = levelGains(c);
    c.attack += gains[0]; c.currentHealth += gains[1];
    c.levelHealth = (c.levelHealth || 0) + gains[1];
    c.keptLevels = (c.keptLevels || 0) + 1;   // levels whose stats this character holds
    healFully(c);
    emit("text", { uid: c.uid, text: "LEVEL UP", color: "#ffd25e" });
    const owner = ownerOf(c);
    for (const x of owner.field.chars.slice()) if (x !== c) runHook(x, "allyLevelUp", { owner });
    if (c.levelUpCount >= levelCap(c)) {
      removeSkill(c, "Level Up");
      runHook(c, "maxLevel", { owner });
    }
  }
}

// Heal all damage: health goes back to the card's health plus equipment and Level Up gains.
function healFully(c) {
  const full = (c.baseHealth ?? c.health) + equipBonuses(c).h + (c.levelHealth || 0);
  if (c.currentHealth < full) c.currentHealth = full;
}

// Undo one Level Up (Data Transfer). The skill comes back if it was used up.
function levelDown(c) {
  if (!(c.keptLevels > 0)) return false;
  c.keptLevels--;
  if (c.levelUpCount > 0) c.levelUpCount--;
  const [atk, hp] = levelGains(c);
  c.attack -= atk; c.currentHealth -= hp;
  c.levelHealth = Math.max(0, (c.levelHealth || 0) - hp);
  if (!hasSkill(c, "Level Up")) c.skills.push("Level Up");
  emit("text", { uid: c.uid, text: "LEVEL DOWN", color: "#c9c9c9" });
  checkDeath(c);
  return true;
}

// ---------------------------------------------------------------------------
// Damage and death
// ---------------------------------------------------------------------------
// Protected: a player with RULES.protectAt or more characters, or with a character that has the
// Protected skill, takes half damage, rounded up. An attacker with Pierce ignores it.
function isProtected(p) {
  return !!RULES.protectAt && (p.field.chars.length >= RULES.protectAt || p.field.chars.some(c => hasSkill(c, "Protected")));
}
function dealDamageToPlayer(p, amount, source) {
  if (amount <= 0 || S.over) return;
  const ip = p.field.chars.find(x => cardRule(x, "redirect") && x.redirectRound !== S.round);
  if (ip) { redirectDamage(ip, amount); return; }
  if (isProtected(p)) {
    if (source && hasSkill(source, "Pierce")) emit("text", { uid: source.uid, text: "PIERCE", color: "#ff9a6b" });
    else {
      const half = Math.ceil(amount / 2);
      log(`${p.name} is Protected and takes ${half} instead of ${amount}.`);
      emit("protected", { player: p.idx, from: amount, to: half });
      amount = half;
    }
  }
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
  // "rule: shepherd <Faction>" (Soul Shepard): asked each time another card of that faction dies.
  const shepard = p.field.chars.find(x => x !== c && inGroup(c, cardRule(x, "shepherd")?.[0]));
  const gain = shepard && p.field.chars.includes(c) ? statsAsRead(c) : null;
  const i = p.field.chars.indexOf(c);
  if (i >= 0) p.field.chars.splice(i, 1);
  p.grave.push(c);
  if (i >= 0) {
    for (const tribe of c.tribes || []) S.died[tribe] = (S.died[tribe] || 0) + 1;   // Soul Shepard grows with each Undead that dies
    if (champOf(p, "the_man_ape") && inGroup(c, "Monkey")) { p.champ.discount = true; champProgress(p, 1); }   // The Troop Remembers
  }
  updateRally(p);
  emit("death", { uid: c.uid, group: c.group });
  log(`${c.name} was destroyed.`);
  if (gain) {
    ask({
      kind: "choose", source: shepard, owner: p.idx, title: shepard.name,
      prompt: `${c.name} fell. Absorb its stats into ${shepard.name}, or return it to your hand?`,
      cards: [c], options: [{ id: "absorb", label: `Absorb +${gain.a} / +${gain.h}` }, { id: "hand", label: "Return it to my hand" }],
      required: true, resolve: "shepard", deadUid: c.uid, shepardUid: shepard.uid, gain,
    });
  }
  sweepDeaths();   // losing a Rally partner or a synergy source can drop others to 0 health
}

// A character dies when its effective health (including area and synergy bonuses) reaches 0.
function checkDeath(c) {
  if (rawStats(c).h > 0) return;
  const p = ownerOf(c);
  if (!p.field.chars.includes(c)) return;
  // Reanimate brings the character back with its own printed stats. Health it had from
  // equipment is not restored (the equipment stays on and still adds its attack).
  if (hasSkill(c, "Reanimate") && !c.reanimated) {
    c.reanimated = true; removeSkill(c, "Reanimate");
    c.currentHealth = c.baseHealth; c.attack = c.baseAttack;
    runHook(c, "reanimate", { owner: p });
    triggerEvolve(c); // "After returning from the Graveyard to the Field, Evolve"
    emit("text", { uid: c.uid, text: "REANIMATE", color: "#8dff8d" });
    log(`${c.name} reanimates.`);
    if (rawStats(c).h <= 0) sendToGraveyard(p, c);
  } else sendToGraveyard(p, c);
}

function dealDamageToCharacter(c, amount) {
  if (!c || amount <= 0) return;
  if (cardRule(c, "redirect") && c.redirectRound !== S.round && ownerOf(c).field.chars.includes(c)) { redirectDamage(c, amount); return; }
  c.currentHealth -= amount;
  emit("charDamage", { uid: c.uid, amount });
  if (rawStats(c).h <= 0) checkDeath(c);
  else runHook(c, "hurt", { owner: ownerOf(c) });
}

// "rule: redirect" (IP Man): once per turn, the first damage that would hit this character or
// its player goes to an enemy character or the enemy player instead. Its player picks which.
function redirectDamage(ip, amount) {
  ip.redirectRound = S.round;
  emit("text", { uid: ip.uid, text: "REDIRECT", color: "#ffd27a" });
  log(`${ip.name} redirects ${amount} damage.`);
  ask({ kind: "target", source: ip, owner: ip.owner, spell: false, targetType: "charOrPlayer", intent: "harm", required: true, amount });
}

// After areas or synergy sources change, characters whose health dropped to 0 die.
function sweepDeaths() {
  for (const c of allChars().slice()) checkDeath(c);
}

// A character's stats as its card reads on the table, buffs included and damage ignored.
function statsAsRead(c) {
  const r = rawStats(c);
  return { a: Math.max(0, r.a), h: Math.max(0, r.h - c.currentHealth + (c.baseHealth ?? c.health)) };
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
  c.baseAttack = c.attack; c.baseHealth = c.health;
  c.currentHealth = c.health; c.equipped = []; c.hasAttacked = !hasSkill(c, "Rush");
  c.owner = p.idx; c.levelUpCount = 0; c.levelHealth = 0; c.keptLevels = 0; c.combatSurvived = 0; c.reanimated = false;
  emit("enter", { uid: c.uid, cost: c.manaCost || 0 });

  runHook(c, "enter", { owner: p });
  updateRally(p);
  triggerSignal(c, p);
}

// Equipment entering the field levels up White Belt Students.
function equipmentEntered(p) {
  for (const x of p.field.chars.slice()) runHook(x, "gearEnters", { owner: p });
}

// ---------------------------------------------------------------------------
// Card effects
// What each card does is written in data/cards.csv (the Effect column) and turned into
// EFFECTS and hooks by js/effects.js. An EFFECTS entry may define:
//   target: "char" | "charOrPlayer" | "area"  (the player then picks a target)
//   intent: "harm" | "help" | "steal"         (used by the computer player)
//   apply(ctx, target)                        (run once a target is chosen)
//   now(ctx)                                  (run immediately, no target)
// ctx = { card, owner, spell }
// ---------------------------------------------------------------------------
function damageEverything(n) {
  for (const q of S.players) {
    for (const x of q.field.chars.slice()) dealDamageToCharacter(x, n);
    dealDamageToPlayer(q, n);
  }
}

// An infected character becomes a Zombie in full: its fracture changes to Zombie (so Zombie
// bonuses reach it) and it gains the Undead tribe on top of the tribes it had. Its class stays.
function makeZombie(t) {
  t.group = "Zombie"; t.groups = ["Zombie"];
  if (!hasTribe(t, "Undead")) t.tribes = [...(t.tribes || []), "Undead"];
}

function convertToZombie(ctx, t, givesReanimate) {
  const foe = foeOf(ctx.owner);
  if (t.owner !== foe.idx || ctx.owner.field.chars.length >= RULES.maxChars) {
    if (givesReanimate || t.owner === ctx.owner.idx) makeZombie(t);
    return;
  }
  foe.field.chars.splice(foe.field.chars.indexOf(t), 1);
  makeZombie(t);
  t.owner = ctx.owner.idx; t.rallyBonus = 0;
  if (givesReanimate && !hasSkill(t, "Reanimate")) { t.skills.push("Reanimate"); t.reanimated = false; }
  ctx.owner.field.chars.push(t);
  updateRally(ctx.owner); updateRally(foe);
  emit("text", { uid: t.uid, text: "INFECTED", color: "#8dff8d" });
  log(`${ctx.owner.name} takes control of ${t.name}.`);
}

function effectFor(c) { return c.disabled ? null : EFFECTS[c.id] || null; }

// Signal abilities fire when the character enters the field.
function triggerSignal(c, owner) {
  if (!hasSkill(c, "Signal")) return;
  const fx = effectFor(c);
  if (!fx) return;
  const ctx = { card: c, owner, spell: false };
  if (fx.target) {
    if (validTargets(fx, ctx).length) ask({ kind: "target", source: c, owner: owner.idx, spell: false, targetType: fx.target, intent: fx.intent });
  } else if (fx.now) fx.now(ctx);
}

// Valid targets for a targeted effect. Spells cannot target Cloak characters.
// Curse spells (anything but a buff) can't target Simple cards while The Simplistic is out.
function validTargets(fx, ctx) {
  const cursed = c => ctx.spell && !isBuff(fx) && shieldedFromCurses(c);
  if (fx.target === "area") return S.players.flatMap(p => p.field.areas).filter(a => !cursed(a));
  const chars = allChars().filter(c => !(ctx.spell && hasSkill(c, "Cloak")) && !cursed(c) && !(c === ctx.card && fx.intent !== "help") && (!fx.filter || fx.filter(c, ctx)));
  if (fx.target === "charOrPlayer") return [...chars, ...S.players.filter(p => !fx.players || fx.players(p.idx, ctx)).map(p => ({ isPlayer: true, idx: p.idx }))];
  return chars;
}

// The effect a waiting target choice will run. It is looked up directly, not through
// effectFor(), so a choice that was already asked for still resolves if its card gets disabled.
const pendingEffect = pd => EFFECTS[pd.source.id];
// Everything the player may pick for a waiting target choice.
function pendingTargets(pd) {
  return validTargets(pendingEffect(pd), { card: pd.source, owner: S.players[pd.owner], spell: pd.spell });
}

function isValidTarget(target) {
  const pd = S.pending;
  if (!pd || pd.kind !== "target") return false;
  return pendingTargets(pd).some(t => t.isPlayer ? target.isPlayer && target.idx === t.idx : t.uid === target.uid);
}

// ---------------------------------------------------------------------------
// Players, decks, turns
// ---------------------------------------------------------------------------
function makePlayer(idx, deckId, isAI) {
  const def = DATA.decks[deckId];
  return {
    idx, name: isAI ? "Computer" : `Player ${idx + 1}`, isAI: !!isAI, deckId, faction: def.faction,
    deckLabel: def.custom ? def.name : `${def.faction} deck`,
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
  if (addToHand(p, c, false)) emit("draw", { player: p.idx, uid: c.uid });
  return c;
}

// Every card that goes to a hand comes through here. A hand holds at most RULES.maxHand
// cards; one more goes to the graveyard instead (it "burns").
function addToHand(p, c, announce = true) {
  if (p.hand.length >= RULES.maxHand) {
    p.grave.push(c);
    emit("burn", { player: p.idx, card: c });
    log(`${p.name}'s hand is full, so ${c.name} goes to the graveyard.`);
    return false;
  }
  p.hand.push(c);
  if (announce) emit("handAdd", { player: p.idx });
  return true;
}

function startTurn(p) {
  p.turnsPlayed++;
  p.manaMax += RULES.manaGrowth;
  p.mana = p.manaMax;
  p.hasDrawn = false;
  if (champOf(p, "the_simplistic")) { p.champ.n = p.manaMax; if (p.champ.n >= DATA.championAbilities.the_simplistic.goal) champLevelUp(p); }   // Humble Beginnings
  for (const c of p.field.chars) {
    c.hasAttacked = false;
    c.attackedThisTurn = false;
    for (const sk of c.tempSkills || []) removeSkill(c, sk);   // e.g. Secure the Data lasts until your next turn
    c.tempSkills = [];
  }
}

// One-time bonus for the player who goes second: +1 mana this turn.
function useManaToken() {
  if (!allowed("useManaToken")) return false;
  const p = active();
  if (S.over || !p.manaToken || S.pending) return false;
  p.manaToken = false;
  p.mana += 1;
  emit("manaToken", { player: p.idx });
  log(`${p.name} uses their bonus mana token.`);
  return true;
}

// "rule: activate" (Data Transfer): an area whose play effect its owner may use once in each
// of their Setup phases.
function canActivateArea(a, p) {
  p = p || active();
  if (S.over || S.pending || !p.hasDrawn || S.phase !== PHASE.SETUP || a.disabled) return false;
  if (!cardRule(a, "activate") || a.usedRound === S.round || !p.field.areas.includes(a)) return false;
  return validTargets(EFFECTS[a.id], { card: a, owner: p, spell: false }).length > 0;
}
function activateArea(uid) {
  if (!allowed("activateArea", uid)) return false;
  const p = active();
  const a = p.field.areas.find(x => x.uid === uid);
  if (!a || !canActivateArea(a, p)) return false;
  a.usedRound = S.round;
  S.pending = { kind: "target", source: a, owner: p.idx, spell: false, targetType: "char", intent: "help" };
  return true;
}

function newGame({ deckId, opponentDeckId, mode, seed, events, abilities }) {
  seed = (seed ?? newSeed()) >>> 0;
  S = { players: [], active: 0, phase: PHASE.DRAW, round: 1, over: false, winner: null, pending: null, queue: [], mode, nextUid: 1, log: [], seed, rng: seed,
        event: null, upcoming: null, lastEvent: null, noEvents: events === false,
        noAbilities: abilities === false, died: {} };
  let opp = opponentDeckId;
  if (!opp) {
    const others = DATA.deckOrder.filter(id => id !== deckId);
    opp = others.length ? others[Math.floor(rand() * others.length)] : deckId;
  }
  S.players = [makePlayer(0, deckId, false), makePlayer(1, opp, mode === "ai")];
  for (const p of S.players) {
    p.deck = buildDeck(p.deckId);
    p.champ = null;   // champion ability, see "Champion abilities" below
    const champion = S.noAbilities ? null : p.deck.find(c => c.rarity === "Unknown" && DATA.championAbilities[c.id]);
    if (champion) p.champ = { id: champion.id, level: 1, n: 0, discount: false };
    for (let k = 0; k < RULES.startingHand; k++) drawCard(p);
  }
  startTurn(S.players[0]);
  // The first player skips their first draw, and the second player gets a one-time +1 mana token,
  // to offset the advantage of going first.
  S.players[0].hasDrawn = true;
  S.phase = PHASE.SETUP;
  S.players[1].manaToken = true;
  log(`${S.players[0].name} (${S.players[0].faction}) vs ${S.players[1].name} (${S.players[1].faction}) · match seed ${seed}`);
  emit("newGame", {});
  return S;
}

// ---------------------------------------------------------------------------
// Champion abilities
// ---------------------------------------------------------------------------
// A deck that holds a champion (an Unknown card with a row in data/champion_abilities.csv) gets that
// champion's ability from turn one, whether or not the champion card has been drawn. Most start
// small and level up once in a match. Progress lives in p.champ = { id, level, n, discount }.
// The wording players read is in data/champion_abilities.csv; what each one does is here:
//   the_simplistic  Humble Beginnings: nothing at first; at max mana 6 every Simple character gets +1/+1
//                   (startTurn, championBonus)
//   the_man_ape     The Troop Remembers: a fallen Monkey makes the next Monkey cost 1 less (costFromEffect);
//                   after 4 have fallen, Monkeys get +1 Attack (championBonus)
//   ip_man          The Bow: at the start of Battle the strongest ready attacker gets +2 Attack (ipBow);
//                   after 5 fights won, two get it
//   boss_level      LEVEL UP: Digital characters can level up 1 more time (levelCap); after 6 levels gained,
//                   the first attack each turn deals double damage (attack)
//   Soul Shepard    "rule: grieve Undead" on the card: +1 Health for every Undead that dies (championBonus)
const champOf = (p, id) => (p && p.champ && p.champ.id === id ? p.champ : null);

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
// "rule: grieve <Tribe>" (Soul Shepard).
function championBonus(c) {
  let a = 0, h = 0;
  if (c.type !== "Character") return { a, h };
  const p = S.players[c.owner], ch = p && p.champ;
  if (ch) {
    if (ch.id === "the_simplistic" && ch.level >= 2 && inGroup(c, "Simple")) { a += 1; h += 1; }
    else if (ch.id === "the_man_ape" && ch.level >= 2 && inGroup(c, "Monkey")) a += 1;
  }
  a += c.bow || 0;   // The Bow, this turn
  h += grieveBonus(c);
  return { a, h };
}
// "rule: grieve <Tribe>": Health gained from every character of that tribe that has died. Counted
// from the start of the match, so it is already there when the card is still in the hand.
function grieveBonus(c) {
  const r = S && cardRule(c, "grieve");
  return r ? S.died[r[0]] || 0 : 0;
}

// The Bow (IP Man): at the start of your Battle phase your strongest ready attacker, or two once
// the ability has leveled up, gets +2 Attack until the end of the turn.
function ipBow(p) {
  const ch = champOf(p, "ip_man");
  if (!ch) return;
  const ready = p.field.chars.filter(canAttack).sort((x, y) => stats(y).a - stats(x).a || x.uid - y.uid).slice(0, ch.level >= 2 ? 2 : 1);
  for (const c of ready) { c.bow = 2; emit("text", { uid: c.uid, text: "THE BOW +2", color: "#ffd27a" }); }
  if (ready.length) log(`${p.name} bows: ${ready.map(c => c.name).join(" and ")} gets +2 Attack this turn.`);
}

// ---------------------------------------------------------------------------
// Random events
// ---------------------------------------------------------------------------
// Every RULES.eventEvery rounds (a round is one player's turn) a random event hits the board for
// both players and lasts that one round. Rounds 6, 11, 16 ... are event rounds. The next event is
// chosen and announced RULES.eventWarn rounds ahead, so each player gets a turn to plan for it.
// What each event is called and how it is described is in data/events.csv; what it does is here.
const eventNow = id => !!S.event && S.event.id === id;   // used by costFromEffect and auraBonus in js/effects.js
const EVENT_ON_START = {
  tremor() { for (const c of allChars().slice()) if (ownerOf(c).field.chars.includes(c)) dealDamageToCharacter(c, 1); },
  windfall() { for (const p of S.players) if (p.deck.length && p.hand.length < RULES.maxHand) drawCard(p); },   // a full hand or empty deck is skipped, never punished
};
// spell_surge (js/effects.js costFromEffect) and amplified_areas (auraBonus) work while the event lasts.
const EVENT_IDS = ["spell_surge", "tremor", "windfall", "amplified_areas"];

function nextEventRound(r) {
  const k = Math.max(1, Math.ceil((r - 1) / RULES.eventEvery));
  return 1 + RULES.eventEvery * k;
}

function updateEvent() {
  if (!RULES.eventEvery || S.noEvents || S.over) return;
  const known = (DATA.eventOrder || []).filter(id => EVENT_IDS.includes(id));
  if (!known.length) return;
  const r = S.round;
  if (S.event && S.event.round < r) {
    const gone = S.event; S.event = null;
    log(`${DATA.events[gone.id].name} is over.`);
    emit("eventEnd", { id: gone.id });
    if (gone.id === "amplified_areas") sweepDeaths();   // bonuses that doubled are gone again
  }
  const at = nextEventRound(r);
  if (!S.upcoming && at - r <= RULES.eventWarn) {
    const pool = known.filter(id => id !== S.lastEvent);
    const choices = pool.length ? pool : known;
    const id = choices[Math.floor(rand() * choices.length)];
    S.upcoming = { id, round: at };
    S.lastEvent = id;
    log(`Coming up in round ${at}: ${DATA.events[id].name}. ${DATA.events[id].desc}`);
    emit("eventWarn", { id, round: at });
  }
  if (S.upcoming && S.upcoming.round === r) {
    S.event = S.upcoming; S.upcoming = null;
    log(`EVENT: ${DATA.events[S.event.id].name}. ${DATA.events[S.event.id].desc}`);
    emit("eventStart", { id: S.event.id });
    EVENT_ON_START[S.event.id]?.();
  }
}

// ---------------------------------------------------------------------------
// Costs and playing cards
// ---------------------------------------------------------------------------
// "rule: freeEquip" (Sensei): its owner's equipment costs nothing.
// "rule: equipCostMax <n>" (Weapons Enthusiast): equipping this character costs at most n.
function equipCost(c, owner, target, fromField) {
  if (owner && owner.field.chars.some(x => cardRule(x, "freeEquip"))) return 0;
  const most = target && cardRule(target, "equipCostMax");
  if (most) return Math.min(Number(most[0]), fromField ? DATA.rarities[c.rarity]?.attachCost ?? 1 : playCost(c, owner));
  if (fromField) return DATA.rarities[c.rarity]?.attachCost ?? 1;
  return playCost(c, owner);
}

// When cards can be played and stored equipment attached: in Setup, and in Battle if the
// card has Flash.
const playWindowOpen = c => S.phase === PHASE.SETUP || (S.phase === PHASE.BATTLE && hasSkill(c, "Flash"));

function playCost(c, p) {
  p = p || active();
  return costFromEffect(c, p);   // "cost:" effects (js/effects.js)
}

// Returns null when the card can be played, otherwise a short reason.
function playBlocker(c, p) {
  p = p || active();
  if (S.over) return "The game is over";
  if (S.pending) return "Finish the current choice first";
  if (counterKinds(c)) return "A counter spell answers a card the other player plays";
  if (!p.hasDrawn) return "Draw a card first";
  if (!playWindowOpen(c)) return S.phase === PHASE.BATTLE ? "Only Flash cards can be played in Battle" : "Cards are played in the Setup phase";
  const cost = playCost(c, p);
  if (c.type === "Equipment") {
    const cheapest = Math.min(cost, ...p.field.chars.map(t => equipCost(c, p, t, false)));
    if (p.mana < cheapest) return `Needs ${cost} mana`;
    if (!p.field.chars.length && backlineCount(p) >= RULES.maxBackline) return `The ${BACKLINE()} is full`;
    return null;
  }
  if (p.mana < cost) return `Needs ${cost} mana`;
  if (c.type === "Character" && p.field.chars.length >= RULES.maxChars) return "Your battlefield is full";
  if (c.type === "Area" && backlineCount(p) >= RULES.maxBackline) return `The ${BACKLINE()} is full`;
  const fx = effectFor(c);
  if (c.type === "Spell" && fx && fx.target && !validTargets(fx, { card: c, owner: p, spell: true }).length) return "No valid targets";
  return null;
}
const canPlay = (c, p) => !playBlocker(c, p);

// Play a card from the active player's hand.
// opts.target: a battlefield character (for equipment)
// opts.toField: place equipment on the backline, to attach later
function playCard(uid, opts = {}) {
  if (!allowed("playCard", uid, opts)) return false;
  const p = active();
  const index = p.hand.findIndex(c => c.uid === uid);
  const c = p.hand[index];
  if (!c || !canPlay(c, p)) return false;

  if (c.type === "Equipment") {
    if (opts.toField) {
      const cost = playCost(c, p);
      if (backlineCount(p) >= RULES.maxBackline || p.mana < cost) return false;
      p.mana -= cost; p.hand.splice(index, 1); p.field.equips.push(c);
      c.placed = S.round * 100 + backlineCount(p);   // keeps the row in the order cards were placed
      emit("play", { card: c, player: p.idx });
      log(`${p.name} places ${c.name} on the ${BACKLINE()}.`);
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

  // A spell that needs a target is only paid for once the target is picked, so cancelling
  // the choice leaves the card in hand and the mana unspent.
  const fx = effectFor(c);
  if (c.type === "Spell" && fx?.target) {
    S.pending = { kind: "target", source: c, owner: p.idx, spell: true, targetType: fx.target, intent: fx.intent, cast: { cost: playCost(c, p) } };
    return true;
  }

  p.mana -= playCost(c, p);
  p.hand.splice(index, 1);
  if (c.type === "Character" && inGroup(c, "Monkey") && champOf(p, "the_man_ape")) p.champ.discount = false;   // the discount was used
  emit("play", { card: c, player: p.idx });

  if (c.type === "Character") {
    log(`${p.name} summons ${c.name}.`);
    const held = { owner: p.idx, card: c };
    if (!offerCounter(held)) finishPlay(held);
  } else if (c.type === "Area") {
    p.field.areas.push(c);
    c.placed = S.round * 100 + backlineCount(p);
    log(`${p.name} plays the area ${c.name}.`);
    if (fx?.now) fx.now({ card: c, owner: p, spell: false });   // e.g. Whirlpool
    sweepDeaths();
  } else {
    p.grave.push(c);
    log(`${p.name} casts ${c.name}.`);
    const held = { owner: p.idx, card: c };
    if (!offerCounter(held)) finishPlay(held);
  }
  return true;
}

function attach(e, target) {
  target.equipped.push(e);
  target.currentHealth += e.health || 0;   // equipment health is current health, not max
  // "rule: teach <Skill>" (API Key): the holder gains the skill for good. Level Up is not
  // given back to a character that has already used all its levels.
  const teach = cardRule(e, "teach")?.[0];
  if (teach && !hasSkill(target, teach) && (teach !== "Level Up" || (target.levelUpCount || 0) < levelCap(target))) target.skills.push(teach);
  emit("text", { uid: target.uid, text: "EQUIP", color: "#7fd6ff" });
}

// Equip a card stored on the backline onto one of your characters.
function attachFieldEquipment(equipUid, targetUid) {
  if (!allowed("attachFieldEquipment", equipUid, targetUid)) return false;
  const p = active();
  const i = p.field.equips.findIndex(e => e.uid === equipUid);
  const e = p.field.equips[i];
  const t = findChar(targetUid);
  if (!e || !t || t.p !== p || !p.hasDrawn || S.pending) return false;
  if (!playWindowOpen(e)) return false;
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
  if (!playWindowOpen(e)) return false;
  return p.field.chars.some(t => p.mana >= equipCost(e, p, t, true));
}

// ---------------------------------------------------------------------------
// Pending choices (targets and pick-a-card dialogs)
// ---------------------------------------------------------------------------
function chooseTarget(target) {
  if (!allowed("chooseTarget", target)) return false;
  const pd = S.pending;
  if (!pd || pd.kind !== "target" || !isValidTarget(target)) return false;
  const fx = pendingEffect(pd);
  const owner = S.players[pd.owner];
  const t = target.isPlayer ? target : (pd.targetType === "area" ? findArea(target.uid)?.c : findChar(target.uid)?.c);
  if (!t) return false;
  S.pending = null;
  if (pd.cast) {   // a spell waiting in hand for its target: pay for it and cast it now
    const i = owner.hand.indexOf(pd.source);
    if (i < 0) return false;
    owner.mana -= pd.cast.cost;
    owner.hand.splice(i, 1);
    owner.grave.push(pd.source);
    emit("play", { card: pd.source, player: owner.idx });
    log(`${owner.name} casts ${pd.source.name}.`);
    // the other player may counter it before it takes effect
    const held = { owner: owner.idx, card: pd.source, target: target.isPlayer ? { isPlayer: true, idx: target.idx } : { uid: target.uid, area: pd.targetType === "area" } };
    if (offerCounter(held)) return true;
  }
  log(`${pd.source.name} targets ${t.isPlayer ? S.players[t.idx].name : t.name}.`);
  fx.apply({ card: pd.source, owner, spell: pd.spell, amount: pd.amount }, t);
  settle();
  return true;
}

function cancelPending() {
  if (!allowed("cancelPending")) return false;
  if (!S.pending || S.pending.required || S.pending.resolve === "counter") return false;
  if (S.pending.source?.type === "Area") S.pending.source.usedRound = null;   // cancelling Data Transfer keeps its use
  if (cardRule(S.pending.source, "strike")) S.pending.source.bladeRound = null;   // and a cancelled strike
  S.pending = null;
  settle();
  return true;
}

// Resolve a "choose" dialog. picks = array of card uids, option = option id.
function resolveChoice(picks, option) {
  if (!allowed("resolveChoice", picks, option)) return false;
  const pd = S.pending;
  if (!pd || pd.kind !== "choose") return false;
  const owner = S.players[pd.owner];
  const picked = pd.cards.filter(c => picks.includes(c.uid)).slice(0, pd.pick || 1);
  S.pending = null;
  const removeFromGrave = c => { for (const q of S.players) { const i = q.grave.findIndex(x => x.uid === c.uid); if (i >= 0) q.grave.splice(i, 1); } };
  // A card leaving the graveyard comes back as a clean copy, without damage or buffs.
  const fresh = c => newCard(DATA.cardsById[c.id] || c);

  if (pd.resolve === "messenger") {
    const foe = foeOf(owner);
    const top = foe.deck.pop();
    if (top) {
      if (option === "take") { owner.deck.push(top); log(`${owner.name} takes ${top.name} onto their deck.`); }
      else { foe.grave.push(top); log(`${top.name} is discarded from ${foe.name}'s deck.`); }
    }
  } else if (pd.resolve === "toHand") {
    for (const c of picked) { removeFromGrave(c); if (addToHand(owner, fresh(c))) log(`${c.name} returns to ${owner.name}'s hand.`); }
  } else if (pd.resolve === "discardDraw") {
    const c = picked[0];
    if (c) { owner.hand.splice(owner.hand.findIndex(x => x.uid === c.uid), 1); owner.grave.push(c); }
    drawCard(owner);
  } else if (pd.resolve === "rise") {
    const c = picked[0];
    if (c) {
      removeFromGrave(c);
      log(`${c.name} rises onto the field.`);
      putOnField(fresh(c), owner);
    }
  } else if (pd.resolve === "shepard") {
    const dead = owner.grave.find(x => x.uid === pd.deadUid);
    const shep = findChar(pd.shepardUid)?.c;
    if (option === "hand" && dead) {
      removeFromGrave(dead);
      if (addToHand(owner, fresh(dead))) log(`${pd.source.name} returns ${dead.name} to ${owner.name}'s hand.`);
    } else if (option === "absorb" && shep) {
      const g = pd.gain;
      shep.attack += g.a; shep.currentHealth += g.h;
      shep.baseAttack += g.a; shep.baseHealth += g.h;
      emit("text", { uid: shep.uid, text: `+${g.a}/+${g.h}`, color: "#8dff8d" });
      log(`${pd.source.name} absorbs ${dead?.name || "the fallen card"}.`);
    }
  } else if (pd.resolve === "counter") {
    const held = pd.held, caster = S.players[held.owner];
    const want = option === "counter" ? picked[0] || (pd.cards.length === 1 ? pd.cards[0] : null) : null;
    const i = want ? owner.hand.findIndex(x => x.uid === want.uid) : -1;
    if (i >= 0 && owner.mana >= playCost(owner.hand[i], owner)) {
      const counter = owner.hand.splice(i, 1)[0];
      owner.mana -= playCost(counter, owner);
      owner.grave.push(counter);
      if (held.card.type === "Character") caster.grave.push(held.card);   // a spell is already there
      emit("countered", { card: held.card, by: counter, player: owner.idx });
      log(`${owner.name} casts ${counter.name}: ${held.card.name} is countered.`);
    } else finishPlay(held);
  } else if (pd.resolve === "apeSacrifice") {
    const ape = findChar(pd.apeUid)?.c;
    const monkey = picked[0] && findChar(picked[0].uid)?.c;
    if (ape && monkey && monkey !== ape) {
      log(`${owner.name} sacrifices ${monkey.name} to ${ape.name}.`);
      destroyCharacter(monkey);
      ape.attack++; ape.health++;
      ape.baseAttack++; ape.baseHealth++;
      ape.currentHealth = ape.baseHealth + equipBonuses(ape).h;   // fully healed
      emit("text", { uid: ape.uid, text: "+1 ALL", color: "#ffd25e" });
    }
  }
  settle();
  return true;
}

// ---------------------------------------------------------------------------
// Combat (port of resolveCharacterAttack)
// ---------------------------------------------------------------------------
function canAttack(c) {
  return S.phase === PHASE.BATTLE && !S.over && !S.pending && c.owner === S.active && !c.hasAttacked && !hasSkill(c, "Tower");
}

// Guards: characters with Challenge or Tower must be attacked before anything else on
// their side, including the player. With more than one, the attacker picks which.
const isGuard = c => hasSkill(c, "Challenge") || hasSkill(c, "Tower");
function guards(defender) { return defender.field.chars.filter(isGuard); }
function forcedTarget(defender) { return guards(defender)[0] || null; }
// The skill that makes a character a guard, for messages.
const guardSkill = c => (hasSkill(c, "Challenge") ? "Challenge" : "Tower");

function attack(attackerUid, targetUid) {
  if (!allowed("attack", attackerUid, targetUid)) return false;
  const p = active();
  const a = p.field.chars.find(c => c.uid === attackerUid);
  if (!a || !canAttack(a)) return false;
  const defender = opponent();
  let target = targetUid != null ? defender.field.chars.find(c => c.uid === targetUid) : null;
  const g = guards(defender);
  if (g.length && !g.includes(target)) target = g[0];

  a.hasAttacked = true;
  a.attackedThisTurn = true;
  emit("lunge", { uid: a.uid, target: target ? target.uid : null, player: defender.idx });
  runHook(a, "attack", { owner: p });
  let as = stats(a);
  if (champOf(p, "boss_level")?.level >= 2 && p.doubledRound !== S.round) {   // LEVEL UP, level 2: the first attack each turn deals double
    p.doubledRound = S.round;
    as = { ...as, a: as.a * 2 };
    emit("text", { uid: a.uid, text: "CRITICAL HIT x2", color: "#ff8a5e" });
    log(`${a.name}'s first attack this turn deals double damage.`);
  }
  if (!target) {
    log(`${a.name} attacks ${defender.name} for ${as.a}.`);
    dealDamageToPlayer(defender, as.a, a);
    return true;
  }
  log(`${a.name} attacks ${target.name}.`);
  const ts = stats(target);
  let ta = ts.a, shield = 0;
  const defend = cardRule(target, "defend");   // "rule: defend <n>" (The Man Ape): +n to all stats while defending
  if (defend) { ta += Number(defend[0]); shield = Number(defend[0]); }
  if (ts.parry) ta *= 2;                                                      // Parry: double damage when defending

  const hitTarget = () => {
    const hpBefore = rawStats(target).h + shield;
    dealDamageToCharacter(target, Math.max(0, as.a - shield));
    if (hasSkill(a, "Overwhelm") && as.a > hpBefore) dealDamageToPlayer(defender, as.a - hpBefore, a);
  };
  const alive = c => ownerOf(c).field.chars.includes(c);

  // Both strike at the same time, unless exactly one of them has Swift: that one strikes
  // first, and takes no damage back if its blow knocks the other out.
  const aSwift = isSwift(a), tSwift = isSwift(target);
  const first = aSwift && !tSwift ? a : tSwift && !aSwift ? target : null;
  emit("clash", { attacker: a.uid, target: target.uid, swift: first ? first.uid : null });
  if (aSwift && !tSwift) {
    hitTarget();
    if (alive(target) && alive(a)) dealDamageToCharacter(a, ta);
  } else if (tSwift && !aSwift) {
    dealDamageToCharacter(a, ta);
    if (alive(a)) hitTarget();
  } else {
    hitTarget();
    if (alive(a)) dealDamageToCharacter(a, ta);
  }
  if (first && alive(first) && !alive(first === a ? target : a)) emit("text", { uid: first.uid, text: "» NO REPLY", color: "#9fe7ff" });
  recordCombatSurvival(a); recordCombatSurvival(target);
  // IP Man's deck counts the fights it wins: its character lives and the enemy character is knocked out.
  if (alive(a) && !alive(target)) { if (champOf(p, "ip_man")) champProgress(p, 1); }
  else if (alive(target) && !alive(a)) { if (champOf(defender, "ip_man")) champProgress(defender, 1); }
  return true;
}

// Swift: the skill, or wearing equipment that grants it (Zippy Shoes, Bow).
const isSwift = c => hasSkill(c, "Swift") || grantsSkill(c, "Swift");

// "rule: survive <fights> <CardID>" (Black Belt Student): after living through that many
// fights, the character transforms into that card.
function recordCombatSurvival(c) {
  const sv = c && cardRule(c, "survive");
  if (sv && ownerOf(c).field.chars.includes(c)) {
    c.combatSurvived = (c.combatSurvived || 0) + 1;
    if (c.combatSurvived >= Number(sv[0])) transformCharacter(c, sv[1]);
  }
}

// "rule: strike" (Kenshi's Blade): once per Battle Phase on your turn, the character holding
// this equipment uses its play effect (3 damage to an enemy character of your choice).
const bladeOf = c => (c.equipped || []).find(e => cardRule(e, "strike") && e.bladeRound !== S.round);
function canUseBlade(c) {
  const blade = bladeOf(c);
  return !!blade && S.phase === PHASE.BATTLE && !S.over && !S.pending && c.owner === S.active
    && validTargets(EFFECTS[blade.id], { card: blade, owner: ownerOf(c), spell: false }).length > 0;
}
function useBlade(uid) {
  if (!allowed("useBlade", uid)) return false;
  const f = findChar(uid);
  if (!f || !canUseBlade(f.c)) return false;
  const blade = bladeOf(f.c);
  blade.bladeRound = S.round;
  log(`${f.c.name} strikes with ${blade.name}.`);
  S.pending = { kind: "target", source: blade, owner: f.p.idx, spell: false, targetType: "char", intent: "harm" };
  return true;
}

// "rule: sacrifice <Faction>" (The Man Ape): after each of your Battle phases you may sacrifice
// another character of that faction you control to give it +1 to all stats for good and heal
// it fully.
function afterBattle(p) {
  for (const ape of p.field.chars.filter(c => cardRule(c, "sacrifice") && c.apeRound !== S.round)) {
    ape.apeRound = S.round;
    const faction = cardRule(ape, "sacrifice")[0];
    const monkeys = p.field.chars.filter(c => c !== ape && inGroup(c, faction));
    if (!monkeys.length) continue;
    ask({
      kind: "choose", source: ape, owner: p.idx, title: ape.name,
      prompt: `Sacrifice a ${faction} to give ${ape.name} +1 to all stats and heal it fully?`,
      cards: monkeys, pick: 1, options: [{ id: "sacrifice", label: "Sacrifice it" }], resolve: "apeSacrifice", apeUid: ape.uid,
    });
  }
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------
function doDraw() {
  if (!allowed("doDraw")) return false;
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
  if (!allowed("advancePhase")) return false;
  if (S.over || S.pending || S.phase === PHASE.DRAW) return false;
  const leavingBattle = S.phase === PHASE.BATTLE;
  if (S.phase < PHASE.END) S.phase++;
  emit("phase", {});
  if (S.phase === PHASE.BATTLE) ipBow(active());
  if (leavingBattle) afterBattle(active());
  return true;
}

// End-of-turn abilities: each "endTurn:" effect on this player's characters, the equipment
// they hold, and their areas.
function endPhaseEffects(p) {
  for (const c of p.field.chars.slice()) {
    runHook(c, "endTurn", { owner: p });
    for (const e of (c.equipped || []).slice()) runHook(e, "endTurn", { owner: p, holder: c });
  }
  for (const a of p.field.areas.slice()) runHook(a, "endTurn", { owner: p });
}

function endTurn() {
  if (!allowed("endTurn")) return false;
  if (S.over) return false;
  if (S.pending && S.pending.kind === "target" && !S.pending.required) S.pending = null;
  if (S.pending) return false;
  // Passing straight from Battle still ends the Battle phase first, which can ask The Man Ape's question.
  if (S.phase === PHASE.BATTLE) {
    S.phase = PHASE.END;
    afterBattle(active());
    if (S.pending) { S.passAfterChoice = true; return true; }
  }
  finishTurn();
  return true;
}

function finishTurn() {
  endPhaseEffects(active());
  for (const c of allChars()) c.bow = 0;   // The Bow lasts one turn
  S.active = 1 - S.active;
  S.phase = PHASE.DRAW;
  S.round++;
  startTurn(active());
  updateEvent();
  emit("turn", { player: S.active });
}
