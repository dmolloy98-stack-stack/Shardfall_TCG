// Shardfall interface: menu, Almanac, board rendering, input and effects.
// The board is a fixed 1440x1000 stage (the LÖVE virtual size) scaled to the window.

const W = 1440, H = 1000, CARD_W = 95, CARD_H = 135;
const L = {
  top:    { chars: 222, support: 78 },
  bottom: { chars: 442, support: 592 },
  areasX: 270, equipsX: 830, deckX: 30, graveX: 140, slot: 105, charStep: 110,
  handY: 770,
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const U = {
  screen: "menu",
  deckId: DATA.deckOrder[0],
  mode: "ai",
  selected: null,        // uid of the attacker picked in Battle
  armed: null,           // { uid, from: "hand" | "field" } equipment waiting for a character
  curtain: false,
  ended: false,
  aiTimer: null,
  undo: [],
  spawn: new Map(), hits: new Map(), lunges: new Map(), drawn: new Map(),
  almanacTab: "cards", almanacFilter: "All", almanacReturn: "menu", guideReturn: "menu",
  scale: 1,
  tutorial: null,        // the running tutorial (js/tutorial.js), if any
  hints: PREFS.get("hints", true),
  hintOpen: true,
  hintNoteUntil: 0,
};

// ---------------------------------------------------------------------------
// Faction medallions (port of drawFactionMedallion) and card art
// ---------------------------------------------------------------------------
const GLYPHS = {
  Simple: '<path d="M12 20V10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="8.3" cy="8.6" rx="4" ry="2.1" transform="rotate(-25 8.3 8.6)" fill="currentColor"/><ellipse cx="15.6" cy="11.4" rx="4" ry="2.1" transform="rotate(20 15.6 11.4)" fill="currentColor"/>',
  Monkey: '<circle cx="12" cy="14" r="3.6" fill="currentColor"/><circle cx="7.6" cy="10" r="2.3" fill="currentColor"/><circle cx="16.4" cy="10" r="2.3" fill="currentColor"/><circle cx="10.4" cy="6.6" r="1.8" fill="currentColor"/><circle cx="13.6" cy="6.6" r="1.8" fill="currentColor"/>',
  Zombie: '<rect x="6.5" y="6" width="11" height="9.5" rx="2" fill="currentColor"/><rect x="9" y="9" width="2" height="2.4" fill="var(--g-bg)"/><rect x="13" y="9" width="2" height="2.4" fill="var(--g-bg)"/><path d="M8.5 18h7M10 15.5v3M12 15.5v3M14 15.5v3" stroke="currentColor" stroke-width="1.4"/>',
  Fighter: '<path d="M6 6l11 11M18 6L7 17M8.4 4.8l-3.4 3.4M15.6 4.8l3.4 3.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" fill="none"/>',
  Digital: '<rect x="7.5" y="7.5" width="9" height="9" rx="1.2" fill="currentColor"/><rect x="10.3" y="10.3" width="3.4" height="3.4" fill="var(--g-bg)"/><path d="M10 4.5v3M14 4.5v3M10 16.5v3M14 16.5v3M4.5 10h3M4.5 14h3M16.5 10h3M16.5 14h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  "N/A": '<path d="M12 4l6 8-6 8-6-8z" fill="currentColor"/><path d="M12 4v16M6 12h12" stroke="var(--g-bg)" stroke-width="0.8"/>',
};
function medal(group, cls = "medal") {
  const color = DATA.factions[group]?.color || "#6c6255";
  return `<svg class="${cls}" viewBox="0 0 24 24" style="--g-bg:${color}" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${color}" stroke="#1b130d" stroke-width="1"/><g color="#f6ecd2">${GLYPHS[group] || GLYPHS["N/A"]}</g></svg>`;
}
function glyph(group) {
  return `<svg viewBox="0 0 24 24" style="--g-bg:transparent" aria-hidden="true"><g color="#3a2a1c">${GLYPHS[group] || GLYPHS["N/A"]}</g></svg>`;
}

// Optional painted art: assets/cards/<ArtKey>.png. Each key is probed once.
const ART = {};
function artFor(key) {
  if (!key) return null;
  if (!(key in ART)) {
    ART[key] = null;
    const img = new Image();
    img.onload = () => { ART[key] = img.src; if (U.screen === "game") render(); };
    img.src = `assets/cards/${key}.png`;
  }
  return ART[key];
}

// ---------------------------------------------------------------------------
// Card markup
// ---------------------------------------------------------------------------
function cardHTML(c, opts = {}) {
  const edge = DATA.rarities[c.rarity]?.color || "#8f97a3";
  const fc = DATA.factions[c.group]?.color || "#7a6d5c";
  const art = artFor(c.artKey);
  const skills = (c.skills || []).map(s => `${DATA.skills[s]?.icon || "•"}${esc(s)}`).join(" ");
  let statsHTML = "";
  if (c.type === "Character" || c.type === "Equipment") {
    if (opts.field) {
      const st = stats(c), raw = rawStats(c);
      const hpLow = c.currentHealth < (c.baseHealth ?? c.health);
      statsHTML = `<div class="stats"><span class="a${st.a > c.attack ? " up" : ""}">⚔${st.a}</span><span class="h${hpLow ? " low" : ""}${st.h > c.currentHealth ? " up" : ""}">♥${Math.max(0, raw.h)}</span><span class="s${st.s > c.speed ? " up" : ""}">⚡${st.s}</span></div>`;
    } else {
      statsHTML = `<div class="stats"><span class="a">⚔${c.attack}</span><span class="h">♥${c.health}</span><span class="s">⚡${c.speed}</span></div>`;
    }
  }
  const cost = opts.costOverride ?? c.manaCost;
  return `<div class="card" style="--edge:${edge};--fc:${fc}">
    ${medal(c.group)}
    ${opts.field ? "" : `<div class="cost">${cost}</div>`}
    <div class="name">${esc(c.name)}</div>
    <div class="type">${esc(c.type)} · ${esc(c.group === "N/A" ? "Neutral" : c.group)}</div>
    <div class="art">${art ? `<img src="${esc(art)}" alt="">` : glyph(c.group)}</div>
    <div class="skills">${skills}</div>
    ${opts.field && c.equipped?.length ? `<div class="equip-count" title="Equipped">●${c.equipped.length}</div>` : ""}
    ${statsHTML}
  </div>`;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
const viewIdx = () => (S.mode === "ai" ? 0 : S.active);
const sideOf = idx => (idx === viewIdx() ? "bottom" : "top");
const humanTurn = () => S && !S.over && !active().isAI && !U.curtain;
function charX(i, n) { return 720 - (n * L.charStep - 15) / 2 + i * L.charStep; }
function handPos(i, n) {
  const spacing = Math.min(105, 800 / Math.max(1, n));
  const x = W / 2 - CARD_W / 2 - ((n - 1) * spacing) / 2 + i * spacing;
  const d = x + CARD_W / 2 - W / 2;
  return { x, y: L.handY + Math.abs(d) * 0.05, rot: d * 0.0007 };
}
// Center of a character on the stage, for floating numbers.
function charCenter(uid) {
  for (const p of S.players) {
    const i = p.field.chars.findIndex(c => c.uid === uid);
    if (i >= 0) return { x: charX(i, p.field.chars.length) + CARD_W / 2, y: L[sideOf(p.idx)].chars + CARD_H / 2 };
  }
  const el = document.querySelector(`.field-card[data-uid="${uid}"]`);
  if (el) return { x: el.offsetLeft + CARD_W / 2, y: el.offsetTop + CARD_H / 2 };
  return { x: W / 2, y: H / 2 };
}
function plateCenter(idx) { return sideOf(idx) === "top" ? { x: 720, y: 50 } : { x: 720, y: 958 }; }

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function floatText(x, y, text, color, small) {
  const el = document.createElement("div");
  el.className = "float" + (small ? " small" : "");
  el.style.left = x + "px"; el.style.top = y + "px"; el.style.color = color;
  el.textContent = text;
  $("#fx-layer").appendChild(el);
  setTimeout(() => el.remove(), 1250);
}
function shake(big) {
  const st = $("#stage");
  st.classList.remove("shake", "shake-big");
  void st.offsetWidth;
  st.classList.add(big ? "shake-big" : "shake");
}
function banner(text) {
  const b = $("#banner");
  b.hidden = false; b.textContent = text;
  b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.hidden = true; }, 1500);
}

