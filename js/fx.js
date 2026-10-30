// Game feel: aiming with fight previews, heavier impacts, big entrances for expensive
// cards, skill spotlights, a board that reacts to the game, and the final blow.
// Everything here is for looks; the rules live in engine.js. ui.js calls in from
// render() and its game event handler.

// While a showcase or the finale plays, the computer waits before its next move.
function fxBusy(ms) { U.busyUntil = Math.max(U.busyUntil || 0, performance.now() + ms); }
const fxLayer = () => document.getElementById("fx-layer");
// Runs fn after ms, unless a new game has started in the meantime.
function later(ms, fn) { const game = S; setTimeout(() => { if (S === game) fn(); }, ms); }

// ---------------------------------------------------------------------------
// Fight preview: what happens if the selected character attacks this target.
// The attack is played out on a copy of the game (simulate), so the preview always
// matches the real rules, skills and abilities included.
// ---------------------------------------------------------------------------
function fightPreview(aUid, tUid) {
  const a = findChar(aUid)?.c;
  if (!a) return null;
  const t = tUid != null ? findChar(tUid)?.c : null;
  const first = !t || stats(a).s >= stats(t).s + (named(t, "The Man Ape") ? 10 : 0);
  return simulate(() => {
    const foe = S.players[1 - S.active];
    const hp0 = foe.health;
    const th0 = t ? rawStats(findChar(tUid).c).h : 0;
    // the tutorial's guard would nudge the player about this make-believe attack
    const guard = actionGuard;
    actionGuard = null;
    let ok;
    try { ok = attack(aUid, tUid ?? null); } finally { actionGuard = guard; }
    if (!ok) return null;
    const alive = uid => !!findChar(uid);
    const tAlive = t && alive(tUid);
    return {
      first, aDies: !alive(aUid), tDies: !!t && !tAlive,
      dmg: t ? th0 - (tAlive ? Math.max(0, rawStats(findChar(tUid).c).h) : 0) : hp0 - foe.health,
    };
  });
}
function previewBadge(pv, face) {
  if (!pv) return "";
  if (face) return `<div class="fight-badge face">−${pv.dmg}${pv.aDies ? " · yours falls" : ""}</div>`;
  const [cls, text] = pv.tDies && !pv.aDies ? ["win", "Defeats it"] : pv.tDies ? ["trade", "Both fall"] : pv.aDies ? ["lose", "Yours falls"] : ["even", `−${pv.dmg} ♥`];
  return `<div class="fight-badge ${cls}" title="${pv.first ? "Your character strikes first" : "This enemy strikes first"}">${pv.first ? "⚡" : ""}${text}</div>`;
}

// ---------------------------------------------------------------------------
// Aiming line: from the chosen attacker (or the hand, for a spell's target) to the
// pointer, snapping to whatever can be hit under it.
// ---------------------------------------------------------------------------
const AIM = { on: false, x: 0, y: 0 };
const aimEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
aimEl.id = "aim";
aimEl.setAttribute("viewBox", "0 0 1440 1000");
aimEl.innerHTML = `<path class="aim-glow"/><path class="aim-line"/><g class="aim-reticle"><circle r="22"/><circle r="6"/><path d="M-34 0h10M24 0h10M0 -34v10M0 24v10"/></g>`;
document.getElementById("stage").insertBefore(aimEl, document.getElementById("fx-layer"));
const AIM_TARGETS = ".field-card.attackable, .field-card.targetable, .plate.attackable, .plate.targetable, .small-card.targetable, .face-btn";

