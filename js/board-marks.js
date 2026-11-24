// Shardfall board marks: the special pieces drawn on top of the table, split out of js/board.js
// so that file stays about one job (laying out the table). Loaded just after it (GAME_SCRIPTS in
// js/data.js); render() in js/board.js calls these.
//   - the big shard and the cracks it leaves in the table
//   - the Protected shell around a player's health gem
//   - the rune ring around a card with the Protected skill

// The big shard (js/rules-shard.js): a tall crystal in the middle band, left of
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
    <ul>${Object.keys(CHAMPION_RULES).filter(id => DATA.cardsById[id] && CHAMPION_RULES[id].shardText).map(id => `<li><b>${esc(DATA.cardsById[id].name)}</b>: ${esc(CHAMPION_RULES[id].shardText)}</li>`).join("")}</ul>
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

// A card with the Protected skill: the "loading ring" (owner's pick, 24 Nov 2026). A band of light
// fills the ring like a progress bar, always stops at 99%, and starts again; small tick marks
// travel around it. The shell on a Protected player's health gem matches (see .ward in
// css/style.css): its shards light one after another and one never does. The hint is Boss Level's
// failed "level up" (docs/world.md, clue log). The ring is 9px outside the card (95 x 135); its
// timing comes from the clock, so redrawing the table doesn't restart it.
const RUNES = ["M5 2v6", "M4 2v6M6 2v6", "M5 2v6", "M5 3v4"];   // the tick marks
const RING_PATH = "M15 3H98A12 12 0 0 1 110 15V138A12 12 0 0 1 98 150H15A12 12 0 0 1 3 138V15A12 12 0 0 1 15 3Z";
const RING_N = 18, RING_S = 18;   // ticks on the ring, seconds per lap (a multiple of the 6 s fill)
function runeRingHTML(flash) {
  const ph = -(performance.now() % (RING_S * 1000)) / 1000;
  const runes = Array.from({ length: RING_N }, (_, k) =>
    `<i style="animation-delay:${(ph - k * RING_S / RING_N).toFixed(2)}s"><svg viewBox="0 0 10 10"><path d="${RUNES[k % RUNES.length]}"/></svg></i>`).join("");
  return `<div class="rune-ring${flash ? " flash" : ""}" style="--ph:${ph.toFixed(2)}s" aria-hidden="true">
    <svg class="track" viewBox="0 0 113 153"><path class="t" d="${RING_PATH}"/><path class="load" pathLength="100" d="${RING_PATH}"/></svg>${runes}</div>`;
}