onGameEvent((type, d) => {
  const now = performance.now();
  if (type === "charDamage") {
    const p = charCenter(d.uid);
    floatText(p.x + (Math.random() - 0.5) * 30, p.y, `-${d.amount}`, "#ff6a4d");
    U.hits.set(d.uid, now);
    if (d.amount >= 3) shake(false);
  } else if (type === "playerDamage") {
    const p = plateCenter(d.player);
    floatText(p.x + (Math.random() - 0.5) * 120, p.y - 10, `-${d.amount}`, "#ff6a4d");
    shake(d.amount >= 5);
  } else if (type === "playerHeal") {
    const p = plateCenter(d.player);
    floatText(p.x, p.y - 10, `+${d.amount}`, "#7be08f");
  } else if (type === "text") {
    const p = charCenter(d.uid);
    floatText(p.x, p.y - 40, d.text, d.color, true);
  } else if (type === "enter") {
    U.spawn.set(d.uid, { cost: Math.min(7, Math.max(1, d.cost)), t: now });
    if (d.cost >= 7) setTimeout(() => shake(true), 380);
  } else if (type === "lunge") {
    U.lunges.set(d.uid, now);
  } else if (type === "draw") {
    U.drawn.set(d.uid, now);
  } else if (type === "manaToken") {
    floatText(sideOf(d.player) === "bottom" ? 223 : 1203, sideOf(d.player) === "bottom" ? 470 : 250, "+1 MANA", "#ffd27a", true);
  } else if (type === "turn") {
    U.selected = null; U.armed = null;
    if (S.mode === "hotseat") U.curtain = true;
    else banner(active().isAI ? `${active().name}'s turn` : "Your turn");
  } else if (type === "gameOver") {
    U.ended = true;
  }
});
const recent = (map, uid, ms) => map.has(uid) && performance.now() - map.get(uid) < ms;

// ---------------------------------------------------------------------------
// Board rendering
// ---------------------------------------------------------------------------
function plateHTML(p, side) {
  const ratio = Math.max(0, Math.min(1, p.health / p.maxHealth));
  const hc = ratio > 0.55 ? "var(--heal)" : ratio > 0.25 ? "#f0a23a" : "var(--danger)";
  const pd = S.pending;
  const targetable = pd?.kind === "target" && pd.targetType === "charOrPlayer" && !S.players[pd.owner].isAI && humanTurn();
  const attackable = side === "top" && U.selected && !forcedTarget(p);
  const y = side === "top" ? 8 : 940;
  return `<div class="plate${targetable ? " targetable" : ""}${attackable ? " attackable" : ""}" data-act="plate" data-player="${p.idx}" style="left:530px;top:${y}px;width:380px">
    <div class="who"><span>${esc(p.name)}</span><em>${esc(p.faction)} deck</em></div>
    <div class="health${p.health < 10 && p.health > 0 ? " cracked" : ""}"><div class="fill" style="width:${ratio * 100}%;--hc:${hc}"></div><div class="num">${p.health} / ${p.maxHealth}</div></div>
  </div>`;
}