function aimSource() {
  if (!S || U.screen !== "game" || !humanTurn()) return null;
  if (U.selected && findChar(U.selected)) return charCenter(U.selected);
  const pd = S.pending;
  if (pd?.kind === "target" && !S.players[pd.owner].isAI) return { x: 720, y: 760 };
  return null;
}
function centerOf(el) {
  if (el.classList.contains("plate")) return plateCenter(Number(el.dataset.player));
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}
function drawAim() {
  const from = aimSource();
  if (!from || !AIM.on) { aimEl.classList.remove("on"); return; }
  let to = { x: AIM.x, y: AIM.y }, ok = false;
  if (AIM.over?.isConnected) { to = centerOf(AIM.over); ok = true; }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < 30) { aimEl.classList.remove("on"); return; }
  // a gentle arc, bowed upward like a thrown shard
  const cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2 - Math.min(140, dist * 0.25);
  const d = `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`;
  aimEl.querySelector(".aim-line").setAttribute("d", d);
  aimEl.querySelector(".aim-glow").setAttribute("d", d);
  aimEl.querySelector(".aim-reticle").setAttribute("transform", `translate(${to.x} ${to.y})`);
  aimEl.classList.add("on");
  aimEl.classList.toggle("ok", ok);
}
function trackAim(e) {
  if (!aimSource()) { if (AIM.on) { AIM.on = false; drawAim(); } return; }
  const pt = stagePoint(e);
  AIM.on = true; AIM.x = pt.x; AIM.y = pt.y;
  AIM.over = document.elementFromPoint(e.clientX, e.clientY)?.closest(AIM_TARGETS) || null;
  drawAim();
}
document.getElementById("stage").addEventListener("pointermove", trackAim);
document.getElementById("stage").addEventListener("pointerleave", () => { AIM.on = false; drawAim(); });

