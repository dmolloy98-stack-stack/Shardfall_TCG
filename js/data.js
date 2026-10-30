// Shardfall game data.
// Cards, decks, skills and rules live in the data/ folder as plain CSV files, one table
// per file. Edit those files (in GitHub, Excel or Google Sheets) to change the game;
// see data/README.md for what each column means. This script loads them, checks them,
// and then starts the game scripts.

const DATA_FILES = ["game_rules", "phases", "ui_text", "skills", "rarities", "factions", "cards", "decks"];
const GAME_SCRIPTS = ["js/engine.js", "js/ai.js", "js/tutorial.js", "js/help.js", "js/guide.js", "js/decks.js", "js/ui.js"];
let DATA = null;

// Parsing (port of the DATA.load* functions in main.lua)
// ---------------------------------------------------------------------------

// CSV parser that handles quoted fields, e.g. "field,with,comma"
function parseCSVLine(line) {
  const out = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { out.push(field.trim()); field = ""; }
    else field += c;
  }
  out.push(field.trim());
  return out;
}

// Rows of a CSV block, skipping # comments, blank lines and the header row.
function csvRows(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  return lines.slice(1).map(parseCSVLine).filter(row => row.some(Boolean));   // spreadsheet apps can leave empty rows
}

function rgb(r, g, b) {
  const to = v => Math.round((parseFloat(v) || 0) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

function buildData(CSV) {
  const rules = {};
  for (const [id, value, kind] of csvRows(CSV.game_rules)) rules[id] = kind === "number" ? Number(value) : value;

  const phases = csvRows(CSV.phases)
    .map(c => ({ id: c[0], name: c[1], order: Number(c[2]), instruction: c[3] || "" }))
    .sort((a, b) => a.order - b.order);

  const uiText = {};
  for (const [id, text] of csvRows(CSV.ui_text)) uiText[id] = text || "";

  const skills = {};
  const skillOrder = [];
  for (const c of csvRows(CSV.skills)) {
    skills[c[1]] = { id: c[0], name: c[1], icon: c[2] || "•", desc: c[3] || "", order: Number(c[4]) || 9999 };
    skillOrder.push(c[1]);
  }
  skillOrder.sort((a, b) => skills[a].order - skills[b].order);

  const rarities = {};
  const rarityOrder = [];
  for (const c of csvRows(CSV.rarities)) {
    rarities[c[1]] = { name: c[1], color: rgb(c[2], c[3], c[4]), attachCost: Number(c[5]) || 1, order: Number(c[6]) };
    rarityOrder.push(c[1]);
  }

  const factions = {};
  for (const c of csvRows(CSV.factions)) {
    factions[c[0]] = { id: c[0], name: c[1], color: rgb(c[2], c[3], c[4]), symbol: c[5], desc: c[6], order: Number(c[7]) };
  }

  const statsOf = s => {
    const m = (s || "").match(/(-?\d+)\+(-?\d+)\+(-?\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const skillsOf = s => (s || "").split("+").map(x => x.trim()).filter(x => x && x !== "---");

  const cardsById = {}, cardsByName = {}, cardList = [];
  for (const c of csvRows(CSV.cards)) {
    if (c.length < 8 || !c[0] || !c[2]) continue;
    const [attack, health, speed] = statsOf(c[7]);
    const ability = c[9] && c[9] !== "---" ? c[9] : "";
    const card = {
      id: c[0], manaCost: Number(c[1]) || 0, name: c[2], rarity: c[3] || "Basic", type: c[4],
      race: c[5], group: c[6], attack, health, speed, skills: skillsOf(c[8]),
      ability, description: c[10] || "", artKey: c[11] || c[0],
    };
    cardsById[card.id] = card;
    cardsByName[card.name] = card;
    cardList.push(card);
  }

  const decks = {}, deckOrder = [];
  for (const c of csvRows(CSV.decks)) {
    const id = c[0];
    if (!id) continue;
    const deck = { id, name: c[1], faction: c[2], description: c[3], isPlayable: c[4] === "true", isAI: c[5] === "true", cards: [] };
    for (const token of (c[6] || "").split("|").filter(Boolean)) {
      const m = token.match(/^([^:]+):(\d+)$/);
      if (!m || !cardsById[m[1]] || Number(m[2]) <= 0) throw new Error(`data/decks.csv, deck ${id}: "${token}" is not a valid entry. Use CardID:copies with a CardID from data/cards.csv.`);
      deck.cards.push({ cardId: m[1], quantity: Number(m[2]) });
    }
    if (!deck.cards.length) throw new Error(`data/decks.csv, deck ${id}: the CardList is empty.`);
    // Deck-building rules from the design sheet. Problems are reported, not fatal.
    const size = deck.cards.reduce((n, e) => n + e.quantity, 0);
    if (size < (rules.min_deck_size ?? 0)) console.warn(`Deck ${id} has ${size} cards; the minimum is ${rules.min_deck_size}`);
    for (const e of deck.cards) {
      const limit = cardsById[e.cardId].rarity === "Unknown" ? rules.max_unknown_copies : rules.max_copies;
      if (limit && e.quantity > limit) console.warn(`Deck ${id} has ${e.quantity} copies of ${e.cardId}; the limit is ${limit}`);
    }
    decks[id] = deck;
    deckOrder.push(id);
  }

  return {
    rules, phases, uiText, skills, skillOrder, rarities, rarityOrder, factions,
    cardsById, cardsByName, cardList, decks, deckOrder,
    text: (id, fallback) => uiText[id] ?? fallback ?? id,
  };
}

// ---------------------------------------------------------------------------
// Browser startup: load every data file, then the game scripts in order.
// ---------------------------------------------------------------------------
// Throws a readable error if a data file is missing or wrong.
async function loadData() {
  const texts = {};
  await Promise.all(DATA_FILES.map(async name => {
    const res = await fetch(`data/${name}.csv`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`data/${name}.csv could not be loaded (${res.status})`);
    texts[name] = await res.text();
  }));
  DATA = buildData(texts);
  return DATA;
}

// The game scripts are fetched with "no-cache" so the browser checks each one with the
// server (a quick "not changed" answer when it hasn't). Without this, a phone could keep
// old copies of some files after an update and mix them with new ones, which stops the
// game from starting.
async function loadGame() {
  let code;
  try {
    [code] = await Promise.all([
      Promise.all(GAME_SCRIPTS.map(async src => {
        const res = await fetch(src, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${src} could not be loaded (${res.status})`);
        return `${await res.text()}\n//# sourceURL=${new URL(src, location.href)}`;
      })),
      loadData(),
    ]);
  } catch (err) {
    showDataError(err);
    return;
  }
  // Each script runs as soon as it is added, in order. ui.js sets shardfallStarted
  // once everything is in place.
  for (const text of code) {
    const el = document.createElement("script");
    el.textContent = text;
    document.body.appendChild(el);
  }
  if (!window.shardfallStarted) recoverFromBadLoad();
}

// If the game didn't start, the page itself was probably an old copy. Reload once, which
// makes the browser check the page with the server; if that doesn't help, say so.
function recoverFromBadLoad() {
  let last = 0;
  try { last = Number(sessionStorage.getItem("shardfall.reloadedAt")) || 0; } catch { /* no storage */ }
  if (Date.now() - last > 60000) {
    try { sessionStorage.setItem("shardfall.reloadedAt", String(Date.now())); } catch { /* no storage */ }
    location.reload();
    return;
  }
  const box = document.createElement("div");
  box.className = "data-error";
  box.innerHTML = `<h2>The game didn't finish loading</h2>
    <p>This can happen for a few minutes after the game is updated, while your browser still has some old files.</p>
    <p><button type="button" class="btn btn-primary">Try again</button></p>`;
  box.querySelector("button").addEventListener("click", () => location.reload());
  document.getElementById("app").hidden = true;
  document.body.prepend(box);
}

function showDataError(err) {
  const local = location.protocol === "file:";
  const box = document.createElement("div");
  box.className = "data-error";
  box.innerHTML = `<h2>The game data could not be loaded</h2>
    <p>${local
      ? "Browsers block a page opened straight from your computer from reading the data folder. Play from the GitHub Pages link instead, or run a local server in this folder (for example <code>python3 -m http.server</code>, then open http://localhost:8000)."
      : "Check that the data folder is next to index.html and that each CSV file is valid."}</p>
    <p class="detail"></p>`;
  box.querySelector(".detail").textContent = String(err.message || err);
  document.getElementById("app").hidden = true;
  document.body.prepend(box);
  console.error(err);
}

// Pages that only need the data (the How to play guide) load this script with data-only.
if (typeof document !== "undefined" && !document.currentScript?.hasAttribute("data-only")) loadGame();
