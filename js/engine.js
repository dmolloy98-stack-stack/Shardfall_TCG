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
  // The rounds a random event (a small shard fall) hits the board; each is announced eventWarn rounds ahead.
  eventRounds: String(DATA.rules.event_rounds ?? "").split("|").map(Number).filter(n => n > 0).sort((a, b) => a - b),
  eventWarn: DATA.rules.event_warning_rounds ?? 2,
  // The big shard fall: the round it lands (0 = never), its health, and what breaking it gives.
  shardRound: DATA.rules.shard_round ?? 0,
  shardHealth: DATA.rules.shard_health ?? 15,
  shardDraw: DATA.rules.shard_draw ?? 1,
  shardDrawNoChamp: DATA.rules.shard_draw_no_champion ?? 2,
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
function log(msg) { if (!muted) { S.log.push(msg); if (S.log.length > 400) S.log.shift(); emit("log", { msg }); } }   // the whole match, for the battle log

// Run fn against a cloned copy of the state without emitting events.
function simulate(fn) {
  const saved = S;
  S = structuredClone({ ...saved, moves: [] });   // the move list isn't needed for a look-ahead
  muted++;
  try { return fn(S); } finally { muted--; S = saved; }
}

// ---------------------------------------------------------------------------
// The front door for moves
// ---------------------------------------------------------------------------
// Every move a player makes comes in through move(name, ...details): your taps (js/ui.js), the
// computer (js/ai.js), the tutorial's scripted opponent, and one day a friend's moves sent over
// the internet. Each accepted move is written down in S.moves as a short note,
// [player, name, ...details], for example [0, "play", 41, { toField: true }]. The notes hold only
// numbers and words, so they can be saved or sent as text. With S.setup (the seed and both deck
// lists) they replay the match exactly: replayMatch().
// The functions behind the names below are the rules themselves; the computer's look-ahead calls
// them directly on a copy of the game, which is never written down.
const MOVES = {
  draw: () => doDraw(),
  deckOut: () => { deckOut(active()); return true; },   // Draw phase with an empty deck: you lose
  next: () => advancePhase(),
  end: () => endTurn(),
  token: () => useManaToken(),
  play: (uid, opts) => playCard(uid, opts || {}),
  attach: (equipUid, charUid) => attachFieldEquipment(equipUid, charUid),
  area: uid => activateArea(uid),
  attack: (uid, target) => attack(uid, target ?? null),
  allFace: () => attackAllFace(),
  blade: uid => useBlade(uid),
  target: t => chooseTarget(t),
  cancel: () => cancelPending(),
  choose: (picks, option) => resolveChoice(picks || [], option ?? null),
  testMana: () => { active().mana++; return true; },          // the Testing tools in the game menu
  testDraw: () => { drawCard(active()); return true; },
};

// A detail as it is written in a note: a player as { isPlayer, idx }, a card by its uid.
function noteOf(x) {
  if (x == null || typeof x !== "object") return x ?? null;
  if (Array.isArray(x)) return x.map(noteOf);
  if (x.isPlayer || S.players.includes(x)) return { isPlayer: true, idx: x.idx };
  if (x.uid != null && x.name != null) return { uid: x.uid };
  const o = {};
  for (const k of Object.keys(x)) if (x[k] !== undefined) o[k] = noteOf(x[k]);
  return o;
}

// Whose decision the game is waiting for: the player answering a question, else the active player.
const decider = () => (S.pending ? S.pending.owner : S.active);

function move(name, ...details) {
  const fn = MOVES[name];
  if (!fn) throw new Error(`Unknown move "${name}"`);
  while (details.length && details[details.length - 1] === undefined) details.pop();
  details = details.map(noteOf);
  const by = decider();
  const ok = fn(...details);
  if (ok !== false && !muted) S.moves.push([by, name, ...details]);
  return ok;
}

