// Shardfall interface core: the screen state U, fast redraws, actions, screens and phone layout.
// The table's drawing is js/board.js, input js/input.js (menu: js/menu.js, storm.js).
// The board is a fixed 1440x1000 stage (the LÖVE virtual size) scaled to the window.
//
// Short names used in the interface code (js/engine.js lists the rules ones: S, p, c, pd, fx):
//   U    what the screen is showing: current screen, selected attacker, timers, settings
//   L    where things sit on the 1440x1000 board, in board pixels
//   $    finds one element on the page, like $("#board")
//   act  runs a player's move through the rules, saves an undo step, redraws the board

// A card in the hand is CARD_W x CARD_H. Characters on the table are drawn bigger (FIELD_W x
// FIELD_H) and the back row (areas, equipment, deck and graveyard) smaller (BACK_W x BACK_H), so
// the fighters are what the eye goes to.
const W = 1440, H = 1000, CARD_W = 95, CARD_H = 135, FIELD_W = 114, FIELD_H = 162, BACK_W = 72, BACK_H = 102;
const L = {
  top:    { chars: 186, backline: 74 },
  bottom: { chars: 452, backline: 624 },
  backX: 214, deckX: 30, graveX: 112, slot: 80, charStep: 126, frontW: 1140,
  handY: 770,
  midX: 720,                                   // the middle of the table, left to right
  // Fixed pieces drawn by render() (js/board.js): where each sits, and its size
  menuBtn:  { x: 16, y: 11, w: 110, h: 44 },   // ☰ Menu
  phaseBtn: { x: 1220, y: 372, w: 200, h: 56 },  // Draw card / To battle → / …
  passBtn:  { x: 1240, y: 942, w: 180, h: 48 },  // Pass turn
  oppHand:  { x: 960, y: 7 },                    // the other player's cards, face down
  turnInfoY: 372,                                // "Round n · whose turn"
  splitW: 196, splitAllX: 728,                   // "Attack directly" and "All attack" side by side
};
// ---------------------------------------------------------------------------
// Seats: who controls each player. Ask these, never "is it not the computer?": in Play a Friend
// the other player is a person, but not at this screen.
// ---------------------------------------------------------------------------
//   "here"      a person at this screen        "computer"  js/ai.js plays it
//   "away"      a friend playing from another browser (Play a Friend, later: a player with away set)
const seatControl = p => (p.isAI ? "computer" : p.away ? "away" : "here");
const isHere = p => !!p && seatControl(p) === "here";
// The seat drawn at the bottom of the table: the one person here, or (two players on one device)
// whoever's turn it is.
function viewIdx() {   // asked for every card on every redraw, so it builds no lists
  const [a, b] = S.players, ha = isHere(a), hb = isHere(b);
  return ha && !hb ? 0 : hb && !ha ? 1 : S.active;
}

// ---------------------------------------------------------------------------
// Kinds of match, in one place. matchType() names the match being played; its row says how the
// screen treats it. A new kind of match (a shake-up mode, Play a Friend) is one new row here.
//   curtain    the "pass the device" screen between turns (two players on one device)
//   progress   counts toward mastery, each deck's record, trophies and first-win badges
//   speech     the computer's champion speaks during the match
//   coached    the tutorial runs the match: no hints, no drawing by itself, no "pass early?"
//              question, no end screen or final-blow effect, and the Trainer's moves are scripted
// ---------------------------------------------------------------------------
const MATCH_TYPES = {
  ai:       { curtain: false, progress: true,  speech: true,  coached: false },   // Quick Match
  campaign: { curtain: false, progress: true,  speech: true,  coached: false },
  hotseat:  { curtain: true,  progress: false, speech: false, coached: false },   // Two Players
  tutorial: { curtain: false, progress: false, speech: false, coached: true },
};
// (The tutorial's own layout, its coach panel and its game menu, still ask U.tutorial directly:
// those are about the tutorial's screen, not about how a kind of match behaves.)
const matchType = () => (U.tutorial ? "tutorial" : U.campaign ? "campaign" : S?.mode || "ai");
const matchRule = key => !!MATCH_TYPES[matchType()]?.[key];

// A piece's place (and size, when it has one) from L, as a style.
const boxStyle = b => `left:${b.x}px;top:${b.y}px` + (b.w ? `;width:${b.w}px;height:${b.h}px` : "");

