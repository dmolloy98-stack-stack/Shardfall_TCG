// Help for new players: beginner hints during a game, the first-visit welcome,
// and the illustrated How to play guide (guide.html) shown inside the game.

// Saved preferences. Storage can be unavailable (private windows), so every
// read and write is allowed to fail.
const PREFS = {
  get(key, fallback) {
    try { const v = localStorage.getItem("shardfall." + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("shardfall." + key, JSON.stringify(value)); } catch { /* not saved */ }
  },
};

// ---------------------------------------------------------------------------
// Beginner hints: one short tip for what you can do right now.
// ---------------------------------------------------------------------------
function hintText() {
  if (!S || S.over || U.curtain || U.tutorial) return null;
  const p = active();
  if (p.isAI) return `${p.name === "Computer" ? "The computer" : p.name} is taking its turn. You can tap any card to read it while you wait.`;
  const pd = S.pending;
  if (pd?.kind === "choose") return null;
  if (pd?.kind === "target") {
    const where = pd.targetType === "charOrPlayer" ? "a glowing card or a health bar" : pd.targetType === "area" ? "a glowing area" : "a glowing card";
    return `${pd.source.name} needs a target: tap ${where}.${pd.required ? "" : " Press Cancel to choose nothing."}`;
  }
  if (U.armed) return "Tap one of your characters to give it this equipment. Its numbers are added to the character's stats.";
  if (U.selected) {
    const forced = forcedTarget(opponent());
    if (forced) return `${forced.name} has Challenge (!), so your attack has to go to it first.`;
    return "Tap an enemy glowing red to fight it, or attack the player directly. Higher ⚡ Speed strikes first; on a tie, the attacker does.";
  }
  if (S.phase === PHASE.DRAW) return "Your turn starts with the Draw step. Press “Draw card” to take the top card of your deck.";
  if (S.phase === PHASE.SETUP) {
    if (p.hand.some(c => canPlay(c, p))) return `Setup: cards glowing green in your hand fit your ${p.mana} mana. Drag one onto the table, or tap it to read it first.`;
    if (p.manaToken && p.hand.some(c => playCost(c, p) === p.mana + 1 && !UNIMPLEMENTED.has(c.name))) return "Tap the +1 beside your mana to use your one-time bonus mana and afford one more card.";
    if (p.field.equips.some(e => canAttachFromField(e, p))) return `You can attach equipment saved in your ${SUPPORT_ROW()} row: tap it, then tap a character. Or press “To battle →”.`;
    return "Nothing else in your hand fits your mana this turn. Press “To battle →” to attack. Unspent mana doesn't carry over.";
  }
  if (S.phase === PHASE.BATTLE) {
    if (p.field.chars.some(c => canAttack(c))) return "Battle: characters with a green outline can attack. Tap one, then tap an enemy or attack the player directly. Each character attacks once per turn.";
    if (p.field.chars.length) return "None of your characters can attack right now. New characters wait a turn unless they have Rush, and Tower characters never attack. Press “To end →”.";
    return "You have no characters to attack with. Press “To end →”.";
  }
  return "End step: press “Pass turn →”. Some cards do something at the end of your turn.";
}

function setHints(on) {
  U.hints = on;
  U.hintOpen = true;
  PREFS.set("hints", on);
  if (!on) U.hintNoteUntil = performance.now() + 4000;
  if (U.screen === "game") renderHint();
  if (!on) setTimeout(() => { if (U.screen === "game") renderHint(); }, 4100);
}

function renderHint() {
  const box = document.getElementById("hint");
  const note = !U.hints && performance.now() < U.hintNoteUntil;
  const text = U.hints && U.screen === "game" ? hintText() : null;
  if (!text && !note) { box.hidden = true; return; }
  box.hidden = false;
  if (note) box.innerHTML = `<p>Hints are off. You can turn them back on from ☰ Menu.</p>`;
  else if (!U.hintOpen) box.innerHTML = `<button type="button" class="hint-chip" data-hint="show" aria-label="Show hint">💡 Hint</button>`;
  else box.innerHTML = `<div class="hint-head"><b>💡 Hint</b><button type="button" class="hint-x" data-hint="hide" aria-label="Hide this hint">✕</button></div>
    <p>${esc(text)}</p><button type="button" class="hint-off" data-hint="off">Turn off hints</button>`;
  box.classList.toggle("collapsed", !note && !U.hintOpen);

  // Beside the board when there is room, otherwise over its bottom-left corner.
  // The wrap is the screen minus any notch, so nothing lands under it.
  const sr = document.getElementById("stage").getBoundingClientRect();
  const wr = document.getElementById("stage-wrap").getBoundingClientRect();
  const gutter = sr.left - wr.left;
  box.classList.toggle("narrow", gutter >= 120 && gutter < 200);
  box.style.maxHeight = wr.height - 16 + "px";
  if (gutter >= 120) {
    const w = Math.min(gutter - 12, 300);
    Object.assign(box.style, { left: wr.left + (gutter - w) / 2 + "px", width: w + "px", top: "", bottom: "" });
    box.style.top = Math.max(wr.top + 8, sr.top + sr.height * 0.5 - box.offsetHeight / 2) + "px";
  } else {
    const w = Math.max(180, Math.min(320, 500 * U.scale));
    Object.assign(box.style, { left: sr.left + 10 + "px", width: w + "px", top: "", bottom: innerHeight - sr.bottom + 72 * U.scale + "px" });
  }
}

// ---------------------------------------------------------------------------
// Phone controls: on a small screen the board's buttons are only a few pixels
// tall, so the main ones are repeated at full size in the space beside the board.
// Each one presses the matching board button, so the rules stay in one place.
// ---------------------------------------------------------------------------
function renderControls() {
  const bar = document.getElementById("controls");
  const sr = document.getElementById("stage").getBoundingClientRect();
  const wr = document.getElementById("stage-wrap").getBoundingClientRect();
  const gutter = wr.right - sr.right;
  if (U.screen !== "game" || !S || !U.small || U.tutorial || gutter < 96) { bar.hidden = true; return; }
  const board = document.getElementById("board");
  const btn = (act, cls = "") => {
    const b = board.querySelector(`[data-act="${act}"]`);
    if (!b) return "";
    return `<button type="button" class="btn ${cls}" data-press="${act}" ${b.disabled ? "disabled" : ""}>${esc(b.textContent.trim())}</button>`;
  };
  let h = btn("menu", "btn-small");
  if (U.curtain) h += btn("curtain", "btn-primary");
  else if (U.ended) h += btn("again", "btn-primary") + btn("tomenu");
  else {
    h += btn("face", "danger");
    if (U.armed || U.selected || (S.pending?.kind === "target" && !S.pending.required && !S.players[S.pending.owner].isAI)) h += `<button type="button" class="btn" data-press="cancel">Cancel</button>`;
    h += btn("phase", S.phase === PHASE.DRAW ? "btn-primary" : "");
    if (S.phase !== PHASE.END) h += btn("pass");
  }
  bar.hidden = false;
  bar.innerHTML = h;
  const w = Math.min(gutter - 16, 190);
  Object.assign(bar.style, { left: sr.right + (gutter - w) / 2 + "px", width: w + "px", top: wr.top + 8 + "px", height: wr.height - 16 + "px" });
}
document.getElementById("controls").addEventListener("click", e => {
  const b = e.target.closest("[data-press]");
  if (!b) return;
  if (b.dataset.press === "cancel") cancelSomething();
  else document.querySelector(`#board [data-act="${b.dataset.press}"]`)?.click();
});

// Held upright, a phone shows the board very small. Suggest turning it sideways,
// but let people carry on if their screen won't rotate.
let portraitOk = false;
function renderRotate() {
  const el = document.getElementById("rotate");
  const upright = innerWidth < innerHeight && innerWidth < 700;
  el.hidden = U.screen !== "game" || !upright || portraitOk;
}
document.getElementById("rotate").addEventListener("click", e => {
  if (!e.target.closest("[data-upright]")) return;
  portraitOk = true;
  renderRotate();
});

document.getElementById("hint").addEventListener("click", e => {
  const b = e.target.closest("[data-hint]");
  if (!b) return;
  if (b.dataset.hint === "hide") U.hintOpen = false;
  else if (b.dataset.hint === "show") U.hintOpen = true;
  else if (b.dataset.hint === "off") { setHints(false); return; }
  renderHint();
});

// ---------------------------------------------------------------------------
// First visit
// ---------------------------------------------------------------------------
function showWelcome() {
  PREFS.set("welcomed", true);
  openModal(`<div class="welcome"><h2 id="modal-title">Welcome to Shardfall</h2>
    <p class="sub">New to card games? Start here.</p>
    <p>The tutorial teaches you by playing a short game, one step at a time. It takes about five minutes.</p>
    <div class="detail-actions">
      <button type="button" class="btn btn-primary" data-w="tutorial">Start the tutorial</button>
      <button type="button" class="btn" data-w="guide">Read How to play</button>
    </div>
    <button type="button" class="link-btn" data-close>Skip, I know how to play</button></div>`);
}
document.getElementById("modal").addEventListener("click", e => {
  const b = e.target.closest("[data-w]");
  if (!b) return;
  closeModal();
  if (b.dataset.w === "tutorial") startTutorial(); else showGuide();
});

// ---------------------------------------------------------------------------
// How to play: guide.html is the one copy of the guide. It opens as its own page
// for sharing, and inside the game its main section is shown on the guide screen.
// ---------------------------------------------------------------------------
function showGuide() {
  if (U.screen === "game") { U.guideReturn = "game"; clearTimeout(U.aiTimer); }
  else U.guideReturn = "menu";
  showScreen("guide");
}

let guideLoaded = false;
async function loadGuide() {
  const box = document.getElementById("guide-content");
  if (guideLoaded) { box.scrollTop = 0; return; }
  try {
    const res = await fetch("guide.html", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    box.innerHTML = doc.getElementById("guide-main").innerHTML;
    // The guide's own "start the tutorial" links start it in place here.
    box.querySelectorAll('a[href$="#tutorial"]').forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); startTutorial(); }));
    fillGuide(box, DATA);
    guideLoaded = true;
  } catch {
    box.innerHTML = `<p>The guide could not be loaded. You can read it at <a href="guide.html">guide.html</a>.</p>`;
  }
}
