// Takes the annotated pictures used by the How to play guide (guide.html) and saves
// them in guide/. Run it again after changing how the board looks:
//
//   node tools/guide-shots.js
//
// Needs Node.js and Playwright (npm install playwright, then npx playwright install chromium).
// It serves this folder itself, sets up each scene with the real game code, draws the
// boxes, numbers and arrows on top, and takes the screenshot.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "guide");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".csv": "text/csv", ".png": "image/png", ".jpg": "image/jpeg" };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

// Runs in the page: draws numbered boxes, labels and arrows over the board.
// Each mark is { box: selectors | [x,y,w,h], n, label, at, arrow: { from: [x,y], to: selector | [x,y] } }.
function annotate(marks) {
  const stage = document.getElementById("stage");
  const sr = stage.getBoundingClientRect();
  const rectOf = sel => {
    if (Array.isArray(sel) && typeof sel[0] === "number") return { x: sel[0], y: sel[1], w: sel[2], h: sel[3] };
    const els = [].concat(sel).flatMap(s => [...document.querySelectorAll(s)]);
    if (!els.length) throw new Error("No element for " + sel);
    const rs = els.map(e => e.getBoundingClientRect());
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
    return { x: l - sr.left, y: t - sr.top, w: Math.max(...rs.map(r => r.right)) - l, h: Math.max(...rs.map(r => r.bottom)) - t };
  };
  const gold = "#ffd27a";
  let svg = `<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${gold}"/></marker>
    <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.9"/></filter></defs>`;
  for (const m of marks) {
    let r = null;
    if (m.box) {
      r = rectOf(m.box);
      const p = m.pad ?? 6;
      r = { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 };
      svg += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="none" stroke="${gold}" stroke-width="3.5" filter="url(#sh)"/>`;
    }
    if (m.arrow) {
      const to = Array.isArray(m.arrow.to) && typeof m.arrow.to[0] === "number" ? m.arrow.to : (() => { const t = rectOf(m.arrow.to); return [t.x + t.w / 2, t.y + t.h / 2]; })();
      const [x1, y1] = m.arrow.from, [x2, y2] = to;
      const bend = m.arrow.bend ?? 0.2;
      const cx = (x1 + x2) / 2 - (y2 - y1) * bend, cy = (y1 + y2) / 2 + (x2 - x1) * bend;
      svg += `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${gold}" stroke-width="5" stroke-linecap="round" marker-end="url(#ah)" filter="url(#sh)"/>`;
    }
    if (m.n != null) {
      const [bx, by] = m.at || [Math.max(20, r.x - 4), Math.max(20, r.y - 4)];
      svg += `<g filter="url(#sh)"><circle cx="${bx}" cy="${by}" r="17" fill="${gold}" stroke="#1b130d" stroke-width="2"/><text x="${bx}" y="${by + 6.5}" text-anchor="middle" font-family="Alegreya Sans, sans-serif" font-weight="800" font-size="19" fill="#1b130d">${m.n}</text></g>`;
    }
    if (m.label) {
      const [lx, ly] = m.at || [r.x, r.y - 30];
      const w = m.label.length * 10.2 + 28;
      svg += `<g filter="url(#sh)"><rect x="${lx}" y="${ly - 22}" width="${w}" height="36" rx="8" fill="#1b0f07" stroke="${gold}" stroke-width="2"/><text x="${lx + 14}" y="${ly + 3}" font-family="Alegreya Sans, sans-serif" font-weight="700" font-size="19" fill="#ffe3a8">${m.label}</text></g>`;
    }
  }
  const layer = document.createElement("div");
  layer.className = "guide-annotations";
  layer.style.cssText = "position:absolute;inset:0;z-index:500;pointer-events:none";
  layer.innerHTML = `<svg width="1440" height="1000" viewBox="0 0 1440 1000" style="position:absolute;inset:0">${svg}</svg>`;
  stage.appendChild(layer);
}

// Runs in the page: a mid-game board with cards in every zone.
function setupBoard({ phase = "setup", select = false } = {}) {
  U.hints = false;
  U.deckId = "simple_starter"; U.mode = "ai";
  newGame({ deckId: "simple_starter", opponentDeckId: "monkey_starter", mode: "ai" });
  const [me, ai] = S.players;
  const put = (p, name) => { const c = cardByName(name); putOnField(c, p); c.hasAttacked = false; return c; };
  S.round = 9; me.manaMax = 5; me.mana = 3; ai.manaMax = 4; ai.mana = 0; ai.manaToken = false;
  me.health = 16; ai.health = 11;
  const sw = put(me, "Simple Swordsman"); put(me, "Simple Farmer"); put(me, "Simple Bowman");
  attach(cardByName("Sword"), sw);
  put(ai, "Fat Monkey"); put(ai, "Chimp"); put(ai, "Orangutan");
  me.field.equips.push(cardByName("Helm"));
  ai.field.areas.push(cardByName("Jungle"));
  me.hand = ["Slap", "Simple Barkeep", "Bow", "Simple Wizard", "Herd"].map(n => cardByName(n));
  me.deck.length = 22; ai.deck.length = 20;
  me.grave = [cardByName("Simple Farmer"), cardByName("Staff")];
  ai.grave = [cardByName("Baby Monkey"), cardByName("Banana"), cardByName("Peel")];
  ai.hand.length = 4;
  S.log = ["Player 1 summons Simple Bowman.", "Computer plays the area Jungle.", "Chimp attacks Player 1 for 2."];
  S.phase = phase === "battle" ? PHASE.BATTLE : PHASE.SETUP;
  me.hasDrawn = true;
  U.curtain = false; U.ended = false;
  showScreen("game");
  if (select) U.selected = sw.uid;
  render();
  document.getElementById("banner").hidden = true;
  document.getElementById("hint").hidden = true;
}

// Runs in the page: a free-standing picture made of cards, for the diagrams.
function showDiagram(html) {
  document.getElementById("app").hidden = true;
  const d = document.createElement("div");
  d.id = "diagram";
  d.style.cssText = "position:fixed;left:0;top:0;padding:28px 36px;background:#1c110a;display:inline-flex;flex-direction:column;align-items:center;gap:18px;font-family:var(--font-body);color:var(--parchment)";
  d.innerHTML = html;
  document.body.appendChild(d);
}

(async () => {
  const server = await serve();
  const url = `http://localhost:${server.address().port}/index.html#menu`;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => { try { localStorage.setItem("shardfall.welcomed", "true"); } catch {} });
  const fresh = async () => { await page.goto(url); await page.waitForFunction(() => typeof startGame === "function"); await page.evaluate(() => document.fonts.ready); };
  const jpg = (name, clip) => page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 84, clip });

  // 1. The whole table, numbered.
  await fresh();
  await page.evaluate(setupBoard, {});
  await page.waitForTimeout(1200);
  await page.evaluate(annotate, [
    { box: '.plate[data-player="1"]', n: 1 },
    { box: ".opp-hand", n: 2 },
    { box: '.field-card[data-side="top"]', n: 3, pad: 10 },
    { box: '.field-card[data-side="bottom"]', n: 4, pad: 10 },
    { box: ".hand-card", n: 5, pad: 4 },
    { box: '.mana[data-player="0"]', n: 6, pad: 10 },
    { box: ".phases", n: 7 },
    { box: '[data-act="phase"]', n: 8 },
    { box: ['.pile.deck[data-player="0"]', '.pile.grave[data-player="0"]'], n: 9 },
    { box: [270, 592, 1040, 135], n: 10 },
    { box: '.plate[data-player="0"]', n: 11 },
    { box: '[data-act="menu"]', n: 12 },
    { box: ".turn-crystal", n: 13 },
  ]);
  await jpg("board.jpg");

  // 2. Playing a card from your hand.
  await fresh();
  await page.evaluate(setupBoard, {});
  await page.waitForTimeout(1200);
  await page.evaluate(annotate, [
    { box: ".hand-card.playable", pad: 4 },
    { arrow: { from: [760, 760], to: [960, 505], bend: 0.15 } },
    { label: "Drag a glowing card onto the table", at: [870, 470] },
    { label: "Glowing green = you have enough mana", at: [1020, 760] },
    { label: "Tap a card to read it", at: [80, 840] },
    { arrow: { from: [330, 836], to: [445, 836], bend: 0 } },
  ]);
  await jpg("play.jpg", { x: 0, y: 360, width: 1440, height: 640 });

  // 3. Attacking.
  await fresh();
  await page.evaluate(setupBoard, { phase: "battle", select: true });
  await page.waitForTimeout(1200);
  await page.evaluate(annotate, [
    { box: ".field-card.selected", pad: 8 },
    { box: '.field-card[data-side="top"]', pad: 10 },
    { box: ".face-btn", pad: 4 },
    { arrow: { from: [372, 486], to: [545, 505], bend: 0.05 } },
    { arrow: { from: [352, 250], to: [543, 268], bend: 0.05 } },
    { arrow: { from: [382, 330], to: [510, 410], bend: -0.1 } },
    { label: "1  Tap one of your characters", at: [40, 490] },
    { label: "2  Tap an enemy to fight it", at: [40, 250] },
    { label: "3  …or hit the player directly", at: [40, 330] },
  ]);
  await jpg("battle.jpg", { x: 0, y: 66, width: 1440, height: 534 });

  // The diagrams are taken at double resolution so their small text stays sharp.
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { try { localStorage.setItem("shardfall.welcomed", "true"); } catch {} });

  // 4. Card anatomy.
  await fresh();
  const anatomy = await page.evaluate(() => { newGame({ deckId: "simple_starter", mode: "ai" }); return `<div style="font-size:22px">${anatomyHTML(cardByName("Simple Bowman"))}</div>`; });
  await page.evaluate(showDiagram, anatomy);
  await page.waitForTimeout(300);
  await (await page.$("#diagram")).screenshot({ path: path.join(OUT, "card.png") });

  // 5. A fight, step by step.
  await fresh();
  const fight = await page.evaluate(() => {
    newGame({ deckId: "simple_starter", mode: "ai" });
    const card = n => `<div style="font-size:19px">${cardHTML(cardByName(n))}</div>`;
    const lab = (t, s) => `<div style="text-align:center;max-width:230px"><b style="font-size:20px;color:#ffe3a8">${t}</b><div style="color:#b7a68a;font-size:16px">${s}</div></div>`;
    return `<div style="display:flex;align-items:center;gap:26px">
      <div style="display:grid;gap:10px;justify-items:center">${lab("Attacker", "Simple Bowman")}${card("Simple Bowman")}</div>
      <div style="font-size:54px;color:#ffd27a;line-height:1">⚔</div>
      <div style="display:grid;gap:10px;justify-items:center">${lab("Defender", "Simple Farmer")}${card("Simple Farmer")}</div></div>
      <ol style="margin:0;padding-left:1.3em;font-size:19px;line-height:1.5;max-width:560px">
        <li><b style="color:#ffe3a8">Compare ⚡ Speed.</b> The Bowman's 2 beats the Farmer's 1, so the Bowman strikes first.</li>
        <li><b style="color:#ffe3a8">The Bowman deals its ⚔ Attack</b> (1) to the Farmer's ♥ Health (1).</li>
        <li><b style="color:#ffe3a8">The Farmer drops to 0 Health</b> and is knocked out before it can strike back.</li></ol>`;
  });
  await page.evaluate(showDiagram, fight);
  await page.waitForTimeout(300);
  await (await page.$("#diagram")).screenshot({ path: path.join(OUT, "fight.png") });

  // 6. Equipment adds to a character's stats.
  await fresh();
  const equip = await page.evaluate(() => {
    newGame({ deckId: "simple_starter", mode: "ai" });
    const f = cardByName("Simple Farmer"); putOnField(f, S.players[0]); attach(cardByName("Sword"), f);
    const card = (c, o) => `<div style="font-size:19px">${cardHTML(c, o)}</div>`;
    const sign = t => `<div style="font-size:48px;color:#ffd27a;font-weight:800">${t}</div>`;
    return `<div style="display:flex;align-items:center;gap:22px">${card(cardByName("Simple Farmer"))}${sign("+")}${card(cardByName("Sword"))}${sign("=")}${card(f, { field: true })}</div>
      <p style="margin:0;font-size:19px;max-width:620px;text-align:center">The Sword's <b style="color:#ffe3a8">+1 Attack</b> is added to the Farmer. Underlined numbers on the table show a bonus.</p>`;
  });
  await page.evaluate(showDiagram, equip);
  await page.waitForTimeout(300);
  await (await page.$("#diagram")).screenshot({ path: path.join(OUT, "equip.png") });

  await browser.close();
  server.close();
  console.log("Saved pictures in", OUT);
})().catch(err => { console.error(err); process.exit(1); });
