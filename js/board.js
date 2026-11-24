// Shardfall board: everything drawn on the table, from the layout helpers to the hand.
// Split out of js/ui.js; loaded just after it (GAME_SCRIPTS in js/data.js). render() is here; the
// machinery that keeps redraws fast (renderRegions, patchChildren) and the state U are in js/ui.js.

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
const viewIdx = () => (S.mode === "ai" ? 0 : S.active);
const sideOf = idx => (idx === viewIdx() ? "bottom" : "top");
const humanTurn = () => S && !S.over && !active().isAI && !U.curtain;
// A target choice a person has to make, which can come up on the other player's turn (IP Man).
const humanTarget = () => S && !S.over && !U.curtain && S.pending?.kind === "target" && !S.players[S.pending.owner].isAI;
// Characters are spaced out evenly and squeeze together when there are many (there is no limit).
function charStep(n) { return Math.min(L.charStep, (L.frontW - FIELD_W) / Math.max(1, n - 1)); }
function charX(i, n) { const step = charStep(n); return 720 - ((n - 1) * step + FIELD_W) / 2 + i * step; }
// On a small screen the hand is drawn bigger, since it has the room.
const PHONE_HAND = { w: 124, h: 176, font: 13, y: 722 };
function handPos(i, n) {
  const cw = U.small ? PHONE_HAND.w : CARD_W;
  const spacing = Math.min(U.small ? 150 : 105, (U.small ? 1280 : 800) / Math.max(1, n));
  const x = W / 2 - cw / 2 - ((n - 1) * spacing) / 2 + i * spacing;
  const d = x + cw / 2 - W / 2;
  return { x, y: (U.small ? PHONE_HAND.y : L.handY) + Math.abs(d) * (U.small ? 0.03 : 0.05), rot: d * 0.0007 };
}
// Center of a character on the stage, for floating numbers.
function charCenter(uid) {
  for (const p of S.players) {
    const i = p.field.chars.findIndex(c => c.uid === uid);
    if (i >= 0) return { x: charX(i, p.field.chars.length) + FIELD_W / 2, y: L[sideOf(p.idx)].chars + FIELD_H / 2 };
  }
  const el = document.querySelector(`.field-card[data-uid="${uid}"]`);
  if (el) return { x: el.offsetLeft + FIELD_W / 2, y: el.offsetTop + FIELD_H / 2 };
  return { x: W / 2, y: H / 2 };
}
// The part of the table a phone held sideways shows: everything but the top and bottom strips.
const PHONE_CROP = { top: 66, h: 868 };
function plateCenter(idx) {
  // On a phone the players' health sits beside the table, so effects aimed at a player
  // land at the table's left edge, next to it.
  if (U.phone) return sideOf(idx) === "top" ? { x: 90, y: PHONE_CROP.top + 50 } : { x: 90, y: PHONE_CROP.top + PHONE_CROP.h - 50 };
  return sideOf(idx) === "top" ? { x: 570, y: 40 } : { x: 570, y: 960 };
}

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
// Board rendering
// ---------------------------------------------------------------------------
// Health is a life crystal: green from 75% up, orange down to 35%, then red and cracked.
const LIFE_TIERS = [{ min: 0.75, cls: "healthy" }, { min: 0.35, cls: "hurt" }, { min: 0, cls: "low" }];
// A player's health as a share of their maximum (0 to 1), and which of the tiers above it is in.
function lifeTier(p) {
  const ratio = Math.max(0, Math.min(1, p.health / p.maxHealth));
  return { ratio, cls: LIFE_TIERS.find(t => ratio >= t.min).cls };
}
// A champion's ability (data/champion_abilities.csv, js/rules-champions.js): its name,
// level and progress toward leveling up, shown under the player's name. Tap it for the details.
function champInfo(p) {
  const ch = p.champ;
  if (!ch) return null;
  const info = DATA.championAbilities[ch.id];
  const grows = !info.goal;   // no levels: Chest Thump, Boss Phases, Soul Shepard (see champStatus in js/rules-champions.js)
  if (grows) { const st = champStatus(p); return { info, ch, grows, progress: st.text, lit: st.lit, label: info.name }; }
  const n = champCount(p);
  const progress = ch.level >= 2 ? "Leveled up" : `${Math.min(n, info.goal)}/${info.goal} ${info.counts.toLowerCase()}`;
  return { info, ch, n, grows, progress, lit: ch.level >= 2, label: `${info.name} · Lv ${ch.level}` };
}
function champLine(p) {
  const c = champInfo(p);
  return c ? `<button type="button" class="champ-line${c.lit ? " lv2" : ""}" data-act="champ" data-player="${p.idx}" title="${esc(c.info.now)}">★ ${esc(c.label)} · ${esc(c.progress)}</button>` : "";
}
function showChampion(p) {
  const c = champInfo(p);
  if (!c) return;
  const card = DATA.cardsById[c.ch.id];
  openModal(`<h2 id="modal-title">${esc(c.info.name)}</h2>
    <p class="sub">${esc(p.name)}'s champion ability · ${esc(card.name)}${c.grows ? "" : ` · Level ${c.ch.level} of 2`}</p>
    <p><b>Now:</b> ${esc(c.info.now)}</p>
    ${c.grows ? "" : `<p><b>Levels up when:</b> ${esc(c.info.when)}</p><p><b>Then:</b> ${esc(c.info.then)}</p>
    <p><b>Progress:</b> ${c.ch.level >= 2 ? "Leveled up" : esc(c.progress)}</p>`}
    ${c.grows ? `<p><b>Right now:</b> ${esc(c.progress)}</p>` : ""}
    <p class="sub">It works from turn one, even before ${esc(card.name)} is drawn.</p>
    <div class="detail-actions" style="margin-top:16px"><button type="button" class="btn btn-small" data-close>Close</button></div>`);
}

