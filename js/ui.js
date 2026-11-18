// Shardfall interface: board rendering, input, dialogs and effects (menu: js/menu.js, storm.js).
// The board is a fixed 1440x1000 stage (the LÖVE virtual size) scaled to the window.
//
// Short names used in the interface code (js/engine.js lists the rules ones: S, p, c, pd, fx):
//   U    what the screen is showing: current screen, selected attacker, timers, settings
//   L    where things sit on the 1440x1000 board, in board pixels
//   $    finds one element on the page, like $("#board")
//   act  runs a player's move through the rules, saves an undo step, redraws the board

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
  skin: PREFS.get("looks") === 3 ? PREFS.get("board", "crystal") : "crystal",   // board look: crystal, glass, altar, battlefield or warmap (chosen in Settings)
  turnColor: null,       // player whose color the turn crystal shows (it changes when the falling shard lands)
  manaSeen: [], manaSpent: [],   // last mana shown per player, and crystals just spent
  lungeVec: new Map(),   // uid -> how far an attacker swoops toward its target
  arriving: new Map(),   // uid -> until when a showcased card is still on its way to the table
  busyUntil: 0,          // the computer waits for big animations to finish (js/fx.js)
  stats: null, endBadges: [], dragAttackAt: 0, lungeAt: 0,
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
  return `<svg viewBox="0 0 24 24" style="--g-bg:transparent" aria-hidden="true"><g color="#1a1226">${GLYPHS[group] || GLYPHS["N/A"]}</g></svg>`;
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
// Rarity frames: the rarer the card, the more of a whole shard it is. Each rarity's
// Frame (rarities.csv) picks a shape: chip, cut, faceted, crystal or shard. The paper is
// clipped to the outline and an SVG layer draws the edge, with crystals that reach past
// the card for crystal and shard. Card units: the card is 95 x 135, 10 units to 1em.
// ---------------------------------------------------------------------------
const FW = 95, FH = 135, FRAME_TIER = { chip: 1, cut: 2, faceted: 3, crystal: 4, shard: 5 };
const FRAMES = {};
function frameOutline(kind) {
  if (kind === "cut") { const c = 7; return [[c,0],[FW-c,0],[FW,c],[FW,FH-c],[FW-c,FH],[c,FH],[0,FH-c],[0,c]]; }
  if (kind === "faceted") return [[10,0],[FW-5,0],[FW,5],[FW,84],[FW-3.5,88],[FW,92],[FW,FH-10],[FW-10,FH],[5,FH],[0,FH-5],[0,64],[3.5,60],[0,56],[0,10]];
  if (kind === "crystal") { const c = 9; return [[c,0],[FW-c,0],[FW,c],[FW,FH-c],[FW-c,FH],[c,FH],[0,FH-c],[0,c]]; }
  if (kind === "shard") {
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // same edge every time
    const pts = [];
    const side = (x0, y0, x1, y1, nx, ny) => {
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 7);
      for (let i = 0; i < n; i++) { const t = i / n, d = (i % 2 ? 2.6 : 0.3) * (0.5 + rand()); pts.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]); }
    };
    side(4, 0, FW - 3, 0, 0, 1); side(FW, 2, FW, FH - 5, -1, 0); side(FW - 3, FH, 6, FH, 0, -1); side(0, FH - 4, 0, 4, 1, 0);
    return pts;
  }
  return null; // chip: a plain rounded card
}
const fPts = pts => pts.map(p => p.map(v => v.toFixed(2)).join(",")).join(" ");
function fInset(pts, d) {
  const kx = (FW / 2 - d) / (FW / 2), ky = (FH / 2 - d) / (FH / 2);
  return pts.map(([x, y]) => [FW / 2 + (x - FW / 2) * kx, FH / 2 + (y - FH / 2) * ky]);
}
function fShade(rgb, t) { // t > 0 lightens, t < 0 darkens
  const c = rgb.match(/\d+/g).map(Number);
  return `rgb(${c.map(v => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t))).join(",")})`;
}
// A cut-gem edge: one strip per side, lit from the top left.
function fBevel(pts, d, edge) {
  const inn = fInset(pts, d);
  let s = "";
  pts.forEach((p, i) => {
    const j = (i + 1) % pts.length, nx = pts[j][1] - p[1], ny = p[0] - pts[j][0], L = Math.hypot(nx, ny) || 1;
    s += `<polygon points="${fPts([p, pts[j], inn[j], inn[i]])}" fill="${fShade(edge, (-(nx / L) * 0.6 - (ny / L) * 0.8) * 0.55)}"/>`;
  });
  return s + `<polygon points="${fPts(pts)}" fill="none" stroke="${fShade(edge, -0.55)}" stroke-width=".7" stroke-linejoin="round"/>`
    + `<polygon points="${fPts(inn)}" fill="none" stroke="${fShade(edge, 0.6)}" stroke-width=".35" opacity=".8"/>`;
}
// One crystal: base at (x, y), pointing at angle deg, length l, half-width w.
function fSpike(x, y, deg, l, w, edge) {
  const a = deg * Math.PI / 180, cx = Math.cos(a), sy = Math.sin(a);
  const T = [x + cx * l, y + sy * l], Lp = [x - sy * w, y + cx * w], R = [x + sy * w, y - cx * w], B = [x - cx * w * 1.4, y - sy * w * 1.4];
  return `<polygon points="${fPts([B, Lp, T])}" fill="${fShade(edge, 0.45)}"/><polygon points="${fPts([B, R, T])}" fill="${fShade(edge, -0.3)}"/>`
    + `<polygon points="${fPts([Lp, T, R])}" fill="none" stroke="${fShade(edge, -0.6)}" stroke-width=".5" stroke-linejoin="round"/>`;
}
function fSpikes(kind, edge) {
  let s = "";
  if (kind === "crystal") {
    [[4.5, 4.5, 225], [FW - 4.5, 4.5, 315], [FW - 4.5, FH - 4.5, 45], [4.5, FH - 4.5, 135]].forEach(([x, y, d]) => {
      s += fSpike(x, y, d - 24, 8.5, 2, edge) + fSpike(x, y, d + 24, 8.5, 2, edge) + fSpike(x, y, d, 13.5, 2.8, edge);
    });
    s += fSpike(FW / 2, 1, -90, 8.5, 3, edge) + fSpike(FW / 2, FH - 1, 90, 8.5, 3, edge);
  }
  if (kind === "shard") {
    [[14,0,-100,7],[30,0,-80,4],[52,0,-95,9.5],[78,0,-70,5.5],[FW,10,-35,8.5],[FW,40,5,5],[FW,70,-10,9],[FW,108,20,5.5],
     [FW-4,FH,60,9],[60,FH,95,5],[34,FH,85,8.5],[3,FH-2,140,9.5],[0,96,175,5.5],[0,62,190,9],[0,28,170,4.5],[2,3,225,8]]
      .forEach(([x, y, d, l]) => { s += fSpike(x, y, d, l, 1.5 + l * 0.13, edge); });
  }
  return s;
}
// The small gem between the stats: one facet line per tier, so rarity reads without color.
function fGem(tier, edge) {
  let s = `<svg class="rarity-gem" viewBox="0 0 20 20" aria-hidden="true"><polygon points="2,7 6,2 14,2 18,7 10,18" fill="${fShade(edge, -0.15)}" stroke="${fShade(edge, -0.65)}" stroke-width="1"/>`;
  for (let i = 1; i < tier; i++) { const x = 2 + 16 * i / tier; s += `<line x1="${x.toFixed(1)}" y1="${x < 6 || x > 14 ? 7 : 2}" x2="10" y2="18" stroke="${fShade(edge, 0.55)}" stroke-width=".8"/>`; }
  return s + `<line x1="2" y1="7" x2="18" y2="7" stroke="${fShade(edge, 0.55)}" stroke-width=".8"/></svg>`;
}
function cardFrame(rarity) {
  if (FRAMES[rarity]) return FRAMES[rarity];
  const r = DATA.rarities[rarity], edge = r?.color || "rgb(143,151,163)";
  const kind = FRAME_TIER[r?.frame] ? r.frame : "chip", pts = frameOutline(kind);
  let svg = `<svg class="frame" viewBox="-10 -10 115 155" aria-hidden="true">`;
  if (kind === "chip") svg += `<rect x=".9" y=".9" width="${FW - 1.8}" height="${FH - 1.8}" rx="7.2" fill="none" stroke="${edge}" stroke-width="1.8"/>`;
  else if (kind === "cut") svg += `<polygon points="${fPts(fInset(pts, 1))}" fill="none" stroke="${edge}" stroke-width="2"/><polygon points="${fPts(fInset(pts, 3.6))}" fill="none" stroke="${fShade(edge, 0.35)}" stroke-width=".6"/>`;
  else svg += fSpikes(kind, edge) + fBevel(pts, kind === "faceted" ? 3.2 : 4.2, edge);
  svg += `</svg>`;
  const extra = kind !== "shard" ? "" : `<svg class="cracks" viewBox="0 0 95 135" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="${edge}" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round" opacity=".9"><path d="M0 50 L12 47 L20 55 L31 52 L38 60"/><path d="M20 55 L23 66"/><path d="M95 72 L82 76 L74 70 L63 79 L57 76"/><path d="M74 70 L71 60"/></g></svg><div class="glint"></div>`;
  return (FRAMES[rarity] = {
    kind,
    clip: pts ? `clip-path:polygon(${pts.map(([x, y]) => `${(x / FW * 100).toFixed(2)}% ${(y / FH * 100).toFixed(2)}%`).join(",")})` : "",
    svg, gem: fGem(FRAME_TIER[kind], edge), extra,
  });
}

