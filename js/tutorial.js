// Shardfall tutorial: a short scripted game against a gentle Trainer, teaching one
// idea at a time. A coach box explains each step. When a step points at something,
// the rest of the screen dims and an arrow points to it. Steps the player must do
// (drag a card, attack) wait until it is done, and the engine's actionGuard refuses
// any other move in the meantime. The Trainer's turns are scripted, not the AI.

const TUT = {
  on: false,
  i: 0,            // current step
  ids: {},         // uid of each scripted card, by key
  oppTimer: null,
  nudgeAt: 0,      // time of the last refused move, to shake the coach box
};

const TUT_TRAINER_HEALTH = 3;

function startTutorial() {
  endTutorial();
  resetMatchScreen();   // js/ui.js
  newGame({ deckId: "simple_starter", opponentDeckId: "simple_starter", mode: "ai", events: false, abilities: false, shard: false });   // lessons are scripted, so no random events, champion abilities or big shard
  S.setup.scripted = true;   // fixed hands and decks, so a lesson can't be replayed from its moves
  const [me, tr] = S.players;
  tr.name = "Trainer"; tr.faction = "Training"; tr.deckLabel = "Training deck";
  tr.health = tr.maxHealth = TUT_TRAINER_HEALTH;
  const make = ids => ids.map(cardById);   // by CardID, so renaming a card keeps the lessons working
  // Hands are fixed, and decks are drawn from the end, so every lesson happens on cue.
  me.hand = make(["simple_farmer", "simple_barkeep", "simplify"]);
  me.deck = make(["simple_swordsman", "herd", "simple_farmer", "simple_wizard", "slap", "sword"]);
  tr.hand = make(["patched_husk", "simple_bowman", "breathing_wall"]);
  tr.deck = make(["simple_swordsman", "simple_wanderer", "helm", "bow", "simple_farmer"]);
  TUT.ids = {
    farmerA: me.hand[0].uid, barkeep: me.hand[1].uid, simplify: me.hand[2].uid,
    farmerB: me.deck[2].uid, slap: me.deck[4].uid, sword: me.deck[5].uid,
    husk: tr.hand[0].uid, bowman: tr.hand[1].uid, wall: tr.hand[2].uid,
  };
  S.log = ["Tutorial: you (Simple) vs the Trainer"];
  TUT.on = true; TUT.i = 0;
  U.tutorial = TUT;
  actionGuard = tutGuard;
  showScreen("game");
  banner("Tutorial");
  render();
}

function endTutorial() {
  clearTimeout(TUT.oppTimer);
  if (!TUT.on) return;
  TUT.on = false;
  U.tutorial = null;
  actionGuard = null;
  const el = document.getElementById("coach");
  if (el) { el.hidden = true; el.innerHTML = ""; }
}

// ---------------------------------------------------------------------------
// Helpers for writing steps
// ---------------------------------------------------------------------------
const tid = key => TUT.ids[key];
const tcard = key => findCard(TUT.ids[key]);
const onField = key => !!findChar(TUT.ids[key]);
const handEl = key => $(`.hand-card[data-uid="${tid(key)}"]`);
const fieldEl = key => $(`.field-card[data-uid="${tid(key)}"]`);
const actEl = act => $(`[data-act="${act}"]`);
const plateEl = idx => $(`.plate[data-player="${idx}"]`);
const graveEl = idx => $(`.pile.grave[data-player="${idx}"]`);
const selectedEl = () => $(".field-card.selected");
// A rectangle given in stage coordinates (the 1440x1000 board), as a screen rectangle.
function stageRect(x, y, w, h) {
  const r = $("#stage").getBoundingClientRect();
  return new DOMRect(r.left + x * U.scale, r.top + y * U.scale, w * U.scale, h * U.scale);
}
const yourTable = () => stageRect(300, L.bottom.chars - 6, 840, FIELD_H + 12);
const targetUid = t => (t && typeof t === "object" ? t.uid : t);

// The lessons themselves (TUT_STEPS) are in js/tutorial-steps.js, loaded right after this file.

// ---------------------------------------------------------------------------
// Running the steps
// ---------------------------------------------------------------------------
const tutStep = () => TUT_STEPS[TUT.i];