// Drag to attack: press one of your ready characters, drag onto an enemy, let go.
// Tapping the attacker and then the target still works.
let dragAtk = null;
document.getElementById("board").addEventListener("pointerdown", e => {
  const el = e.target.closest('.field-card[data-side="bottom"]');
  if (!el || e.button === 2 || !humanTurn() || S.phase !== PHASE.BATTLE || S.pending) return;
  const c = active().field.chars.find(x => x.uid === Number(el.dataset.uid));
  if (!c || !canAttack(c)) return;
  dragAtk = { uid: c.uid, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
});
addEventListener("pointermove", e => {
  if (!dragAtk || e.pointerId !== dragAtk.id) return;
  if (!dragAtk.moved && Math.hypot(e.clientX - dragAtk.x, e.clientY - dragAtk.y) > 12) {
    dragAtk.moved = true;
    if (U.selected !== dragAtk.uid) { U.selected = dragAtk.uid; render(); }
  }
  if (dragAtk.moved) trackAim(e);
});
addEventListener("pointerup", e => {
  if (e.pointerType === "touch") { AIM.on = false; drawAim(); }
  if (!dragAtk || e.pointerId !== dragAtk.id) return;
  const d = dragAtk; dragAtk = null;
  if (!d.moved) return;
  U.dragAttackAt = performance.now();   // the click that follows this release is ignored
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.field-card.attackable, .plate.attackable, .face-btn');
  if (!over || U.selected !== d.uid) return;
  U.selected = null;
  act(() => attack(d.uid, over.classList.contains("field-card") ? Number(over.dataset.uid) : null));
});
addEventListener("pointercancel", () => { dragAtk = null; });

// ---------------------------------------------------------------------------
// Impacts
// ---------------------------------------------------------------------------
// Screen shake that grows with the hit.
function shakeBy(px) {
  if (REDUCED_MOTION || px <= 0) return;
  const st = document.getElementById("stage");
  st.style.setProperty("--amp", Math.min(16, px) + "px");
  st.classList.remove("shake", "shake-big", "shake-n");
  void st.offsetWidth;
  st.classList.add("shake-n");
}
// A damage number that pops and wobbles; bigger hits are bigger and golden.
function damageNumber(x, y, amount, overkill) {
  const el = document.createElement("div");
  el.className = "dmg" + (amount >= 5 ? " heavy" : "");
  el.style.cssText = `left:${x}px;top:${y}px;--size:${Math.min(76, 30 + amount * 5)}px`;
  el.textContent = `-${amount}`;
  if (overkill > 0) el.innerHTML += `<small>OVERKILL</small>`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
// A white flash and a ring where a blow lands.
function impactAt(x, y, amount) {
  if (REDUCED_MOTION) return;
  const ring = document.createElement("div");
  ring.className = "impact-ring";
  ring.style.cssText = `left:${x}px;top:${y}px;--s:${0.7 + Math.min(amount, 8) * 0.12}`;
  fxLayer().appendChild(ring);
  setTimeout(() => ring.remove(), 500);
}
// Bits of the life crystal fly off when a player is hit.
const LIFE_CRYSTAL = idx => (sideOf(idx) === "top" ? { x: 554, y: 33 } : { x: 554, y: 967 });
const TIER_COLORS = { healthy: ["#e3ffe8", "#3fd26b"], hurt: ["#fff0d6", "#ff9a2e"], low: ["#ffe0e0", "#ff3b3b"] };
function crystalChips(idx, n, spread = 1) {
  if (REDUCED_MOTION) return;
  const p = S.players[idx];
  const ratio = Math.max(0, p.health / p.maxHealth);
  const colors = TIER_COLORS[LIFE_TIERS.find(t => ratio >= t.min).cls];
  const at = LIFE_CRYSTAL(idx), up = sideOf(idx) === "top" ? 1 : -1;
  for (let k = 0; k < n; k++) {
    const el = document.createElement("div");
    const a = (Math.random() - 0.5) * Math.PI * spread, r = 60 + Math.random() * 90 * spread;
    el.className = "life-chip";
    el.style.cssText = `left:${at.x}px;top:${at.y}px;--dx:${Math.sin(a) * r}px;--dy:${up * Math.cos(a) * r}px;--r:${(Math.random() - 0.5) * 540}deg;--c:${colors[k % 2]};--s:${0.6 + Math.random() * 0.8}`;
    fxLayer().appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  const plate = document.querySelector(`.plate[data-player="${idx}"]`);
  if (plate) { plate.classList.remove("struck"); void plate.offsetWidth; plate.classList.add("struck"); }
}
// Restart a CSS animation class on a card that is on the board right now.
function flashCard(uid, cls) {
  const el = document.querySelector(`.field-card[data-uid="${uid}"]`);
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}
// A short callout in the middle of the table, for big moments.
function callout(text, sub) {
  const el = document.createElement("div");
  el.className = "callout";
  el.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// ---------------------------------------------------------------------------
// Big entrances: a card costing 6 or more is shown large in the middle of the table,
// then flies to its place (or bursts, for a spell) with a shockwave.
// ---------------------------------------------------------------------------
const SHOWCASE_COST = 6;
function showcase(card, player) {
  const isChar = card.type === "Character";
  if (isChar) U.arriving.set(card.uid, performance.now() + 1300);
  fxBusy(1400);
  const box = document.createElement("div");
  box.className = "showcase";
  box.innerHTML = `${cardHTML(card)}<p>${esc(S.players[player].name)} plays</p>`;
  fxLayer().appendChild(box);
  const dim = document.createElement("div");
  dim.className = "showcase-dim";
  fxLayer().appendChild(dim);
  later(820, () => {
    dim.remove();
    const field = isChar && document.querySelector(`.field-card[data-uid="${card.uid}"]`);
    if (field) {
      const tx = field.offsetLeft + CARD_W / 2 - 720, ty = field.offsetTop + CARD_H / 2 - 430;
      box.animate([{ transform: "translate(-50%, -50%) scale(1)" }, { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.455)` }], { duration: 260, easing: "cubic-bezier(.6,0,.9,.5)", fill: "forwards" });
      later(260, () => {
        box.remove();
        U.arriving.delete(card.uid);
        U.spawn.set(card.uid, { t: performance.now(), big: true });
        render();
        const c = { x: field.offsetLeft + CARD_W / 2, y: field.offsetTop + CARD_H / 2 };
        shockwave(c.x, c.y);
        shakeBy(10);
        sparkle(c.x, c.y, 18);
      });
    } else {
      box.classList.add("burst");
      shockwave(720, 430);
      shakeBy(card.type === "Spell" ? 8 : 5);
      sparkle(720, 430, 26);
      later(350, () => box.remove());
      if (isChar) { U.arriving.delete(card.uid); render(); }
    }
  });
  // a safety net, in case the board changed under the animation
  setTimeout(() => { box.remove(); dim.remove(); }, 2000);
}
function shockwave(x, y) {
  if (REDUCED_MOTION) return;
  const el = document.createElement("div");
  el.className = "shockwave";
  el.style.cssText = `left:${x}px;top:${y}px`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// Skill spotlight: the skill's icon pops above the card when it takes effect.
const SKILL_TEXT = { "LEVEL UP": "Level Up", "EVOLVE!": "Evolve", "TRANSFORM!": "Transform", "REANIMATE": "Reanimate", "+1 ATK/SPD": "Rally" };
function skillSpotlight(uid, text) {
  const skill = SKILL_TEXT[text];
  if (!skill || REDUCED_MOTION) return;
  const p = charCenter(uid);
  const el = document.createElement("div");
  el.className = "skill-pop";
  el.style.cssText = `left:${p.x}px;top:${p.y - 30}px`;
  el.innerHTML = `<span>${esc(DATA.skills[skill]?.icon || "✦")}</span><b>${esc(skill)}</b>`;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 1400);
  setTimeout(() => flashCard(uid, "skill-glow"), 0);
}

// Each faction enters the table its own way (cheaper cards; big ones get a showcase).
const FACTION_ENTRANCE = { Simple: "enter-sprout", Monkey: "enter-bounce", Zombie: "enter-rise", Fighter: "enter-stance", Digital: "enter-glitch" };
function spawnClass(sp) {
  if (sp.big) return "spawn-7";
  return FACTION_ENTRANCE[sp.faction] || "spawn-" + sp.cost;
}

// ---------------------------------------------------------------------------
// The match: running totals for the end screen, and the final blow.
// ---------------------------------------------------------------------------
function resetMatchStats() {
  U.stats = { played: [0, 0], dealt: [0, 0], biggest: 0, low: [1, 1] };
  U.endBadges = [];
}
function countDamage(victimIdx, amount) {
  const st = U.stats;
  if (!st) return;
  st.dealt[1 - victimIdx] += amount;
  st.biggest = Math.max(st.biggest, amount);
}

function finale(winner) {
  const game = S;
  const st = U.stats || {};
  // little achievements, shown on the end screen
  const badges = [];
  if (winner != null) {
    const w = S.players[winner];
    if (w.health >= w.maxHealth) badges.push(["Flawless", "Won without taking a hit"]);
    if ((st.low?.[winner] ?? 1) < 0.35) badges.push(["Comeback", "Won from red health"]);
    if (S.mode === "ai" && winner === 0 && !U.tutorial) {
      const wins = PREFS.get("wins", {}) || {};
      const id = S.players[0].deckId;
      if (!wins[id]) badges.push(["First win", `with ${DATA.decks[id]?.name || "this deck"}`]);
      wins[id] = (wins[id] || 0) + 1;
      PREFS.set("wins", wins);
    }
  }
  if (st.biggest >= 8) badges.push(["Massive hit", `${st.biggest} damage in one blow`]);
  U.endBadges = badges;

  if (REDUCED_MOTION || U.tutorial) { U.ended = true; return; }
  fxBusy(2000);
  // slow motion on the winning blow, then the loser's life crystal shatters
  const anims = document.getAnimations?.() || [];
  anims.forEach(a => { a.playbackRate = 0.3; });
  setTimeout(() => anims.forEach(a => { a.playbackRate = 1; }), 700);
  const losers = winner == null ? [0, 1] : [1 - winner];
  later(450, () => {
    for (const i of losers) { crystalChips(i, 28, 2); const at = LIFE_CRYSTAL(i); shockwave(at.x, at.y); }
    const flash = document.createElement("div");
    flash.className = "final-flash";
    fxLayer().appendChild(flash);
    setTimeout(() => flash.remove(), 900);
    shakeBy(16);
  });
  setTimeout(() => { if (S === game) { U.ended = true; render(); } }, 1700);
}

function endStatsHTML() {
  const st = U.stats;
  if (!st) return "";
  const [me, them] = [viewIdx(), 1 - viewIdx()];
  const row = (label, a, b) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
  return `<table class="end-stats"><tr><th></th><td>${esc(S.players[me].name)}</td><td>${esc(S.players[them].name)}</td></tr>
    ${row("Cards played", st.played[me], st.played[them])}${row("Damage dealt", st.dealt[me], st.dealt[them])}</table>
    <p class="end-sub">Biggest hit: ${st.biggest} · ${S.round} turn${S.round === 1 ? "" : "s"}</p>
    ${U.endBadges?.length ? `<div class="end-badges">${U.endBadges.map(([t, s]) => `<div class="end-badge"><b>${esc(t)}</b><span>${esc(s)}</span></div>`).join("")}</div>` : ""}`;
}

// ---------------------------------------------------------------------------
// A board that reacts: each side glows with its faction color, brighter as mana grows,
// and the table grows tense when someone is close to losing.
// ---------------------------------------------------------------------------
function sideStyle(p) {
  return `--fc:${DATA.factions[p.faction]?.color || "#8a6cf0"};--mana:${Math.min(1, p.manaMax / 10).toFixed(2)}`;
}
function isTense() {
  return !S.over && S.players.some(p => p.health / p.maxHealth < 0.35);
}