// Heavy effects off (Settings): the html element gets "light-fx", and css/style.css stops the
// looping background effects. js/storm.js holds the menu's falling shards still too.
const applyHeavyFx = () => document.documentElement.classList.toggle("light-fx", !U.heavyFx);

// Dozing: after DOZE_MS with no input and nothing happening, every looping effect pauses
// (html.doze in css/style.css; js/storm.js stops the menu's falling shards), so a device can
// rest while the player thinks. Any input, or any game event (the computer's moves), wakes it.
const DOZE_MS = 20000;
let dozeTimer = 0;
function wake() {
  if (document.documentElement.classList.contains("doze")) {
    document.documentElement.classList.remove("doze");
    if (U.screen === "menu") storm.start();
  }
  clearTimeout(dozeTimer);
  dozeTimer = setTimeout(() => {
    document.documentElement.classList.add("doze");
    storm.stop();
  }, DOZE_MS);
}
for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) addEventListener(ev, wake, { passive: true });
onGameEvent(() => wake());
setTimeout(wake, 0);   // start counting once every script has loaded

// The board is drawn in regions (the scenery, each player's plate, each side of the table, the
// middle band, the buttons, the log, the end screen). render() marks where each region starts
// with RG(name); a region whose HTML is the same as last time is not touched at all. Each region
// is a wrapper that takes no space of its own (display: contents), so the pieces inside are laid
// out on the board exactly as before.
const RG = name => `\u0000${name}\u0000`;
function renderRegions(board, h) {
  const parts = h.split("\u0000");   // [scenery, name, html, name, html, ...]
  const regions = [["scenery", parts[0]]];
  for (let i = 1; i < parts.length; i += 2) regions.push([parts[i], parts[i + 1] || ""]);
  if (board.dataset.regions !== regions.map(r => r[0]).join(",")) {
    board.innerHTML = regions.map(([name]) => `<div class="rg" data-rg="${name}"></div>`).join("");
    board.dataset.regions = regions.map(r => r[0]).join(",");
  }
  for (const [name, html] of regions) {
    const box = board.querySelector(`:scope > [data-rg="${name}"]`);
    if (box.__src === html) continue;
    box.__src = html;
    patchChildren(box, html);
  }
}

// Redraws a container from new HTML, but keeps every piece that hasn't changed. The board is
// described from scratch after every move; rebuilding all of it made the browser restyle and
// lay out every card each time, which was slow on phones. Each top-level piece is matched by
// its card (data-uid) or its kind and order, and is only replaced when its HTML differs.
// A kept piece also keeps any animation it is in the middle of.
function patchChildren(box, html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const keyOf = (el, seen) => {
    const base = (el.className && typeof el.className === "string" ? el.className.split(" ")[0] : el.tagName) + (el.dataset?.uid ? ":" + el.dataset.uid : el.dataset?.player ? ":p" + el.dataset.player : "");
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return base + "#" + n;
  };
  const old = new Map();
  { const seen = new Map(); for (const el of box.children) old.set(keyOf(el, seen), el); }
  const seen = new Map(), keep = new Set();
  const want = [...tpl.content.children].map(el => {
    const html = el.outerHTML, o = old.get(keyOf(el, seen));
    if (o && o.__html === html && !keep.has(o)) { keep.add(o); return o; }
    el.__html = html;
    return el;
  });
  for (const el of [...box.children]) if (!keep.has(el)) el.remove();
  want.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
}

