// Shardfall interface: board rendering, input, dialogs and effects (menu: js/menu.js, storm.js).
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
};

const $ = sel => document.querySelector(sel);
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
};
applyHeavyFx();

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

// The big shard ("The big shard fall" in js/engine.js): a tall crystal in the middle band, left of
// the phases, glowing purple, blue and green. It cracks more as it loses health. When it lands, the
// table cracks open from that spot and stays cracked, glowing, for the rest of the match.
const SHARD_AT = { x: 365, y: 398 };
const SHARD_BODY = "M40 2 L66 30 L60 92 L40 118 L20 92 L14 30 Z";
const SHARD_FACETS = "M14 30 L40 44 L66 30 M40 44 L40 118 M20 92 L40 44 L60 92";
const SHARD_CRACKS = ["M40 4 L35 18 L42 27 L37 38", "M64 33 L53 41 L57 53 L50 60", "M16 40 L27 49 L22 62 L30 70", "M44 70 L52 80 L45 92 L50 104", "M24 88 L31 96 L27 106"];
function shardHTML(human) {
  const sh = S.shard;
  if (!sh) return "";
  const now = performance.now(), cracks = Math.round((1 - sh.health / sh.max) * SHARD_CRACKS.length);
  const landing = now - (U.shardFellAt || 0) < 1300, hit = now - (U.shardHitAt || 0) < 400;
  const attackable = human && U.selected != null && S.phase === PHASE.BATTLE && !S.pending;
  return `<button type="button" class="shard-rock${attackable ? " attackable" : ""}${landing ? " landing" : ""}${hit ? " hit" : ""}" data-act="shard"
    style="left:${SHARD_AT.x - 40}px;top:${SHARD_AT.y - 66}px;--age:-${landing ? (now - U.shardFellAt).toFixed(0) : 0}ms" aria-label="The big shard: ${sh.health} of ${sh.max} health. Break it to claim it.">
    <svg viewBox="0 0 80 120" aria-hidden="true"><defs><linearGradient id="shard-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c58cff"/><stop offset="0.5" stop-color="#5fb8ff"/><stop offset="1" stop-color="#5dffb5"/></linearGradient></defs>
      <path class="sr-body" d="${SHARD_BODY}"/><path class="sr-facet" d="${SHARD_FACETS}"/>${SHARD_CRACKS.slice(0, cracks).map(d => `<path class="sr-crack" d="${d}"/>`).join("")}</svg>
    <b class="sr-hp">${sh.health}</b></button>`;
}
// The cracks in the table: drawn once per match from the match seed, so they don't jump around.
function scarPaths() {
  if (U.scar?.game === S) return U.scar.paths;
  let seed = (S.seed % 2147483646) + 1;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const paths = [];
  const crack = (x, y, ang, len, width, depth) => {
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`, walked = 0;
    while (walked < len && x > -20 && x < W + 20 && y > -20 && y < H + 20) {
      ang += (rnd() - 0.5) * 0.9;
      const step = 30 + rnd() * 50;
      x += Math.cos(ang) * step; y += Math.sin(ang) * step * 0.8; walked += step;
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
      if (depth < 2 && rnd() < 0.22) crack(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6), len * 0.35, width * 0.6, depth + 1);
    }
    paths.push({ d, w: width.toFixed(1), k: paths.length });
  };
  for (let i = 0; i < 11; i++) crack(SHARD_AT.x, SHARD_AT.y, (i / 11) * Math.PI * 2 + rnd() * 0.4, 700 + rnd() * 700, 3.2, 0);
  U.scar = { game: S, paths };
  return paths;
}
function scarHTML() {
  if (!S.shardFell) return "";
  const age = performance.now() - (U.shardFellAt || 0);
  return `<svg class="shard-scar${age < 2200 ? " forming" : ""}" viewBox="0 0 ${W} ${H}" style="--age:-${Math.min(age, 2200).toFixed(0)}ms" aria-hidden="true">
    <defs><linearGradient id="scar-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset="0" stop-color="#b45cff"/><stop offset="0.45" stop-color="#4fb8ff"/><stop offset="1" stop-color="#4dffa6"/></linearGradient>
    <radialGradient id="scar-glow" cx="${SHARD_AT.x / W}" cy="${SHARD_AT.y / H}" r="0.75"><stop offset="0" stop-color="#9a6bff" stop-opacity="0.32"/><stop offset="0.5" stop-color="#3fa0ff" stop-opacity="0.12"/><stop offset="1" stop-color="#3dffa0" stop-opacity="0.04"/></radialGradient></defs>
    <rect class="scar-tint" width="${W}" height="${H}" fill="url(#scar-glow)"/>
    ${scarPaths().map(p => `<path class="scar-glow" d="${p.d}" pathLength="1" style="stroke-width:${p.w * 4};--k:${p.k}"/><path class="scar-line" d="${p.d}" pathLength="1" style="stroke-width:${p.w};--k:${p.k}"/>`).join("")}</svg>`;
}
function showShard() {
  const sh = S.shard;
  if (!sh) return;
  openModal(`<h2 id="modal-title">The big shard</h2>
    <p class="sub">${sh.health} of ${sh.max} health</p>
    <p>It fell into the middle of the table in round ${RULES.shardRound}. In your Battle phase, any of your characters can attack it. It never hits back, and Challenge and Tower don't protect it. Spells can't touch it.</p>
    <p>Its health is shared. <b>Whoever deals the blow that breaks it claims it</b>: you draw ${RULES.shardDraw === 1 ? "a card" : RULES.shardDraw + " cards"} and get your champion's shard bonus. A deck with no champion draws ${RULES.shardDrawNoChamp} cards instead.</p>
    <ul>${Object.keys(SHARD_BONUS).filter(id => DATA.cardsById[id]).map(id => `<li><b>${esc(DATA.cardsById[id].name)}</b>: ${esc(SHARD_BONUS_TEXT[id])}</li>`).join("")}</ul>
    <div class="detail-actions" style="margin-top:16px"><button type="button" class="btn btn-small" data-close>Close</button></div>`);
}
const SHARD_BONUS_TEXT = {
  the_simplistic: "all your characters are fully healed.",
  the_man_ape: "a free 2/2 Monkey (a Chimp with +1 Attack).",
  ip_man: "your strongest character gets Swift for the rest of the match.",
  boss_level: "Boss Level jumps to its next phase.",
  soul_shepard: "your last fallen character comes back to your hand.",
};

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
// A champion's ability (data/champion_abilities.csv, "Champion abilities" in js/engine.js): its name,
// level and progress toward leveling up, shown under the player's name. Tap it for the details.
function champInfo(p) {
  const ch = p.champ;
  if (!ch) return null;
  const info = DATA.championAbilities[ch.id];
  const grows = !info.goal;   // no levels: Chest Thump, Boss Phases, Soul Shepard (see champStatus in js/engine.js)
  if (grows) { const st = champStatus(p); return { info, ch, grows, progress: st.text, lit: st.lit, label: info.name }; }
  const n = ch.id === "the_simplistic" ? p.manaMax : ch.n;
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

// Protected, seen as a shell of light-blue shards around the health gem: the shards you hold
// guard you. The shell is 24 shards in three rings (a geode, not a tech bubble). It snaps
// together when you become Protected, a shard chips off and grows back when a hit is halved,
// and the shell breaks apart when you lose it.
const WARD = (() => {
  const J = [0.06, -0.08, 0.05, -0.04, 0.09, -0.06];   // fixed wobble so the facets look hand-cut
  const pt = (k, r) => { const a = (-90 + 60 * k) * Math.PI / 180; return [Math.cos(a) * 34 * r, Math.sin(a) * 40 * r]; };
  const mid = (k, r) => { const a = (-60 + 60 * k) * Math.PI / 180; return [Math.cos(a) * 34 * r, Math.sin(a) * 40 * r]; };
  const V = k => pt(k % 6, 1), M = k => mid(k % 6, 0.93 + J[k % 6] * 0.5), I = k => pt(k % 6, 0.5 + J[(k + 2) % 6]), C = [1.5, -2];
  const tris = [];
  for (let k = 0; k < 6; k++) tris.push([V(k), M(k), I(k)], [M(k), V(k + 1), I(k + 1)], [M(k), I(k + 1), I(k)], [C, I(k), I(k + 1)]);
  return tris.map(t => {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, l = Math.hypot(cx, cy) || 1;
    return { d: "M" + t.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z", fx: (cx / l * 34).toFixed(0), fy: (cy / l * 34).toFixed(0) };
  });
})();
const wardState = { on: [], at: [], hitAt: [], hits: [] };
function wardHTML(p) {
  if (wardState.game !== S) Object.assign(wardState, { game: S, on: [], at: [], hitAt: [], hits: [] });   // a new match starts clean
  const i = p.idx, on = isProtected(p), now = performance.now();
  if (on && !wardState.on[i]) wardState.at[i] = now;
  else if (!on && wardState.on[i]) wardBreak(i);
  wardState.on[i] = on;
  if (!on) return "";
  const forming = now - (wardState.at[i] || 0) < 1100, hit = now - (wardState.hitAt[i] || 0) < 1100;
  const age = forming ? now - wardState.at[i] : hit ? now - wardState.hitAt[i] : 0;
  const chip = (wardState.hits[i] || 0) * 7 % WARD.length;
  return `<svg class="ward${forming ? " forming" : ""}${hit ? " hit" : ""}" viewBox="-40 -46 80 92" style="--age:-${age.toFixed(0)}ms" aria-hidden="true">${WARD.map((s, k) =>
    `<path class="s${hit && k === chip ? " chip" : ""}" d="${s.d}" style="--i:${k};--fx:${s.fx}px;--fy:${s.fy}px"/>`).join("")}</svg>`;
}
// A halved hit: the shell flashes and one shard chips off, then grows back.
function wardHit(i) {
  wardState.hitAt[i] = performance.now();
  wardState.hits[i] = (wardState.hits[i] || 0) + 1;
  const el = document.querySelector(`.plate[data-player="${i}"] .life`);
  const old = el?.querySelector(".ward");
  if (old) old.outerHTML = wardHTML(S.players[i]);
}
// The shell breaks: its shards fall away from the gem.
function wardBreak(i) {
  if (REDUCED_MOTION || !S) return;
  const at = LIFE_CRYSTAL(i);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 40 + Math.random() * 50;
    fxDiv("life-chip", `left:${at.x + Math.cos(a) * 26}px;top:${at.y + Math.sin(a) * 30}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r + 40}px;--r:${(Math.random() - 0.5) * 540}deg;--c:${k % 2 ? "#dff6ff" : "#8fd8ff"};--s:${0.5 + Math.random() * 0.6}`, 900);
  }
}

// A card with the Protected skill: a ring of glowing blue runes travels around it. The runes are
// drawn here (not a font), so every device shows the same shapes. The ring is 9px outside the
// card (95 x 135); its timing comes from the clock, so redrawing the table doesn't restart it.
const RUNES = ["M2 1v8M2 3l5-2M2 6l5-2", "M2 9V1l5 4-5 4", "M5 1v8M1 3l4 2 4-2M2 9l3-3 3 3", "M1 1l8 8M9 1L1 9M5 1v2M5 7v2",
  "M2 1v8h6M2 5l6-4", "M1 9l4-8 4 8M3 6h4", "M5 1L1 5l4 4 4-4zM5 3v4", "M2 1h6M5 1v8M2 9h6M2 5h6"];
const RING_PATH = "M15 3H98A12 12 0 0 1 110 15V138A12 12 0 0 1 98 150H15A12 12 0 0 1 3 138V15A12 12 0 0 1 15 3Z";
const RING_N = 18, RING_S = 18;   // runes on the ring, seconds per lap
function runeRingHTML(flash) {
  const ph = -(performance.now() % (RING_S * 1000)) / 1000;
  const runes = Array.from({ length: RING_N }, (_, k) =>
    `<i style="animation-delay:${(ph - k * RING_S / RING_N).toFixed(2)}s"><svg viewBox="0 0 10 10"><path d="${RUNES[k % RUNES.length]}"/></svg></i>`).join("");
  return `<div class="rune-ring${flash ? " flash" : ""}" style="--ph:${ph.toFixed(2)}s" aria-hidden="true">
    <svg class="track" viewBox="0 0 113 153"><path class="t" d="${RING_PATH}"/><path class="sweep" pathLength="100" d="${RING_PATH}"/><path class="sweep two" pathLength="100" d="${RING_PATH}"/></svg>${runes}</div>`;
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
    <div class="who"><span class="name">${esc(p.name)}${hpBarHTML(p)}${thinking ? `<i class="thinking-dots" aria-label="thinking"><b></b><b></b><b></b></i>` : ""}</span><em>${esc(p.deckLabel ?? p.faction + " deck")} · ${Math.max(0, p.health)} / ${p.maxHealth} health</em>${champLine(p)}${protLine(p)}</div>
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
    const blade = side === "bottom" && human && canUseBlade(c) ? `<button type="button" class="blade-btn" data-act="blade" data-uid="${c.uid}" title="Kenshi's Blade: deal 3 damage to an enemy character, once per Battle">⚔ Strike 3</button>` : "";
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
    h += `<div class="curtain"><p>Pass the device to</p><h2>${esc(active().name)}</h2><p>${esc(active().deckLabel ?? active().faction + " deck")} · Round ${S.round}</p>${eventLine() ? `<p>${esc(eventLine().when)}: ${esc(eventLine().name)}. ${esc(eventLine().desc)}</p>` : ""}<button type="button" class="btn btn-primary" data-act="curtain">Start turn</button></div>`;
  } else if (U.ended && !U.tutorial) {
    const title = S.winner == null ? "A draw" : S.mode === "ai" ? (S.winner === 0 ? "Victory" : "Defeat") : `${S.players[S.winner].name} wins`;
    const sub = S.winner == null ? "Both players fell at once." : `${S.players[S.winner].name} wins in round ${S.round}.`;
    const camp = U.campaign ? campaignEndHTML(S.winner === 0) : null;
    const actions = camp ? camp.actions : `<button type="button" class="btn btn-primary" data-act="again">Play again</button><button type="button" class="btn" data-act="tomenu">Main menu</button>`;
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
    <div class="full-log">${S.log.map((m, i) => `<p${i === S.log.length - 1 ? ' class="last"' : ""}>${esc(m)}</p>`).join("") || "<p>Nothing has happened yet.</p>"}</div>
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
    // Wording for the special rules (js/engine.js), then the general cases.
    const redirect = pd.amount != null;
    const what = pd.source.id === "data_transfer" ? "one of your characters to lose a Level (you gain 2 HP)"
      : redirect ? `an enemy character or player to take the ${pd.amount} damage instead`
      : cardRule(pd.source, "strike") ? "an enemy character to take 3 damage"
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
  if (!S || S.over || !(active().isAI || aiChoice) || U.screen !== "game" || U.tutorial) return;
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

// opts.opponentDeckId and opts.foeChampion are used by the campaign (js/campaign.js).
function startGame(opts = {}) {
  if (deckProblem(U.deckId)) { showScreen("menu"); return; }
  endTutorial();
  clearTimeout(U.aiTimer);
  Object.assign(U, { selected: null, armed: null, curtain: false, ended: false, undo: [], turnColor: null });
  U.spawn.clear(); U.hits.clear(); U.lunges.clear(); U.drawn.clear();
  U.campaign = opts.campaign ?? null;
  newGame({ deckId: U.deckId, opponentDeckId: opts.opponentDeckId, mode: U.campaign ? "ai" : U.mode, foeChampion: opts.foeChampion });
  showScreen("game");
  if (S.mode === "hotseat") U.curtain = true; else banner("Your turn");
  if (!U.campaign && S.mode === "ai") championMatchStarts();   // the computer's champion speaks (js/campaign.js)
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
  const ready = S.phase <= PHASE.BATTLE ? p.field.chars.filter(c => !c.hasAttacked && !hasSkill(c, "Tower")).length : 0;
  if (!U.passCheck || U.tutorial || (!playable && !ready)) { act(() => move("end")); return; }
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
  if (!U.autoFlow || U.tutorial || !S || S.over || U.ended || !humanTurn() || S.pending || U.armed || !$("#modal").hidden) return;
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

// With two or more guards (Challenge or Tower) the attacker's player picks which one to hit.
// The rules send an attack aimed anywhere else to the first guard, which is right when there
// is only one. With several, that took the choice away, so such a tap now asks for a guard.
// "All attack": the rules are in js/engine.js. The blows come in one rush, without wind-ups,
// and one Undo takes the whole attack back.
function attackAllFaceMove() {
  U.multiAttack = true;
  try { return move("allFace"); } finally { U.multiAttack = false; }
}

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
  drag = { uid, el, start: stagePoint(e), moved: false, pointerId: e.pointerId, tilt: 0 };
  el.classList.add("held");   // the card lifts toward you as soon as you touch it
  el.setPointerCapture?.(e.pointerId);
}
// Where a card being dragged can go: the frontline for characters, the backline for
// areas and equipment, anywhere on the table for spells.
function dropZone(c) {
  if (c.type === "Character") return { left: 720 - L.frontW / 2 - 12, top: L.bottom.chars - 8, width: L.frontW + 24, height: FIELD_H + 16 };
  if (c.type === "Spell") return { left: 24, top: 70, width: 1392, height: 650 };
  return { left: L.backX - 8, top: L.bottom.backline - 8, width: RULES.maxBackline * L.slot + 6, height: BACK_H + 16 };
}
// While a card is dragged, the spots it can go light up: the border of your front row for a
// character, your empty back-row slots for an area or equipment (and your characters, which
// equipment can also go on). They are stage classes, so a redraw mid-drag keeps them.
const PLACING = ["placing-char", "placing-back", "placing-equip", "placing-off"];
function setPlacing(c) {
  const st = $("#stage");
  st.classList.remove(...PLACING);
  if (!c) return;
  const p = active();
  if (c.type === "Character") st.classList.add("placing-char");
  if ((c.type === "Area" || c.type === "Equipment") && backlineCount(p) < RULES.maxBackline) st.classList.add("placing-back");
  if (c.type === "Equipment" && p.field.chars.length) st.classList.add("placing-equip");
}
function handMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const pt = stagePoint(e);
  if (!drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) > 8) {
    const c = active().hand.find(x => x.uid === drag.uid);
    if (humanTurn() && c && !drag.nudged && /^Needs \d+ mana/.test(playBlocker(c) || "")) { drag.nudged = true; nudgeMana(active().idx); }
    if (!humanTurn() || !c || !canPlay(c)) return;
    drag.moved = true;
    drag.card = c;
    drag.el.classList.add("dragging");
    drag.ghost = document.createElement("div");
    drag.ghost.className = "ghost";
    drag.ghost.innerHTML = cardHTML(c, { costOverride: playCost(c) });
    $("#stage").appendChild(drag.ghost);
    if (c.type === "Spell") {   // a spell can be let go of anywhere on the table
      drag.hint = document.createElement("div");
      drag.hint.className = "drop-hint spell";
      for (const [k, v] of Object.entries(dropZone(c))) drag.hint.style[k] = v + "px";
      $("#stage").appendChild(drag.hint);
    } else setPlacing(c);   // the spots it can go light up
    drag.last = pt;
  }
  if (drag.moved) {
    drag.ghost.style.left = pt.x - CARD_W / 2 + "px";
    drag.ghost.style.top = pt.y - CARD_H / 2 + "px";
    // the card leans the way it is moving, and settles when it stops
    drag.tilt = Math.max(-16, Math.min(16, drag.tilt * 0.6 + (pt.x - drag.last.x) * 0.5));
    drag.last = pt;
    drag.ghost.style.transform = `scale(1.12) rotate(${drag.tilt.toFixed(1)}deg)`;
    // back over the hand, letting go puts the card back
    const back = pt.y >= 740;
    drag.ghost.classList.toggle("invalid", back);
    drag.hint?.classList.toggle("off", back);
    $("#stage").classList.toggle("placing-off", back);
  }
}
function handUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag; drag = null;
  d.ghost?.remove(); d.hint?.remove(); setPlacing(null);
  d.el.classList.remove("dragging", "held");
  if (!d.moved) {
    const c = S.players[viewIdx()].hand.find(x => x.uid === d.uid);
    if (c) showDetail(c, { hand: true });
    return;
  }
  const pt = stagePoint(e);
  dropSpot(d.uid, pt);
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const charEl = under?.closest('.field-card[data-side="bottom"]');
  const c = d.card;
  if (c.type === "Equipment") {
    const inEquipRow = pt.x >= L.backX - 10 && pt.x <= L.backX + RULES.maxBackline * L.slot && pt.y >= L.bottom.backline - 10 && pt.y <= L.bottom.backline + BACK_H + 10;
    if (charEl) act(() => move("play", c.uid, { target: { uid: Number(charEl.dataset.uid) } }));
    else if (inEquipRow) act(() => move("play", c.uid, { toField: true }));
    else if (pt.y < 740 && active().field.chars.length) { U.armed = { uid: c.uid, from: "hand" }; render(); }
    else render();
  } else if (pt.y < 740) act(() => move("play", c.uid));
  else render();
}

// ---------------------------------------------------------------------------
// Board input
// ---------------------------------------------------------------------------
$("#board").addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || !S) return;
  if (performance.now() - U.dragAttackAt < 400) return;   // the release of a drag-to-attack
  const a = el.dataset.act;
  const uid = Number(el.dataset.uid);
  const human = humanTurn();
  if (a === "menu") return showGameMenu();
  if (a === "curtain") { U.curtain = false; yourTurnMoment(); render(); const b = $("#board"); b.classList.remove("rotate-in"); void b.offsetWidth; b.classList.add("rotate-in"); banner(`${active().name}'s turn`); return; }
  if (a === "again") return U.campaign ? playCampaignMatch(U.campaign.stage) : startGame({ opponentDeckId: U.lastOpp });   // the same opponent as last time
  if (a === "camp-next") return campaignNext();
  if (a === "camp-map") return showCampaign();
  if (a === "tomenu") { endTutorial(); U.menuView = "home"; return showScreen("menu"); }
  if (a === "phase") return onPhaseButton();
  if (a === "lore-new") { showNewLore(); return; }
  if (a === "trophies") { showTrophies(); return; }
  if (a === "hist") { showHist(Number(el.dataset.i)); return; }
  if (a === "log") { showLog(); return; }
  if (a === "pass") { if (human && !S.pending && !U.armed) { U.selected = null; passTurn(); } return; }
  if (a === "faceall") { if (human && S.phase === PHASE.BATTLE) { U.selected = null; act(attackAllFaceMove); } return; }
  if (a === "face") { if (U.selected) { const s = U.selected; U.selected = null; act(() => move("attack", s, null)); } return; }
  if (a === "blade") { if (human) { U.selected = null; act(() => move("blade", uid)); } return; }
  if (a === "char") return clickChar(uid);
  if (a === "token") { if (human) act(() => move("token")); return; }
  if (a === "grave") return showGrave(S.players[Number(el.dataset.player)]);
  if (a === "champ") return showChampion(S.players[Number(el.dataset.player)]);
  if (a === "shard") {
    if (human && U.selected != null && S.phase === PHASE.BATTLE && S.shard) { const s = U.selected; U.selected = null; act(() => move("attack", s, "shard")); }
    else showShard();
    return;
  }
  if (a === "deck") { if (human && Number(el.dataset.player) === S.active && S.phase === PHASE.DRAW) onPhaseButton(); return; }
  if (a === "plate") {
    const idx = Number(el.dataset.player);
    if (humanTarget() && isValidTarget({ isPlayer: true, idx })) act(() => move("target", { isPlayer: true, idx }));
    else if (human && U.selected && idx !== S.active && !mustPickGuard(null)) { const s = U.selected; U.selected = null; act(() => move("attack", s, null)); }
    return;
  }
  if (a === "area") {
    const pd = S.pending;
    const found = findArea(uid);
    if (humanTarget() && pd.targetType === "area") act(() => move("target", { uid }));
    else if (human && found.p === active() && canActivateArea(found.c)) act(() => move("area", uid));
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
hand.addEventListener("pointercancel", e => { if (drag) { drag.ghost?.remove(); drag.hint?.remove(); setPlacing(null); drag.el.classList.remove("dragging", "held"); drag = null; } });
hand.addEventListener("contextmenu", e => {
  e.preventDefault();
  const el = e.target.closest(".hand-card");
  const c = el && S.players[viewIdx()].hand.find(x => x.uid === Number(el.dataset.uid));
  if (c) showDetail(c, { hand: true });
});

function cancelSomething() {
  if (U.armed) { U.armed = null; render(); return true; }
  if (U.selected) { U.selected = null; render(); return true; }
  if (S?.pending?.kind === "target" && !S.players[S.pending.owner].isAI) { if (move("cancel")) { render(); return true; } }
  return false;
}
// Keyboard: Space for the next step (Draw card, To battle, ...), E to pass the turn, Escape to
// cancel or close.
document.addEventListener("keydown", e => {
  if (U.screen === "game" && $("#modal").hidden && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest?.("input, textarea")) {
    const press = act => { const b = $(`#board [data-act="${act}"]`); if (b && !b.disabled) { e.preventDefault(); b.click(); } };
    if (e.key === " ") { press("phase"); return; }
    if (e.key === "e" || e.key === "E") { press("pass"); return; }
  }
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