// "All attack": every character that can attack hits the opposing player. Does nothing while a
// guard (Challenge or Tower) stands, since the rules send those blows to the guard.
function attackAllFace() {
  if (guards(opponent()).length) return false;
  const ids = active().field.chars.filter(canAttack).map(c => c.uid);
  let any = false;
  for (const uid of ids) { if (S.over) break; if (attack(uid, null)) any = true; }
  return any;
}

// A whole match as text-friendly data: how it was set up, and every move since.
const matchRecord = () => ({ setup: S.setup, moves: S.moves });

// Plays a recorded match again from the start. Stops with an error naming the move that no
// longer fits (for example after a card was changed), so a broken replay is never silent.
function replayMatch(rec) {
  if (!rec?.setup || rec.setup.scripted) throw new Error("This match can't be replayed (no setup, or a tutorial lesson).");
  newGame({ ...rec.setup });
  rec.moves.forEach(([by, name, ...details], i) => {
    if (decider() !== by) throw new Error(`Replay went wrong at move ${i + 1} (${name}): it was player ${by + 1}'s move, but the game was waiting for player ${decider() + 1}.`);
    if (move(name, ...details) === false) throw new Error(`Replay went wrong at move ${i + 1} (${name}): the rules refused it.`);
  });
  return S;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const hasSkill = (c, n) => (c.skills || []).includes(n);
// Where a card is from (its Fracture; a hybrid has two), what it is (tribes) and what it does
// (classes). A card can have one or two of each. c.group is the first fracture: it sets the color.
const groupsOf = c => c.groups || [c.group];
const inGroup = (c, g) => groupsOf(c).includes(g);
// A tribe family is a wider name for several tribes ("tribe_family_<Name>" rows in data/game_rules.csv).
// None are in use: Undead used to be one, and is now a fracture (a whole world, holding the Zombie
// tribe today and Skeletons or Vampires later). A card "has" a family when it has any tribe in it.
const TRIBE_FAMILIES = Object.fromEntries(Object.entries(DATA.rules).filter(([k]) => k.startsWith("tribe_family_"))
  .map(([k, v]) => [k.slice("tribe_family_".length), String(v).split("|").map(s => s.trim()).filter(Boolean)]));
const hasTribe = (c, t) => (c.tribes || []).includes(t) || (TRIBE_FAMILIES[t] || []).some(x => (c.tribes || []).includes(x));
// Every tribe a character counts as: its own, plus each family one of them belongs to.
const tribesOf = c => [...new Set([...(c.tribes || []), ...Object.keys(TRIBE_FAMILIES).filter(f => hasTribe(c, f))])];
const hasClass = (c, k) => (c.classes || []).includes(k);
// A card "is" a name when it is that fracture, tribe or class, checked in that order. Rules that
// name a kind of card ("rule: shepherd Undead", "rule: sacrifice Monkey") use this.
const isKind = (c, name) => (DATA.factions[name] ? inGroup(c, name) : hasTribe(c, name) || hasClass(c, name));
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
  return !r ? 3 : r[0] === "none" ? Infinity : Number(r[0]);
};
const levelGains = c => { const r = cardRule(c, "levelGain"); return r ? [Number(r[0]), Number(r[1])] : [1, 1]; };
function levelUp(c, times = 1) {
  for (let k = 0; k < times; k++) {
    if (!hasSkill(c, "Level Up") || (c.levelUpCount || 0) >= levelCap(c)) return;
    c.levelUpCount = (c.levelUpCount || 0) + 1;
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
function damageEverything(n, spare = null) {   // spare: a character left out (Zombombadier itself)
  for (const q of S.players) {
    for (const x of q.field.chars.filter(x => x !== spare)) dealDamageToCharacter(x, n);
    dealDamageToPlayer(q, n);
  }
}

// An infected character gains the Zombie tribe on top of the tribes it had, so cards that care
// about Zombies reach it. It keeps its own fracture (the owner's choice: it doesn't join the
// Undead world) and its class.
function makeZombie(t) {
  if (!(t.tribes || []).includes("Zombie")) t.tribes = [...(t.tribes || []), "Zombie"];
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