// Protected: shown on the player's plate while they take half damage.
function protLine(p) {
  if (!isProtected(p)) return "";
  const why = p.field.chars.length >= RULES.protectAt ? `${RULES.protectAt} or more characters` : "a Protected character";
  return `<span class="prot-line" title="${esc(p.name)} has ${why}: damage to them is halved, rounded up. Pierce ignores it.">${esc(DATA.skills.Protected?.icon || "▣")} Protected · half damage</span>`;
}

// The health bar beside a player's name. js/motion.js shows the part just lost as a white
// chunk that drains away a moment later.
function hpBarHTML(p) {
  const { ratio, cls } = lifeTier(p);
  return `<span class="hpbar ${cls}" data-player="${p.idx}" style="--hp:${ratio.toFixed(3)};--chunk:${ratio.toFixed(3)}" aria-hidden="true"><i class="chunk"></i><i class="fill"></i></span>`;
}
// A big hit (BIG_HIT damage or more at once) to the player at the bottom: the screen's edges
// flash red and their life crystal cracks a little more for a moment.
const BIG_HIT = 5;
U.crackAt = [0, 0];
const crackFlash = idx => performance.now() - (U.crackAt[idx] || 0) < 900;
function bigHit(idx) {
  U.crackAt[idx] = performance.now();
  const el = document.createElement("div");
  el.className = "edge-flash";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
  if (U.screen === "game") render();
  later(950, () => { if (U.screen === "game") render(); });
}
function plateHTML(p, side) {
  const { ratio, cls: tier } = lifeTier(p);
  const cracks = Math.min(4, (tier !== "low" ? 0 : ratio >= 0.15 ? 2 : 4) + (crackFlash(p.idx) ? 2 : 0));
  const pd = S.pending;
  const targetable = humanTarget() && pd.targetType === "charOrPlayer" && isValidTarget({ isPlayer: true, idx: p.idx });
  const attackable = side === "top" && U.selected && !forcedTarget(p);
  const y = side === "top" ? 3 : 937;
  const thinking = p.isAI && S.active === p.idx && !S.over && !U.ended;   // the computer is taking its turn
  return `<div class="plate${crackFlash(p.idx) ? " crack-flash" : ""}${thinking ? " thinking" : ""}${targetable ? " targetable" : ""}${attackable ? " attackable" : ""}${tier === "low" ? " danger" : ""}${tier === "low" && ratio < 0.15 ? " critical" : ""}" data-act="plate" data-player="${p.idx}" style="left:530px;top:${y}px;width:380px;--pc:${PLAYER_COLORS[p.idx]}" aria-label="${esc(p.name)}: ${p.health} of ${p.maxHealth} health">
    <div class="life">${crystalSVG("life-crystal " + tier, cracks)}${wardHTML(p)}<b>${Math.max(0, p.health)}</b></div>
    <div class="who"><span class="name">${esc(p.name)}${hpBarHTML(p)}${thinking ? `<i class="thinking-dots" role="img" aria-label="thinking"><b></b><b></b><b></b></i>` : ""}</span><em>${esc(p.deckLabel ?? p.faction + " deck")} · ${Math.max(0, p.health)} / ${p.maxHealth} health</em>${champLine(p)}${protLine(p)}</div>
    ${attackable ? previewBadge(fightPreview(U.selected, null), true) : targetable ? targetBadge(targetPreview({ isPlayer: true, idx: p.idx })) : ""}
  </div>`;
}

