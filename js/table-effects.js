// Effects on the table that the board itself draws: random event cards, deaths (each world
// dies its own way), hits, swift strikes and the other reactions to game events.
// Split out of js/ui.js; loaded just after it (GAME_SCRIPTS in js/data.js).

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function floatText(x, y, text, color, small) {
  fxDiv("float" + (small ? " small" : ""), `left:${x}px;top:${y}px;color:${color}`, 1250).textContent = text;
}
// Random events (see js/rules-events.js): a small card in the middle of the table
// that says what is coming, how soon, and what it does. While it lasts (two rounds, one turn each)
// it says "This round and next", then "Last round". Off in normal play (js/rules-events.js).
// The random events are the small shard falls; the big one in round 8 shows here too when it is close.
function eventLine() {
  const e = S.event || S.upcoming;
  const bigIn = RULES.shardRound && !S.noShard && !S.shardFell ? RULES.shardRound - S.round : Infinity;
  if (bigIn <= RULES.eventWarn && (!e || e.round > RULES.shardRound)) {
    return { when: `${bigIn <= 1 ? "Next round" : `In ${bigIn} rounds`} · big shard fall`, name: "The big shard", desc: `${RULES.shardHealth} health. Break it to claim it`, now: false, big: true };
  }
  if (!e) return null;
  const info = DATA.events[e.id];
  const left = S.event ? 0 : e.round - S.round;
  const rest = S.event ? S.event.round + RULES.eventLength - S.round : 0;   // rounds it still lasts, this one included
  const now = rest <= 1 ? "Last round" : rest === 2 ? "This round and next" : `${rest} more rounds`;
  const when = (S.event ? now : left <= 1 ? "Next round" : `In ${left} rounds`) + " · mini shard fall";
  return { when, name: info.name, desc: info.desc, now: !!S.event };
}
function eventPill() {
  const e = eventLine();
  if (!e) return "";
  return `<div class="event-pill${e.now ? " now" : ""}${e.big ? " big" : ""}" role="status"><span class="event-when">${esc(e.when)}</span><b>${esc(e.name)}</b><span class="event-desc">${esc(e.desc)}</span></div>`;
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
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.5, r = 50 + Math.random() * 60;
    fxDiv("spark", `left:${x}px;top:${y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--c:${colors[k % colors.length]};--s:${0.6 + Math.random() * 0.9}`, 900);
  }
}