function fieldHTML(p, side) {
  const y = L[side];
  const n = p.field.chars.length;
  const pd = S.pending;
  const human = humanTurn();
  const humanPending = pd && !S.players[pd.owner].isAI && human;
  let h = "";

  // deck and graveyard
  const fc = DATA.factions[p.faction]?.color || "#888";
  h += `<div class="pile deck" data-act="deck" data-player="${p.idx}" style="left:${L.deckX}px;top:${y.support}px;--fc:${fc}"><span>DECK<b>${p.deck.length}</b></span></div>`;
  h += `<div class="pile grave" data-act="grave" data-player="${p.idx}" style="left:${L.graveX}px;top:${y.support}px"><span>GRAVE<b>${p.grave.length}</b></span></div>`;

  // areas and equipment rows
  for (let i = 0; i < RULES.maxAreas; i++) {
    const a = p.field.areas[i];
    const x = L.areasX + i * L.slot;
    if (!a) { h += `<div class="slot" style="left:${x}px;top:${y.support}px"></div>`; continue; }
    const tgt = humanPending && pd.kind === "target" && pd.targetType === "area";
    const usable = human && p === active() && canActivateArea(a, p);
    h += `<div class="small-card${tgt ? " targetable" : ""}${usable ? " activatable" : ""}" data-act="area" data-uid="${a.uid}" style="left:${x}px;top:${y.support}px">${cardHTML(a)}</div>`;
  }
  for (let i = 0; i < RULES.maxEquips; i++) {
    const e = p.field.equips[i];
    const x = L.equipsX + i * L.slot;
    if (!e) { h += `<div class="slot" data-zone="equips" style="left:${x}px;top:${y.support}px"></div>`; continue; }
    const armed = U.armed?.uid === e.uid;
    h += `<div class="small-card${armed ? " armed" : ""}" data-act="equip" data-uid="${e.uid}" data-player="${p.idx}" style="left:${x}px;top:${y.support}px">${cardHTML(e)}${side === "bottom" ? `<div class="attach-cost">Attach: ${equipCost(e, p, null, true)} mana</div>` : ""}</div>`;
  }
  const labelY = side === "bottom" ? y.support - 20 : y.support + CARD_H + 2;
  h += `<div class="zone-label" style="left:${L.areasX}px;top:${labelY}px">Areas</div>`;
  h += `<div class="zone-label" style="left:${L.equipsX}px;top:${labelY}px">${side === "bottom" ? "Equipment · tap one, then a character" : "Equipment"}</div>`;

  // characters
  const forced = side === "top" ? forcedTarget(p) : null;
  p.field.chars.forEach((c, i) => {
    const cls = ["field-card"];
    if (side === "bottom" && human && canAttack(c)) cls.push("ready");
    if (c.hasAttacked && c.owner === S.active && S.phase === PHASE.BATTLE) cls.push("spent");
    if (U.selected === c.uid) cls.push("selected");
    if (humanPending && pd.kind === "target" && pd.targetType !== "area" && isValidTarget({ uid: c.uid })) cls.push("targetable");
    if (U.armed && side === "bottom" && human) cls.push("targetable");
    if (U.selected && side === "top" && (!forced || forced === c)) cls.push("attackable");
    if (recent(U.hits, c.uid, 450)) cls.push("hit");
    if (recent(U.lunges, c.uid, 400)) cls.push(side === "bottom" ? "lunge-up" : "lunge-down");
    const sp = U.spawn.get(c.uid);
    if (sp && performance.now() - sp.t < 1000) cls.push("spawn-" + sp.cost);
    h += `<div class="${cls.join(" ")}" data-act="char" data-uid="${c.uid}" data-side="${side}" style="left:${charX(i, n)}px;top:${y.chars}px">${cardHTML(c, { field: true })}</div>`;
  });
  return h;
}

function manaHTML(p, side) {
  const pos = side === "bottom" ? "left:200px;top:470px" : "left:1180px;top:250px";
  let token = "";
  if (p.manaToken) {
    const usable = humanTurn() && p === active() && !S.pending;
    token = `<button type="button" class="mana-token" data-act="token" ${usable ? "" : "disabled"} title="One-time bonus for going second: tap to gain +1 mana this turn" aria-label="Use bonus mana token, plus 1 mana this turn">+1</button>`;
  }
  return `<div class="mana" data-player="${p.idx}" style="${pos}"><div class="gem">${p.mana}</div>${token}MANA ${p.mana}/${p.manaMax}</div>`;
}

function render() {
  if (!S) return;
  const me = S.players[viewIdx()], them = S.players[1 - viewIdx()];
  const human = humanTurn();
  let h = `<div class="bar top"></div><div class="bar bottom"></div>`;
  h += `<button type="button" class="btn stage-btn" data-act="menu" style="left:16px;top:11px;width:110px;height:44px" aria-label="Game menu">☰ Menu</button>`;
  h += plateHTML(them, "top") + plateHTML(me, "bottom");

  // opponent hand, face down
  const oh = them.hand.map(() => `<div class="card back"></div>`).join("");
  h += `<div class="opp-hand" style="left:${960}px;top:7px" title="${them.hand.length} cards in hand">${oh}</div>`;
  h += fieldHTML(them, "top") + fieldHTML(me, "bottom");
  h += manaHTML(them, "top") + manaHTML(me, "bottom");

  // middle band
  h += `<div class="turn-info" style="top:372px"><b>Round ${S.round}</b>${esc(active().name)}'s turn</div>`;
  h += `<div class="phases">${DATA.phases.map((ph, i) => `<div class="phase-step${i === S.phase ? " on" : ""}">${esc(ph.name)}</div>`).join("")}</div>`;
  const forced = forcedTarget(them);
  if (U.selected && human) {
    h += forced
      ? `<div class="instruction">${esc(forced.name)} has Challenge and must be attacked first</div>`
      : `<button type="button" class="face-btn" data-act="face">⚔ Attack ${esc(them.name)} directly</button>`;
  } else if (!S.over) {
    const instr = active().isAI ? `${active().name === "Computer" ? "The computer" : active().name} is taking its turn…` : DATA.phases[S.phase]?.instruction || "";
    h += `<div class="instruction">${esc(instr)}</div>`;
  }

  const label = ["Draw card", "To battle →", "To end →", "Pass turn →"][S.phase];
  const canPhase = human && !S.pending && !U.armed;
  h += `<button type="button" class="btn stage-btn${canPhase && S.phase === PHASE.DRAW ? " glow" : ""}" data-act="phase" style="left:1220px;top:372px;width:200px;height:56px" ${canPhase ? "" : "disabled"}>${label}</button>`;
  h += `<button type="button" class="btn stage-btn" data-act="pass" style="left:1240px;top:942px;width:180px;height:48px" ${canPhase ? "" : "disabled"}>Pass turn</button>`;
  h += `<div class="log">${S.log.slice(-6).map(m => `<div>${esc(m)}</div>`).join("")}</div>`;

  if (U.curtain) {
    h += `<div class="curtain"><p>Pass the device to</p><h2>${esc(active().name)}</h2><p>${esc(active().faction)} deck · Round ${S.round}</p><button type="button" class="btn btn-primary" data-act="curtain">Start turn</button></div>`;
  } else if (U.ended && !U.tutorial) {
    const title = S.winner == null ? "A draw" : S.mode === "ai" ? (S.winner === 0 ? "Victory" : "Defeat") : `${S.players[S.winner].name} wins`;
    const sub = S.winner == null ? "Both players fell at once." : `${S.players[S.winner].name} wins in round ${S.round}.`;
    h += `<div class="curtain endscreen"><h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="detail-actions"><button type="button" class="btn btn-primary" data-act="again">Play again</button><button type="button" class="btn" data-act="tomenu">Main menu</button></div></div>`;
  }
  $("#board").innerHTML = h;
  renderHand(me);
  renderPrompt();
  renderOverlays();
}