// ---------------------------------------------------------------------------
// Card markup
// ---------------------------------------------------------------------------
// Cards from no fracture are stored as "N/A" in the data and shown as "Unbound".
const groupLabel = group => (group === "N/A" ? "Unbound" : group);
const fractureLabel = c => groupsOf(c).map(groupLabel).join(" + ");

// Tribes (species) and classes (jobs): plain placeholder symbols, to be replaced by art. Tribes sit
// in round badges and classes in square ones. A name with no symbol shows its first letter.
const TAG_GLYPHS = {
  Human: '<circle cx="12" cy="8" r="3.6" fill="currentColor"/><path d="M5 20c0-4.6 3-7 7-7s7 2.4 7 7z" fill="currentColor"/>',
  Animal: '<ellipse cx="12" cy="15.5" rx="4.6" ry="3.6" fill="currentColor"/><circle cx="6.3" cy="10.6" r="1.9" fill="currentColor"/><circle cx="10" cy="6.8" r="1.9" fill="currentColor"/><circle cx="14" cy="6.8" r="1.9" fill="currentColor"/><circle cx="17.7" cy="10.6" r="1.9" fill="currentColor"/>',
  Undead: '<path d="M12 3.5c-4.2 0-7 2.7-7 6.4 0 2.2 1 3.7 2.6 4.6V18h2v-2h1.4v2h2v-2H15v2h2v-3.5c1.6-.9 2.6-2.4 2.6-4.6 0-3.7-2.8-6.4-7.6-6.4z" fill="currentColor"/><circle cx="9.3" cy="10.4" r="1.5" fill="var(--g-bg)"/><circle cx="14.7" cy="10.4" r="1.5" fill="var(--g-bg)"/>',
  Cyber: '<path d="M12 3l7.5 4.3v9.4L12 21l-7.5-4.3V7.3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  Plant: '<path d="M12 21V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 12C7 12 5 8 5 4c5 0 7 3 7 8zM12 14c4 0 7-2.5 7-7-4.500 0-7 2.500-7 7z" fill="currentColor"/>',
  Goblin: '<path d="M3 8l5 2.5h8L21 8l-2.600 6.500c-1 3.500-3.600 5.500-6.400 5.500s-5.400-2-6.400-5.500z" fill="currentColor"/><circle cx="9.500" cy="13" r="1.200" fill="var(--g-bg)"/><circle cx="14.500" cy="13" r="1.200" fill="var(--g-bg)"/>',
  Warrior: '<path d="M12 2.500l2 3v9.500h-4V5.500z" fill="currentColor"/><path d="M6.500 15h11v2.200h-11zM11 17h2v4.500h-2z" fill="currentColor"/>',
  Mage: '<path d="M12 3l2.400 6 6.100.6-4.700 4 1.500 6.100L12 16.700 6.700 19.700l1.500-6.100-4.700-4 6.100-.6z" fill="currentColor"/>',
  Scout: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  Guardian: '<path d="M12 2.500l8 3v6.200c0 4.800-3.300 8.200-8 9.800-4.700-1.600-8-5-8-9.800V5.500z" fill="currentColor"/>',
  Worker: '<path d="M14.500 3.500a5 5 0 0 0-4.300 7L3.500 17.200l3.300 3.300 6.700-6.700a5 5 0 0 0 7-4.300l-3 3-3-.8-.8-3z" fill="currentColor"/>',
  Student: '<path d="M3 6.500c3-1 6-1 9 .8 3-1.800 6-1.800 9-.8v12c-3-1-6-1-9 .8-3-1.800-6-1.800-9-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 7.300V19" stroke="currentColor" stroke-width="1.800"/>',
  Master: '<path d="M3.500 18.500L2.500 7l5.500 4.500L12 4.500l4 7L21.500 7l-1 11.500z" fill="currentColor"/>',
  Fighter: '<rect x="5" y="9" width="14" height="10" rx="3" fill="currentColor"/><path d="M7.500 9V6.500M10.500 9V5M13.500 9V5M16.500 9V6.500" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"/>',
};
function tagBadge(kind, name) {
  const g = TAG_GLYPHS[name] || `<text x="12" y="16.500" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor">${esc(name[0] || "?")}</text>`;
  return `<svg class="tag ${kind}" viewBox="0 0 24 24" style="--g-bg:#e9dcc0" role="img" aria-label="${kind}: ${esc(name)}"><title>${esc(name)}</title><g color="#3a2a1c">${g}</g></svg>`;
}
const tagsHTML = c => (c.type === "Character" && (c.tribes?.length || c.classes?.length))
  ? `<div class="tags"><span>${(c.tribes || []).map(t => tagBadge("tribe", t)).join("")}</span><span>${(c.classes || []).map(k => tagBadge("class", k)).join("")}</span></div>` : "";