// A defeated character breaks into shards: copies of the card, each clipped to one
// wedge, fly apart and fade. Runs before the board redraws, while the card is still there.
function shatter(uid, delay = 0, group = null) {
  const src = document.querySelector(`.field-card[data-uid="${uid}"]`);
  if (!src || REDUCED_MOTION) return;
  if (delay) {
    // the board redraws without the card straight away; hold a copy until the blow lands
    const hold = document.createElement("div");
    hold.className = "shard-hold";
    hold.innerHTML = src.innerHTML;
    hold.style.cssText = `left:${src.offsetLeft}px;top:${src.offsetTop}px`;
    $("#fx-layer").appendChild(hold);
    const card = { offsetLeft: src.offsetLeft, offsetTop: src.offsetTop, innerHTML: src.innerHTML };
    setTimeout(() => { hold.remove(); shatterFrom(card, group); }, delay);
    return;
  }
  shatterFrom(src, group);
}
// Each faction leaves the table its own way. Other cards shatter like crystal.
const DEATHS = { Undead: sinkAway, Cyber: pixelAway, Wild: tumbleAway, Mortal: slashAway };
function deathPiece(src, cls, style = "", ms = 1000) {
  const piece = fxDiv(cls, `left:${src.offsetLeft}px;top:${src.offsetTop}px;${style}`, ms);
  piece.innerHTML = src.innerHTML;
  return piece;
}
function sinkAway(src) {   // Undead: sinks back into the ground
  deathPiece(src, "death-sink", "", 1100);
}
function pixelAway(src) {  // Cyber: breaks up into pixels and glitches out
  const cols = 5, rows = 7, w = FIELD_W / cols, h = FIELD_H / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const l = k * w, t = r * h;
    deathPiece(src, "death-pixel", `clip-path:inset(${t}px ${FIELD_W - l - w}px ${FIELD_H - t - h}px ${l}px);--dx:${(Math.random() - 0.5) * 70}px;--dy:${(Math.random() - 0.3) * 60}px;animation-delay:${(Math.random() * 0.35).toFixed(2)}s`, 1200);
  }
}
function tumbleAway(src) { // Wild: knocked off the table, tumbling
  const dir = Math.random() < 0.5 ? -1 : 1;
  deathPiece(src, "death-tumble", `--dx:${dir * 140}px;--r:${dir * 540}deg`, 1000);
}
function slashAway(src) {  // Mortal: cut in two by a clean strike
  deathPiece(src, "death-slash", `clip-path:polygon(0 0, 100% 0, 100% 35%, 0 70%);--dx:-18px;--dy:-26px;--r:-8deg`, 1000);
  deathPiece(src, "death-slash", `clip-path:polygon(0 70%, 100% 35%, 100% 100%, 0 100%);--dx:18px;--dy:34px;--r:8deg`, 1000);
  fxDiv("death-slash-line", `left:${src.offsetLeft - 10}px;top:${src.offsetTop + FIELD_H * 0.525}px`, 500);
}
function shatterFrom(src, group) {
  if (DEATHS[group]) { DEATHS[group](src); sparkle(src.offsetLeft + FIELD_W / 2, src.offsetTop + FIELD_H / 2, 6); return; }
  const x = src.offsetLeft, y = src.offsetTop, cx = FIELD_W / 2, cy = FIELD_H / 2;
  const ring = [[0, 0], [45, 0], [95, 0], [95, 50], [95, 95], [95, 135], [50, 135], [0, 135], [0, 85], [0, 40]].map(([x, y]) => [x * FIELD_W / 95, y * FIELD_H / 135]);
  ring.forEach((p, k) => {
    const q = ring[(k + 1) % ring.length];
    const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
    // one wedge of the card, from its center out to this stretch of the edge
    deathPiece(src, "shard-piece", `clip-path:polygon(${cx}px ${cy}px, ${p[0]}px ${p[1]}px, ${q[0]}px ${q[1]}px);--dx:${mx * 1.6 + (Math.random() - 0.5) * 30}px;--dy:${my * 1.4 + 30 + Math.random() * 40}px;--r:${(Math.random() - 0.5) * 120}deg`, 950);
  });
  sparkle(x + cx, y + cy, 10);
}

// The turn handover: a shard falls into the turn crystal, which then takes on the
// color of the player whose turn it is now.
// Your turn begins: your side of the table lights up and your hand gives a little wave.
function yourTurnMoment() {
  U.myTurnAt = performance.now();
  if (REDUCED_MOTION) return;
  fxDiv("my-turn-glow", "", 1500);
}
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
// The words that float up from a character. The rules send which one ({ uid, say: "evolve" }, with
// numbers like n when it has them); the words are "float_<say>" rows in data/ui_text.csv, and the
// colour, and the skill spotlighted with it, are here. A card's own "say" action sends its words
// and colour itself ({ uid, text, color }).
const FLOATS = {
  disabled: { color: "#c9c9c9" },
  drain: { color: "#ff8a6b" },
  evolve: { color: "#b98cff", skill: "Evolve" },
  transform: { color: "#6fe3ff", skill: "Transform" },
  levelUp: { color: "#ffd25e", skill: "Level Up" },
  levelDown: { color: "#c9c9c9" },
  infected: { color: "#8dff8d" },
  chestThump: { color: "#ffd27a" },
  plusAttack: { color: "#ffd27a" },
  bow: { color: "#ffd27a" },
  gainSwift: { color: "#9fe7ff" },
  pierce: { color: "#ff9a6b" },
  reanimate: { color: "#8dff8d", skill: "Reanimate" },
  redirect: { color: "#ffd27a" },
  noReply: { color: "#9fe7ff", skill: "Swift", afterBlow: true },
  equip: { color: "#7fd6ff" },
  absorb: { color: "#8dff8d" },
  plusAll: { color: "#ffd25e" },
};
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SWIFT_GAP = 230;   // ms between a Swift blow and the reply

