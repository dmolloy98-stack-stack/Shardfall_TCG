// Computer opponent. It plays one action per call to aiStep(), so the UI can
// pause between actions and the human can follow what happened.
// It uses simulate() to try a move on a copy of the state before committing.
//
// How it thinks:
//   - evaluate() scores a position: its characters and health against the other side's.
//   - In Setup it plans the turn: it tries its best few plays, then the best few follow-ups
//     to each, and takes the first step of the line that ends in the best position. This is
//     how it finds two cheap cards that beat one expensive one, or a buff before an attack.
//   - In Battle it first checks whether attacking the player with everything wins the game.
//     Otherwise it looks a few attacks ahead and takes the first step of the best line.
//   - Each faction has a style (AI_STYLES) that changes what it values.

// How each faction's computer player likes to play:
//   face   how much it values hurting the enemy player      board  its own characters
//   hand   cards kept in hand                               wild   how often it takes its
//                                                                  second-best idea instead
const AI_STYLES = {
  Fighter: { face: 1.35, board: 0.95, hand: 0.4, wild: 0 },    // rushes the player down
  Monkey:  { face: 1.1,  board: 1,    hand: 0.5, wild: 0.25 }, // unpredictable
  Zombie:  { face: 0.9,  board: 1.15, hand: 0.6, wild: 0 },    // builds a swarm, strikes late
  Digital: { face: 1,    board: 1.1,  hand: 0.5, wild: 0 },    // grows its characters
  Simple:  { face: 1,    board: 1,    hand: 0.5, wild: 0 },    // steady
};
const AI_PLAIN = { face: 1, board: 1, hand: 0.5, wild: 0 };
// A champion (campaign only, see js/champions.js) adds its own tweaks on top of its faction's
// style, and some of them change as the match goes on.
function aiStyle(idx) {
  const p = S.players[idx];
  const base = AI_STYLES[p.faction] || AI_PLAIN;
  const ch = championOf(p);
  if (!ch) return base;
  const { late, hurt, ...own } = ch.ai;
  const st = { ...base, ...own };
  if (late && S.round >= late.round) Object.assign(st, late);
  if (hurt && p.health / p.maxHealth < hurt.below) Object.assign(st, hurt);
  return st;
}
// Setup planning: how many plays ahead it looks, and how many options it follows at each step.
const PLAN_DEPTH = 2, PLAN_WIDTH = 3;
// Battle planning: the same, for attacks.
const BATTLE_DEPTH = 3, BATTLE_WIDTH = 3;
const SHARD_CHIP = 1.2;   // what a point of damage on the big shard is worth to the computer
const SHARD_CLAIM = 6;    // what claiming it is worth beyond what shows on the board (the card drawn, a phase)

function charValue(c) {
  if (!c) return 0;
  const st = stats(c);
  return st.a * 1.4 + st.h + (isSwift(c) ? 1.5 : 0) + (c.manaCost || 0) * 0.8 + (c.skills || []).length;
}

const fieldValue = p => p.field.chars.reduce((n, c) => n + charValue(c), 0);

// Score a position from the point of view of player index me.
function evaluate(me) {
  if (S.over) return S.winner === me ? 1e6 : -1e6;
  const mine = S.players[me], theirs = S.players[1 - me];
  const st = aiStyle(me);
  let score = fieldValue(mine) * st.board + mine.health * 1.2
    - fieldValue(theirs) - theirs.health * 1.2 * st.face
    + mine.hand.length * st.hand;
  // The big shard: damage dealt to it is a small step toward claiming it (see "The big shard fall"
  // in js/engine.js), and claiming it is worth SHARD_CLAIM on top of what it changes on the board.
  if (S.shardFell) score += (S.shardChip[me] - S.shardChip[1 - me]) * SHARD_CHIP;   // kept after the break, so breaking it never looks like a loss
  if (S.shardBy != null) score += S.shardBy === me ? SHARD_CLAIM : -SHARD_CLAIM;
  // Danger: the other side's attackers could finish me next turn and nothing guards me.
  if (!guards(mine).length) {
    const threat = theirs.field.chars.reduce((n, c) => n + (hasSkill(c, "Tower") ? 0 : stats(c).a), 0);
    if (threat >= mine.health) score -= 25;
  }
  return score;
}

// A target in the form chooseTarget() takes: a player as it is, a card by its uid.
const targetRef = t => (t.isPlayer ? t : { uid: t.uid });