function fieldHTML(p, side) {
  const y = L[side];
  const n = p.field.chars.length;
  const pd = S.pending;
  const human = humanTurn();
  const humanPending = humanTarget();
  let h = "";

  // deck and graveyard
  const fc = DATA.factions[p.faction]?.color || "#888";
  h += `<div class="pile deck" data-act="deck" data-player="${p.idx}" style="left:${L.deckX}px;top:${y.backline}px;--fc:${fc}"><span>DECK<b>${p.deck.length}</b></span></div>`;
  h += `<div class="pile grave" data-act="grave" data-player="${p.idx}" style="left:${L.graveX}px;top:${y.backline}px"><span>GRAVE<b>${Math.max(0, p.grave.length - (MOTION.flying[p.idx] || 0))}</b></span></div>`;

  // support row: areas and stored equipment together, in the order they were placed
  const support = [...p.field.areas, ...p.field.equips].sort((a, b) => (a.placed ?? 0) - (b.placed ?? 0));
  for (let i = 0; i < RULES.maxBackline; i++) {
    const c = support[i];
    const x = L.backX + i * L.slot;
    if (!c) { h += `<div class="slot" data-side="${side}" style="left:${x}px;top:${y.backline}px"></div>`; continue; }
    if (c.type === "Area") {
      const tgt = humanPending && pd.kind === "target" && pd.targetType === "area";
      const usable = human && p === active() && canActivateArea(c, p);
      h += `<div class="small-card${tgt ? " targetable" : ""}${usable ? " activatable" : ""}" data-act="area" data-uid="${c.uid}" style="left:${x}px;top:${y.backline}px">${cardHTML(c)}${eotBadge(c, p.idx)}</div>`;
    } else {
      const armed = U.armed?.uid === c.uid;
      h += `<div class="small-card${armed ? " armed" : ""}" data-act="equip" data-uid="${c.uid}" data-player="${p.idx}" style="left:${x}px;top:${y.backline}px">${cardHTML(c)}${side === "bottom" ? `<div class="attach-cost">Attach: ${equipCost(c, p, null, true)} mana</div>` : ""}</div>`;
    }
  }
  h += `<div class="zone-label back-label" style="left:${L.backX - 22}px;top:${y.backline}px;height:${BACK_H}px" title="Areas and equipment">${esc(BACKLINE())}</div>`;
  h += `<div class="zone-label front-label" style="left:${L.deckX}px;top:${y.chars + FIELD_H / 2 - 8}px">${esc(DATA.text("zone_frontline", "Frontline"))} ›</div>`;

  // characters
  const guarded = side === "top" && guards(p).length > 0;
  p.field.chars.forEach((c, i) => {
    const cls = ["field-card"];
    if (side === "bottom" && human && canAttack(c)) cls.push("ready");
    if (c.hasAttacked && c.owner === S.active && S.phase === PHASE.BATTLE) cls.push("spent");
    if (U.selected === c.uid) cls.push("selected");
    if (U.finalHero === c.uid) cls.push("final-hero");
    if (humanPending && pd.kind === "target" && pd.targetType !== "area" && isValidTarget({ uid: c.uid })) cls.push("targetable");
    if (U.armed && side === "bottom" && human) cls.push("targetable");
    const attackable = U.selected && side === "top" && (!guarded || isGuard(c));
    if (attackable) cls.push("attackable");
    if (recent(U.hits, c.uid, 450)) cls.push("hit");
    let vars = `--d:${((c.uid * 0.37) % 3).toFixed(2)}s`;
    const lv = U.lungeVec.get(c.uid);
    if (recent(U.lunges, c.uid, 450 + (lv?.wind || 0))) {
      const v = lv || { dx: 0, dy: side === "bottom" ? -34 : 34 };
      const e = performance.now() - U.lunges.get(c.uid);   // a redraw mid-swoop carries on where it was
      cls.push("lunge");
      if (v.wind) cls.push("winding");
      vars += `;--dx:${v.dx.toFixed(0)}px;--dy:${v.dy.toFixed(0)}px;--wind:${v.wind || 0}ms;--e:${(-e).toFixed(0)}ms;--e2:${((v.wind || 0) - e).toFixed(0)}ms`;
    }
    const sp = U.spawn.get(c.uid);
    const age = sp ? performance.now() - sp.t : -1;   // a card still flying in lands first (js/motion.js)
    if (sp && age >= 0 && age < 1000) cls.push(spawnClass(sp));
    if ((U.arriving.get(c.uid) ?? 0) > performance.now()) cls.push("arriving");
    const tgt = humanPending && pd.kind === "target" && pd.targetType !== "area" && isValidTarget({ uid: c.uid });
    const preview = attackable && human ? previewBadge(fightPreview(U.selected, c.uid)) : tgt ? targetBadge(targetPreview({ uid: c.uid })) : "";
    const blade = side === "bottom" && human && canUseBlade(c) ? bladeButton(c) : "";
    h += `<div class="${cls.join(" ")}" data-act="char" data-uid="${c.uid}" data-side="${side}" style="left:${charX(i, n)}px;top:${y.chars}px;${vars}">${cardHTML(c, { field: true })}${hasSkill(c, "Protected") ? runeRingHTML(recent(U.hits, c.uid, 450)) : ""}${eotBadge(c, p.idx)}${preview}${blade}</div>`;
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
  // crystals just spent flare and go dark, so you see what a play cost
  const prev = U.manaSeen[p.idx];
  if (prev && p.mana < prev.mana && prev.round === S.round) U.manaSpent[p.idx] = { from: Math.min(MANA_SHOWN, prev.mana), to: lit, at: performance.now() };
  U.manaSeen[p.idx] = { mana: p.mana, round: S.round };
  const spent = U.manaSpent[p.idx] && performance.now() - U.manaSpent[p.idx].at < 500 ? U.manaSpent[p.idx] : null;
  const crystals = Array.from({ length: MANA_SHOWN }, (_, i) => crystalSVG(i < lit ? "mana-crystal lit" : i < earned ? "mana-crystal" + (spent && i >= spent.to && i < spent.from ? " spend" : "") : "mana-crystal locked")).join("");
  let token = "";
  if (p.manaToken) {
    const usable = humanTurn() && p === active() && !S.pending;
    token = `<button type="button" class="mana-token" data-act="token" ${usable ? "" : "disabled"} title="One-time bonus for going second: tap to gain +1 mana this turn" aria-label="Use bonus mana token, plus 1 mana this turn">+1</button>`;
  }
  return `<div class="mana" data-player="${p.idx}" style="left:140px;top:${top}px" aria-label="${p.mana} of ${p.manaMax} mana"><div class="mana-row">${crystals}</div><div class="mana-num"><span><b>${p.mana}</b> / ${p.manaMax}</span><small>MANA</small></div>${token}</div>`;
}

// Board skins change only how the table looks, never the layout or the rules.
// Shattered Crystal is the main board; the others can be picked in Settings.
const SKINS = [
  { id: "crystal", name: "Shattered Crystal", desc: "Dark crystal slabs split by glowing cracks, light leaking through" },
  { id: "glass", name: "Stained Glass", desc: "A shattered window: lead lines, jewel light, shards still falling" },
  { id: "altar", name: "Crystal Altar", desc: "A glowing stone altar under the falling shards" },
  { id: "battlefield", name: "Shattered Battlefield", desc: "Floating islands over a shard rift, each side styled after its deck" },
  { id: "warmap", name: "War Map", desc: "An inked battle map by candlelight" },
];
function setSkin(id) {
  if (!SKINS.some(k => k.id === id)) return;
  U.skin = id;
  PREFS.set("board", id);
  PREFS.set("looks", 3);   // a board picked after the Shattered Crystal update is remembered
}
function skinButtons(attr) {
  return SKINS.map(k => `<button type="button" class="skin-tile" ${attr}="${k.id}" aria-pressed="${k.id === U.skin}"><span class="skin-preview skin-${k.id}"></span><strong>${esc(k.name)}</strong><span>${esc(k.desc)}</span></button>`).join("");
}

function render() {
  if (!S) return;
  for (const k of SKINS) $("#stage").classList.toggle("skin-" + k.id, k.id === U.skin);
  $("#stage").classList.toggle("tense", isTense());
  const me = S.players[viewIdx()], them = S.players[1 - viewIdx()];
  const human = humanTurn();
  // The scenery behind the table; each board skin styles these pieces its own way.
  let h = `<div class="scene"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="side top" data-faction="${esc(them.faction)}" style="${sideStyle(them)}"></div><div class="side bottom" data-faction="${esc(me.faction)}" style="${sideStyle(me)}"></div>
    <div class="rift"></div>${scarHTML()}`;
  for (const side of ["top", "bottom"]) {
    h += `<div class="lane back" data-side="${side}" style="left:${L.backX - 26}px;top:${L[side].backline - 6}px;width:${RULES.maxBackline * L.slot + 26}px;height:${BACK_H + 12}px"></div>`;
    h += `<div class="lane front" data-side="${side}" style="left:${720 - L.frontW / 2 - 12}px;top:${L[side].chars - 8}px;width:${L.frontW + 24}px;height:${FIELD_H + 16}px"></div>`;
  }
  h += `<div class="bar top"></div><div class="bar bottom"></div>`;
  h += `<button type="button" class="btn stage-btn" data-act="menu" style="left:16px;top:11px;width:110px;height:44px" aria-label="Game menu">☰ Menu</button>`;
  h += RG("players") + plateHTML(them, "top") + plateHTML(me, "bottom");

  // opponent hand, face down
  const oh = them.hand.map(() => `<div class="card back"></div>`).join("");
  h += `<div class="opp-hand" style="left:${960}px;top:7px" title="${them.hand.length} cards in hand">${oh}</div>`;
  h += RG("top") + fieldHTML(them, "top") + RG("bottom") + fieldHTML(me, "bottom");
  h += RG("mana") + manaHTML(them, "top") + manaHTML(me, "bottom");
  h += RG("middle");

  // middle band
  const turnColor = PLAYER_COLORS[U.turnColor ?? S.active];
  h += `<div class="turn-crystal${performance.now() - U.turnLandedAt < 700 ? " landed" : ""}" style="--pc:${turnColor}" title="Glows in the color of the player whose turn it is">${crystalSVG("big-crystal")}</div>`;
  h += `<div class="turn-info" style="top:372px"><b>Round ${S.round}</b><span style="color:${turnColor}">${esc(active().name)}'s turn</span></div>`;
  h += `<div class="phases">${DATA.phases.map((ph, i) => `<div class="phase-step${i === S.phase ? " on" : ""}">${esc(ph.name)}</div>`).join("")}</div>`;
  h += eventPill();
  h += shardHTML(human);
  const forced = guards(them);
  // "All attack": every character that can still attack goes for the player (see attackAllFace).
  const readyN = human && S.phase === PHASE.BATTLE && !S.pending ? me.field.chars.filter(canAttack).length : 0;
  const allLethal = readyN > 1 && simulate(() => { const g = actionGuard; actionGuard = null; try { attackAllFace(); } finally { actionGuard = g; } return S.over && S.winner === S.active; });
  const allBtn = (style = "") => `<button type="button" class="face-btn all${allLethal ? " lethal" : ""}" data-act="faceall" style="${style}">${allLethal ? "☠ LETHAL: all attack" : "⚔ All attack"} ${esc(them.name)} (${readyN})</button>`;
  if (U.selected && human) {
    h += forced.length
      ? `<div class="instruction">${forced.length === 1 ? `${esc(forced[0].name)} has ${guardSkill(forced[0])} and must be attacked first` : "Attack one of the Challenge or Tower characters first"}</div>`
      : readyN > 1
        ? `<button type="button" class="face-btn" data-act="face" style="width:196px">⚔ Attack directly</button>${allBtn("left:728px;width:196px")}`
        : `<button type="button" class="face-btn" data-act="face">⚔ Attack ${esc(them.name)} directly</button>`;
  } else if (readyN > 0 && !forced.length && !S.over) {
    h += allBtn();
  } else if (!S.over) {
    const instr = active().isAI ? `${active().name === "Computer" ? "The computer" : active().name} is taking its turn…` : DATA.phases[S.phase]?.instruction || "";
    h += `<div class="instruction">${esc(instr)}</div>`;
  }

  h += RG("buttons");
  const label = ["Draw card", "To battle →", "To end →", "Pass turn →"][S.phase];
  const canPhase = human && !S.pending && !U.armed;
  h += `<button type="button" class="btn stage-btn${canPhase && S.phase === PHASE.DRAW ? " glow" : ""}" data-act="phase" title="Keyboard: Space" style="left:1220px;top:372px;width:200px;height:56px" ${canPhase ? "" : "disabled"}>${label}</button>`;
  h += `<button type="button" class="btn stage-btn" data-act="pass" title="Keyboard: E" style="left:1240px;top:942px;width:180px;height:48px" ${canPhase ? "" : "disabled"}>Pass turn</button>`;
  h += RG("log");
  if (U.showLog) h += logPanelHTML();
  h += RG("over");

  if (U.curtain) {
    h += `<div class="curtain"><p>${esc(T("curtain_pass"))}</p><h2>${esc(active().name)}</h2><p>${esc(T("curtain_round", { deck: active().deckLabel ?? active().faction + " deck", round: S.round }))}</p>${eventLine() ? `<p>${esc(eventLine().when)}: ${esc(eventLine().name)}. ${esc(eventLine().desc)}</p>` : ""}<button type="button" class="btn btn-primary" data-act="curtain">${esc(T("curtain_start"))}</button></div>`;
  } else if (U.ended && !U.tutorial) {
    const title = S.winner == null ? T("end_draw") : S.mode === "ai" ? T(S.winner === 0 ? "end_victory" : "end_defeat") : T("end_wins", { name: S.players[S.winner].name });
    const sub = S.winner == null ? T("end_both_fell") : T("end_wins_round", { name: S.players[S.winner].name, round: S.round });
    const camp = U.campaign ? campaignEndHTML(S.winner === 0) : null;
    const actions = camp ? camp.actions : `<button type="button" class="btn btn-primary" data-act="again">${esc(T("end_again"))}</button><button type="button" class="btn" data-act="tomenu">${esc(T("end_menu"))}</button>`;
    h += `<div class="curtain endscreen"><h2>${esc(title)}</h2><p>${esc(sub)}</p>${camp ? camp.story : ""}${recallHTML()}${masteryHTML()}${newTrophiesHTML()}${newLoreHTML()}${endStatsHTML()}<div class="detail-actions">${actions}</div></div>`;
  }
  renderRegions($("#board"), h);
  renderHand(me);
  renderPrompt();
  renderOverlays();
  drawAim();
  motionAfterRender();   // cards glide to their new places (js/motion.js)
  autoFlow();
}

// Turn history: every card played and every attack becomes a small icon in a row along the top
// of the battle log panel (newest on the right), so it takes no extra room on the table. Tap
// one to see the card and what happened. The log lines written with a move are kept with it.
const HIST_SHOWN = 9;
const HIST_KIND = { play: { glyph: "✦" }, cast: { glyph: "✧" }, attack: { glyph: "⚔" }, shard: { glyph: "◆" } };
// "Computer played Chimp", "Player 1's Gorilla attacked"
function histTitle(e, c) {
  const who = S.players[e.player]?.name || "";
  return e.kind === "play" ? `${who} played ${c.name}` : e.kind === "cast" ? `${who} cast ${c.name}`
    : e.kind === "attack" ? `${who}'s ${c.name} attacked` : `${who}'s ${c.name} hit the big shard`;
}
U.hist = []; U.recentLog = [];
function histAdd(e, now) {
  if (!S) return;
  e.t = now;
  e.lines = U.recentLog.filter(l => now - l.t < 40).map(l => l.msg);   // written just before, in the same move
  U.hist.push(e);
  if (U.hist.length > 60) U.hist.shift();
}
function histLog(msg, now) {
  U.recentLog.push({ msg, t: now });
  if (U.recentLog.length > 6) U.recentLog.shift();
  const last = U.hist[U.hist.length - 1];
  if (last && now - last.t < 450 && !last.lines.includes(msg)) last.lines.push(msg);   // written by the same move
}
function histHTML() {
  const start = Math.max(0, U.hist.length - HIST_SHOWN);
  const now = performance.now();
  return U.hist.slice(start).map((e, k) => {
    const c = DATA.cardsById[e.id];
    if (!c) return "";
    const i = start + k;
    const fresh = now - e.t < 700 ? " fresh" : "";
    return `<span class="hist-i ${sideOf(e.player)}${fresh}" data-act="hist" data-i="${i}" title="${esc(histTitle(e, c))}" style="--pc:${PLAYER_COLORS[e.player]}">${medal(c.group, "hist-medal")}<i>${HIST_KIND[e.kind].glyph}</i></span>`;
  }).join("");
}
function showHist(i) {
  const e = U.hist[i];
  const c = e && DATA.cardsById[e.id];
  if (!c) return;
  openModal(`<h2 id="modal-title">${esc(histTitle(e, c))}</h2>
    <div class="hist-detail"><div class="hist-card">${cardHTML(c)}</div>
      <div class="hist-lines">${(e.lines.length ? e.lines : ["Nothing else happened."]).map(l => `<p>${esc(l)}</p>`).join("")}</div></div>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-close>Back to the game</button></div>`);
}

// The battle log: the last few things that happened, in a panel at the bottom right of the
// table. New lines light up for a moment. Tapping it opens the whole match's log.
function logPanelHTML() {
  const now = performance.now();
  const lines = S.log.slice(U.hist.length ? -4 : -6).map(m => {   // fewer lines once the history row is showing
    const age = now - (U.logAt.get(m) ?? -1e9);
    return `<div${age < 1600 ? ` class="fresh" style="animation-delay:${-age.toFixed(0)}ms"` : ""}>${esc(m)}</div>`;
  }).join("");
  const hist = histHTML();
  return `<div class="log" data-act="log" role="button" tabindex="0" aria-label="Battle log: tap to read the whole match">${hist ? `<span class="hist">${hist}</span>` : `<span class="log-title">Battle log</span>`}<span class="log-lines">${lines}</span></div>`;
}
function showLog() {
  openModal(`<h2 id="modal-title">Battle log</h2>
    <div class="full-log" tabindex="0" aria-label="Battle log">${S.log.map((m, i) => `<p${i === S.log.length - 1 ? ' class="last"' : ""}>${esc(m)}</p>`).join("") || "<p>Nothing has happened yet.</p>"}</div>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-close>Back to the game</button></div>`);
  const box = document.querySelector("#modal .full-log");
  if (box) box.scrollTop = box.scrollHeight;
}

// Tutorial coach and beginner hints sit above the board in screen space, so their
// text stays readable however small the board is scaled.
function renderOverlays() {
  tutUpdate();
  renderCoach();
  renderSideInfo();   // before the hint, which sits between its panels on a phone
  renderHint();
  renderControls();
  renderRotate();
}

// What a hand card says when you hold the pointer over it: its ability, then what its skills do.
function handTip(c) {
  const parts = [];
  const ab = c.ability;
  if (ab) parts.push(esc(ab));
  for (const k of c.skills || []) { const d = DATA.skills[k]?.desc; if (d) parts.push(`<b>${esc(k)}</b>: ${esc(d)}`); }
  return parts.length ? `<div class="hand-tip">${parts.join("<br>")}</div>` : "";
}

function renderHand(p) {
  const layer = $("#hand-layer");
  const human = humanTurn() && p === active();
  const n = p.hand.length;
  patchChildren(layer, U.curtain ? "" : p.hand.map((c, i) => {
    const pos = handPos(i, n);
    const cls = ["hand-card"];
    if (human && canPlay(c, p)) cls.push("playable");
    if (recent(U.drawn, c.uid, 600)) cls.push("drawn");
    const wave = performance.now() - U.myTurnAt - 250 - i * 70;   // the hand's wave at the start of your turn
    const waveStyle = wave < 600 && !REDUCED_MOTION ? `;--wave:${(-wave).toFixed(0)}ms` : "";
    if (waveStyle) cls.push("wave");
    if (S.pending?.cast && S.pending.source === c) cls.push("casting");   // a spell waiting for its target
    const costShown = playCost(c, p);
    return `<div class="${cls.join(" ")}" data-uid="${c.uid}" style="left:${pos.x}px;top:${pos.y}px;transform:rotate(${pos.rot}rad);z-index:${i + 1}${waveStyle}">${cardHTML(c, { costOverride: costShown })}${handTip(c)}</div>`;
  }).join(""));
}

function renderPrompt() {
  const el = $("#prompt");
  const pd = S.pending;
  let msg = null, cancel = true;
  if (U.curtain || U.ended) msg = null;
  else if (pd?.kind === "target" && !S.players[pd.owner].isAI) {
    // Wording for one card (a "target_<CardID>" row in data/ui_text.csv), then the special rules, then
    // the general cases. {damage} and {heal} are the numbers in the card's play clause.
    const redirect = pd.amount != null;
    const nums = { damage: playAmount(pd.source, "damage"), heal: playAmount(pd.source, "heal"), amount: pd.amount };
    const own = DATA.uiText["target_" + pd.source.id];
    const what = own != null ? own.replace(/\{(\w+)\}/g, (m, k) => nums[k] ?? m)
      : redirect ? T("target_redirect", nums)
      : cardRule(pd.source, "strike") ? T("target_strike", nums)
      : pd.targetType === "area" ? "an area" : pd.targetType === "charOrPlayer" ? "a character or player" : "a character";
    msg = `${pd.source.name}${redirect ? ` (${S.players[pd.owner].name})` : ""}: choose ${what}`;
    cancel = !pd.required;
  } else if (U.armed) {
    const c = findCardAnywhere(U.armed.uid);
    msg = `Choose one of your characters to equip ${c ? c.name : "it"}`;
  }
  el.hidden = !msg;
  if (msg) el.innerHTML = `<span>${esc(msg)}</span>${cancel ? `<button type="button" class="btn" data-act="cancel">Cancel</button>` : ""}`;

  if (pd?.kind === "choose" && !S.players[pd.owner].isAI && !U.curtain && !openModal.choose) showChoose();
}

// The Strike button on a character holding equipment with "rule: strike" (Kenshi's Blade). Its words
// come from data/ui_text.csv and its number from the equipment's play clause.
function bladeButton(c) {
  const blade = bladeOf(c), vars = { card: blade.name, damage: playAmount(blade, "damage") ?? "" };
  return `<button type="button" class="blade-btn" data-act="blade" data-uid="${c.uid}" title="${esc(T("blade_tip", vars))}">${esc(T("blade_button", vars))}</button>`;
}

function findCardAnywhere(uid) {
  for (const p of S.players) for (const list of [p.hand, p.field.equips, p.field.areas, p.field.chars, p.grave]) {
    const c = list.find(x => x.uid === uid);
    if (c) return c;
  }
  return null;
}