// The screen state: everything the screen remembers that isn't the game itself (that is S). EVERY
// field is listed here with its starting value, even ones only one file uses, so this is the one
// place to see what U holds. Add a new field here, not with a first "U.x = ..." in another file.
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
  skin: PREFS.get("looks") === 3 ? PREFS.get("board", "crystal") : "crystal",   // board look: crystal, glass, altar, battlefield or warmap (chosen in Settings)
  turnColor: null,       // player whose color the turn crystal shows (it changes when the falling shard lands)
  manaSeen: [], manaSpent: [],   // last mana shown per player, and crystals just spent
  lungeVec: new Map(),   // uid -> how far an attacker swoops toward its target
  arriving: new Map(),   // uid -> until when a showcased card is still on its way to the table
  busyUntil: 0,          // the computer waits for big animations to finish (js/fx.js)
  stats: null, endBadges: [], dragAttackAt: 0, lungeAt: 0,
  turnLandedAt: 0,
  hints: PREFS.get("hints", true),
  showLog: PREFS.get("showLog", true),     // the battle log panel on the table (Settings)
  autoFlow: PREFS.get("autoFlow", true),   // draw automatically, skip a Battle with nothing to do (Settings)
  passCheck: PREFS.get("passCheck", true), // ask before passing with moves left (Settings)
  // the always-on looping effects (Settings). Phones and tablets start with them off: they make
  // a phone redraw the screen all the time, which warms it up. A player's own choice is kept.
  heavyFx: PREFS.get("heavyFx", !matchMedia("(pointer: coarse)").matches),
  aiSpeed: PREFS.get("aiSpeed", "normal"), // how fast the computer plays: slow, normal or fast (Settings)
  logAt: new Map(),      // log line -> when it was written, so new lines light up
  myTurnAt: 0,           // when your turn began, for the "your turn" moment
  hintOpen: true,
  hintNoteUntil: 0,
  // The menus (js/menu.js, js/campaign.js)
  menuView: "home",      // the start menu's view: "home" (the three doors) or "setup" (choosing decks)
  setupMode: "ai",       // what the deck choice is for: "ai", "hotseat", "campaign" or "decks"
  oppDeckId: PREFS.get("opp", "random"),   // the other side's deck: "random" or a deck id
  lastOpp: undefined,    // the opponent of the last Quick Match, for "Play again" (undefined: random)
  campaign: null,        // the campaign stage being played, { stage }, or null
  almanacTribe: undefined, almanacClass: undefined,   // the Almanac's Tribe and Class filters (undefined: All)
  // The screen's size (fitStage in this file)
  small: false,          // a small screen: the hand is drawn bigger
  phone: false,          // a phone held sideways: the table is cropped to fit
  dock: null,            // where the tutorial's coach box sits beside the table, or null
  // The table's moments, for effects (js/board.js, js/board-marks.js, js/fx.js, js/table-effects.js)
  crackAt: [0, 0],       // per player: when a big hit last cracked their life crystal
  hist: [], recentLog: [],   // the turn history, and log lines just written (for it)
  clash: null,           // the fight going on now: { at, swift, n, uids }
  lastAttacker: null, lastTarget: null, lungeWind: 0,   // the last attack: who, at whom, its wind-up
  multiAttack: false,    // "All attack" is running (no wind-ups between attackers)
  finalHero: null,       // uid of the character that dealt the winning blow
  shardFellAt: 0, shardHitAt: 0,   // when the big shard landed, and was last hit
  scar: null,            // the cracked table under the big shard, drawn once a match: { game, paths }
  flowTimer: 0,          // the automatic draw or skip waiting to happen (Settings: auto flow)
  // The end of a match (js/progress.js)
  masteryGain: null,     // mastery the deck earned this match
  newLore: [], newTrophies: [],   // card stories and trophies unlocked this match
};
applyHeavyFx();

// ---------------------------------------------------------------------------
// Actions (every human action goes through act() so it can be undone)
// ---------------------------------------------------------------------------
function act(fn) {
  const snap = structuredClone(S);
  snap.histLen = U.hist.length;   // an undo also takes back the turn history after this point
  const ok = fn();
  if (ok !== false) { U.undo.push(snap); if (U.undo.length > 25) U.undo.shift(); }
  afterAction();
  return ok;
}
function afterAction() {
  render();
  scheduleAI();
}
// How fast the computer plays (Settings). Each of its moves waits this many times the base pause.
const AI_SPEEDS = { slow: { name: "Slow", k: 2 }, normal: { name: "Normal", k: 1.4 }, fast: { name: "Fast", k: 0.7 } };
if (!AI_SPEEDS[U.aiSpeed]) U.aiSpeed = "normal";
function scheduleAI() {
  clearTimeout(U.aiTimer);
  const aiChoice = S?.pending && S.players[S.pending.owner].isAI;
  if (!S || S.over || !(active().isAI || aiChoice) || U.screen !== "game" || matchRule("coached")) return;
  const wait = Math.max(0, U.busyUntil - performance.now());
  U.aiTimer = setTimeout(() => {
    if (U.busyUntil > performance.now()) { scheduleAI(); return; }
    const d = aiDecide();   // js/ai.js: what it will do, not done yet
    const go = () => { const more = d.run(); render(); if (more || active().isAI) scheduleAI(); };
    const ms = d.aim ? aiAim(d.aim) : 0;   // it points at its target first (js/fx.js)
    if (!ms) { go(); return; }
    const game = S;
    U.aiTimer = setTimeout(() => { clearAiAim(); if (S === game && U.screen === "game") go(); }, ms);
  }, (S.phase === PHASE.DRAW ? 900 : 750) * AI_SPEEDS[U.aiSpeed].k + wait);
}

