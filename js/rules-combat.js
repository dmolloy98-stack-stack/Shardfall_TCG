// Shardfall rules: damage, death and combat. Split out of js/engine.js (the core: the game state S,
// the front door for moves, stats and skills). Loaded right after it (GAME_SCRIPTS in js/data.js).

// ---------------------------------------------------------------------------
// Damage and death
// ---------------------------------------------------------------------------
// Protected: a player with RULES.protectAt or more characters, or with a character that has the
// Protected skill, takes half damage, rounded up. An attacker with Pierce ignores it.
function isProtected(p) {
  return !!RULES.protectAt && (p.field.chars.length >= RULES.protectAt || p.field.chars.some(c => skillNow(c, "Protected")));
}
function dealDamageToPlayer(p, amount, source) {
  if (amount <= 0 || S.over) return;
  const ip = p.field.chars.find(x => cardRule(x, "redirect") && x.redirectRound !== S.round);
  if (ip) { redirectDamage(ip, amount); return; }
  if (isProtected(p)) {
    if (source && skillNow(source, "Pierce")) emit("text", { uid: source.uid, say: "pierce" });
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
  champHook(p, "hurt");   // e.g. Boss Phases
}

function healPlayer(p, amount) {
  if (amount <= 0) return;
  const before = p.health;
  p.health = Math.max(p.health, Math.min(p.maxHealth, p.health + amount));   // never above the maximum; a heal never lowers it
  if (p.health > before) emit("playerHeal", { player: p.idx, amount: p.health - before });   // shows what was really gained
}

function sendToGraveyard(p, c) {
  // "rule: shepherd <Kind>" (Soul Shepard): asked each time another card of that kind dies
  // (a fracture, tribe or class; Soul Shepard's is the Undead fracture).
  const shepard = p.field.chars.find(x => x !== c && cardRule(x, "shepherd") && isKind(c, cardRule(x, "shepherd")[0]));
  const gain = shepard && p.field.chars.includes(c) ? statsAsRead(c) : null;
  const i = p.field.chars.indexOf(c);
  if (i >= 0) p.field.chars.splice(i, 1);
  p.grave.push(c);
  if (i >= 0) {
    // deaths counted by fracture and by tribe, and all together as "Any" (Soul Shepard grows with each)
    for (const k of new Set([...groupsOf(c), ...tribesOf(c), "Any"])) S.died[k] = (S.died[k] || 0) + 1;
    for (const pl of S.players) champHook(pl, "died", c, p.idx);   // The Man Ape and Soul Shepard count these
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
    emit("reanimate", { uid: c.uid, player: p.idx });
    emit("text", { uid: c.uid, say: "reanimate" });
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
  emit("text", { uid: ip.uid, say: "redirect" });
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
// Combat (port of resolveCharacterAttack)
// ---------------------------------------------------------------------------
function canAttack(c) {
  return S.phase === PHASE.BATTLE && !S.over && !S.pending && c.owner === S.active && !c.hasAttacked && !skillNow(c, "Tower");
}

// Guards: characters with Challenge or Tower must be attacked before anything else on
// their side, including the player. With more than one, the attacker picks which.
const isGuard = c => skillNow(c, "Challenge") || skillNow(c, "Tower");
function guards(defender) { return defender.field.chars.filter(isGuard); }
function forcedTarget(defender) { return guards(defender)[0] || null; }
// The skill that makes a character a guard, for messages.
const guardSkill = c => (skillNow(c, "Challenge") ? "Challenge" : "Tower");

function attack(attackerUid, targetUid) {
  if (!allowed("attack", attackerUid, targetUid)) return false;
  const p = active();
  const a = p.field.chars.find(c => c.uid === attackerUid);
  if (!a || !canAttack(a)) return false;
  const defender = opponent();
  if (targetUid === "shard") {   // the big shard: it doesn't hit back, and guards don't protect it
    if (!S.shard) return false;
    a.hasAttacked = true;
    a.attackedThisTurn = true;
    emit("lunge", { uid: a.uid, target: "shard", player: defender.idx });
    runHook(a, "attack", { owner: p });
    hitShard(a, stats(a).a);
    return true;
  }
  let target = targetUid != null ? defender.field.chars.find(c => c.uid === targetUid) : null;
  const g = guards(defender);
  if (g.length && !g.includes(target)) target = g[0];

  a.hasAttacked = true;
  a.attackedThisTurn = true;
  emit("lunge", { uid: a.uid, target: target ? target.uid : null, player: defender.idx });
  runHook(a, "attack", { owner: p });
  const as = stats(a);
  champHook(p, "attacking", a);   // e.g. Chest Thump shows its +1
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
    if (skillNow(a, "Overwhelm") && as.a > hpBefore) dealDamageToPlayer(defender, as.a - hpBefore, a);
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
  if (first && alive(first) && !alive(first === a ? target : a)) emit("text", { uid: first.uid, say: "noReply" });
  recordCombatSurvival(a); recordCombatSurvival(target);
  // A fight won: its character lives and the enemy character is knocked out (IP Man counts these).
  if (alive(a) && !alive(target)) champHook(p, "fightWon");
  else if (alive(target) && !alive(a)) champHook(defender, "fightWon");
  return true;
}

// Swift: the skill, or wearing equipment that grants it (Zippy Shoes, Bow).
const isSwift = c => skillNow(c, "Swift");

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

// "rule: sacrifice <Kind>" (The Man Ape: Monkey, a tribe): after each of your Battle phases you may
// sacrifice another character of that kind you control to give it +1 to all stats for good and heal
// it fully.
function afterBattle(p) {
  for (const ape of p.field.chars.filter(c => cardRule(c, "sacrifice") && c.apeRound !== S.round)) {
    ape.apeRound = S.round;
    const faction = cardRule(ape, "sacrifice")[0];
    const monkeys = p.field.chars.filter(c => c !== ape && isKind(c, faction));
    if (!monkeys.length) continue;
    ask({
      kind: "choose", source: ape, owner: p.idx, title: ape.name,
      prompt: `Sacrifice a ${faction} to give ${ape.name} +1 to all stats and heal it fully?`,
      cards: monkeys, pick: 1, options: [{ id: "sacrifice", label: "Sacrifice it" }], resolve: "apeSacrifice", apeUid: ape.uid,
    });
  }
}