function tutGuard(name, ...args) {
  if (!TUT.on || !S) return true;
  if (S.active === 1) return true;          // the Trainer's scripted moves
  const st = tutStep();
  if (st.allow && st.allow(name, ...args)) return true;
  TUT.nudgeAt = performance.now();
  setTimeout(() => renderCoach(), 0);
  return false;
}

function tutGoto(i) {
  TUT.i = Math.max(0, Math.min(TUT_STEPS.length - 1, i));
  const st = tutStep();
  if (st.opp) runTrainer(0);
}

// Called after every render: move on when the current step is done.
function tutUpdate() {
  if (!TUT.on) return;
  for (let guard = 0; guard < 5; guard++) {
    const st = tutStep();
    const back = st.back?.();
    if (back && !(st.done && st.done())) { tutGoto(TUT_STEPS.findIndex(s => s.id === back)); continue; }
    const finished = st.opp ? S.active === 0 && st.started : st.done && st.done();
    if (!finished) break;
    tutGoto(TUT.i + 1);
  }
}

function runTrainer(k) {
  const st = tutStep();
  st.started = true;
  clearTimeout(TUT.oppTimer);
  TUT.oppTimer = setTimeout(() => {
    if (!TUT.on || tutStep() !== st) return;
    // Pause while the player is reading a card or looking at another screen.
    if (U.screen !== "game" || !$("#modal").hidden) { runTrainer(k); return; }
    st.opp[k]();
    render();
    if (k + 1 < st.opp.length) runTrainer(k + 1);
  }, k === 0 ? 1400 : 1100);
}

function tutNext() {
  if (!TUT.on || !tutStep().next) return;
  tutGoto(TUT.i + 1);
  render();
}