// Best target for the pending target choice.
function aiPickTarget() {
  const pd = S.pending;
  const me = pd.owner;
  let best = null, bestScore = -Infinity;
  for (const t of pendingTargets(pd)) {
    const score = simulate(() => { chooseTarget(targetRef(t)); return evaluate(me); });
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function aiResolveChoice() {
  const pd = S.pending;
  const me = pd.owner;
  // Soul Shepard and The Man Ape: try each answer on a copy of the game and take the best.
  if (pd.resolve === "shepard") {
    const score = o => simulate(() => { resolveChoice([], o); return evaluate(me); });
    resolveChoice([], score("absorb") >= score("hand") + (aiStyle(me).gather || 0) ? "absorb" : "hand");
    return;
  }
  if (pd.resolve === "apeSacrifice") {
    let best = null, bestScore = simulate(() => { resolveChoice([], null); return evaluate(me); });
    for (const c of pd.cards) {
      const sc = simulate(() => { resolveChoice([c.uid], "sacrifice"); return evaluate(me); });
      if (sc > bestScore + (aiStyle(me).sac ?? 0.5)) { bestScore = sc; best = c.uid; }
    }
    resolveChoice(best ? [best] : [], best ? "sacrifice" : null);
    return;
  }
  // A counter spell: use one only when stopping the card is worth more than the counter costs,
  // so a 4-mana counter is not spent on a 1-mana character.
  if (pd.resolve === "counter") {
    const letIt = simulate(() => { resolveChoice([], null); return evaluate(me); });
    let best = null, bestGain = 0;
    for (const c of pd.cards) {
      const gain = simulate(() => { resolveChoice([c.uid], "counter"); return evaluate(me); }) - letIt - playCost(c, S.players[me]) * 1.2;
      if (gain > bestGain) { bestGain = gain; best = c.uid; }
    }
    resolveChoice(best ? [best] : [], best ? "counter" : null);
    return;
  }
  if (pd.resolve === "messenger") {
    const top = pd.cards[0];
    resolveChoice([], top && top.manaCost >= 3 ? "take" : "discard");
    return;
  }
  const sorted = pd.cards.slice().sort((a, b) => b.manaCost - a.manaCost);
  if (pd.resolve === "discardDraw") sorted.reverse();
  const picks = sorted.slice(0, pd.pick || 1).map(c => c.uid);
  const option = pd.options?.some(o => o.id === "field") && S.players[me].mana >= 2 ? "field" : "hand";
  resolveChoice(picks, option);
}

// Do one setup action and answer any choice it raises, the way the computer would.
// Returns false if the action could not be done.
function aiDo(run) {
  if (!run()) return false;
  if (S.pending?.kind === "target") { const t = aiPickTarget(); if (!t) return false; chooseTarget(targetRef(t)); }
  if (S.pending?.kind === "choose") aiResolveChoice();
  return true;
}

// All candidate setup actions, each scored by simulating it.
function aiSetupActions() {
  const me = S.active;
  const p = active();
  const base = evaluate(me);
  const actions = [];
  const tryAction = (label, run) => {
    const score = simulate(() => (aiDo(run) ? evaluate(me) : -Infinity));
    if (score > -Infinity) actions.push({ label, run, score });
  };

  for (const c of p.hand) {
    if (!canPlay(c, p)) continue;
    if (c.type === "Equipment") {
      for (const t of p.field.chars) tryAction(`equip ${c.name}`, () => playCard(c.uid, { target: t }));
      if (!p.field.chars.length) tryAction(`place ${c.name}`, () => playCard(c.uid, { toField: true }));
    } else {
      tryAction(`play ${c.name}`, () => playCard(c.uid));
    }
  }
  for (const a of p.field.areas) {
    if (canActivateArea(a, p)) tryAction(`activate ${a.name}`, () => activateArea(a.uid));
  }
  for (const e of p.field.equips) {
    if (!canAttachFromField(e, p)) continue;
    for (const t of p.field.chars) tryAction(`attach ${e.name}`, () => attachFieldEquipment(e.uid, t.uid));
  }
  // Developing the board is worth something even when the position score barely moves.
  for (const a of actions) a.gain = a.score - base;
  return actions.filter(a => a.gain > 0.5).sort((x, y) => y.gain - x.gain);
}

// The best position reachable from here with up to depth more setup plays.
function aiPlanScore(me, depth) {
  let best = evaluate(me);
  if (depth <= 0 || S.over || S.pending) return best;
  for (const a of aiSetupActions().slice(0, PLAN_WIDTH)) {
    const score = simulate(() => (aiDo(a.run) ? aiPlanScore(me, depth - 1) : -Infinity));
    if (score > best) best = score;
  }
  return best;
}

// The setup play to make now: the first step of the best line of plays, or null to stop.
function aiPlanSetup() {
  const me = S.active;
  const options = aiSetupActions().slice(0, PLAN_WIDTH + 1);
  if (!options.length) return null;
  for (const a of options) a.plan = simulate(() => (aiDo(a.run) ? aiPlanScore(me, (aiStyle(me).depth ?? PLAN_DEPTH) - 1) : -Infinity));
  options.sort((x, y) => y.plan - x.plan);
  // A wild player sometimes goes with its second idea.
  const wild = aiStyle(me).wild;
  if (wild && options.length > 1 && options[1].plan > evaluate(me) && rand() < wild) return options[1];
  return options[0];
}

// If attacking the enemy player with every ready character wins the game right now, returns
// the first attacker to send. Otherwise null.
function aiLethal() {
  const me = S.active;
  if (guards(opponent()).length) return null;
  const order = active().field.chars.filter(canAttack).map(c => c.uid);
  if (!order.length) return null;
  const wins = simulate(() => {
    for (const uid of order) { if (S.over || S.pending) break; attack(uid, null); }
    return S.over && S.winner === me;
  });
  return wins ? order[0] : null;
}

function aiAttackActions() {
  const me = S.active;
  const base = evaluate(me);
  const out = [];
  const defender = opponent();
  for (const a of active().field.chars) {
    if (!canAttack(a)) continue;
    const g = guards(defender);
    const targets = g.length ? g : [null, ...defender.field.chars];
    if (S.shard) targets.push("shard");   // guards don't protect the big shard
    for (const t of targets) {
      const tid = t === "shard" ? "shard" : t ? t.uid : null;
      const score = simulate(() => { attack(a.uid, tid); return evaluate(me); });
      out.push({ attacker: a.uid, target: tid, gain: score - base });
    }
  }
  // Kenshi's Blade: a free 3 damage once per Battle Phase.
  for (const a of active().field.chars) {
    if (!canUseBlade(a)) continue;
    for (const t of validTargets(EFFECTS[bladeOf(a).id], { card: bladeOf(a), owner: active(), spell: false })) {
      const score = simulate(() => { useBlade(a.uid); chooseTarget({ uid: t.uid }); return evaluate(me); });
      out.push({ blade: a.uid, target: t.uid, gain: score - base });
    }
  }
  return out.sort((x, y) => y.gain - x.gain);
}

// Do one battle action from aiAttackActions().
function aiStrike(a) {
  if (a.blade) { useBlade(a.blade); chooseTarget({ uid: a.target }); }
  else attack(a.attacker, a.target);
  if (S.pending?.kind === "target") { const t = aiPickTarget(); if (t) chooseTarget(targetRef(t)); }
  if (S.pending?.kind === "choose") aiResolveChoice();
}

// The best position reachable from here with up to depth more attacks. Looking a few attacks
// ahead finds lines where the first attack looks poor alone, like breaking a guard so the
// others can reach the player.
function aiBattleScore(me, depth) {
  let best = evaluate(me);
  if (depth <= 0 || S.over || S.pending) return best;
  for (const a of aiAttackActions().slice(0, BATTLE_WIDTH)) {
    const score = simulate(() => { aiStrike(a); return aiBattleScore(me, depth - 1); });
    if (score > best) best = score;
  }
  return best;
}

// The attack to make now: the first step of the best line of attacks, or null to stop.
function aiPlanBattle() {
  const me = S.active;
  const base = evaluate(me);
  const st = aiStyle(me);
  // A patient champion only attacks when it clearly gains, and keeps its champion card at home
  // unless the gain is bigger still.
  const champ = championOf(active()) ? active().field.chars.find(c => c.name === active().champion) : null;
  let best = null, bestScore = base + (st.patience || 0);
  for (const a of aiAttackActions().slice(0, BATTLE_WIDTH + 1)) {
    const score = simulate(() => { aiStrike(a); return aiBattleScore(me, BATTLE_DEPTH - 1); });
    const need = champ && a.attacker === champ.uid ? st.champMargin || 0 : 0;
    if (score - need > bestScore) { bestScore = score - need; best = a; }
  }
  return best;
}

// Perform one AI action. Returns false when the AI has nothing more to do this turn.
// A choice can belong to the player whose turn it isn't (Soul Shepard, IP Man). The
// computer answers its own choices at any time, and waits while a person answers theirs.
function aiStep() {
  if (S.over) return false;
  if (S.pending && !S.players[S.pending.owner].isAI) return active().isAI;
  if (!S.pending && !active().isAI) return false;
  if (S.pending?.kind === "target") {
    const t = aiPickTarget();
    if (t) chooseTarget(targetRef(t)); else cancelPending();
    return true;
  }
  if (S.pending?.kind === "choose") { aiResolveChoice(); return true; }

  if (S.phase === PHASE.DRAW) {
    if (!active().deck.length) { deckOut(active()); return false; }
    doDraw(); return true;
  }
  if (S.phase === PHASE.SETUP) {
    const best = aiPlanSetup();
    if (best) { best.run(); return true; }
    // Spend the one-time mana token only when the extra mana unlocks a good play.
    if (active().manaToken && simulate(() => useManaToken() && aiSetupActions().length > 0)) { useManaToken(); return true; }
    advancePhase(); return true;
  }
  if (S.phase === PHASE.BATTLE) {
    const lethal = aiLethal();
    if (lethal != null) { attack(lethal, null); return true; }
    const best = aiPlanBattle();
    if (best?.blade) { useBlade(best.blade); chooseTarget({ uid: best.target }); return true; }
    if (best) { attack(best.attacker, best.target); return true; }
    advancePhase(); return true;
  }
  endTurn();
  return false;
}
