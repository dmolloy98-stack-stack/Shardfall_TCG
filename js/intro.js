// The cold open: about 20 seconds of stained-glass panels telling how the Shardfall
// began, played before the main menu every time the game opens. Tap to go on, Skip to
// leave. The story bible is docs/world.md; edit the lines below to change the intro.

const INTRO_PANELS = [
  { text: "Once, there were many worlds, and each one was whole.", motif: "whole", glass: ["#2f5fbf", "#5b3fc4", "#1f8a7e", "#d9a441"] },
  { text: "Then the worlds collided. Everything shattered, and the pieces began to fall.", title: "The Shardfall", motif: "broken", glass: ["#7a2bd1", "#b8326a", "#3d1fa8", "#e08a3a"] },
  { text: "Every shard holds a power. Five factions scramble to gather them, because more shards mean survival.", motif: "factions", glass: ["#2a4f9e", "#8a3fb8", "#c9893a", "#2f8f5b"] },
  { text: "No one knows what broke the worlds. The others blame the restless dead.", motif: "mystery", glass: ["#1d3b2a", "#3c1f52", "#24502f", "#552a6e"] },
  { text: "Where Shardkeepers meet, the shards are called into battle. Master them, and the worlds may be made whole again.", motif: "keeper", glass: ["#c08a2e", "#6a3fd0", "#b0452e", "#3a7bd5"] },
];
const INTRO_PANEL_MS = 3900, INTRO_TITLE_MS = 1900;

// ---------------------------------------------------------------------------
// A stained-glass window: an arched frame of glass panes in rings around a centre
// medallion, joined by dark leading, with a motif in the middle.
// ---------------------------------------------------------------------------
function glassWindow(panel, idx) {
  const cx = 120, cy = 150;
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  const sector = (r0, r1, a0, a1) => `M${pt(r1, a0)} A${r1} ${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)} Z`;
  const rings = [[34, 62, 8], [62, 96, 12], [96, 136, 16], [136, 210, 20]];
  let panes = "";
  rings.forEach(([r0, r1, n], ring) => {
    const turn = ring % 2 ? Math.PI / n : 0;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + turn, a1 = ((k + 1) / n) * Math.PI * 2 + turn;
      const h = (k * 7 + ring * 3 + idx) % panel.glass.length;
      let fill = panel.glass[h];
      // a clue for the patient: before anything collided, one green pane was already cracked
      const clue = panel.motif === "whole" && ring === 1 && k === 9;
      if (clue) fill = "#4f9a54";
      const shade = 0.72 + ((k * 13 + ring * 5) % 7) * 0.04;
      panes += `<path d="${sector(r0, r1, a0, a1)}" fill="${fill}" fill-opacity="${shade.toFixed(2)}" style="--i:${ring}"/>`;
      if (clue) panes += `<path class="g-crack" d="M${pt(r0 + 4, a0 + 0.12)} L${pt((r0 + r1) / 2, (a0 + a1) / 2 - 0.05)} L${pt(r1 - 5, a1 - 0.1)}"/>`;
    }
  });
  const arch = "M18 298 V138 Q18 40 120 8 Q222 40 222 138 V298 Z";
  return `<svg class="glass" viewBox="0 0 240 306" aria-hidden="true">
    <defs>
      <clipPath id="arch-${idx}"><path d="${arch}"/></clipPath>
      <radialGradient id="light-${idx}" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
    </defs>
    <g clip-path="url(#arch-${idx})">
      <rect x="0" y="0" width="240" height="306" fill="#140b1c"/>
      <g class="panes">${panes}</g>
      <rect class="g-light" x="0" y="0" width="240" height="306" fill="url(#light-${idx})"/>
    </g>
    <path class="g-frame" d="${arch}"/>
    <circle cx="${cx}" cy="${cy}" r="34" class="g-medallion"/>
    <g class="motif" transform="translate(${cx} ${cy})">${glassMotif(panel.motif)}</g>
  </svg>`;
}