// Tutorial coach and beginner hints sit above the board in screen space, so their
// text stays readable however small the board is scaled.
function renderOverlays() {
  tutUpdate();
  renderCoach();
  renderHint();
  renderControls();
  renderRotate();
}

function renderHand(p) {
  const layer = $("#hand-layer");
  const human = humanTurn() && p === active();
  const n = p.hand.length;
  layer.innerHTML = p.hand.map((c, i) => {
    const pos = handPos(i, n);
    const cls = ["hand-card"];
    if (human && canPlay(c, p)) cls.push("playable");
    if (recent(U.drawn, c.uid, 600)) cls.push("drawn");
    const costShown = playCost(c, p);
    return `<div class="${cls.join(" ")}" data-uid="${c.uid}" style="left:${pos.x}px;top:${pos.y}px;transform:rotate(${pos.rot}rad);z-index:${i + 1}">${cardHTML(c, { costOverride: costShown })}</div>`;
  }).join("");
  if (U.curtain) layer.innerHTML = "";
}

function renderPrompt() {
  const el = $("#prompt");
  const pd = S.pending;
  let msg = null, cancel = true;
  if (U.curtain || U.ended) msg = null;
  else if (pd?.kind === "target" && !S.players[pd.owner].isAI) {
    const what = pd.source.name === "Data Transfer" ? "one of your characters to lose a Level (you gain 2 HP)" : pd.targetType === "area" ? "an area" : pd.targetType === "charOrPlayer" ? "a character or player" : "a character";
    msg = `${pd.source.name}: choose ${what}`;
    cancel = !pd.required;
  } else if (U.armed) {
    const c = findCardAnywhere(U.armed.uid);
    msg = `Choose one of your characters to equip ${c ? c.name : "it"}`;
  }
  el.hidden = !msg;
  if (msg) el.innerHTML = `<span>${esc(msg)}</span>${cancel ? `<button type="button" class="btn" data-act="cancel">Cancel</button>` : ""}`;

  if (pd?.kind === "choose" && !S.players[pd.owner].isAI && !U.curtain && !openModal.choose) showChoose();
}

function findCardAnywhere(uid) {
  for (const p of S.players) for (const list of [p.hand, p.field.equips, p.field.areas, p.field.chars, p.grave]) {
    const c = list.find(x => x.uid === uid);
    if (c) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions (every human action goes through act() so it can be undone)
// ---------------------------------------------------------------------------
function act(fn) {
  const snap = structuredClone(S);
  const ok = fn();
  if (ok !== false) { U.undo.push(snap); if (U.undo.length > 25) U.undo.shift(); }
  afterAction();
  return ok;
}
function afterAction() {
  render();
  scheduleAI();
}
function scheduleAI() {
  clearTimeout(U.aiTimer);
  if (!S || S.over || !active().isAI || U.screen !== "game" || U.tutorial) return;
  U.aiTimer = setTimeout(() => {
    const more = aiStep();
    render();
    if (more || active().isAI) scheduleAI();
  }, S.phase === PHASE.DRAW ? 900 : 750);
}

function startGame() {
  endTutorial();
  clearTimeout(U.aiTimer);
  Object.assign(U, { selected: null, armed: null, curtain: false, ended: false, undo: [] });
  U.spawn.clear(); U.hits.clear(); U.lunges.clear(); U.drawn.clear();
  newGame({ deckId: U.deckId, mode: U.mode });
  showScreen("game");
  if (U.mode === "hotseat") U.curtain = true; else banner("Your turn");
  render();
}

function onPhaseButton() {
  if (!humanTurn() || S.pending || U.armed) return;
  U.selected = null;
  if (S.phase === PHASE.DRAW) {
    if (!active().deck.length) { act(() => { deckOut(active()); }); return; }
    act(doDraw);
  } else if (S.phase === PHASE.END) act(endTurn);
  else act(advancePhase);
}

function clickChar(uid, side) {
  const human = humanTurn();
  const pd = S.pending;
  const found = findChar(uid);
  if (!found) return;
  if (human && pd?.kind === "target" && !S.players[pd.owner].isAI) {
    if (isValidTarget({ uid })) act(() => chooseTarget({ uid }));
    return;
  }
  if (human && U.armed) {
    if (found.p === active()) {
      const { uid: eq, from } = U.armed;
      U.armed = null;
      act(() => from === "field" ? attachFieldEquipment(eq, uid) : playCard(eq, { target: { uid } }));
    }
    return;
  }
  if (human && S.phase === PHASE.BATTLE) {
    if (found.p === active() && canAttack(found.c)) { U.selected = U.selected === uid ? null : uid; render(); return; }
    if (found.p !== active() && U.selected) {
      const a = U.selected; U.selected = null;
      act(() => attack(a, uid));
      return;
    }
  }
  showDetail(found.c, { field: true });
}

// ---------------------------------------------------------------------------
// Hand: drag to play, tap for details
// ---------------------------------------------------------------------------
let drag = null;
function stagePoint(e) {
  const r = $("#stage").getBoundingClientRect();
  return { x: (e.clientX - r.left) / U.scale, y: (e.clientY - r.top) / U.scale };
}
function handDown(e) {
  const el = e.target.closest(".hand-card");
  if (!el || e.button === 2) return;
  const uid = Number(el.dataset.uid);
  drag = { uid, el, start: stagePoint(e), moved: false, pointerId: e.pointerId };
  el.setPointerCapture?.(e.pointerId);
}
function handMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const pt = stagePoint(e);
  if (!drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) > 8) {
    const c = active().hand.find(x => x.uid === drag.uid);
    if (!humanTurn() || !c || !canPlay(c)) return;
    drag.moved = true;
    drag.card = c;
    drag.el.classList.add("dragging");
    drag.ghost = document.createElement("div");
    drag.ghost.className = "ghost";
    drag.ghost.innerHTML = cardHTML(c, { costOverride: playCost(c) });
    $("#stage").appendChild(drag.ghost);
    if (c.type === "Equipment") {
      drag.hint = document.createElement("div");
      drag.hint.className = "drop-hint";
      Object.assign(drag.hint.style, { left: L.equipsX - 8 + "px", top: L.bottom.support - 8 + "px", width: RULES.maxEquips * L.slot + 6 + "px", height: CARD_H + 16 + "px" });
      $("#stage").appendChild(drag.hint);
    }
  }
  if (drag.moved) {
    drag.ghost.style.left = pt.x - CARD_W / 2 + "px";
    drag.ghost.style.top = pt.y - CARD_H / 2 + "px";
  }
}
function handUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag; drag = null;
  d.ghost?.remove(); d.hint?.remove();
  d.el.classList.remove("dragging");
  if (!d.moved) {
    const c = S.players[viewIdx()].hand.find(x => x.uid === d.uid);
    if (c) showDetail(c, { hand: true });
    return;
  }
  const pt = stagePoint(e);
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const charEl = under?.closest('.field-card[data-side="bottom"]');
  const c = d.card;
  if (c.type === "Equipment") {
    const inEquipRow = pt.x >= L.equipsX - 10 && pt.x <= L.equipsX + RULES.maxEquips * L.slot && pt.y >= L.bottom.support - 10 && pt.y <= L.bottom.support + CARD_H + 10;
    if (charEl) act(() => playCard(c.uid, { target: { uid: Number(charEl.dataset.uid) } }));
    else if (inEquipRow) act(() => playCard(c.uid, { toField: true }));
    else if (pt.y < 740 && active().field.chars.length) { U.armed = { uid: c.uid, from: "hand" }; render(); }
    else render();
  } else if (pt.y < 740) act(() => playCard(c.uid));
  else render();
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function openModal(html, { dismissable = true } = {}) {
  $("#modal-content").innerHTML = html;
  $("#modal").hidden = false;
  $("#modal").dataset.dismissable = dismissable ? "1" : "";
  const first = $("#modal-content").querySelector("button");
  first?.focus({ preventScroll: true });
}
function closeModal() {
  $("#modal").hidden = true;
  $("#modal-content").innerHTML = "";
  openModal.choose = false;
}