onGameEvent((type, d) => {
  const now = performance.now();
  // A blow lands when the attacker reaches its target, a moment after the lunge starts.
  const delay = now - U.lungeAt < 80 && !REDUCED_MOTION ? 190 + (U.lungeWind || 0) : 0;   // after the swoop (and any wind-up, js/fx.js)
  if (type === "log") {
    U.logAt.set(d.msg, now);
    if (U.logAt.size > 200) U.logAt.delete(U.logAt.keys().next().value);
    histLog(d.msg, now);
  } else if (type === "newGame") {
    resetMatchStats();
    U.hist = []; U.recentLog = [];
  } else if (type === "clash") {
    // A fight is about to resolve. With Swift, the first blow lands, then the reply a beat later.
    U.clash = { at: now, swift: d.swift, n: 0, uids: [d.attacker, d.target] };
  } else if (type === "charDamage") {
    const p = charCenter(d.uid);
    const f = findChar(d.uid);
    const overkill = f ? -rawStats(f.c).h : 0;
    if (f) countDamage(f.p.idx, d.amount);
    creditFight(d.uid, d.amount);
    const clash = U.clash && now - U.clash.at < 30 ? U.clash : null;
    const wait = delay + (clash?.swift != null && !REDUCED_MOTION ? clash.n++ * SWIFT_GAP : 0);
    const tier = feelTier(d.amount);
    later(wait, () => {
      damageNumber(p.x + (Math.random() - 0.5) * 30, p.y, d.amount, overkill);
      impactAt(p.x, p.y, d.amount);
      U.hits.set(d.uid, performance.now());
      flashCard(d.uid, "hit");
      hitStop(clash ? clash.uids : [d.uid], tier.stop);
      addTrauma(tier.trauma);
      if (tier.callout) callout(tier.callout);
    });
  } else if (type === "protected") {
    const p = plateCenter(d.player);
    later(delay, () => { wardHit(d.player); floatText(p.x, p.y - 46, `PROTECTED ${d.from} → ${d.to}`, "#9fe7ff"); });
  } else if (type === "playerDamage") {
    const p = plateCenter(d.player);
    countDamage(d.player, d.amount);
    creditFight(null, d.amount);
    if (U.stats) U.stats.low[d.player] = Math.min(U.stats.low[d.player], S.players[d.player].health / S.players[d.player].maxHealth);
    const tier = feelTier(d.amount);
    later(delay, () => {
      damageNumber(p.x + (Math.random() - 0.5) * 120, p.y - 10, d.amount, 0);
      crystalChips(d.player, 6 + Math.min(10, d.amount * 2));
      addTrauma(tier.trauma + 0.12);   // a hit to a player is felt a little more than one to a card
      if (d.amount >= BIG_HIT && sideOf(d.player) === "bottom") bigHit(d.player);
      if (tier.callout) callout(tier.callout);
    });
  } else if (type === "burn") {
    // a full hand: the card goes to the graveyard instead
    const p = plateCenter(d.player);
    floatText(p.x, p.y + (sideOf(d.player) === "top" ? 70 : -70), `Hand full: ${d.card.name} burns`, "#ff9a6b", true);
  } else if (type === "playerHeal") {
    const p = plateCenter(d.player);
    floatText(p.x, p.y - 10, `+${d.amount}`, "#7be08f");
  } else if (type === "text") {
    const p = charCenter(d.uid);
    const f = d.say ? FLOATS[d.say] || {} : {};
    const text = d.say ? T("float_" + d.say, d) : d.text, color = d.say ? f.color : d.color;
    const wait = f.afterBlow ? delay + SWIFT_GAP : 0;   // "» NO REPLY" (Swift won the fight untouched) shows once the blow has landed
    later(wait, () => { floatText(p.x, p.y - 40, text, color, true); if (f.skill) skillSpotlight(d.uid, f.skill); });
  } else if (type === "enter") {
    U.spawn.set(d.uid, { cost: Math.min(7, Math.max(1, d.cost)), t: now, faction: findChar(d.uid)?.c.group });
  } else if (type === "lunge") {
    const hf = findChar(d.uid);   // the turn history (histAdd)
    if (hf) histAdd({ kind: d.target === "shard" ? "shard" : "attack", id: hf.c.id, player: hf.p.idx }, now);
    // the attacker swoops most of the way to its target and springs back
    const from = charCenter(d.uid);
    const to = d.target === "shard" ? SHARD_AT : d.target != null ? charCenter(d.target) : plateCenter(d.player);
    const wind = U.multiAttack ? 0 : windUp(d.uid);   // a strong or boosted attacker winds up first
    U.lunges.set(d.uid, now);
    U.lungeVec.set(d.uid, { dx: (to.x - from.x) * 0.72, dy: (to.y - from.y) * 0.72, wind });
    U.lungeAt = now; U.lungeWind = wind; U.lastAttacker = d.uid; U.lastTarget = typeof d.target === "number" ? d.target : null;
  } else if (type === "draw") {
    U.drawn.set(d.uid, now);
  } else if (type === "champLevel") {
    const who = S.players[d.player], info = DATA.championAbilities[d.id];
    banner(`${info.name}: LEVEL UP`);
    floatText(sideOf(d.player) === "bottom" ? 720 : 720, sideOf(d.player) === "bottom" ? 900 : 120, "CHAMPION LEVEL UP", "#ffd27a");
  } else if (type === "shardFall") {
    U.shardFellAt = now;
    later(250, () => { addTrauma(0.95); impactAt(SHARD_AT.x, SHARD_AT.y, 12); sparkle(SHARD_AT.x, SHARD_AT.y, 30); });
  } else if (type === "shardHit") {
    const tier = feelTier(d.amount);
    later(delay, () => {
      U.shardHitAt = performance.now();
      damageNumber(SHARD_AT.x + (Math.random() - 0.5) * 30, SHARD_AT.y - 20, d.amount, 0);
      impactAt(SHARD_AT.x, SHARD_AT.y, d.amount);
      addTrauma(tier.trauma);
      const el = document.querySelector(".shard-rock");
      if (el) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
    });
  } else if (type === "shardClaim") {
    const who = S.players[d.player];
    later(delay + 120, () => {
      addTrauma(0.85);
      for (let k = 0; k < 3; k++) sparkle(SHARD_AT.x + (k - 1) * 30, SHARD_AT.y + (k - 1) * 20, 22);
      impactAt(SHARD_AT.x, SHARD_AT.y, 14);
      banner(`${who.name} claims the big shard`);
      callout(`${d.drawn ? `+${d.drawn} card${d.drawn > 1 ? "s" : ""}` : "No card"}${d.extra ? " · " + d.extra : ""}`);
    });
  } else if (type === "champPhase") {
    banner(`Boss Level: ${BOSS_PHASES[d.phase]}`);
    floatText(720, sideOf(d.player) === "bottom" ? 900 : 120, BOSS_PHASES[d.phase], "#ff8a5e");
  } else if (type === "manaToken") {
    floatText(sideOf(d.player) === "bottom" ? 223 : 1203, sideOf(d.player) === "bottom" ? 470 : 250, "+1 MANA", "#ffd27a", true);
  } else if (type === "turn") {
    U.selected = null; U.armed = null;
    turnHandover(d.player);
    if (S.mode === "hotseat") U.curtain = true;
    else if (S.shard && now - (U.shardFellAt || 0) < 100) banner("The big shard falls");
    else if (S.event && S.event.round === S.round) banner(`Mini shard fall: ${DATA.events[S.event.id].name}`);
    else banner(active().isAI ? `${active().name}'s turn` : "Your turn");
    if (!active().isAI && S.mode !== "hotseat") yourTurnMoment();
  } else if (type === "play") {
    histAdd({ kind: d.card.type === "Spell" ? "cast" : "play", id: d.card.id, player: d.player }, now);   // the turn history
    if (U.stats) U.stats.played[d.player]++;
    if (d.card.manaCost >= SHOWCASE_COST && !REDUCED_MOTION) { setTimeout(() => showcase(d.card, d.player), 0); return; }
    // after the board redraws, sparkle where the card landed
    setTimeout(() => {
      const el = document.querySelector(`#board [data-uid="${d.card.uid}"]`);
      const side = sideOf(d.player);
      const at = el ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 } : { x: 720, y: L[side].chars + FIELD_H / 2 };
      sparkle(at.x, at.y, d.card.type === "Spell" ? 22 : 14);
    }, 0);
  } else if (type === "countered") {
    banner(`${d.by.name}: ${d.card.name} is countered`);
    sparkle(720, 430, 22);
  } else if (type === "death") {
    shatter(d.uid, delay, d.group);
    reactToDeath(d.uid, delay);
  } else if (type === "gameOver") {
    finale(d.winner);
  }
});
const recent = (map, uid, ms) => map.has(uid) && performance.now() - map.get(uid) < ms;