// The centre of each window. Crystals use the same outline as the game's crystals.
function glassMotif(kind) {
  const crystal = (fill, extra = "") => `<g transform="translate(-14 -17) scale(0.7)" ${extra}><path d="${CRYSTAL}" fill="${fill}" stroke="#140b1c" stroke-width="2.5"/><path d="${CRYSTAL_FACETS}" fill="none" stroke="#140b1c" stroke-width="1.5" opacity="0.7"/></g>`;
  if (kind === "whole") return crystal("#efe8ff");
  if (kind === "broken") {
    return `<g transform="translate(-14 -17) scale(0.7)">
      <path d="M20 1 L36 14 L26 22 L20 20 Z" fill="#efe8ff" stroke="#140b1c" stroke-width="2.5" transform="translate(4 -5) rotate(8 20 20)"/>
      <path d="M4 14 L20 1 L20 20 L12 26 Z" fill="#d9ccff" stroke="#140b1c" stroke-width="2.5" transform="translate(-6 -3) rotate(-10 20 20)"/>
      <path d="M12 26 L20 20 L26 22 L32 38 L20 47 L8 38 Z" fill="#c4b2ff" stroke="#140b1c" stroke-width="2.5" transform="translate(0 6)"/>
      <path d="M26 22 L36 14 L32 38 Z" fill="#efe8ff" stroke="#140b1c" stroke-width="2.5" transform="translate(7 3) rotate(12 30 26)"/>
    </g>`;
  }
  if (kind === "factions") {
    const order = Object.keys(DATA.factions).slice(0, 5);
    return order.map((f, i) => {
      const a = -Math.PI / 2 + (i / order.length) * Math.PI * 2;
      return `<circle cx="${(Math.cos(a) * 17).toFixed(1)}" cy="${(Math.sin(a) * 17).toFixed(1)}" r="8" fill="${DATA.factions[f].color}" stroke="#140b1c" stroke-width="2"/>`;
    }).join("") + `<circle r="5" fill="#efe8ff" stroke="#140b1c" stroke-width="2"/>`;
  }
  if (kind === "mystery") return crystal("#2b1d3a", "") + `<path d="M-2 -14 L3 -4 L-3 3 L2 12" fill="none" stroke="#7dff8a" stroke-width="2" opacity="0.85"/>`;
  // keeper: one crystal with light pouring out of it
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<path d="M${(Math.cos(a) * 20).toFixed(1)} ${(Math.sin(a) * 20).toFixed(1)} L${(Math.cos(a) * 31).toFixed(1)} ${(Math.sin(a) * 31).toFixed(1)}" stroke="#ffe7a8" stroke-width="3" stroke-linecap="round"/>`;
  }).join("");
  return rays + crystal("#ffe7a8");
}

// ---------------------------------------------------------------------------
// Playing it
// ---------------------------------------------------------------------------
const INTRO = { i: -1, timer: 0, done: null };
const introEl = document.getElementById("intro") || buildIntroEl();

// Browsers can keep an older index.html for a while after an update, while the scripts
// load fresh. That older page has no #intro, so build it here rather than fail silently.
function buildIntroEl() {
  const el = document.createElement("div");
  el.id = "intro";
  el.className = "intro";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "The story of the Shardfall");
  el.hidden = true;
  el.innerHTML = `<div class="intro-stage" aria-live="polite"></div>
    <button type="button" class="intro-skip btn btn-small">Skip</button>
    <div class="intro-dots" aria-hidden="true"></div>`;
  document.body.appendChild(el);
  return el;
}

function playIntro(done) {
  INTRO.done = done || null;
  INTRO.i = -1;
  introEl.hidden = false;
  document.documentElement.classList.add("intro-on");
  introEl.querySelector(".intro-dots").innerHTML = INTRO_PANELS.map(() => "<i></i>").join("");
  nextIntroPanel();
  introEl.querySelector(".intro-skip").focus({ preventScroll: true });
}

function nextIntroPanel() {
  clearTimeout(INTRO.timer);
  INTRO.i++;
  const stage = introEl.querySelector(".intro-stage");
  if (INTRO.i > INTRO_PANELS.length) { endIntro(); return; }
  if (INTRO.i === INTRO_PANELS.length) {
    stage.innerHTML = `<div class="intro-panel intro-title"><h1>Shardfall</h1></div>`;
    INTRO.timer = setTimeout(nextIntroPanel, INTRO_TITLE_MS);
  } else {
    const p = INTRO_PANELS[INTRO.i];
    stage.innerHTML = `<div class="intro-panel">${glassWindow(p, INTRO.i)}<div class="intro-words">${p.title ? `<h2>${esc(p.title)}</h2>` : ""}<p>${esc(p.text)}</p></div></div>`;
    INTRO.timer = setTimeout(nextIntroPanel, INTRO_PANEL_MS);
  }
  introEl.querySelectorAll(".intro-dots i").forEach((d, k) => d.classList.toggle("on", k <= INTRO.i));
}

function endIntro() {
  clearTimeout(INTRO.timer);
  if (introEl.hidden) return;
  introEl.classList.add("leaving");
  setTimeout(() => {
    introEl.hidden = true;
    introEl.classList.remove("leaving");
    introEl.querySelector(".intro-stage").innerHTML = "";
    document.documentElement.classList.remove("intro-on");
    const done = INTRO.done;
    INTRO.done = null;
    done?.();
  }, REDUCED_MOTION ? 0 : 450);
}

introEl.addEventListener("click", e => {
  if (e.target.closest(".intro-skip")) endIntro();
  else nextIntroPanel();
});
document.addEventListener("keydown", e => {
  if (introEl.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); endIntro(); }
  else if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); nextIntroPanel(); }
});