function skillRows(c) {
  return (c.skills || []).map(s => {
    const sk = DATA.skills[s];
    return `<div class="detail-skill"><span class="icon">${esc(sk?.icon || "•")}</span><span><b>${esc(s)}</b> · ${esc(sk?.desc || "")}</span></div>`;
  }).join("");
}

function showDetail(c, ctx = {}) {
  let actions = "", extra = "";
  if (ctx.field && c.owner != null && findChar(c.uid)) {
    const st = stats(c), raw = rawStats(c);
    extra += `<div class="statline"><span class="a">⚔ ${st.a}</span><span class="h">♥ ${Math.max(0, raw.h)}</span><span class="s">⚡ ${st.s}</span></div>`;
    if (c.equipped?.length) extra += `<p><b>Equipped:</b> ${c.equipped.map(e => `${esc(e.name)} (+${e.attack}/+${e.health}/+${e.speed})`).join(", ")}</p>`;
    if (st.parry && !hasSkill(c, "Parry")) extra += `<p>Has Parry from an area.</p>`;
    if (c.disabled) extra += `<p class="reason">Disabled: this character has no abilities.</p>`;
  }
  if (ctx.hand && humanTurn() && S.players[viewIdx()] === active()) {
    const blocker = playBlocker(c);
    if (blocker) actions = `<p class="reason">${esc(blocker)}</p>`;
    else if (c.type === "Equipment") {
      const p = active();
      const btns = [];
      if (p.field.chars.length) btns.push(`<button type="button" class="btn btn-primary" data-m="arm" data-uid="${c.uid}">Equip to a character</button>`);
      if (p.field.equips.length < RULES.maxEquips && p.mana >= playCost(c, p)) btns.push(`<button type="button" class="btn" data-m="tofield" data-uid="${c.uid}">Place in equipment row</button>`);
      actions = `<div class="detail-actions">${btns.join("")}</div>`;
    } else actions = `<div class="detail-actions"><button type="button" class="btn btn-primary" data-m="play" data-uid="${c.uid}">Play for ${playCost(c)} mana</button></div>`;
  }
  if (UNIMPLEMENTED.has(c.name)) extra += `<p class="reason">Counter spells are not playable yet: they need a reaction window the game does not have.</p>`;
  const ability = c.ability || c.description;
  openModal(`<div class="detail">
    ${cardHTML(c, ctx.field && findChar(c.uid) ? { field: true } : {})}
    <div class="detail-text">
      <div><h2 id="modal-title">${esc(c.name)}</h2><p class="sub">${esc(c.type)} · ${esc(c.rarity)} · ${esc(c.group === "N/A" ? "Neutral" : c.group)}${c.race && c.race !== "N/A" ? " · " + esc(c.race) : ""} · ${c.manaCost} mana</p></div>
      ${ability ? `<p class="ability">${esc(ability)}</p>` : ""}
      ${skillRows(c)}
      ${extra}
      ${actions}
      <div class="detail-actions"><button type="button" class="btn btn-small" data-close>Close</button></div>
    </div>
  </div>`);
}