// The screen's state for one match, cleared before a new one (a match, the campaign or the tutorial).
// A new per-match field in U is reset here.
function resetMatchScreen() {
  clearTimeout(U.aiTimer);
  Object.assign(U, { selected: null, armed: null, curtain: false, ended: false, undo: [], turnColor: null });
  U.spawn.clear(); U.hits.clear(); U.lunges.clear(); U.drawn.clear();
}

// Who is taking its turn, as a sentence starts: "The computer", or a champion's or the Trainer's name.
const thinkerName = p => (p.name === COMPUTER_NAME ? "The computer" : p.name);

// opts.opponentDeckId and opts.foeChampion are used by the campaign (js/campaign.js).
function startGame(opts = {}) {
  if (deckProblem(U.deckId)) { showScreen("menu"); return; }
  endTutorial();
  resetMatchScreen();
  U.campaign = opts.campaign ?? null;
  newGame({ deckId: U.deckId, opponentDeckId: opts.opponentDeckId, mode: U.campaign ? "ai" : U.mode, foeChampion: opts.foeChampion });
  showScreen("game");
  if (matchRule("curtain")) U.curtain = true; else banner("Your turn");
  if (matchType() === "ai" && matchRule("speech")) championMatchStarts();   // the computer's champion speaks (js/campaign.js; the campaign starts it itself)
  render();
}

function onPhaseButton() {
  if (!humanTurn() || S.pending || U.armed) return;
  U.selected = null;
  if (S.phase === PHASE.DRAW) {
    if (!active().deck.length) { act(() => move("deckOut")); return; }
    act(() => move("draw"));
  } else if (S.phase === PHASE.END) passTurn();
  else act(() => move("next"));
}

// Passing early: with "Ask before passing early" on (Settings), passing while you could still
// play a card or attack asks once first.
function passTurn() {
  const p = active();
  const playable = S.phase === PHASE.SETUP ? p.hand.filter(c => canPlay(c, p)).length : 0;
  const ready = S.phase <= PHASE.BATTLE ? p.field.chars.filter(c => !c.hasAttacked && !skillNow(c, "Tower")).length : 0;
  if (!U.passCheck || matchRule("coached") || (!playable && !ready)) { act(() => move("end")); return; }
  const left = [playable && `${p.mana} mana and ${playable} card${playable > 1 ? "s" : ""} you can play`, ready && `${ready} character${ready > 1 ? "s" : ""} that can still attack`].filter(Boolean).join(", and ");
  openModal(`<h2 id="modal-title">Pass your turn?</h2><p>You still have ${esc(left)}.</p>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-close>Keep playing</button><button type="button" class="btn" data-m="passok">Pass turn</button></div>
    <p class="modal-note"><button type="button" class="link-btn" data-m="passnever">Don't ask me again</button> (you can turn it back on in Settings)</p>`);
}

// Draw and skip by themselves (Settings): your card is drawn for you a moment after your turn
// begins, and a Battle where nothing can attack moves on to the End step. Rechecked after every
// redraw; any move of yours cancels the wait.
function autoFlow() {
  clearTimeout(U.flowTimer);
  if (!U.autoFlow || matchRule("coached") || !S || S.over || U.ended || !humanTurn() || S.pending || U.armed || !$("#modal").hidden) return;
  const p = active();
  if (S.phase === PHASE.DRAW) U.flowTimer = setTimeout(() => { if (humanTurn() && S.phase === PHASE.DRAW && !S.pending && $("#modal").hidden) onPhaseButton(); }, 700);
  else if (S.phase === PHASE.BATTLE && !p.field.chars.some(c => canAttack(c) || canUseBlade(c)) && !p.hand.some(c => canPlay(c, p))) {
    U.flowTimer = setTimeout(() => {
      if (!humanTurn() || S.phase !== PHASE.BATTLE || S.pending) return;
      floatText(720, 345, "Nothing can attack: Battle skipped", "#cfd8ff", true);
      act(() => move("next"));
    }, 650);
  }
}