// One line for every name. The name's width (in ems of the name's own font) goes on the card as
// --nw, and the style sheet shrinks a name wider than its box (never below half size); the box
// differs between the normal card and the phone table, so the sum is done there (.card .name span).
// Widths are measured once per name, and again if the card font arrives after the first cards.
// The one exception to one line: names listed here may run to two lines (the owner's choice).
const TWO_LINE_NAMES = new Set(["Shadow-Stitched Soldier"]);
let nameCtx = null;
const nameWidths = new Map();
document.fonts?.ready.then(() => nameWidths.clear());
document.fonts?.addEventListener?.("loadingdone", () => nameWidths.clear());
const nameFit = n => {
  let w = nameWidths.get(n);
  if (w == null) {
    nameCtx = nameCtx || document.createElement("canvas").getContext("2d");
    nameCtx.font = `800 100px ${getComputedStyle(document.body).fontFamily}`;
    // A two-line name only has to fit its widest word.
    const parts = TWO_LINE_NAMES.has(n) ? n.split(" ") : [n];
    w = Math.max(...parts.map(t => nameCtx.measureText(t).width)) / 100;
    nameWidths.set(n, w);
  }
  return `;--nw:${w.toFixed(3)}`;
};

function cardHTML(c, opts = {}) {
  const edge = DATA.rarities[c.rarity]?.color || "#8f97a3";
  const fc = DATA.factions[c.group]?.color || "#7a6d5c";
  const art = artFor(c.artKey);
  const skills = (c.skills || []).map(s => `<span>${DATA.skills[s]?.icon || "•"}${esc(s)}</span>`).join("");
  const skillLen = (c.skills || []).reduce((n, s) => n + s.length + 2, 0);   // letters: a long list takes two smaller lines on the phone
  let statsHTML = "";
  if (c.type === "Character" || c.type === "Equipment") {
    if (opts.field) {
      const st = stats(c), raw = rawStats(c);
      const hpLow = c.currentHealth < (c.baseHealth ?? c.health);
      statsHTML = `<div class="stats"><span class="a${st.a > c.attack ? " up" : ""}">⚔${st.a}</span><span class="h${hpLow ? " low" : ""}${st.h > c.currentHealth ? " up" : ""}">♥${Math.max(0, raw.h)}</span></div>`;
    } else {
      statsHTML = `<div class="stats"><span class="a">⚔${c.attack}</span><span class="h${grieveBonus(c) ? " up" : ""}">♥${c.health + grieveBonus(c)}</span></div>`;
    }
  }
  const cost = opts.costOverride ?? c.manaCost;
  // Level Up progress on the table: stars for levels gained, and a glow that grows with them.
  const lv = opts.field && c.type === "Character" ? c.levelUpCount || 0 : 0;
  const levels = opts.field && c.type === "Character" && (lv > 0 || hasSkill(c, "Level Up"));
  const cap = levels ? levelCap(c) : 0;
  const pips = !levels ? "" : cap === Infinity
    ? `<div class="level-pips" title="Level ${lv}">Lv ${lv}</div>`
    : `<div class="level-pips" title="Level ${lv} of ${cap}">${"★".repeat(Math.min(lv, cap))}${"☆".repeat(Math.max(0, cap - lv))}</div>`;
  const fr = cardFrame(c.rarity);
  return `<div class="card framed f-${fr.kind}${lv ? " lv" + Math.min(lv, 3) : ""}" style="--edge:${edge};--fc:${fc}${nameFit(c.name)}"><div class="shape"><div class="face" style="${fr.clip}">
    ${medal(c.group)}${groupsOf(c).length > 1 ? medal(groupsOf(c)[1], "medal second") : ""}
    ${opts.field ? "" : `<div class="cost">${cost}</div>`}
    <div class="name${TWO_LINE_NAMES.has(c.name) ? " two" : ""}"><span>${esc(c.name)}</span></div>
    <div class="art">${art ? `<img src="${esc(art)}" alt="">` : glyph(c.group)}</div>
    ${tagsHTML(c)}
    <div class="skills${skillLen > 14 ? " many" : ""}">${skills}</div>
    ${opts.field && c.equipped?.length ? `<div class="equip-count" title="Equipped">●${c.equipped.length}</div>` : ""}
    ${pips}
    ${statsHTML}
    ${fr.gem}${fr.extra}
  </div>${fr.svg}</div></div>`;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
const viewIdx = () => (S.mode === "ai" ? 0 : S.active);
const sideOf = idx => (idx === viewIdx() ? "bottom" : "top");
const humanTurn = () => S && !S.over && !active().isAI && !U.curtain;
// A target choice a person has to make, which can come up on the other player's turn (IP Man).
const humanTarget = () => S && !S.over && !U.curtain && S.pending?.kind === "target" && !S.players[S.pending.owner].isAI;
// Characters are spaced out evenly and squeeze together when there are many (there is no limit).
function charStep(n) { return Math.min(L.charStep, (L.frontW - CARD_W) / Math.max(1, n - 1)); }
function charX(i, n) { const step = charStep(n); return 720 - ((n - 1) * step + CARD_W) / 2 + i * step; }
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
    if (i >= 0) return { x: charX(i, p.field.chars.length) + CARD_W / 2, y: L[sideOf(p.idx)].chars + CARD_H / 2 };
  }
  const el = document.querySelector(`.field-card[data-uid="${uid}"]`);
  if (el) return { x: el.offsetLeft + CARD_W / 2, y: el.offsetTop + CARD_H / 2 };
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
// Effects
// ---------------------------------------------------------------------------
function floatText(x, y, text, color, small) {
  fxDiv("float" + (small ? " small" : ""), `left:${x}px;top:${y}px;color:${color}`, 1250).textContent = text;
}
// Random events (see "Random events" in js/engine.js): a small card in the middle of the table
// that says what is coming, how soon, and what it does. During the event round it says "This round".
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
  const when = (S.event ? "This round" : left <= 1 ? "Next round" : `In ${left} rounds`) + " · mini shard fall";
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
const DEATHS = { Zombie: sinkAway, Digital: pixelAway, Monkey: tumbleAway, Fighter: slashAway };
function deathPiece(src, cls, style = "", ms = 1000) {
  const piece = fxDiv(cls, `left:${src.offsetLeft}px;top:${src.offsetTop}px;${style}`, ms);
  piece.innerHTML = src.innerHTML;
  return piece;
}
function sinkAway(src) {   // Zombie: sinks back into the ground
  deathPiece(src, "death-sink", "", 1100);
}
function pixelAway(src) {  // Digital: breaks up into pixels and glitches out
  const cols = 5, rows = 7, w = CARD_W / cols, h = CARD_H / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const l = k * w, t = r * h;
    deathPiece(src, "death-pixel", `clip-path:inset(${t}px ${CARD_W - l - w}px ${CARD_H - t - h}px ${l}px);--dx:${(Math.random() - 0.5) * 70}px;--dy:${(Math.random() - 0.3) * 60}px;animation-delay:${(Math.random() * 0.35).toFixed(2)}s`, 1200);
  }
}
function tumbleAway(src) { // Monkey: knocked off the table, tumbling
  const dir = Math.random() < 0.5 ? -1 : 1;
  deathPiece(src, "death-tumble", `--dx:${dir * 140}px;--r:${dir * 540}deg`, 1000);
}
function slashAway(src) {  // Fighter: cut in two by a clean strike
  deathPiece(src, "death-slash", `clip-path:polygon(0 0, 100% 0, 100% 35%, 0 70%);--dx:-18px;--dy:-26px;--r:-8deg`, 1000);
  deathPiece(src, "death-slash", `clip-path:polygon(0 70%, 100% 35%, 100% 100%, 0 100%);--dx:18px;--dy:34px;--r:8deg`, 1000);
  fxDiv("death-slash-line", `left:${src.offsetLeft - 10}px;top:${src.offsetTop + CARD_H * 0.525}px`, 500);
}
function shatterFrom(src, group) {
  if (DEATHS[group]) { DEATHS[group](src); sparkle(src.offsetLeft + CARD_W / 2, src.offsetTop + CARD_H / 2, 6); return; }
  const x = src.offsetLeft, y = src.offsetTop, cx = CARD_W / 2, cy = CARD_H / 2;
  const ring = [[0, 0], [45, 0], [95, 0], [95, 50], [95, 95], [95, 135], [50, 135], [0, 135], [0, 85], [0, 40]];
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
const SWIFT_GAP = 230;   // ms between a Swift blow and the reply

onGameEvent((type, d) => {
  const now = performance.now();
  // A blow lands when the attacker reaches its target, a moment after the lunge starts.
  const delay = now - U.lungeAt < 80 && !REDUCED_MOTION ? 190 : 0;
  if (type === "newGame") {
    resetMatchStats();
  } else if (type === "clash") {
    // A fight is about to resolve. With Swift, the first blow lands, then the reply a beat later.
    U.clash = { at: now, swift: d.swift, n: 0, uids: [d.attacker, d.target] };
  } else if (type === "charDamage") {
    const p = charCenter(d.uid);
    const f = findChar(d.uid);
    const overkill = f ? -rawStats(f.c).h : 0;
    if (f) countDamage(f.p.idx, d.amount);
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
    if (U.stats) U.stats.low[d.player] = Math.min(U.stats.low[d.player], S.players[d.player].health / S.players[d.player].maxHealth);
    const tier = feelTier(d.amount);
    later(delay, () => {
      damageNumber(p.x + (Math.random() - 0.5) * 120, p.y - 10, d.amount, 0);
      crystalChips(d.player, 6 + Math.min(10, d.amount * 2));
      addTrauma(tier.trauma + 0.12);   // a hit to a player is felt a little more than one to a card
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
    // "» NO REPLY" (Swift won the fight untouched) shows once the blow has landed
    const wait = d.text.startsWith("»") ? delay + SWIFT_GAP : 0;
    later(wait, () => { floatText(p.x, p.y - 40, d.text, d.color, true); skillSpotlight(d.uid, d.text); });
  } else if (type === "enter") {
    U.spawn.set(d.uid, { cost: Math.min(7, Math.max(1, d.cost)), t: now, faction: findChar(d.uid)?.c.group });
  } else if (type === "lunge") {
    // the attacker swoops most of the way to its target and springs back
    const from = charCenter(d.uid);
    const to = d.target === "shard" ? SHARD_AT : d.target != null ? charCenter(d.target) : plateCenter(d.player);
    U.lunges.set(d.uid, now);
    U.lungeVec.set(d.uid, { dx: (to.x - from.x) * 0.72, dy: (to.y - from.y) * 0.72 });
    U.lungeAt = now;
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
  } else if (type === "play") {
    if (U.stats) U.stats.played[d.player]++;
    if (d.card.manaCost >= SHOWCASE_COST && !REDUCED_MOTION) { setTimeout(() => showcase(d.card, d.player), 0); return; }
    // after the board redraws, sparkle where the card landed
    setTimeout(() => {
      const el = document.querySelector(`#board [data-uid="${d.card.uid}"]`);
      const side = sideOf(d.player);
      const at = el ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + CARD_H / 2 } : { x: 720, y: L[side].chars + CARD_H / 2 };
      sparkle(at.x, at.y, d.card.type === "Spell" ? 22 : 14);
    }, 0);
  } else if (type === "countered") {
    banner(`${d.by.name}: ${d.card.name} is countered`);
    sparkle(720, 430, 22);
  } else if (type === "death") {
    shatter(d.uid, delay, d.group);
  } else if (type === "gameOver") {
    finale(d.winner);
  }
});
const recent = (map, uid, ms) => map.has(uid) && performance.now() - map.get(uid) < ms;

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

function plateHTML(p, side) {
  const { ratio, cls: tier } = lifeTier(p);
  const cracks = tier !== "low" ? 0 : ratio >= 0.15 ? 2 : 4;
  const pd = S.pending;
  const targetable = humanTarget() && pd.targetType === "charOrPlayer" && isValidTarget({ isPlayer: true, idx: p.idx });
  const attackable = side === "top" && U.selected && !forcedTarget(p);
  const y = side === "top" ? 3 : 937;
  return `<div class="plate${targetable ? " targetable" : ""}${attackable ? " attackable" : ""}${tier === "low" ? " danger" : ""}${tier === "low" && ratio < 0.15 ? " critical" : ""}" data-act="plate" data-player="${p.idx}" style="left:530px;top:${y}px;width:380px;--pc:${PLAYER_COLORS[p.idx]}" aria-label="${esc(p.name)}: ${p.health} of ${p.maxHealth} health">
    <div class="life">${crystalSVG("life-crystal " + tier, cracks)}${wardHTML(p)}<b>${Math.max(0, p.health)}</b></div>
    <div class="who"><span class="name">${esc(p.name)}</span><em>${esc(p.deckLabel ?? p.faction + " deck")} · ${Math.max(0, p.health)} / ${p.maxHealth} health</em>${champLine(p)}${protLine(p)}</div>
    ${attackable ? previewBadge(fightPreview(U.selected, null), true) : ""}
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
  const guarded = side === "top" && guards(p).length > 0;
  p.field.chars.forEach((c, i) => {
    const cls = ["field-card"];
    if (side === "bottom" && human && canAttack(c)) cls.push("ready");
    if (c.hasAttacked && c.owner === S.active && S.phase === PHASE.BATTLE) cls.push("spent");
    if (U.selected === c.uid) cls.push("selected");
    if (humanPending && pd.kind === "target" && pd.targetType !== "area" && isValidTarget({ uid: c.uid })) cls.push("targetable");
    if (U.armed && side === "bottom" && human) cls.push("targetable");
    const attackable = U.selected && side === "top" && (!guarded || isGuard(c));
    if (attackable) cls.push("attackable");
    if (recent(U.hits, c.uid, 450)) cls.push("hit");
    let vars = `--d:${((c.uid * 0.37) % 3).toFixed(2)}s`;
    if (recent(U.lunges, c.uid, 450)) {
      const v = U.lungeVec.get(c.uid) || { dx: 0, dy: side === "bottom" ? -34 : 34 };
      cls.push("lunge");
      vars += `;--dx:${v.dx.toFixed(0)}px;--dy:${v.dy.toFixed(0)}px`;
    }
    const sp = U.spawn.get(c.uid);
    if (sp && performance.now() - sp.t < 1000) cls.push(spawnClass(sp));
    if ((U.arriving.get(c.uid) ?? 0) > performance.now()) cls.push("arriving");
    const preview = attackable && human ? previewBadge(fightPreview(U.selected, c.uid)) : "";
    const blade = side === "bottom" && human && canUseBlade(c) ? `<button type="button" class="blade-btn" data-act="blade" data-uid="${c.uid}" title="Kenshi's Blade: deal 3 damage to an enemy character, once per Battle">⚔ Strike 3</button>` : "";
    h += `<div class="${cls.join(" ")}" data-act="char" data-uid="${c.uid}" data-side="${side}" style="left:${charX(i, n)}px;top:${y.chars}px;${vars}">${cardHTML(c, { field: true })}${hasSkill(c, "Protected") ? runeRingHTML(recent(U.hits, c.uid, 450)) : ""}${preview}${blade}</div>`;
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
  h += eventPill();
  h += shardHTML(human);
  const forced = guards(them);
  // "All attack": every character that can still attack goes for the player (see attackAllFace).
  const readyN = human && S.phase === PHASE.BATTLE && !S.pending ? me.field.chars.filter(canAttack).length : 0;
  const allBtn = (style = "") => `<button type="button" class="face-btn all" data-act="faceall" style="${style}">⚔ All attack ${esc(them.name)} (${readyN})</button>`;
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

  const label = ["Draw card", "To battle →", "To end →", "Pass turn →"][S.phase];
  const canPhase = human && !S.pending && !U.armed;
  h += `<button type="button" class="btn stage-btn${canPhase && S.phase === PHASE.DRAW ? " glow" : ""}" data-act="phase" style="left:1220px;top:372px;width:200px;height:56px" ${canPhase ? "" : "disabled"}>${label}</button>`;
  h += `<button type="button" class="btn stage-btn" data-act="pass" style="left:1240px;top:942px;width:180px;height:48px" ${canPhase ? "" : "disabled"}>Pass turn</button>`;
  h += `<div class="log">${S.log.slice(-6).map(m => `<div>${esc(m)}</div>`).join("")}</div>`;

  if (U.curtain) {
    h += `<div class="curtain"><p>Pass the device to</p><h2>${esc(active().name)}</h2><p>${esc(active().deckLabel ?? active().faction + " deck")} · Round ${S.round}</p>${eventLine() ? `<p>${esc(eventLine().when)}: ${esc(eventLine().name)}. ${esc(eventLine().desc)}</p>` : ""}<button type="button" class="btn btn-primary" data-act="curtain">Start turn</button></div>`;
  } else if (U.ended && !U.tutorial) {
    const title = S.winner == null ? "A draw" : S.mode === "ai" ? (S.winner === 0 ? "Victory" : "Defeat") : `${S.players[S.winner].name} wins`;
    const sub = S.winner == null ? "Both players fell at once." : `${S.players[S.winner].name} wins in round ${S.round}.`;
    const camp = U.campaign ? campaignEndHTML(S.winner === 0) : null;
    const actions = camp ? camp.actions : `<button type="button" class="btn btn-primary" data-act="again">Play again</button><button type="button" class="btn" data-act="tomenu">Main menu</button>`;
    h += `<div class="curtain endscreen"><h2>${esc(title)}</h2><p>${esc(sub)}</p>${camp ? camp.story : ""}${endStatsHTML()}<div class="detail-actions">${actions}</div></div>`;
  }
  $("#board").innerHTML = h;
  renderHand(me);
  renderPrompt();
  renderOverlays();
  drawAim();
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
  const ab = c.ability || c.description;
  if (ab) parts.push(esc(ab));
  for (const k of c.skills || []) { const d = DATA.skills[k]?.desc; if (d) parts.push(`<b>${esc(k)}</b>: ${esc(d)}`); }
  return parts.length ? `<div class="hand-tip">${parts.join("<br>")}</div>` : "";
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
    if (S.pending?.cast && S.pending.source === c) cls.push("casting");   // a spell waiting for its target
    const costShown = playCost(c, p);
    return `<div class="${cls.join(" ")}" data-uid="${c.uid}" style="left:${pos.x}px;top:${pos.y}px;transform:rotate(${pos.rot}rad);z-index:${i + 1}">${cardHTML(c, { costOverride: costShown })}${handTip(c)}</div>`;
  }).join("");
  if (U.curtain) layer.innerHTML = "";
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
  const aiChoice = S?.pending && S.players[S.pending.owner].isAI;
  if (!S || S.over || !(active().isAI || aiChoice) || U.screen !== "game" || U.tutorial) return;
  const wait = Math.max(0, U.busyUntil - performance.now());
  U.aiTimer = setTimeout(() => {
    if (U.busyUntil > performance.now()) { scheduleAI(); return; }
    const more = aiStep();
    render();
    if (more || active().isAI) scheduleAI();
  }, (S.phase === PHASE.DRAW ? 900 : 750) + wait);
}

// opts.opponentDeckId and opts.setup(S) are used by the campaign (js/campaign.js).
function startGame(opts = {}) {
  if (deckProblem(U.deckId)) { showScreen("menu"); return; }
  endTutorial();
  clearTimeout(U.aiTimer);
  Object.assign(U, { selected: null, armed: null, curtain: false, ended: false, undo: [], turnColor: null });
  U.spawn.clear(); U.hits.clear(); U.lunges.clear(); U.drawn.clear();
  U.campaign = opts.campaign ?? null;
  newGame({ deckId: U.deckId, opponentDeckId: opts.opponentDeckId, mode: U.campaign ? "ai" : U.mode });
  opts.setup?.(S);
  showScreen("game");
  if (S.mode === "hotseat") U.curtain = true; else banner("Your turn");
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

// With two or more guards (Challenge or Tower) the attacker's player picks which one to hit.
// The rules send an attack aimed anywhere else to the first guard, which is right when there
// is only one. With several, that took the choice away, so such a tap now asks for a guard.
// "All attack player": every character that can attack hits the opposing player. Does nothing
// while a guard (Challenge or Tower) stands, since the rules send those blows to the guard.
// One Undo takes the whole attack back.
function attackAllFace() {
  if (guards(opponent()).length) return false;
  const ids = active().field.chars.filter(canAttack).map(c => c.uid);
  let any = false;
  for (const uid of ids) { if (S.over) break; if (attack(uid, null)) any = true; }
  return any;
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
      if (mustPickGuard(found.c)) return;
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
  drag = { uid, el, start: stagePoint(e), moved: false, pointerId: e.pointerId, tilt: 0 };
  el.classList.add("held");   // the card lifts toward you as soon as you touch it
  el.setPointerCapture?.(e.pointerId);
}
// Where a card being dragged can go: the frontline for characters, the backline for
// areas and equipment, anywhere on the table for spells.
function dropZone(c) {
  if (c.type === "Character") return { left: 720 - L.frontW / 2 - 12, top: L.bottom.chars - 8, width: L.frontW + 24, height: CARD_H + 16 };
  if (c.type === "Spell") return { left: 24, top: 70, width: 1392, height: 650 };
  return { left: L.backX - 8, top: L.bottom.backline - 8, width: RULES.maxBackline * L.slot + 6, height: CARD_H + 16 };
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
    drag.hint = document.createElement("div");
    drag.hint.className = "drop-hint" + (c.type === "Spell" ? " spell" : "");
    for (const [k, v] of Object.entries(dropZone(c))) drag.hint.style[k] = v + "px";
    $("#stage").appendChild(drag.hint);
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
    drag.hint.classList.toggle("off", back);
  }
}
function handUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag; drag = null;
  d.ghost?.remove(); d.hint?.remove();
  d.el.classList.remove("dragging", "held");
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

// "Tribe: Human, Animal · Class: Master": what a character is and what it does.
function kindsLine(c) {
  if (c.type !== "Character" || !(c.tribes?.length || c.classes?.length)) return "";
  const part = (label, list, kind) => list?.length ? `<span class="kinds-part"><b>${label}</b> ${list.map(n => `${tagBadge(kind, n)}${esc(n)}`).join(", ")}</span>` : "";
  return `<p class="kinds">${part(c.tribes?.length > 1 ? "Tribes" : "Tribe", c.tribes, "tribe")}${part(c.classes?.length > 1 ? "Classes" : "Class", c.classes, "class")}</p>`;
}
function showDetail(c, ctx = {}) {
  let actions = "", extra = "";
  if (ctx.field && c.owner != null && findChar(c.uid)) {
    const st = stats(c), raw = rawStats(c);
    extra += `<div class="statline"><span class="a">⚔ ${st.a}</span><span class="h">♥ ${Math.max(0, raw.h)}</span></div>`;
    if (c.equipped?.length) extra += `<p><b>Equipped:</b> ${c.equipped.map(e => `${esc(e.name)} (+${e.attack}/+${e.health})`).join(", ")}</p>`;
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
  if (counterKinds(c)) extra += `<p class="reason">Counter spell: you can't play it on your own turn. When the other player plays a card it can stop, the game asks you. It costs mana you left unspent on your turn.</p>`;
  const ability = c.ability || c.description;
  const spellFx = c.type === "Spell" && EFFECTS[c.id]?.target ? EFFECTS[c.id] : null;
  const spellKind = spellFx ? (spellFx.intent === "help" ? " · Buff spell" : " · Curse spell") : "";
  openModal(`<div class="detail">
    ${cardHTML(c, ctx.field && findChar(c.uid) ? { field: true } : {})}
    <div class="detail-text">
      <div><h2 id="modal-title">${esc(c.name)}</h2><p class="sub">${esc(c.type)} · ${esc(c.rarity)} · ${esc(fractureLabel(c))} · ${c.manaCost} mana${spellKind}</p>${kindsLine(c)}</div>
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
    const needPick = pd.resolve !== "messenger" && pd.resolve !== "shepard";
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
      ${U.screen === "menu" ? `<button type="button" class="btn" data-set="intro">Watch the intro</button>` : ""}
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
    else if (set.dataset.set === "intro") { closeModal(); playIntro(); }
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
  else if (m === "restart") U.tutorial ? startTutorial() : U.campaign ? playCampaignMatch(U.campaign.stage) : startGame();
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
  if (performance.now() - U.dragAttackAt < 400) return;   // the release of a drag-to-attack
  const a = el.dataset.act;
  const uid = Number(el.dataset.uid);
  const human = humanTurn();
  if (a === "menu") return showGameMenu();
  if (a === "curtain") { U.curtain = false; render(); const b = $("#board"); b.classList.remove("rotate-in"); void b.offsetWidth; b.classList.add("rotate-in"); banner(`${active().name}'s turn`); return; }
  if (a === "again") return U.campaign ? playCampaignMatch(U.campaign.stage) : startGame();
  if (a === "camp-next") return campaignNext();
  if (a === "camp-map") return showCampaign();
  if (a === "tomenu") { endTutorial(); return showScreen("menu"); }
  if (a === "phase") return onPhaseButton();
  if (a === "pass") { if (human && !S.pending && !U.armed) { U.selected = null; act(endTurn); } return; }
  if (a === "faceall") { if (human && S.phase === PHASE.BATTLE) { U.selected = null; act(attackAllFace); } return; }
  if (a === "face") { if (U.selected) { const s = U.selected; U.selected = null; act(() => attack(s, null)); } return; }
  if (a === "blade") { if (human) { U.selected = null; act(() => useBlade(uid)); } return; }
  if (a === "char") return clickChar(uid);
  if (a === "token") { if (human) act(useManaToken); return; }
  if (a === "grave") return showGrave(S.players[Number(el.dataset.player)]);
  if (a === "champ") return showChampion(S.players[Number(el.dataset.player)]);
  if (a === "shard") {
    if (human && U.selected != null && S.phase === PHASE.BATTLE && S.shard) { const s = U.selected; U.selected = null; act(() => attack(s, "shard")); }
    else showShard();
    return;
  }
  if (a === "deck") { if (human && Number(el.dataset.player) === S.active && S.phase === PHASE.DRAW) onPhaseButton(); return; }
  if (a === "plate") {
    const idx = Number(el.dataset.player);
    if (humanTarget() && isValidTarget({ isPlayer: true, idx })) act(() => chooseTarget({ isPlayer: true, idx }));
    else if (human && U.selected && idx !== S.active && !mustPickGuard(null)) { const s = U.selected; U.selected = null; act(() => attack(s, null)); }
    return;
  }
  if (a === "area") {
    const pd = S.pending;
    const found = findArea(uid);
    if (humanTarget() && pd.targetType === "area") act(() => chooseTarget({ uid }));
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
hand.addEventListener("pointercancel", e => { if (drag) { drag.ghost?.remove(); drag.hint?.remove(); drag.el.classList.remove("dragging", "held"); drag = null; } });
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
