// Cards that travel: a card glides from where it was to where it is now, instead of
// popping in and out. Drawn cards slide out of the deck into the hand, played cards fly
// from the hand to the table (the computer's from its hidden hand at the top), cards that
// leave the table drift into the graveyard pile, and the hand closes up smoothly.
// Health numbers count down (or up) instead of jumping.
//
// How it works: the board is redrawn from scratch after every move (render in js/ui.js).
// After each redraw, motionAfterRender() looks at where every card now sits and compares it
// with where it sat after the last redraw. A card that moved gets a short animation from the
// old spot to the new one. A card that left the screen (to a graveyard, onto a character as
// equipment, back into a deck) gets a "ghost" copy that flies there. Everything here is for
// looks; the rules never wait for it.

const MOVE_MS = 430;                       // how long a card takes to travel
const MOVE_EASE = "cubic-bezier(.2,.8,.25,1)";
const MOTION = {
  where: new Map(),     // uid -> { x, y, w, kind } centre and width on the board after the last redraw
  moves: new Map(),     // uid -> { dx, dy, s, t } a card on its way: offset it started from, and when
  graves: [null, null], // the graveyard uids seen per player
  flying: [0, 0],       // cards on their way to each graveyard (the pile counts them once they land)
  game: null, view: null,
  life: [null, null],   // health shown on each crystal while it counts
};

// Where a player's deck and graveyard piles sit (centres).
const pileAt = (idx, which) => ({ x: (which === "grave" ? L.graveX : L.deckX) + BACK_W / 2, y: L[sideOf(idx)].backline + BACK_H / 2, w: BACK_W });
const eased = p => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);   // close to MOVE_EASE

// Every card on screen now: uid -> { el, x, y, w, kind }
function cardsOnScreen() {
  const out = new Map();
  for (const el of document.querySelectorAll("#board .field-card[data-uid]"))
    out.set(+el.dataset.uid, { el, x: el.offsetLeft + FIELD_W / 2, y: el.offsetTop + FIELD_H / 2, w: FIELD_W, kind: "field" });
  for (const el of document.querySelectorAll("#board .small-card[data-uid]"))
    out.set(+el.dataset.uid, { el, x: el.offsetLeft + BACK_W / 2, y: el.offsetTop + BACK_H / 2, w: BACK_W, kind: "back" });
  for (const el of document.querySelectorAll("#hand-layer .hand-card[data-uid]"))
    out.set(+el.dataset.uid, { el, x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth, kind: "hand" });
  // the other player's hand is face down: its cards are known here by their place in the hand
  const opp = S.players[1 - viewIdx()];
  const box = document.querySelector("#board .opp-hand");
  if (box) [...box.children].forEach((el, i) => {
    const c = opp.hand[i];
    if (c) out.set(c.uid, { el, x: box.offsetLeft + el.offsetLeft + el.offsetWidth / 2, y: box.offsetTop + el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth, kind: "opp" });
  });
  return out;
}

// Where a card is drawn on screen right now, part-way through a move included.
function visualSpot(uid, now) {
  const at = MOTION.where.get(uid);
  if (!at) return null;
  const mv = MOTION.moves.get(uid);
  if (!mv) return at;
  const left = 1 - eased((now - mv.t) / MOVE_MS);
  return { ...at, x: at.x + mv.dx * left, y: at.y + mv.dy * left, w: at.w * (1 + (mv.s - 1) * left) };
}

// Starts (or carries on, after a redraw) the glide of one element.
function glide(el, mv, now) {
  const left = Math.max(0, MOVE_MS - (now - mv.t));
  if (!left) return;
  const a = el.animate([{ translate: `${mv.dx}px ${mv.dy}px`, scale: mv.s }, { translate: "0px 0px", scale: 1 }],
    { duration: MOVE_MS, easing: MOVE_EASE, fill: "backwards" });
  a.currentTime = MOVE_MS - left;
  el.classList.add("moving");
}

