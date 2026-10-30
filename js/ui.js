// Shardfall interface: menu, Almanac, board rendering, input and effects.
// The board is a fixed 1440x1000 stage (the LÖVE virtual size) scaled to the window.

const W = 1440, H = 1000, CARD_W = 95, CARD_H = 135;
const L = {
  top:    { chars: 222, backline: 78 },
  bottom: { chars: 442, backline: 592 },
  backX: 270, deckX: 30, graveX: 140, slot: 105, charStep: 110, frontW: 1140,
  handY: 770,
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const U = {
  screen: "menu",
  deckId: DATA.decks[PREFS.get("deck")] ? PREFS.get("deck") : DATA.deckOrder[0],   // a starter or a saved custom deck
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
  skin: PREFS.get("board", "altar"),   // board look: altar, battlefield or warmap (chosen in Settings)
  turnColor: null,       // player whose color the turn crystal shows (it changes when the falling shard lands)
  turnLandedAt: 0,
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
// Characters are spaced out evenly and squeeze together when there are many (there is no limit).
function charStep(n) { return Math.min(L.charStep, (L.frontW - CARD_W) / Math.max(1, n - 1)); }
function charX(i, n) { const step = charStep(n); return 720 - ((n - 1) * step + CARD_W) / 2 + i * step; }
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
function plateCenter(idx) { return sideOf(idx) === "top" ? { x: 570, y: 40 } : { x: 570, y: 960 }; }

// Each player has a color; the turn crystal glows in the color of whoever's turn it is.
const PLAYER_COLORS = ["#4cc9f0", "#ff5d8f"];

// A crystal shard drawn in SVG, used for mana, health and the turn crystal.
const CRYSTAL = "M20 1 L36 14 L32 38 L20 47 L8 38 L4 14 Z";
const CRYSTAL_FACETS = "M4 14 L20 20 L36 14 M20 20 L20 47 M8 38 L20 20 L32 38";
const CRACKS = ["M20 2 L17 10 L21 15 L18 19", "M35 15 L28 19 L30 25 L26 28", "M6 22 L13 26 L10 33 L15 37", "M22 30 L27 35 L23 41 L26 46"];
function crystalSVG(cls, cracks = 0) {
  return `<svg class="${cls}" viewBox="0 0 40 48" aria-hidden="true"><path class="c-body" d="${CRYSTAL}"/><path class="c-shine" d="${CRYSTAL}"/><path class="c-facet" d="${CRYSTAL_FACETS}"/>${CRACKS.slice(0, cracks).map(d => `<path class="c-crack" d="${d}"/>`).join("")}</svg>`;
}

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

// A burst of little star sparkles at a point on the board.
function sparkle(x, y, n = 14) {
  if (REDUCED_MOTION) return;
  const colors = ["#ffffff", "#d9c8ff", "#a78bfa", "#ffd27a"];
  for (let k = 0; k < n; k++) {
    const el = document.createElement("div");
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.5, r = 50 + Math.random() * 60;
    el.className = "spark";
    el.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--c:${colors[k % colors.length]};--s:${0.6 + Math.random() * 0.9}`;
    $("#fx-layer").appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
}

// A defeated character breaks into shards: copies of the card, each clipped to one
// wedge, fly apart and fade. Runs before the board redraws, while the card is still there.
function shatter(uid) {
  const src = document.querySelector(`.field-card[data-uid="${uid}"]`);
  if (!src || REDUCED_MOTION) return;
  const x = src.offsetLeft, y = src.offsetTop, cx = CARD_W / 2, cy = CARD_H / 2;
  const ring = [[0, 0], [45, 0], [95, 0], [95, 50], [95, 95], [95, 135], [50, 135], [0, 135], [0, 85], [0, 40]];
  ring.forEach((p, k) => {
    const q = ring[(k + 1) % ring.length];
    const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
    const piece = document.createElement("div");
    piece.className = "shard-piece";
    piece.innerHTML = src.innerHTML;
    piece.style.cssText = `left:${x}px;top:${y}px;clip-path:polygon(${cx}px ${cy}px, ${p[0]}px ${p[1]}px, ${q[0]}px ${q[1]}px);--dx:${mx * 1.6 + (Math.random() - 0.5) * 30}px;--dy:${my * 1.4 + 30 + Math.random() * 40}px;--r:${(Math.random() - 0.5) * 120}deg`;
    $("#fx-layer").appendChild(piece);
    setTimeout(() => piece.remove(), 950);
  });
  sparkle(x + cx, y + cy, 10);
}

// The turn handover: a shard falls into the turn crystal, which then takes on the
// color of the player whose turn it is now.
function turnHandover(player) {
  U.turnColor = 1 - player;
  const land = () => { U.turnColor = null; U.turnLandedAt = performance.now(); if (U.screen === "game") render(); };
  if (REDUCED_MOTION) { land(); return; }
  const el = document.createElement("div");
  el.className = "falling-shard";
  el.style.setProperty("--pc", PLAYER_COLORS[player]);
  el.innerHTML = crystalSVG("fall-crystal");
  $("#fx-layer").appendChild(el);
  setTimeout(() => { el.remove(); land(); sparkle(70, 400, 12); }, 650);
}
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    turnHandover(d.player);
    if (S.mode === "hotseat") U.curtain = true;
    else banner(active().isAI ? `${active().name}'s turn` : "Your turn");
  } else if (type === "play") {
    // after the board redraws, sparkle where the card landed
    setTimeout(() => {
      const el = document.querySelector(`#board [data-uid="${d.card.uid}"]`);
      const side = sideOf(d.player);
      const at = el ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + CARD_H / 2 } : { x: 720, y: L[side].chars + CARD_H / 2 };
      sparkle(at.x, at.y, d.card.type === "Spell" ? 22 : 14);
    }, 0);
  } else if (type === "death") {
    shatter(d.uid);
  } else if (type === "gameOver") {
    U.ended = true;
  }
});
const recent = (map, uid, ms) => map.has(uid) && performance.now() - map.get(uid) < ms;

