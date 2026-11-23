// Shardfall rules: costs, playing a card, and the choices a card asks for (targets and pick-a-card
// windows). Split out of js/engine.js; loaded after it (GAME_SCRIPTS in js/data.js).

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