function motionAfterRender() {
  if (!S) return;
  const now = performance.now();
  const screen = cardsOnScreen();
  // A new match, an undo, or the other player's view (hotseat): start from what is shown.
  const fresh = MOTION.game !== S || MOTION.view !== viewIdx() || REDUCED_MOTION;
  if (fresh) {
    MOTION.game = S; MOTION.view = viewIdx();
    MOTION.moves.clear(); MOTION.flying = [0, 0];
    MOTION.graves = S.players.map(p => new Set(p.grave.map(c => c.uid)));
    MOTION.where = new Map([...screen].map(([uid, s]) => [uid, { x: s.x, y: s.y, w: s.w, kind: s.kind }]));
    lifeAfterRender(true);
    return;
  }

  for (const [uid, s] of screen) {
    let mv = MOTION.moves.get(uid);
    if (mv && now - mv.t >= MOVE_MS) { MOTION.moves.delete(uid); mv = null; }
    const before = visualSpot(uid, now);
    const prev = MOTION.where.get(uid);
    let from = null;
    if (prev && (Math.abs(prev.x - s.x) > 2 || Math.abs(prev.y - s.y) > 2 || prev.kind !== s.kind)) from = before;
    else if (!prev && (s.kind === "hand" || s.kind === "opp")) from = pileAt(s.kind === "hand" ? viewIdx() : 1 - viewIdx(), "deck");   // just drawn
    if (from) {
      mv = { dx: from.x - s.x, dy: from.y - s.y, s: Math.max(0.3, Math.min(2.5, from.w / s.w)), t: now };
      MOTION.moves.set(uid, mv);
      landAfterFlight(uid, s.el);
    }
    if (mv) glide(s.el, mv, now);
  }

  // Cards that left the screen: into a graveyard, onto a character, or back into a deck.
  S.players.forEach((p, i) => {
    const seen = MOTION.graves[i];
    for (const c of p.grave) {
      if (seen.has(c.uid)) continue;
      seen.add(c.uid);
      const was = visualSpot(c.uid, now);
      toGrave(c, i, was);
    }
    if (p.grave.length < seen.size) MOTION.graves[i] = new Set(p.grave.map(c => c.uid));   // a card came back out
  });
  for (const [uid, was] of MOTION.where) {
    if (screen.has(uid) || S.players.some(p => p.grave.some(c => c.uid === uid))) continue;
    const holder = allChars().find(ch => (ch.equipped || []).some(e => e.uid === uid));
    const card = holder?.equipped.find(e => e.uid === uid);
    if (holder && card) { const to = screen.get(holder.uid); if (to) ghostFly(card, visualSpot(uid, now) || was, to, { shrink: true }); continue; }
    const owner = S.players.find(p => p.deck.some(c => c.uid === uid));
    if (owner) ghostFly(null, visualSpot(uid, now) || was, pileAt(owner.idx, "deck"), { shrink: true });
  }

  MOTION.where = new Map([...screen].map(([uid, s]) => [uid, { x: s.x, y: s.y, w: s.w, kind: s.kind }]));
  showGraveCounts();
  lifeAfterRender(false);
}

// A character's entrance (sprout, bounce, ...) plays when it lands, not while it flies.
function landAfterFlight(uid, el) {
  const sp = U.spawn.get(uid);
  if (!sp || performance.now() - sp.t > 120) return;
  for (const k of [...el.classList]) if (k.startsWith("enter-") || k.startsWith("spawn-")) el.classList.remove(k);
  sp.t = performance.now() + MOVE_MS - 60;
  later(MOVE_MS - 60, () => { if (U.screen === "game") render(); });
}

// A card going to the graveyard. From the table it waits for its death effect first; a spell
// from a hand is shown in the middle of the table for a moment, so you see what was cast.
function toGrave(card, idx, was) {
  const grave = pileAt(idx, "grave");
  const fromDeck = !was;   // a card that burned (full hand) or was milled never reached the screen
  const from = was || pileAt(idx, "deck");
  const spell = card.type === "Spell" && was && (was.kind === "hand" || was.kind === "opp");
  const big = card.manaCost >= SHOWCASE_COST;   // a big spell has its own showcase (js/fx.js)
  MOTION.flying[idx]++;
  const land = () => { MOTION.flying[idx] = Math.max(0, MOTION.flying[idx] - 1); showGraveCounts(idx); };
  if (spell && !big) {
    const mid = { x: 720, y: 400, w: 150 };
    fxBusy(MOVE_MS + 750 + MOVE_MS);
    ghostFly(card, from, mid, { hold: 750, then: grave, onLand: land });
  } else if (spell) {
    later(1150, () => ghostFly(card, { x: 720, y: 430, w: 60 }, grave, { onLand: land }));
  } else {
    const wait = was && was.kind === "field" ? 380 : 0;
    later(wait, () => ghostFly(fromDeck ? null : card, from, grave, { onLand: land, fade: was?.kind === "field" }));
  }
}