// ---------------------------------------------------------------------------
// Board rendering
// ---------------------------------------------------------------------------
// Health is a life crystal: green from 75% up, orange down to 35%, then red and cracked.
const LIFE_TIERS = [{ min: 0.75, cls: "healthy" }, { min: 0.35, cls: "hurt" }, { min: 0, cls: "low" }];
function plateHTML(p, side) {
  const ratio = Math.max(0, Math.min(1, p.health / p.maxHealth));
  const tier = LIFE_TIERS.find(t => ratio >= t.min).cls;
  const cracks = tier !== "low" ? 0 : ratio >= 0.15 ? 2 : 4;
  const pd = S.pending;
  const targetable = pd?.kind === "target" && pd.targetType === "charOrPlayer" && !S.players[pd.owner].isAI && humanTurn();
  const attackable = side === "top" && U.selected && !forcedTarget(p);
  const y = side === "top" ? 3 : 937;
  return `<div class="plate${targetable ? " targetable" : ""}${attackable ? " attackable" : ""}${tier === "low" ? " danger" : ""}" data-act="plate" data-player="${p.idx}" style="left:530px;top:${y}px;width:380px;--pc:${PLAYER_COLORS[p.idx]}" aria-label="${esc(p.name)}: ${p.health} of ${p.maxHealth} health">
    <div class="life">${crystalSVG("life-crystal " + tier, cracks)}<b>${Math.max(0, p.health)}</b></div>
    <div class="who"><span class="name">${esc(p.name)}</span><em>${esc(p.deckLabel ?? p.faction + " deck")} · ${Math.max(0, p.health)} / ${p.maxHealth} health</em></div>
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
  h += `<div class="pile deck" data-act="deck" data-player="${p.idx}" style="left:${L.deckX}px;top:${y.backline}px;--fc:${fc}"><span>DECK<b>${p.deck.length}</b></span></div>`;
  h += `<div class="pile grave" data-act="grave" data-player="${p.idx}" style="left:${L.graveX}px;top:${y.backline}px"><span>GRAVE<b>${p.grave.length}</b></span></div>`;

  // support row: areas and stored equipment together, in the order they were placed
  const support = [...p.field.areas, ...p.field.equips].sort((a, b) => (a.placed ?? 0) - (b.placed ?? 0));
  for (let i = 0; i < RULES.maxBackline; i++) {
    const c = support[i];
    const x = L.backX + i * L.slot;
    if (!c) { h += `<div class="slot" style="left:${x}px;top:${y.backline}px"></div>`; continue; }
    if (c.type === "Area") {
      const tgt = humanPending && pd.kind === "target" && pd.targetType === "area";
      const usable = human && p === active() && canActivateArea(c, p);
      h += `<div class="small-card${tgt ? " targetable" : ""}${usable ? " activatable" : ""}" data-act="area" data-uid="${c.uid}" style="left:${x}px;top:${y.backline}px">${cardHTML(c)}</div>`;
    } else {
      const armed = U.armed?.uid === c.uid;
      h += `<div class="small-card${armed ? " armed" : ""}" data-act="equip" data-uid="${c.uid}" data-player="${p.idx}" style="left:${x}px;top:${y.backline}px">${cardHTML(c)}${side === "bottom" ? `<div class="attach-cost">Attach: ${equipCost(c, p, null, true)} mana</div>` : ""}</div>`;
    }
  }
  const labelY = side === "bottom" ? y.backline - 20 : y.backline + CARD_H + 2;
  h += `<div class="zone-label" style="left:${L.backX}px;top:${labelY}px">${esc(BACKLINE())} · areas and equipment</div>`;
  h += `<div class="zone-label front-label" style="left:${L.deckX}px;top:${y.chars + 58}px">${esc(DATA.text("zone_frontline", "Frontline"))} ›</div>`;

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

// Mana is a row of 10 crystals for both players: lit ones can be spent this turn, dark ones
// are spent, and faint outlines are crystals not earned yet. Past 10 the numbers carry on.
const MANA_SHOWN = 10;
function manaHTML(p, side) {
  const top = side === "bottom" ? 945 : 13;
  const earned = Math.min(MANA_SHOWN, Math.max(p.manaMax, p.mana));
  const lit = Math.min(earned, p.mana);
  const crystals = Array.from({ length: MANA_SHOWN }, (_, i) => crystalSVG(i < lit ? "mana-crystal lit" : i < earned ? "mana-crystal" : "mana-crystal locked")).join("");
  let token = "";
  if (p.manaToken) {
    const usable = humanTurn() && p === active() && !S.pending;
    token = `<button type="button" class="mana-token" data-act="token" ${usable ? "" : "disabled"} title="One-time bonus for going second: tap to gain +1 mana this turn" aria-label="Use bonus mana token, plus 1 mana this turn">+1</button>`;
  }
  return `<div class="mana" data-player="${p.idx}" style="left:140px;top:${top}px" aria-label="${p.mana} of ${p.manaMax} mana"><div class="mana-row">${crystals}</div><div class="mana-num"><span><b>${p.mana}</b> / ${p.manaMax}</span><small>MANA</small></div>${token}</div>`;
}

// Board skins change only how the table looks, never the layout or the rules.
// The Crystal Altar is the main board; the others can be picked in Settings.
const SKINS = [
  { id: "altar", name: "Crystal Altar", desc: "A glowing stone altar under the falling shards" },
  { id: "battlefield", name: "Shattered Battlefield", desc: "Floating islands over a shard rift, each side styled after its deck" },
  { id: "warmap", name: "War Map", desc: "An inked battle map by candlelight" },
];
function setSkin(id) {
  if (!SKINS.some(k => k.id === id)) return;
  U.skin = id;
  PREFS.set("board", id);
}
function skinButtons(attr) {
  return SKINS.map(k => `<button type="button" class="skin-tile" ${attr}="${k.id}" aria-pressed="${k.id === U.skin}"><span class="skin-preview skin-${k.id}"></span><strong>${esc(k.name)}</strong><span>${esc(k.desc)}</span></button>`).join("");
}

function render() {
  if (!S) return;
  for (const k of SKINS) $("#stage").classList.toggle("skin-" + k.id, k.id === U.skin);
  const me = S.players[viewIdx()], them = S.players[1 - viewIdx()];
  const human = humanTurn();
  // The scenery behind the table; each board skin styles these pieces its own way.
  let h = `<div class="scene"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="side top" data-faction="${esc(them.faction)}"></div><div class="side bottom" data-faction="${esc(me.faction)}"></div>
    <div class="rift"></div>`;
  for (const side of ["top", "bottom"]) {
    h += `<div class="lane back" style="left:${L.backX - 10}px;top:${L[side].backline - 8}px;width:${RULES.maxBackline * L.slot + 10}px;height:${CARD_H + 16}px"></div>`;
    h += `<div class="lane front" style="left:${720 - L.frontW / 2 - 12}px;top:${L[side].chars - 8}px;width:${L.frontW + 24}px;height:${CARD_H + 16}px"></div>`;
  }
  h += `<div class="bar top"></div><div class="bar bottom"></div>`;
  h += `<button type="button" class="btn stage-btn" data-act="menu" style="left:16px;top:11px;width:110px;height:44px" aria-label="Game menu">☰ Menu</button>`;
  h += plateHTML(them, "top") + plateHTML(me, "bottom");

  // opponent hand, face down
  const oh = them.hand.map(() => `<div class="card back"></div>`).join("");
  h += `<div class="opp-hand" style="left:${960}px;top:7px" title="${them.hand.length} cards in hand">${oh}</div>`;
  h += fieldHTML(them, "top") + fieldHTML(me, "bottom");
  h += manaHTML(them, "top") + manaHTML(me, "bottom");

  // middle band
  const turnColor = PLAYER_COLORS[U.turnColor ?? S.active];
  h += `<div class="turn-crystal${performance.now() - U.turnLandedAt < 700 ? " landed" : ""}" style="--pc:${turnColor}" title="Glows in the color of the player whose turn it is">${crystalSVG("big-crystal")}</div>`;
  h += `<div class="turn-info" style="top:372px"><b>Round ${S.round}</b><span style="color:${turnColor}">${esc(active().name)}'s turn</span></div>`;
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
    h += `<div class="curtain"><p>Pass the device to</p><h2>${esc(active().name)}</h2><p>${esc(active().deckLabel ?? active().faction + " deck")} · Round ${S.round}</p><button type="button" class="btn btn-primary" data-act="curtain">Start turn</button></div>`;
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
  if (deckProblem(U.deckId)) { showScreen("menu"); return; }
  endTutorial();
  clearTimeout(U.aiTimer);
  Object.assign(U, { selected: null, armed: null, curtain: false, ended: false, undo: [], turnColor: null });
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
      Object.assign(drag.hint.style, { left: L.backX - 8 + "px", top: L.bottom.backline - 8 + "px", width: RULES.maxBackline * L.slot + 6 + "px", height: CARD_H + 16 + "px" });
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
    const inEquipRow = pt.x >= L.backX - 10 && pt.x <= L.backX + RULES.maxBackline * L.slot && pt.y >= L.bottom.backline - 10 && pt.y <= L.bottom.backline + CARD_H + 10;
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
      if (backlineCount(p) < RULES.maxBackline && p.mana >= playCost(c, p)) btns.push(`<button type="button" class="btn" data-m="tofield" data-uid="${c.uid}">Save it on the ${esc(BACKLINE())}</button>`);
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

// Settings: beginner hints and the board skin. Opened from the main menu or the game menu.
function showSettings() {
  openModal(`<h2 id="modal-title">Settings</h2>
    <div class="menu-list">
      <button type="button" class="btn" data-set="hints" aria-pressed="${U.hints}">Beginner hints: ${U.hints ? "On" : "Off"}</button>
    </div>
    <div class="menu-skins"><h3>Board</h3><div class="skin-list compact">${skinButtons("data-skin")}</div></div>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-set="done">${U.screen === "game" ? "Back to the game menu" : "Done"}</button></div>`);
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
      <button type="button" class="btn" data-m="settings">Settings</button>
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
  const skin = e.target.closest("[data-skin]");
  if (skin) { setSkin(skin.dataset.skin); render(); showSettings(); return; }
  const set = e.target.closest("[data-set]");
  if (set) {
    if (set.dataset.set === "hints") { setHints(!U.hints); showSettings(); }
    else if (U.screen === "game") showGameMenu();
    else closeModal();
    return;
  }
  const b = e.target.closest("[data-m]");
  if (!b) return;
  const m = b.dataset.m, uid = Number(b.dataset.uid);
  if (m === "detail") { const c = findCardAnywhere(uid); if (c) showDetail(c); return; }
  closeModal();
  if (m === "play") act(() => playCard(uid));
  else if (m === "arm") { U.armed = { uid, from: "hand" }; render(); }
  else if (m === "tofield") act(() => playCard(uid, { toField: true }));
  else if (m === "restart") U.tutorial ? startTutorial() : startGame();
  else if (m === "settings") showSettings();
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
  for (const id of ["menu", "almanac", "guide", "builder", "game"]) $("#" + id).hidden = id !== name;
  if (name === "menu") { renderMenu(); storm.start(); } else storm.stop();
  if (name === "almanac") renderAlmanac();
  if (name === "guide") loadGuide();
  if (name === "builder") renderBuilder();
  else $("#bld-walk").hidden = true;
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

// The deck choice: the starter decks, then decks the player built (js/decks.js), then
// a tile to build a new one.
function renderMenu() {
  if (!DATA.decks[U.deckId]) U.deckId = DATA.deckOrder[0];
  const tile = id => {
    const d = DATA.decks[id];
    const edit = d.custom ? `<button type="button" class="deck-edit btn btn-small" data-edit="${id}" aria-label="Edit ${esc(d.name)}">Edit</button>` : "";
    return `<div class="deck-slot"><button type="button" class="deck-tile${d.custom ? " custom" : ""}" data-deck="${id}" aria-pressed="${id === U.deckId}" style="--fc:${DATA.factions[d.faction]?.color || "#888"}">${medal(d.faction)}<strong>${esc(d.name)}</strong><span>${esc(d.description)}</span></button>${edit}</div>`;
  };
  const starters = DATA.deckOrder.filter(id => DATA.decks[id].isPlayable);
  const mine = Object.keys(DATA.decks).filter(id => DATA.decks[id].custom);
  $("#deck-list").innerHTML = [...starters, ...mine].map(tile).join("")
    + `<div class="deck-slot"><button type="button" class="deck-tile create" data-create><span class="plus" aria-hidden="true">+</span><strong>Create your own</strong><span>Build a deck from any cards in the game</span></button></div>`;
  const problem = deckProblem(U.deckId);
  $("#deck-problem").hidden = !problem;
  $("#deck-problem").textContent = problem || "";
  $("#btn-start").disabled = !!problem;
  $("#mode-ai").setAttribute("aria-checked", U.mode === "ai");
  $("#mode-hotseat").setAttribute("aria-checked", U.mode === "hotseat");
}
$("#deck-list").addEventListener("click", e => {
  const edit = e.target.closest("[data-edit]");
  if (edit) { editDeck(edit.dataset.edit); return; }
  if (e.target.closest("[data-create]")) { createDeck(); return; }
  const t = e.target.closest("[data-deck]");
  if (t) { U.deckId = t.dataset.deck; PREFS.set("deck", U.deckId); renderMenu(); }
});
$("#mode-ai").addEventListener("click", () => { U.mode = "ai"; renderMenu(); });
$("#mode-hotseat").addEventListener("click", () => { U.mode = "hotseat"; renderMenu(); });
$("#btn-start").addEventListener("click", startGame);
$("#btn-almanac").addEventListener("click", () => { U.almanacReturn = "menu"; showScreen("almanac"); });
$("#btn-rules").addEventListener("click", () => showGuide());
$("#btn-settings").addEventListener("click", showSettings);
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
// Menu background: crystal shards falling like meteors through a night sky.
// Each shard spins and tumbles; nearer ones are bigger, faster and leave a trail.
// ---------------------------------------------------------------------------
const storm = (() => {
  const cv = $("#storm"), ctx = cv.getContext("2d");
  // Shard colors: [light core, deep edge, glow rgb]. Later each faction could get its own.
  const PALETTE = [
    ["#ffffff", "#b9a4ff", "190,170,255"],
    ["#f1e8ff", "#7c3aed", "139,92,246"],
    ["#e9ddff", "#9b6bff", "167,128,255"],
    ["#ffffff", "#d8ccff", "225,215,255"],
  ];
  // Outline of a crystal shard (unit size): a long, uneven hexagon with a sharp tip.
  const SHAPE = [[0, -1.7], [0.55, -0.55], [0.45, 0.85], [0, 1.25], [-0.5, 0.75], [-0.58, -0.6]];
  const DIR = { x: -0.34, y: 0.94 };   // falling down and slightly to the left
  let raf = 0, last = 0, w = 0, h = 0, shards = [], stars = [], nextStar = 3;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function shard(anywhere, big) {
    const z = big ? 1 : Math.random() ** 1.6;                 // depth: most shards are far away
    return {
      x: Math.random() * (w + h * 0.4),
      y: anywhere ? Math.random() * h : -40 - Math.random() * h * 0.4,
      z, big,
      size: big ? 30 : 5 + z * 19,
      speed: big ? 760 : 70 + z * 330,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * (1 + z * 3),
      flip: Math.random() * Math.PI * 2, flipSpeed: 1 + Math.random() * 3,
      colors: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    };
  }
  function size() {
    w = innerWidth; h = innerHeight;
    cv.width = w * devicePixelRatio; cv.height = h * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const n = Math.min(55, Math.round((w * h) / 16000));
    shards = Array.from({ length: n }, () => shard(true));
    stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + 0.2, t: Math.random() * 6 }));
  }

  function sky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#06030d"); g.addColorStop(0.55, "#120a20"); g.addColorStop(1, "#1a0c16");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a faint violet glow over the horizon where the shards land
    const rg = ctx.createRadialGradient(w / 2, h * 1.1, 10, w / 2, h * 1.1, h * 0.8);
    rg.addColorStop(0, "rgba(150,90,255,0.22)"); rg.addColorStop(1, "rgba(150,90,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.t);
      ctx.fillStyle = "#e8e0ff";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawShard(s) {
    const [core, edge, glow] = s.colors;
    const a = 0.35 + s.z * 0.65;                              // far shards are dimmer
    ctx.globalCompositeOperation = "lighter";
    if (s.z > 0.3) {
      // the meteor trail, pointing back up the way it came
      const len = s.size * 5 + s.speed * 0.22;
      const tx = s.x - DIR.x * len, ty = s.y - DIR.y * len;
      const tg = ctx.createLinearGradient(s.x, s.y, tx, ty);
      tg.addColorStop(0, `rgba(${glow},${0.55 * a})`); tg.addColorStop(1, `rgba(${glow},0)`);
      ctx.strokeStyle = tg; ctx.lineWidth = s.size * 0.7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    // soft glow around the crystal
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2.6);
    gr.addColorStop(0, `rgba(${glow},${0.35 * a})`); gr.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = gr; ctx.fillRect(s.x - s.size * 3, s.y - s.size * 3, s.size * 6, s.size * 6);
    ctx.globalCompositeOperation = "source-over";

    // the crystal itself, tumbling: squashing it sideways makes it look like it turns in 3D
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    const turn = Math.cos(s.flip);
    ctx.scale(s.size * (0.25 + 0.75 * Math.abs(turn)), s.size);
    ctx.globalAlpha = a;
    const fg = ctx.createLinearGradient(-0.6, -1.7, 0.6, 1.3);
    fg.addColorStop(0, turn > 0 ? core : edge); fg.addColorStop(0.5, "#ffffff"); fg.addColorStop(1, turn > 0 ? edge : core);
    ctx.fillStyle = fg;
    ctx.beginPath(); SHAPE.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
    // facets
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(0, -1.7); ctx.lineTo(0.1 * turn, 0.2); ctx.lineTo(0, 1.25);
    ctx.moveTo(0.55, -0.55); ctx.lineTo(0.1 * turn, 0.2); ctx.lineTo(-0.58, -0.6); ctx.stroke();
    ctx.strokeStyle = `rgba(${glow},0.9)`; ctx.lineWidth = 0.08;
    ctx.beginPath(); SHAPE.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    sky(t / 1000);
    if (!reduce) {
      // now and then a big, bright shard streaks across
      nextStar -= dt;
      if (nextStar <= 0) { shards.push(shard(false, true)); nextStar = 4 + Math.random() * 5; }
    }
    shards.sort((a, b) => a.z - b.z);
    for (const s of shards) {
      if (!reduce) {
        s.x += DIR.x * s.speed * dt; s.y += DIR.y * s.speed * dt;
        s.rot += s.spin * dt; s.flip += s.flipSpeed * dt;
      }
      drawShard(s);
    }
    // shards that fall off the screen start again at the top; big ones just go
    shards = shards.flatMap(s => (s.y > h + 80 || s.x < -120 ? (s.big ? [] : [shard(false)]) : [s]));
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { if (raf || reduce) { size(); if (reduce) frame(performance.now()); } });
  return {
    start() { if (!raf) { size(); last = performance.now(); if (reduce) frame(last); else raf = requestAnimationFrame(frame); } },
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
