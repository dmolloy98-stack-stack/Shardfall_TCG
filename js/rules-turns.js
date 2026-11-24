// Shardfall rules: players, decks, starting a match, turns and phases. Split out of js/engine.js;
// loaded after it (GAME_SCRIPTS in js/data.js). newGame() and the match setup S.setup are here.

// ---------------------------------------------------------------------------
// Players, decks, turns
// ---------------------------------------------------------------------------
function makePlayer(idx, deckId, isAI) {
  const def = DATA.decks[deckId] || { faction: "Mixed", custom: true, name: "Replayed deck" };   // a replayed custom deck that isn't saved here
  return {
    idx, name: isAI ? "Computer" : `Player ${idx + 1}`, isAI: !!isAI, deckId, faction: def.faction,
    deckLabel: def.custom ? def.name : `${def.faction} deck`,
    mana: 0, manaMax: 0, turnsPlayed: 0, hasDrawn: false, ripen: false,
    deck: [], hand: [], grave: [],
    health: RULES.startingHealth, maxHealth: RULES.startingHealth,
    field: { chars: [], areas: [], equips: [] },
  };
}

function buildDeck(list) {
  const d = [];
  for (const entry of list) for (let k = 0; k < entry.quantity; k++) d.push(newCard(DATA.cardsById[entry.cardId]));
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
  champHook(p, "turnStart");   // e.g. Humble Beginnings (js/rules-champions.js)
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

// The parts of a match's state that start empty. js/boot.js also uses this to fill in anything
// missing from a match saved by an older version of the game (the hosted page keeps a match
// going across updates), so a newer rule never meets a match that lacks its part.
const baseState = () => ({ players: [], active: 0, phase: PHASE.DRAW, round: 1, over: false, winner: null, pending: null, queue: [], nextUid: 1, log: [],
  moves: [], setup: null, event: null, upcoming: null, lastEvent: null, noEvents: false, noAbilities: false, noShard: false, shard: null, shardFell: false, shardChip: [0, 0], shardBy: null, passAfterChoice: false, died: {} });

// A new match. Everything needed to replay it is kept in S.setup: these same settings, the seed,
// and both deck lists (so a replay works even where a custom deck isn't saved).
//   foeChampion  campaign: the second player is this champion (its CardID), who starts with its card in hand
//   lists        [deck list, deck list] to use instead of the saved decks (replays)
//   randPick     a replay of a match whose opponent deck was picked at random
function newGame({ deckId, opponentDeckId, mode, seed, events, abilities, shard, foeChampion, lists, randPick }) {
  seed = (seed ?? newSeed()) >>> 0;
  S = { ...baseState(), mode, seed, rng: seed, noEvents: events === false, noAbilities: abilities === false, noShard: shard === false };
  let opp = opponentDeckId;
  if (!opp || randPick) {
    randPick = true;
    const others = DATA.deckOrder.filter(id => id !== deckId);
    const pick = rand();
    if (!opp) opp = others.length ? others[Math.floor(pick * others.length)] : deckId;
  }
  lists = lists || [deckId, opp].map(id => DATA.decks[id].cards.map(e => ({ cardId: e.cardId, quantity: e.quantity })));
  S.setup = { deckId, opponentDeckId: opp, mode, seed, events, abilities, shard, foeChampion, randPick: !!randPick, lists };
  S.players = [makePlayer(0, deckId, false), makePlayer(1, opp, mode === "ai")];
  for (const p of S.players) {
    p.deck = buildDeck(lists[p.idx]);
    p.champ = null;   // champion ability, see "Champion abilities" below
    const champion = S.noAbilities ? null : p.deck.find(c => c.rarity === "Unknown" && DATA.championAbilities[c.id]);
    if (champion) p.champ = { id: champion.id, level: 1, n: 0 };
    for (let k = 0; k < RULES.startingHand; k++) drawCard(p);
  }
  startTurn(S.players[0]);
  // The first player skips their first draw, and the second player gets a one-time +1 mana token,
  // to offset the advantage of going first.
  S.players[0].hasDrawn = true;
  S.phase = PHASE.SETUP;
  S.players[1].manaToken = true;
  log(`${S.players[0].name} (${S.players[0].faction}) vs ${S.players[1].name} (${S.players[1].faction}) · match seed ${seed}`);
  if (foeChampion) campaignChampion(S.players[1], foeChampion);
  emit("newGame", {});
  return S;
}

// A campaign match: the second player is a champion, who starts with its own card in hand so it
// shows up in the match. (Its lines and how the computer plays it are in js/champions.js.)
// The champion is named by its CardID. Matches recorded before November 2026 named it by the card's
// name, so a name is still understood.
function campaignChampion(foe, champion) {
  const card = DATA.cardsById[champion] || DATA.cardsByName[champion];
  if (!card) return;
  const id = card.id, name = card.name;
  foe.name = name;
  foe.champion = id;
  const k = foe.deck.findIndex(c => c.id === id);
  if (k >= 0 && !foe.hand.some(c => c.id === id)) {
    const champ = foe.deck.splice(k, 1)[0];
    foe.deck.unshift(foe.hand.pop());
    foe.hand.push(champ);
    shuffle(foe.deck);
  }
  S.log.push(`${name} challenges ${S.players[0].name}.`);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------
function doDraw() {
  if (!allowed("doDraw")) return false;
  return drawStep();
}
function drawStep() {
  const p = active();
  if (S.phase !== PHASE.DRAW || S.over) return false;
  const c = drawCard(p);
  if (!c) return true;   // an empty deck: the draw happened, and its player lost (deckOut)
  for (let k = champHook(p, "extraDraws") || 0; k > 0 && !S.over; k--) drawCard(p);   // e.g. Boss Phases: 1 extra card
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
  if (S.phase === PHASE.BATTLE) champHook(active(), "battleStart");   // e.g. The Bow
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
  // Passing in the Draw phase still draws first, so passing can't skip a full hand's burn or
  // an empty deck's loss.
  if (S.phase === PHASE.DRAW) { drawStep(); if (S.over) return true; }
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
  shardFall();
  emit("turn", { player: S.active });
}