// A copy of a card (or a card back) that flies from one spot to another, then goes away.
// opts: hold (ms to stay at the end), then (a second stop after the hold), shrink (fade out
// small at the end), fade (start see-through, for a card that has just died), onLand.
function ghostFly(card, from, to, opts = {}) {
  if (!from || !to || U.screen !== "game") { opts.onLand?.(); return; }
  const el = document.createElement("div");
  el.className = "ghost-card";
  el.innerHTML = card ? cardHTML(card) : `<div class="card back"></div>`;
  el.style.cssText = `left:${to.x}px;top:${to.y}px`;
  fxLayer().appendChild(el);
  const base = CARD_W;   // the ghost's card is hand-sized; scale it to each spot's width
  const at = (p, extra = {}) => ({ translate: `${p.x - to.x}px ${p.y - to.y}px`, scale: p.w / base, ...extra });
  const end = opts.shrink ? { ...at(to), scale: (to.w / base) * 0.45, opacity: 0 } : at(to);
  const frames = [at(from, { opacity: opts.fade ? 0.55 : 1 }), end];
  const a = el.animate(frames, { duration: MOVE_MS, easing: MOVE_EASE, fill: "forwards" });
  a.onfinish = () => {
    if (opts.then) {
      later(opts.hold || 0, () => {
        const b = el.animate([at(to), { ...at(opts.then), scale: (opts.then.w / base) * 0.9 }], { duration: MOVE_MS, easing: "cubic-bezier(.5,0,.75,.4)", fill: "forwards" });
        b.onfinish = () => { el.remove(); pulsePile(opts.then); opts.onLand?.(); };
      });
      // a safety net, in case a new match starts during the hold
      setTimeout(() => el.remove(), (opts.hold || 0) + MOVE_MS * 2 + 400);
      return;
    }
    el.remove();
    if (!opts.shrink) pulsePile(to);
    opts.onLand?.();
  };
}

// The pile a card just landed on gives a little bump.
function pulsePile(at) {
  const el = [...document.querySelectorAll("#board .pile")].find(p => Math.abs(p.offsetLeft + BACK_W / 2 - at.x) < 4 && Math.abs(p.offsetTop + BACK_H / 2 - at.y) < 4);
  if (!el) return;
  el.classList.remove("got"); void el.offsetWidth; el.classList.add("got");
}

// The graveyard counter counts a card once it has landed there.
function showGraveCounts(only) {
  S.players.forEach((p, i) => {
    if (only != null && only !== i) return;
    const b = document.querySelector(`#board .pile.grave[data-player="${i}"] b`);
    if (b) b.textContent = Math.max(0, p.grave.length - MOTION.flying[i]);
  });
}

// ---------------------------------------------------------------------------
// Health counts down (or up) instead of jumping, so a big hit reads as a big hit.
// ---------------------------------------------------------------------------
function lifeAfterRender(fresh) {
  S.players.forEach((p, i) => {
    const real = Math.max(0, p.health);
    const L0 = MOTION.life[i];
    if (fresh || !L0) { MOTION.life[i] = { shown: real, target: real, raf: 0 }; return; }
    if (L0.target !== real) {
      L0.target = real;
      L0.from = L0.shown; L0.t = performance.now();
      L0.ms = Math.min(900, 220 + Math.abs(real - L0.shown) * 70);
      if (!L0.raf) L0.raf = requestAnimationFrame(() => lifeTick(i));
    }
    paintLife(i);
  });
}
function lifeTick(i) {
  const L0 = MOTION.life[i];
  L0.raf = 0;
  if (!S || U.screen !== "game") return;
  const p = Math.min(1, (performance.now() - L0.t) / L0.ms);
  L0.shown = Math.round(L0.from + (L0.target - L0.from) * eased(p));
  paintLife(i);
  if (p < 1) L0.raf = requestAnimationFrame(() => lifeTick(i));
  else document.querySelectorAll(`.plate[data-player="${i}"] .life, .si-player[data-player="${i}"] .si-life`).forEach(el => el.classList.remove("counting-down", "counting-up"));
}
function paintLife(i) {
  const L0 = MOTION.life[i];
  const going = L0.shown !== L0.target ? (L0.target < L0.shown ? "counting-down" : "counting-up") : "";
  for (const el of document.querySelectorAll(`.plate[data-player="${i}"] .life, .si-player[data-player="${i}"] .si-life`)) {
    const b = el.querySelector("b");
    if (b) b.textContent = L0.shown;
    el.classList.toggle("counting-down", going === "counting-down");
    el.classList.toggle("counting-up", going === "counting-up");
  }
}

// A card let go of after dragging starts its flight from where it was dropped, not from its
// place in the hand.
function dropSpot(uid, pt) {
  const at = MOTION.where.get(uid);
  if (at) MOTION.where.set(uid, { ...at, x: pt.x, y: pt.y, kind: "drop" });
  MOTION.moves.delete(uid);
}