// ---------------------------------------------------------------------------
// Coach box, spotlight and arrow
// ---------------------------------------------------------------------------
function renderCoach() {
  const el = document.getElementById("coach");
  if (!TUT.on || U.screen !== "game") { el.hidden = true; return; }
  const st = tutStep();
  const text = typeof st.text === "function" ? st.text() : st.text;
  const nudging = performance.now() - TUT.nudgeAt < 2500;

  let rects = (st.target?.() || []).filter(Boolean).map(x => (x instanceof Element ? x.getBoundingClientRect() : x)).filter(r => r.width > 0);
  if (st.union && rects.length) rects = [unionRect(rects)];
  const dim = !st.opp && !st.final;

  const progress = Math.round((TUT_STEPS.indexOf(st) / (TUT_STEPS.length - 1)) * 100);
  // On phones the board's buttons are tiny, so the step's button is repeated here at full size.
  const boardBtn = U.dock && !st.opp && (st.target?.() || []).find(x => x instanceof Element && ["phase", "face"].includes(x.dataset.act));
  const doBtn = boardBtn && !boardBtn.disabled ? `<button type="button" class="btn btn-primary" data-coach="do" data-do="${boardBtn.dataset.act}">${esc(boardBtn.textContent.trim())}</button>` : "";
  let foot = "";
  if (st.final) {
    foot = `<button type="button" class="btn btn-primary" data-coach="play">Play a real game</button><button type="button" class="btn" data-coach="guide">How to play</button><button type="button" class="btn" data-coach="menu">Main menu</button>`;
  } else {
    foot = `<span class="coach-progress" role="progressbar" aria-label="Tutorial progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></span><button type="button" class="coach-quit" data-coach="quit">Leave tutorial</button>${st.next ? `<button type="button" class="btn btn-primary" data-coach="next">Next</button>` : doBtn}`;
  }
  el.hidden = false;
  el.innerHTML = `<svg class="coach-svg" aria-hidden="true"></svg>
    <div class="coach-box${st.wide ? " wide" : ""}${U.dock ? " docked" : ""}${nudging ? " nudge" : ""}" role="dialog" aria-live="polite" aria-label="Tutorial">
      ${st.title ? `<h2>${st.title}</h2>` : ""}
      <div class="coach-text">${text}</div>
      ${nudging ? `<p class="coach-nudge">Let's stick to the highlighted step for now.</p>` : ""}
      <div class="coach-foot">${foot}</div>
    </div>`;

  const box = el.querySelector(".coach-box");
  const vw = el.clientWidth, vh = el.clientHeight;
  let pos;
  if (U.dock) {
    // Phones: the coach has its own panel next to the board.
    const wr = $("#stage-wrap").getBoundingClientRect();
    pos = { x: wr.left + U.dock.x + 8, y: wr.top + U.dock.y + 8 };
    box.style.width = U.dock.w - 16 + "px";
    box.style.maxHeight = U.dock.h - 16 + "px";
  } else {
    // The visible height, not 100vh: phone browsers count the space behind their bars.
    box.style.maxHeight = vh - 24 + "px";
    // Keep clear of the targets and of the board's own prompt bar.
    const prompt = document.getElementById("prompt");
    const avoid = prompt.hidden ? rects : [...rects, prompt.getBoundingClientRect()];
    pos = st.opp ? placeAside(box.offsetWidth, box.offsetHeight, vw, vh) : placeCoach(box.offsetWidth, box.offsetHeight, rects, avoid, vw, vh, st.wide || st.final || !rects.length);
  }
  box.style.left = pos.x + "px"; box.style.top = pos.y + "px";

  // Dim everything except the targets, outline them, and point at the first one.
  const pad = 8;
  const holes = rects.map(r => `<rect x="${r.left - pad}" y="${r.top - pad}" width="${r.width + pad * 2}" height="${r.height + pad * 2}" rx="12"/>`).join("");
  let svg = "";
  if (dim) {
    svg += `<defs><mask id="coach-mask"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${holes}</g></mask>
      <marker id="coach-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd27a"/></marker></defs>
      <rect width="100%" height="100%" fill="rgba(6,3,1,0.62)" mask="url(#coach-mask)"/>`;
    svg += `<g class="coach-ring">${holes}</g>`;
  }
  if (dim && rects.length) {
    // Drag steps point from the card to where it goes; others from the box to the target.
    const dragging = st.drag && rects.length > 1;
    const from = dragging ? rects[0] : null;
    const b = dragging ? { left: from.left, top: from.top, right: from.right, bottom: from.bottom } : { left: pos.x, top: pos.y, right: pos.x + box.offsetWidth, bottom: pos.y + box.offsetHeight };
    const t = dragging ? rects[1] : rects[0];
    const tc = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
    const bc = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
    const start = edgePoint(b, bc, tc, dragging ? pad + 4 : 6);
    const end = dragging ? tc : edgePoint({ left: t.left - pad, top: t.top - pad, right: t.right + pad, bottom: t.bottom + pad }, tc, bc, 8);
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    if (dist > 40) {
      const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
      const bend = Math.min(80, dist * 0.2);
      const cx = mx - ((end.y - start.y) / dist) * bend, cy = my + ((end.x - start.x) / dist) * bend;
      svg += `<path class="coach-arrow" d="M${start.x} ${start.y} Q${cx} ${cy} ${end.x} ${end.y}" marker-end="url(#coach-head)"/>`;
    }
  }
  el.querySelector(".coach-svg").innerHTML = svg;
}

function unionRect(rs) {
  const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
  const r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
  return new DOMRect(l, t, r - l, b - t);
}

// Where the line from `from` toward `to` leaves rectangle r, pushed out by gap.
function edgePoint(r, from, to, gap) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const hw = (r.right - r.left) / 2 + gap, hh = (r.bottom - r.top) / 2 + gap;
  const k = 1 / Math.max(Math.abs(dx) / hw || 0, Math.abs(dy) / hh || 0, 1e-6);
  return { x: from.x + dx * Math.min(k, 1), y: from.y + dy * Math.min(k, 1) };
}

// Pick a spot for the coach box that does not cover what it is talking about:
// the empty space beside the board first, then around the targets, then corners.
// During the Trainer's turn the box steps aside so the whole table is visible:
// beside the board when there is room, otherwise in the bottom-left corner.
function placeAside(bw, bh, vw, vh) {
  const sr = $("#stage").getBoundingClientRect();
  if (sr.left >= bw + 24) return { x: (sr.left - bw) / 2, y: (vh - bh) / 2 };
  return { x: 12, y: vh - bh - 12 };
}

function placeCoach(bw, bh, rects, avoid, vw, vh, center) {
  const m = 12;
  const clamp = p => ({ x: Math.max(m, Math.min(vw - bw - m, p.x)), y: Math.max(m, Math.min(vh - bh - m, p.y)) });
  if (center) return clamp({ x: (vw - bw) / 2, y: (vh - bh) / 2 });
  const sr = $("#stage").getBoundingClientRect();
  const u = unionRect(rects);
  const ux = u.left + u.width / 2, uy = u.top + u.height / 2;
  const cands = [];
  const gl = sr.left, gr = vw - sr.right;
  const sideFirst = ux > vw / 2 ? ["L", "R"] : ["R", "L"];
  for (const s of sideFirst) {
    if (s === "L" && gl >= bw + m * 2) cands.push({ x: (gl - bw) / 2, y: uy - bh / 2 });
    if (s === "R" && gr >= bw + m * 2) cands.push({ x: sr.right + (gr - bw) / 2, y: uy - bh / 2 });
  }
  const gap = 56;
  const vertical = uy > vh / 2 ? [{ x: ux - bw / 2, y: u.top - bh - gap }, { x: ux - bw / 2, y: u.bottom + gap }] : [{ x: ux - bw / 2, y: u.bottom + gap }, { x: ux - bw / 2, y: u.top - bh - gap }];
  cands.push(...vertical, { x: u.right + gap, y: uy - bh / 2 }, { x: u.left - bw - gap, y: uy - bh / 2 });
  cands.push({ x: m, y: m }, { x: vw - bw - m, y: m }, { x: m, y: vh - bh - m }, { x: vw - bw - m, y: vh - bh - m });
  const hits = p => avoid.some(r => p.x < r.right + 10 && p.x + bw > r.left - 10 && p.y < r.bottom + 10 && p.y + bh > r.top - 10);
  for (const c of cands) {
    const p = clamp(c);
    if (!hits(p)) return p;
  }
  return clamp(cands[cands.length - 1]);
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-coach]");
  if (!b) return;
  const what = b.dataset.coach;
  if (what === "next") tutNext();
  else if (what === "do") document.querySelector(`#board [data-act="${b.dataset.do}"]`)?.click();
  else if (what === "quit") { endTutorial(); showScreen("menu"); }
  else if (what === "play") { endTutorial(); U.deckId = "simple_starter"; U.mode = "ai"; startGame(); }
  else if (what === "guide") { endTutorial(); showScreen("menu"); showGuide(); }
  else if (what === "menu") { endTutorial(); showScreen("menu"); }
});