function showGrave(p) {
  openModal(`<h2 id="modal-title">${esc(p.name)}'s graveyard</h2><p class="sub">${p.grave.length} card${p.grave.length === 1 ? "" : "s"}</p>
    <div class="modal-cards">${p.grave.length ? p.grave.map(c => `<button type="button" data-m="detail" data-uid="${c.uid}">${cardHTML(c)}</button>`).join("") : "<p>Nothing here yet.</p>"}</div>
    <div class="detail-actions" style="margin-top:16px"><button type="button" class="btn btn-small" data-close>Close</button></div>`);
}

function showChoose() {
  const pd = S.pending;
  openModal.choose = true;
  const picked = new Set();
  const max = pd.pick || 1;
  const draw = () => {
    const options = pd.options || [{ id: "ok", label: "Confirm" }];
    const needPick = pd.resolve !== "messenger";
    $("#modal-content").innerHTML = `<h2 id="modal-title">${esc(pd.title)}</h2><p class="sub">${esc(pd.prompt)}</p>
      <div class="modal-cards">${pd.cards.map(c => `<button type="button" class="${picked.has(c.uid) ? "picked" : ""}" data-pick="${c.uid}">${cardHTML(c)}</button>`).join("")}</div>
      <div class="detail-actions" style="margin-top:16px">${options.map(o => `<button type="button" class="btn${o === options[0] ? " btn-primary" : ""}" data-opt="${o.id}" ${needPick && !picked.size && pd.required ? "disabled" : ""}>${esc(o.label)}</button>`).join("")}
      ${pd.required ? "" : `<button type="button" class="btn btn-small" data-opt="__skip">Skip</button>`}</div>`;
  };
  openModal("", { dismissable: false });
  draw();
  $("#modal-content").onclick = e => {
    const pick = e.target.closest("[data-pick]");
    if (pick) {
      const uid = Number(pick.dataset.pick);
      if (picked.has(uid)) picked.delete(uid);
      else { if (picked.size >= max) picked.delete(picked.values().next().value); picked.add(uid); }
      draw(); return;
    }
    const opt = e.target.closest("[data-opt]");
    if (!opt) return;
    $("#modal-content").onclick = null;
    closeModal();
    if (opt.dataset.opt === "__skip") act(() => resolveChoice([], null));
    else act(() => resolveChoice([...picked], opt.dataset.opt));
  };
}

function showGameMenu() {
  const canUndo = U.undo.length && humanTurn();
  if (U.tutorial) {
    openModal(`<h2 id="modal-title">Tutorial</h2>
      <div class="menu-list">
        <button type="button" class="btn" data-m="resume">Resume</button>
        <button type="button" class="btn" data-m="restart">Start the tutorial over</button>
        <button type="button" class="btn" data-m="rules">How to play</button>
        <button type="button" class="btn" data-m="mainmenu">Leave tutorial</button>
      </div>`);
    return;
  }
  openModal(`<h2 id="modal-title">Game menu</h2>
    <div class="menu-list">
      <button type="button" class="btn" data-m="resume">Resume</button>
      <button type="button" class="btn" data-m="restart">${esc(DATA.text("button_restart", "Restart"))}</button>
      <button type="button" class="btn" data-m="hints" aria-pressed="${U.hints}">Beginner hints: ${U.hints ? "On" : "Off"}</button>
      <button type="button" class="btn" data-m="almanac">${esc(DATA.text("button_almanac", "Almanac"))}</button>
      <button type="button" class="btn" data-m="rules">How to play</button>
      <button type="button" class="btn" data-m="mainmenu">${esc(DATA.text("button_main_menu", "Main menu"))}</button>
    </div>
    <div class="dev"><h3>Testing tools</h3><div class="row">
      <button type="button" class="btn btn-small" data-m="undo" ${canUndo ? "" : "disabled"}>Undo (${U.undo.length})</button>
      <button type="button" class="btn btn-small" data-m="mana" ${humanTurn() ? "" : "disabled"}>+1 mana</button>
      <button type="button" class="btn btn-small" data-m="qadraw" ${humanTurn() ? "" : "disabled"}>Draw a card</button>
    </div></div>`);
}

$("#modal").addEventListener("click", e => {
  if (e.target.closest("[data-close]") && $("#modal").dataset.dismissable) { closeModal(); return; }
  const b = e.target.closest("[data-m]");
  if (!b) return;
  const m = b.dataset.m, uid = Number(b.dataset.uid);
  if (m === "detail") { const c = findCardAnywhere(uid); if (c) showDetail(c); return; }
  closeModal();
  if (m === "play") act(() => playCard(uid));
  else if (m === "arm") { U.armed = { uid, from: "hand" }; render(); }
  else if (m === "tofield") act(() => playCard(uid, { toField: true }));
  else if (m === "restart") U.tutorial ? startTutorial() : startGame();
  else if (m === "hints") { setHints(!U.hints); showGameMenu(); }
  else if (m === "almanac") { U.almanacReturn = "game"; clearTimeout(U.aiTimer); showScreen("almanac"); }
  else if (m === "rules") showGuide();
  else if (m === "mainmenu") { endTutorial(); clearTimeout(U.aiTimer); showScreen("menu"); }
  else if (m === "undo") { if (U.undo.length) { S = U.undo.pop(); U.selected = null; U.armed = null; U.ended = S.over; render(); } }
  else if (m === "mana") act(() => { active().mana++; });
  else if (m === "qadraw") act(() => { drawCard(active()); });
});