// "All attack": the rules are in js/engine.js. The blows come in one rush, without wind-ups,
// and one Undo takes the whole attack back.
function attackAllFaceMove() {
  U.multiAttack = true;
  try { return move("allFace"); } finally { U.multiAttack = false; }
}

// With two or more guards (Challenge or Tower) the attacker's player picks which one to hit.
// The rules send an attack aimed anywhere else to the first guard, which is right when there
// is only one. With several, that took the choice away, so such a tap now asks for a guard.
function mustPickGuard(target) {
  const g = guards(opponent());
  if (g.length < 2 || g.includes(target)) return false;
  banner("Choose a guard to attack");
  return true;
}

function clickChar(uid) {
  const human = humanTurn();
  const found = findChar(uid);
  if (!found) return;
  if (humanTarget()) {
    if (isValidTarget({ uid })) act(() => move("target", { uid }));
    return;
  }
  if (human && U.armed) {
    if (found.p === active()) {
      const { uid: eq, from } = U.armed;
      U.armed = null;
      act(() => from === "field" ? move("attach", eq, uid) : move("play", eq, { target: { uid } }));
    }
    return;
  }
  if (human && S.phase === PHASE.BATTLE) {
    if (found.p === active() && canAttack(found.c)) { U.selected = U.selected === uid ? null : uid; render(); return; }
    if (found.p !== active() && U.selected) {
      if (mustPickGuard(found.c)) return;
      const a = U.selected; U.selected = null;
      act(() => move("attack", a, uid));
      return;
    }
  }
  showDetail(found.c, { field: true });
}

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
// The table covers the part of the page actually on screen (the visual viewport). Phone
// browsers can show less than the whole page: when it was zoomed in on the menu, or for a
// moment after rotating. Sizing to the whole page then pushed half the board off screen.
function fitGameToScreen() {
  const vv = window.visualViewport;
  if (!vv) return;
  Object.assign($("#game").style, {
    top: vv.offsetTop + "px", left: vv.offsetLeft + "px", right: "auto", bottom: "auto",
    width: vv.width + "px", height: vv.height + "px", minHeight: "0",
  });
}

function fitStage() {
  fitGameToScreen();
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
  // Phone held sideways: the strips along the top and bottom of the table (health, mana,
  // Menu, Pass turn) are cut off, so the rest of the table can be drawn bigger. Health and
  // mana move into the space at the left (renderSideInfo) and the buttons to the right.
  let cropTop = 0, cropH = H;
  U.phone = false;
  if (U.small && !U.tutorial && w > h) {
    const s = Math.min(w / W, h / PHONE_CROP.h);
    if ((w - W * s) / 2 >= 100) { U.phone = true; U.scale = s; cropTop = PHONE_CROP.top; cropH = PHONE_CROP.h; }
  }
  $("#stage").classList.toggle("small", U.small);
  $("#stage-wrap").classList.toggle("phone", U.phone);
  // How big 44 screen pixels (a comfortable thumb) is in the table's own units. The board is
  // shrunk to fit a phone, so its little buttons borrow this for an invisible bigger tap area.
  document.documentElement.style.setProperty("--tap", (44 / U.scale).toFixed(1) + "px");
  $("#stage").style.transform = `translate(${(bw - W * U.scale) / 2}px, ${(bh - cropH * U.scale) / 2 - cropTop * U.scale}px) scale(${U.scale})`;
}
// Phones resize the page when the browser bars slide in and out, and on rotation.
function onResize() {
  if (U.screen !== "game") return;
  const was = U.small;
  fitStage();
  if (U.small !== was && S) render();   // the hand and the cards are drawn differently on a phone
  else renderOverlays();
}
window.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("scroll", onResize);
// Some phones report the new size a moment after they finish rotating.
window.addEventListener("orientationchange", () => { onResize(); setTimeout(onResize, 300); setTimeout(onResize, 800); });
// iPhone browsers allow pinch zoom even when the page asks not to; block it on the table.
document.addEventListener("gesturestart", e => { if (U.screen === "game") e.preventDefault(); });
