// Drawing cards: fracture medallions, optional painted art, rarity frames, the card markup
// (cardHTML), tribe and class badges, and fitting long names on one line.
// Split out of js/ui.js; loaded just before it (GAME_SCRIPTS in js/data.js).

// ---------------------------------------------------------------------------
// Faction medallions (port of drawFactionMedallion) and card art
// ---------------------------------------------------------------------------
const GLYPHS = {
  Simple: '<path d="M12 20V10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="8.3" cy="8.6" rx="4" ry="2.1" transform="rotate(-25 8.3 8.6)" fill="currentColor"/><ellipse cx="15.6" cy="11.4" rx="4" ry="2.1" transform="rotate(20 15.6 11.4)" fill="currentColor"/>',
  Wild: '<circle cx="12" cy="14" r="3.6" fill="currentColor"/><circle cx="7.6" cy="10" r="2.3" fill="currentColor"/><circle cx="16.4" cy="10" r="2.3" fill="currentColor"/><circle cx="10.4" cy="6.6" r="1.8" fill="currentColor"/><circle cx="13.6" cy="6.6" r="1.8" fill="currentColor"/>',
  Undead: '<rect x="6.5" y="6" width="11" height="9.5" rx="2" fill="currentColor"/><rect x="9" y="9" width="2" height="2.4" fill="var(--g-bg)"/><rect x="13" y="9" width="2" height="2.4" fill="var(--g-bg)"/><path d="M8.5 18h7M10 15.5v3M12 15.5v3M14 15.5v3" stroke="currentColor" stroke-width="1.4"/>',
  Mortal: '<path d="M6 6l11 11M18 6L7 17M8.4 4.8l-3.4 3.4M15.6 4.8l3.4 3.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" fill="none"/>',
  Cyber: '<rect x="7.5" y="7.5" width="9" height="9" rx="1.2" fill="currentColor"/><rect x="10.3" y="10.3" width="3.4" height="3.4" fill="var(--g-bg)"/><path d="M10 4.5v3M14 4.5v3M10 16.5v3M14 16.5v3M4.5 10h3M4.5 14h3M16.5 10h3M16.5 14h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
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
  Monkey: '<ellipse cx="12" cy="15.5" rx="4.6" ry="3.6" fill="currentColor"/><circle cx="6.3" cy="10.6" r="1.9" fill="currentColor"/><circle cx="10" cy="6.8" r="1.9" fill="currentColor"/><circle cx="14" cy="6.8" r="1.9" fill="currentColor"/><circle cx="17.7" cy="10.6" r="1.9" fill="currentColor"/>',
  Undead: '<path d="M6.2 20V10.2a5.8 5.8 0 0 1 11.6 0V20z" fill="currentColor"/><path d="M11.2 8h1.6v7.5h-1.6zM9 10.2h6v1.6H9z" fill="var(--g-bg)"/><rect x="3" y="19.4" width="18" height="2" rx="1" fill="currentColor"/>',   // the family: any tribe that should be dead but is living (a gravestone)
  Zombie: '<circle cx="12" cy="12" r="5.2" fill="currentColor"/><path d="M16.6 12.0L20.0 12.0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="20.6" cy="12.0" r="1.5" fill="currentColor"/><path d="M15.3 15.3L17.7 17.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18.1" cy="18.1" r="1.5" fill="currentColor"/><path d="M12.0 16.6L12.0 20.0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.0" cy="20.6" r="1.5" fill="currentColor"/><path d="M8.7 15.3L6.3 17.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="5.9" cy="18.1" r="1.5" fill="currentColor"/><path d="M7.4 12.0L4.0 12.0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="3.4" cy="12.0" r="1.5" fill="currentColor"/><path d="M8.7 8.7L6.3 6.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="5.9" cy="5.9" r="1.5" fill="currentColor"/><path d="M12.0 7.4L12.0 4.0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.0" cy="3.4" r="1.5" fill="currentColor"/><path d="M15.3 8.7L17.7 6.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18.1" cy="5.9" r="1.5" fill="currentColor"/><circle cx="10.3" cy="10.6" r="1.2" fill="var(--g-bg)"/><circle cx="13.8" cy="13" r="1.5" fill="var(--g-bg)"/><circle cx="10.9" cy="14.2" r=".8" fill="var(--g-bg)"/>',   // a germ: the infection
  Skeleton: '<path d="M12 2.8C7.6 2.8 4.8 5.7 4.8 9.6c0 2.3 1 3.9 2.6 4.8v1.8h9.2v-1.8c1.6-.9 2.6-2.5 2.6-4.8 0-3.9-2.8-6.8-7.2-6.8z" fill="currentColor"/><path d="M7.3 9.3l3.3.6-1.2 2.9zM16.7 9.3l-3.3.6 1.2 2.9zM12 12.4l-1.1 2h2.2z" fill="var(--g-bg)"/><rect x="7.6" y="17" width="8.8" height="4" rx="1.2" fill="currentColor"/><path d="M10 17v4M12 17v4M14 17v4" stroke="var(--g-bg)" stroke-width=".9"/>',   // a bony skull with its jaw
  Program: '<path d="M12 3l7.5 4.3v9.4L12 21l-7.5-4.3V7.3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
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