// ---------------------------------------------------------------------------
// Board input
// ---------------------------------------------------------------------------
$("#board").addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || !S) return;
  const a = el.dataset.act;
  const uid = Number(el.dataset.uid);
  const human = humanTurn();
  if (a === "menu") return showGameMenu();
  if (a === "curtain") { U.curtain = false; render(); const b = $("#board"); b.classList.remove("rotate-in"); void b.offsetWidth; b.classList.add("rotate-in"); banner(`${active().name}'s turn`); return; }
  if (a === "again") return startGame();
  if (a === "tomenu") { endTutorial(); return showScreen("menu"); }
  if (a === "phase") return onPhaseButton();
  if (a === "pass") { if (human && !S.pending && !U.armed) { U.selected = null; act(endTurn); } return; }
  if (a === "face") { if (U.selected) { const s = U.selected; U.selected = null; act(() => attack(s, null)); } return; }
  if (a === "char") return clickChar(uid, el.dataset.side);
  if (a === "token") { if (human) act(useManaToken); return; }
  if (a === "grave") return showGrave(S.players[Number(el.dataset.player)]);
  if (a === "deck") { if (human && Number(el.dataset.player) === S.active && S.phase === PHASE.DRAW) onPhaseButton(); return; }
  if (a === "plate") {
    const idx = Number(el.dataset.player);
    const pd = S.pending;
    if (human && pd?.kind === "target" && isValidTarget({ isPlayer: true, idx })) act(() => chooseTarget({ isPlayer: true, idx }));
    else if (human && U.selected && idx !== S.active) { const s = U.selected; U.selected = null; act(() => attack(s, null)); }
    return;
  }
  if (a === "area") {
    const pd = S.pending;
    const found = findArea(uid);
    if (human && pd?.kind === "target" && pd.targetType === "area") act(() => chooseTarget({ uid }));
    else if (human && found.p === active() && canActivateArea(found.c)) act(() => activateArea(uid));
    else showDetail(found.c);
    return;
  }
  if (a === "equip") {
    const owner = S.players[Number(el.dataset.player)];
    const e2 = owner.field.equips.find(x => x.uid === uid);
    if (human && owner === active() && canAttachFromField(e2)) { U.armed = U.armed?.uid === uid ? null : { uid, from: "field" }; render(); }
    else showDetail(e2);
  }
});
$("#board").addEventListener("contextmenu", e => {
  e.preventDefault();
  if (cancelSomething()) return;
  const el = e.target.closest("[data-uid]");
  const c = el && findCardAnywhere(Number(el.dataset.uid));
  if (c) showDetail(c, { field: !!findChar(c.uid) });
});
$("#prompt").addEventListener("click", e => { if (e.target.closest('[data-act="cancel"]')) cancelSomething(); });

const hand = $("#hand-layer");
hand.addEventListener("pointerdown", handDown);
hand.addEventListener("pointermove", handMove);
hand.addEventListener("pointerup", handUp);
hand.addEventListener("pointercancel", e => { if (drag) { drag.ghost?.remove(); drag.hint?.remove(); drag.el.classList.remove("dragging"); drag = null; } });
hand.addEventListener("contextmenu", e => {
  e.preventDefault();
  const el = e.target.closest(".hand-card");
  const c = el && S.players[viewIdx()].hand.find(x => x.uid === Number(el.dataset.uid));
  if (c) showDetail(c, { hand: true });
});

function cancelSomething() {
  if (U.armed) { U.armed = null; render(); return true; }
  if (U.selected) { U.selected = null; render(); return true; }
  if (S?.pending?.kind === "target" && !S.players[S.pending.owner].isAI) { if (cancelPending()) { render(); return true; } }
  return false;
}
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#modal").hidden) { if ($("#modal").dataset.dismissable) closeModal(); return; }
  if (U.screen === "game") cancelSomething();
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function showScreen(name) {
  U.screen = name;
  // The game screen behaves like an app: no page scrolling, bouncing or zooming.
  document.documentElement.classList.toggle("in-game", name === "game");
  for (const id of ["menu", "almanac", "guide", "game"]) $("#" + id).hidden = id !== name;
  if (name === "menu") { renderMenu(); storm.start(); } else storm.stop();
  if (name === "almanac") renderAlmanac();
  if (name === "guide") loadGuide();
  if (name === "game") { fitStage(); render(); scheduleAI(); }
  window.scrollTo(0, 0);
}