// ---------------------------------------------------------------------------
// Card anatomy: a large card with its parts labelled. Used by the tutorial and
// for the picture in the How to play guide. Sizes are in em so it scales.
// ---------------------------------------------------------------------------
function anatomyHTML(c) {
  // Points on the card (in card em units, the card is 9.5 x 13.5) and where each label sits.
  const K = 1.1, X0 = 11.8, Y0 = 0.4;
  const parts = [
    { side: "L", y: 0.6, px: 1.25, py: 1.25, t: "Fracture", d: "The shattered world it is from" },
    { side: "L", y: 5.2, px: 1.45, py: 9.4, t: "Tribe", d: "What it is (round symbol)" },
    { side: "L", y: 9.4, px: 3.2, py: 10.95, t: "Skills", d: "Keywords with special rules" },
    { side: "L", y: 12.4, px: 1.3, py: 12.5, t: "⚔ Attack", d: "Damage it deals" },
    { side: "R", y: 0.6, px: 8.45, py: 1.05, t: "Mana cost", d: "What it costs to play" },
    { side: "R", y: 3.6, px: 9.3, py: 5, t: "Rarity", d: "The edge color and the gem" },
    { side: "R", y: 6.6, px: 7.9, py: 9.4, t: "Class", d: "What it does (square symbol)" },
    { side: "R", y: 9.6, px: 8.3, py: 12.5, t: "♥ Health", d: "Damage it can take" },
  ];
  const lines = parts.map(p => {
    const x = X0 + p.px * K, y = Y0 + p.py * K;
    const lx = p.side === "L" ? 10.9 : 23.6, ly = p.y + 0.75;
    return `<path d="M${lx} ${ly} L${x} ${y}"/><circle cx="${x}" cy="${y}" r="0.28"/>`;
  }).join("");
  const labels = parts.map(p => `<div class="anat-label ${p.side}" style="top:${p.y}em"><b>${p.t}</b><span>${p.d}</span></div>`).join("");
  return `<div class="anatomy"><div class="anat-card" style="left:${X0}em;top:${Y0}em">${cardHTML(c)}</div>
    <svg viewBox="0 0 35 15.8" aria-hidden="true">${lines}</svg>${labels}</div>`;
}
