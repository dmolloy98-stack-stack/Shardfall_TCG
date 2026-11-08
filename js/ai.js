// Computer opponent. It plays one action per call to aiStep(), so the UI can
// pause between actions and the human can follow what happened.
// It uses simulate() to try a move on a copy of the state before committing.

function charValue(c) {
  if (!c) return 0;
  const st = stats(c);
  return st.a * 1.4 + st.h + (isSwift(c) ? 1.5 : 0) + (c.manaCost || 0) * 0.8 + (c.skills || []).length;
}

function boardValue(p) {
  return p.field.chars.reduce((n, c) => n + charValue(c), 0) + p.health * 1.2;
}

// Score a position from the point of view of player index me.
function evaluate(me) {
  if (S.over) return S.winner === me ? 1e6 : -1e6;
  const mine = S.players[me], theirs = S.players[1 - me];
  return boardValue(mine) - boardValue(theirs) + mine.hand.length * 0.5;
}

// Best target for the pending target choice.
function aiPickTarget() {
  const pd = S.pending;
  const me = pd.owner;
  const fx = effectFor(pd.source) || EFFECTS[pd.source.name];
  const ctx = { card: pd.source, owner: S.players[me], spell: pd.spell };
  let best = null, bestScore = -Infinity;
  for (const t of validTargets(fx, ctx)) {
    const score = simulate(() => { chooseTarget(t.isPlayer ? t : { uid: t.uid }); return evaluate(me); });
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
    resolveChoice([], score("absorb") >= score("hand") ? "absorb" : "hand");
    return;
  }
  if (pd.resolve === "apeSacrifice") {
    let best = null, bestScore = simulate(() => { resolveChoice([], null); return evaluate(me); });
    for (const c of pd.cards) {
      const sc = simulate(() => { resolveChoice([c.uid], "sacrifice"); return evaluate(me); });
      if (sc > bestScore + 0.5) { bestScore = sc; best = c.uid; }
    }
    resolveChoice(best ? [best] : [], best ? "sacrifice" : null);
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

// All candidate setup actions, each scored by simulating it.
function aiSetupActions() {
  const me = S.active;
  const p = active();
  const base = evaluate(me);
  const actions = [];
  const tryAction = (label, run) => {
    const score = simulate(() => {
      if (!run()) return -Infinity;
      if (S.pending?.kind === "target") { const t = aiPickTarget(); if (!t) return -Infinity; chooseTarget(t.isPlayer ? t : { uid: t.uid }); }
      if (S.pending?.kind === "choose") aiResolveChoice();
      return evaluate(me);
    });
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

function aiAttackActions() {
  const me = S.active;
  const base = evaluate(me);
  const out = [];
  const defender = opponent();
  for (const a of active().field.chars) {
    if (!canAttack(a)) continue;
    const g = guards(defender);
    const targets = g.length ? g : [null, ...defender.field.chars];
    for (const t of targets) {
      const score = simulate(() => { attack(a.uid, t ? t.uid : null); return evaluate(me); });
      out.push({ attacker: a.uid, target: t ? t.uid : null, gain: score - base });
    }
  }
  // Kenshi's Blade: a free 3 damage once per Battle Phase.
  for (const a of active().field.chars) {
    if (!canUseBlade(a)) continue;
    for (const t of validTargets(EFFECTS["Kenshi's Blade"], { card: bladeOf(a), owner: active(), spell: false })) {
      const score = simulate(() => { useBlade(a.uid); chooseTarget({ uid: t.uid }); return evaluate(me); });
      out.push({ blade: a.uid, target: t.uid, gain: score - base });
    }
  }
  return out.filter(x => x.gain > 0).sort((x, y) => y.gain - x.gain);
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
    if (t) chooseTarget(t.isPlayer ? t : { uid: t.uid }); else cancelPending();
    return true;
  }
  if (S.pending?.kind === "choose") { aiResolveChoice(); return true; }

  if (S.phase === PHASE.DRAW) {
    if (!active().deck.length) { deckOut(active()); return false; }
    doDraw(); return true;
  }
  if (S.phase === PHASE.SETUP) {
    const [best] = aiSetupActions();
    if (best) { best.run(); return true; }
    // Spend the one-time mana token only when the extra mana unlocks a good play.
    if (active().manaToken && simulate(() => useManaToken() && aiSetupActions().length > 0)) { useManaToken(); return true; }
    advancePhase(); return true;
  }
  if (S.phase === PHASE.BATTLE) {
    const [best] = aiAttackActions();
    if (best?.blade) { useBlade(best.blade); chooseTarget({ uid: best.target }); return true; }
    if (best) { attack(best.attacker, best.target); return true; }
    advancePhase(); return true;
  }
  endTurn();
  return false;
}