// On phones the board is shrunk a lot, so the space around it is put to use: the
// tutorial coach gets its own panel beside the board (or under it, held upright),
// and normal games get large buttons at the side (see renderControls).
function fitStage() {
  const wrap = $("#stage-wrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  U.small = Math.min(w / W, h / H) < 0.62;
  U.dock = null;
  let bw = w, bh = h;
  if (U.tutorial && U.small) {
    if (w > h) {
      const pw = Math.round(Math.min(400, Math.max(260, w - (h * W) / H)));
      U.dock = { x: w - pw, y: 0, w: pw, h };
      bw = w - pw;
    } else {
      const ph = Math.round(Math.max(h * 0.45, h - (w * H) / W));
      U.dock = { x: 0, y: h - ph, w, h: ph };
      bh = h - ph;
    }
  }
  U.scale = Math.min(bw / W, bh / H);
  $("#stage").style.transform = `translate(${(bw - W * U.scale) / 2}px, ${(bh - H * U.scale) / 2}px) scale(${U.scale})`;
}
// Phones resize the page when the browser bars slide in and out, and on rotation.
function onResize() { if (U.screen === "game") { fitStage(); renderOverlays(); } }
window.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("resize", onResize);
// iPhone browsers allow pinch zoom even when the page asks not to; block it on the table.
document.addEventListener("gesturestart", e => { if (U.screen === "game") e.preventDefault(); });

function renderMenu() {
  $("#deck-list").innerHTML = DATA.deckOrder.filter(id => DATA.decks[id].isPlayable).map(id => {
    const d = DATA.decks[id];
    return `<button type="button" class="deck-tile" data-deck="${id}" aria-pressed="${id === U.deckId}" style="--fc:${DATA.factions[d.faction]?.color || "#888"}">${medal(d.faction)}<strong>${esc(d.name)}</strong><span>${esc(d.description)}</span></button>`;
  }).join("");
  $("#mode-ai").setAttribute("aria-checked", U.mode === "ai");
  $("#mode-hotseat").setAttribute("aria-checked", U.mode === "hotseat");
}
$("#deck-list").addEventListener("click", e => { const t = e.target.closest("[data-deck]"); if (t) { U.deckId = t.dataset.deck; renderMenu(); } });
$("#mode-ai").addEventListener("click", () => { U.mode = "ai"; renderMenu(); });
$("#mode-hotseat").addEventListener("click", () => { U.mode = "hotseat"; renderMenu(); });
$("#btn-start").addEventListener("click", startGame);
$("#btn-almanac").addEventListener("click", () => { U.almanacReturn = "menu"; showScreen("almanac"); });
$("#btn-rules").addEventListener("click", () => showGuide());
$("#btn-tutorial").addEventListener("click", startTutorial);
$("#guide-back").addEventListener("click", () => showScreen(U.guideReturn === "game" && S ? "game" : "menu"));
$("#guide-tutorial").addEventListener("click", startTutorial);
$("#alm-back").addEventListener("click", () => showScreen(U.almanacReturn === "game" && S ? "game" : "menu"));

function renderAlmanac() {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === U.almanacTab));
  const filters = ["All", ...Object.keys(DATA.factions), "Neutral"];
  $("#alm-filters").hidden = U.almanacTab !== "cards";
  $("#alm-filters").innerHTML = filters.map(f => `<button type="button" class="chip" data-filter="${f}" aria-pressed="${f === U.almanacFilter}">${esc(f)}</button>`).join("");
  if (U.almanacTab === "skills") {
    $("#alm-content").innerHTML = `<div class="skill-list">${DATA.skillOrder.map(name => {
      const sk = DATA.skills[name];
      const users = DATA.cardList.filter(c => c.skills.includes(name)).length;
      return `<div class="skill-item"><span class="icon">${esc(sk.icon)}</span><strong>${esc(name)}</strong><p>${esc(sk.desc)}</p><small>${users} card${users === 1 ? "" : "s"}</small></div>`;
    }).join("")}</div>`;
    return;
  }
  const groups = [...Object.keys(DATA.factions), "N/A"];
  const want = U.almanacFilter === "Neutral" ? "N/A" : U.almanacFilter;
  let h = `<div class="card-grid">`;
  for (const g of groups) {
    if (want !== "All" && want !== g) continue;
    const cards = DATA.cardList.filter(c => c.group === g).sort((a, b) => (DATA.rarities[a.rarity]?.order - DATA.rarities[b.rarity]?.order) || a.manaCost - b.manaCost);
    h += `<h2 class="faction-head" style="--fc:${DATA.factions[g]?.color || "#c9b48d"}">${esc(g === "N/A" ? "Neutral" : g)} <small style="font-size:.6em;color:var(--muted)">${cards.length} cards</small></h2>`;
    h += cards.map(c => `<button type="button" class="chip-card" data-card="${c.id}" style="appearance:none;border:0;background:none;padding:0">${cardHTML(c)}</button>`).join("");
  }
  $("#alm-content").innerHTML = h + `</div>`;
}
document.querySelector(".tabs").addEventListener("click", e => { const t = e.target.closest("[data-tab]"); if (t) { U.almanacTab = t.dataset.tab; renderAlmanac(); } });
$("#alm-filters").addEventListener("click", e => { const t = e.target.closest("[data-filter]"); if (t) { U.almanacFilter = t.dataset.filter; renderAlmanac(); } });
$("#alm-content").addEventListener("click", e => { const t = e.target.closest("[data-card]"); if (t) showDetail(DATA.cardsById[t.dataset.card]); });

// ---------------------------------------------------------------------------
// Menu storm (port of the rain and lightning on the LÖVE start screen)
// ---------------------------------------------------------------------------
const storm = (() => {
  const cv = $("#storm"), ctx = cv.getContext("2d");
  let raf = 0, drops = [], flash = 0, bolt = null, nextBolt = 2, last = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function size() {
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drops = Array.from({ length: Math.floor(innerWidth / 6) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 600 + Math.random() * 500, l: 10 + Math.random() * 18 }));
  }
  function makeBolt() {
    const pts = [[innerWidth * (0.15 + Math.random() * 0.7), 0]];
    while (pts[pts.length - 1][1] < innerHeight * 0.6) { const [x, y] = pts[pts.length - 1]; pts.push([x + (Math.random() - 0.5) * 70, y + 20 + Math.random() * 40]); }
    return pts;
  }
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    const w = innerWidth, h = innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b0f1a"); g.addColorStop(0.6, "#1a1210"); g.addColorStop(1, "#140c08");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // distant tavern glow
    const rg = ctx.createRadialGradient(w / 2, h * 1.05, 10, w / 2, h * 1.05, h * 0.7);
    rg.addColorStop(0, "rgba(255,160,70,0.28)"); rg.addColorStop(1, "rgba(255,160,70,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    if (!reduce) {
      nextBolt -= dt;
      if (nextBolt <= 0) { bolt = makeBolt(); flash = 1; nextBolt = 3 + Math.random() * 5; }
      if (flash > 0) {
        ctx.fillStyle = `rgba(200,215,255,${flash * 0.22})`; ctx.fillRect(0, 0, w, h);
        if (bolt) {
          ctx.strokeStyle = `rgba(230,240,255,${flash})`; ctx.lineWidth = 2.5; ctx.beginPath();
          bolt.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        }
        flash -= dt * 2.2;
      }
      ctx.strokeStyle = "rgba(170,190,230,0.35)"; ctx.lineWidth = 1; ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt; d.x -= d.v * dt * 0.12;
        if (d.y > h) { d.y = -20; d.x = Math.random() * (w + 100); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.12, d.y + d.l);
      }
      ctx.stroke();
    }
    raf = requestAnimationFrame(frame);
  }
  addEventListener("resize", size);
  return {
    start() { if (!raf) { size(); last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
})();

// ---------------------------------------------------------------------------
// Boot. Keeps an in-progress game across live updates of the hosted page.
// ---------------------------------------------------------------------------
window.claude?.hot?.snapshot?.(() => ({ S: U.tutorial ? null : S, screen: U.screen, deckId: U.deckId, mode: U.mode }));
function boot(saved) {
  if (saved?.deckId) U.deckId = saved.deckId;
  if (saved?.mode) U.mode = saved.mode;
  if (saved?.S) { S = saved.S; U.ended = S.over; showScreen(saved.screen === "almanac" ? "almanac" : "game"); return; }
  showScreen("menu");
  if (location.hash === "#tutorial") startTutorial();
  else if (location.hash === "#how-to-play") showGuide();
  else if (!PREFS.get("welcomed", false)) showWelcome();
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
