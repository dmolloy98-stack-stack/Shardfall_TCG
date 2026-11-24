// Shardfall game data.
// Cards, decks, skills and rules live in the data/ folder as plain CSV files, one table
// per file. Edit those files (in GitHub, Excel or Google Sheets) to change the game;
// see data/README.md for what each column means. This script loads them, checks them,
// and then starts the game scripts.

const DATA_FILES = ["game_rules", "phases", "ui_text", "skills", "rarities", "factions", "cards", "decks", "events", "champion_abilities", "whats_new", "trophies", "mastery", "ai_styles"];
const GAME_SCRIPTS = ["js/saves.js", "js/engine.js", "js/rules-combat.js", "js/rules-turns.js", "js/rules-play.js", "js/rules-champions.js", "js/rules-events.js", "js/rules-shard.js", "js/effects.js", "js/ai.js", "js/dom.js", "js/tutorial.js", "js/tutorial-steps.js", "js/help.js", "js/guide.js", "js/decks.js", "js/fx.js", "js/previews.js", "js/motion.js", "js/intro.js", "js/cards.js", "js/ui.js", "js/board.js", "js/board-marks.js", "js/input.js", "js/table-effects.js", "js/panels.js", "js/menu.js", "js/storm.js", "js/champions.js", "js/campaign.js", "js/progress.js", "js/boot.js"];
let DATA = null;

// Words players read (data/ui_text.csv). T("id") gives the text; T("id", { name: "Ann" }) fills in
// {name}. A TextID missing from the file shows as [id], so it is easy to spot (tools/words-test.js
// checks every T("...") in the code has its row).
function T(id, vars) {
  let t = DATA.uiText[id];
  if (t == null) { console.warn(`No words for "${id}" in data/ui_text.csv`); return `[${id}]`; }
  if (vars) t = t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return t;
}
// Fills every element marked data-t="id" in the page with its words (index.html).
function fillWords(root = document) { for (const el of root.querySelectorAll("[data-t]")) el.textContent = T(el.dataset.t); }

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
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  return lines.slice(1).map(parseCSVLine).filter(row => row.some(Boolean));   // spreadsheet apps can leave empty rows
}

// The rows of a table as objects named by the header row: row.CardID, row.Effect. Columns are found
// by their name, so a column can be moved or added in the sheet without breaking the game. A column
// the game needs that is missing stops it with a message naming the file and the column.
function csvTable(text, file, needs = []) {
  const lines = (text || "").replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  if (!lines.length) return [];
  const head = parseCSVLine(lines[0]);
  const missing = needs.filter(n => !head.includes(n));
  if (missing.length) throw new Error(`data/${file}.csv: the column${missing.length > 1 ? "s" : ""} ${missing.map(m => `"${m}"`).join(", ")} ${missing.length > 1 ? "are" : "is"} missing from the header row. Its columns are: ${head.join(", ")}.`);
  return lines.slice(1).map(parseCSVLine).filter(row => row.some(Boolean))
    .map(row => Object.fromEntries(head.map((h, i) => [h, row[i] ?? ""])));
}

function rgb(r, g, b) {
  const to = v => Math.round((parseFloat(v) || 0) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

// ---------------------------------------------------------------------------
// One reader per table. buildData() calls them in order and checks the cards and decks.
// ---------------------------------------------------------------------------
function readRules(text) {
  const rules = {};
  for (const r of csvTable(text, "game_rules", ["RuleID", "Value", "ValueType"])) rules[r.RuleID] = r.ValueType === "number" ? Number(r.Value) : r.Value;
  return rules;
}
const readPhases = text => csvTable(text, "phases", ["PhaseID", "Name", "DisplayOrder"])
  .map(r => ({ id: r.PhaseID, name: r.Name, order: Number(r.DisplayOrder), instruction: r.Instruction || "" }))
  .sort((a, b) => a.order - b.order);
function readUiText(text) {
  const uiText = {};
  for (const r of csvTable(text, "ui_text", ["TextID", "Text"])) uiText[r.TextID] = r.Text || "";
  return uiText;
}
// Random events (data/events.csv): what each one is called and how it is described to players.
// What an event does is written in js/rules-events.js, keyed by its EventID.
function readEvents(text) {
  const events = {}, eventOrder = [];
  for (const r of csvTable(text, "events", ["EventID", "Name", "Description"])) { events[r.EventID] = { id: r.EventID, name: r.Name, desc: r.Description || "" }; eventOrder.push(r.EventID); }
  return { events, eventOrder };
}
// Champion abilities (data/champion_abilities.csv): the wording shown to players. What each one does is in js/rules-champions.js.
function readChampionAbilities(text) {
  const out = {};
  for (const r of csvTable(text, "champion_abilities", ["ChampionID", "AbilityName", "Now", "LevelUpWhen", "Then", "Goal", "Counts"])) {
    out[r.ChampionID] = { id: r.ChampionID, name: r.AbilityName, now: r.Now || "", when: r.LevelUpWhen || "", then: r.Then || "", goal: Number(r.Goal) || 0, counts: r.Counts || "" };
  }
  return out;
}
function readSkills(text) {
  const skills = {}, skillOrder = [];
  for (const r of csvTable(text, "skills", ["SkillID", "Name", "IconKey", "Description", "DisplayOrder"])) {
    skills[r.Name] = { id: r.SkillID, name: r.Name, icon: r.IconKey || "•", desc: r.Description || "", order: Number(r.DisplayOrder) || 9999 };
    skillOrder.push(r.Name);
  }
  skillOrder.sort((a, b) => skills[a].order - skills[b].order);
  return { skills, skillOrder };
}
function readRarities(text) {
  const rarities = {}, rarityOrder = [];
  for (const r of csvTable(text, "rarities", ["Name", "EdgeR", "EdgeG", "EdgeB", "EquipmentAttachCost", "DisplayOrder"])) {
    const cost = r.EquipmentAttachCost;
    rarities[r.Name] = { name: r.Name, color: rgb(r.EdgeR, r.EdgeG, r.EdgeB), attachCost: cost !== "" && Number.isFinite(Number(cost)) ? Number(cost) : 1, order: Number(r.DisplayOrder), frame: r.Frame || "chip" };
    rarityOrder.push(r.Name);
  }
  return { rarities, rarityOrder };
}
function readFactions(text) {
  const factions = {};
  for (const r of csvTable(text, "factions", ["FactionID", "Name", "ColorR", "ColorG", "ColorB"])) {
    factions[r.FactionID] = { id: r.FactionID, name: r.Name, color: rgb(r.ColorR, r.ColorG, r.ColorB), symbol: r.SymbolKey, desc: r.Description, order: Number(r.DisplayOrder) };
  }
  return factions;
}
// What's new (data/whats_new.csv): one entry per update, newest first. The newest is the version
// the menu shows, and the one a bug report names.
const readWhatsNew = text => csvTable(text, "whats_new", ["Update", "Date", "Changes"])
  .map(r => ({ update: r.Update, date: r.Date || "", changes: (r.Changes || "").split("|").map(x => x.trim()).filter(Boolean) }));

// Trophies (data/trophies.csv): names, words and goal numbers. What each one checks is js/progress.js.
const readTrophies = text => csvTable(text, "trophies", ["TrophyID", "Name", "How", "Goal"])
  .map(r => ({ id: r.TrophyID, name: r.Name, how: r.How, goal: r.Goal === "" ? null : Number(r.Goal) }));
// Deck mastery titles (data/mastery.csv): DeckID -> five titles.
function readMastery(text) {
  const out = {};
  for (const r of csvTable(text, "mastery", ["DeckID", "Title1", "Title2", "Title3", "Title4", "Title5"])) out[r.DeckID] = [1, 2, 3, 4, 5].map(k => r["Title" + k]);
  return out;
}
// How the computer plays each fracture (data/ai_styles.csv): Fracture -> { face, board, hand, wild }.
function readAiStyles(text) {
  const out = {};
  for (const r of csvTable(text, "ai_styles", ["Fracture", "Face", "Board", "Hand", "Wild"])) out[r.Fracture] = { face: Number(r.Face), board: Number(r.Board), hand: Number(r.Hand), wild: Number(r.Wild) || 0 };
  return out;
}

const CARD_TYPES = ["Character", "Spell", "Equipment", "Area"];
const CARD_COLUMNS = ["CardID", "Cost", "Name", "Rarity", "Type", "Tribes", "Fracture", "Stats", "Skills", "Ability", "Description", "ArtKey", "Effect", "Classes"];

// The cards (data/cards.csv), checked one by one. A typing mistake stops the game with a message
// naming the card, the same way a mistake in a deck list or an Effect does. Without this, a
// misspelled skill or faction was ignored without a word and the card just played wrong.
function readCards(text, { rarities, rarityOrder, factions, skills, skillOrder }) {
  const statsOf = s => {
    // Attack+Health. An older third number (Speed, now removed) is ignored.
    const m = (s || "").match(/(-?\d+)\+(-?\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const namesOf = s => (s || "").split("+").map(x => x.trim()).filter(x => x && x !== "---");   // skills, tribes and classes: Human+Monkey
  const fracturesOf = s => { const l = namesOf(s); return l.length ? l : ["N/A"]; };
  const cardsById = {}, cardsByName = {}, cardList = [];
  const checkCard = card => {
    const bad = (what, value, list) => { throw new Error(`data/cards.csv, card ${card.id}: ${what} "${value}" is not known. Use one of: ${list.join(", ")}.`); };
    if (cardsById[card.id]) throw new Error(`data/cards.csv: the CardID ${card.id} is used twice.`);
    if (cardsByName[card.name]) throw new Error(`data/cards.csv: two cards are named "${card.name}" (${cardsByName[card.name].id} and ${card.id}).`);
    if (!CARD_TYPES.includes(card.type)) bad("the Type", card.type, CARD_TYPES);
    if (!rarities[card.rarity]) bad("the Rarity", card.rarity, rarityOrder);
    for (const g of card.groups) if (g !== "N/A" && !factions[g]) bad("the Fracture", g, [...Object.keys(factions), "N/A"]);
    if (card.groups.length > 1 && card.groups.includes("N/A")) bad("the Fracture", card.groups.join("+"), Object.keys(factions));
    for (const k of [...card.tribes, ...card.classes]) if (/[a-z]:/.test(k)) bad("the tribe or class", k, ["a plain name"]);
    if (card.type !== "Character" && (card.tribes.length || card.classes.length)) throw new Error(`data/cards.csv, card ${card.id}: only characters have tribes and classes. Use --- for a ${card.type}.`);
    for (const s of card.skills) if (!skills[s]) bad("the skill", s, skillOrder);
  };
  for (const r of csvTable(text, "cards", CARD_COLUMNS)) {
    if (!r.CardID || !r.Name || !r.Type) continue;
    const [attack, health] = statsOf(r.Stats);
    const card = {
      id: r.CardID, manaCost: Number(r.Cost) || 0, name: r.Name, rarity: r.Rarity || "Basic", type: r.Type,
      // Fracture (where it is from; a hybrid lists two, "Mortal+Wild"; the first sets its color),
      // tribes (species) and classes (job). The names in these three lists must not clash with a
      // CardID, so "allies.Human" can't mean a card.
      group: fracturesOf(r.Fracture)[0], groups: fracturesOf(r.Fracture), tribes: namesOf(r.Tribes), classes: namesOf(r.Classes),
      attack, health, skills: namesOf(r.Skills),
      ability: r.Ability && r.Ability !== "---" ? r.Ability : "", description: r.Description || "", artKey: r.ArtKey || r.CardID,
      effect: (r.Effect || "").trim(),   // what the card does, read by js/effects.js
    };
    checkCard(card);
    cardsById[card.id] = card;
    cardsByName[card.name] = card;
    cardList.push(card);
  }
  return { cardsById, cardsByName, cardList };
}

// The starter decks (data/decks.csv). A broken entry stops the game; breaking the deck-building
// rules from the design sheet is only reported (warnings).
function readDecks(text, cardsById, rules, warnings) {
  const decks = {}, deckOrder = [];
  for (const r of csvTable(text, "decks", ["DeckID", "Name", "Faction", "Description", "IsPlayable", "IsAI", "CardList"])) {
    const id = r.DeckID;
    if (!id) continue;
    const deck = { id, name: r.Name, faction: r.Faction, description: r.Description, isPlayable: r.IsPlayable === "true", isAI: r.IsAI === "true", cards: [] };
    for (const token of (r.CardList || "").split("|").filter(Boolean)) {
      const m = token.match(/^([^:]+):(\d+)$/);
      if (!m || !cardsById[m[1]] || Number(m[2]) <= 0) throw new Error(`data/decks.csv, deck ${id}: "${token}" is not a valid entry. Use CardID:copies with a CardID from data/cards.csv.`);
      deck.cards.push({ cardId: m[1], quantity: Number(m[2]) });
    }
    if (!deck.cards.length) throw new Error(`data/decks.csv, deck ${id}: the CardList is empty.`);
    const size = deck.cards.reduce((n, e) => n + e.quantity, 0);
    if (size < (rules.min_deck_size ?? 0)) warnings.push(`data/decks.csv, deck ${id}: it has ${size} cards; the minimum is ${rules.min_deck_size}.`);
    for (const e of deck.cards) {
      const limit = cardsById[e.cardId].rarity === "Unknown" ? rules.max_unknown_copies : rules.max_copies;
      if (limit && e.quantity > limit) warnings.push(`data/decks.csv, deck ${id}: it has ${e.quantity} copies of ${e.cardId}; the limit is ${limit}.`);
    }
    const champions = deck.cards.filter(e => cardsById[e.cardId].rarity === "Unknown").length;
    if (rules.max_unknown_kinds != null && champions > rules.max_unknown_kinds) warnings.push(`data/decks.csv, deck ${id}: it has ${champions} different champions (Unknown cards); the limit is ${rules.max_unknown_kinds}.`);
    decks[id] = deck;
    deckOrder.push(id);
  }
  return { decks, deckOrder };
}

function buildData(CSV) {
  const warnings = [];   // mistakes the game can live with; shown on the menu and failed by tools/data-test.js
  const rules = readRules(CSV.game_rules);
  const uiText = readUiText(CSV.ui_text);
  const kinds = { ...readSkills(CSV.skills), ...readRarities(CSV.rarities), factions: readFactions(CSV.factions) };
  const cards = readCards(CSV.cards, kinds);
  const whatsNew = readWhatsNew(CSV.whats_new);
  return {
    warnings,
    whatsNew, version: whatsNew[0] ? `Update ${whatsNew[0].update}` : "",
    rules, phases: readPhases(CSV.phases), uiText, ...readEvents(CSV.events), championAbilities: readChampionAbilities(CSV.champion_abilities),
    ...kinds, ...cards, ...readDecks(CSV.decks, cards.cardsById, rules, warnings),
    trophies: readTrophies(CSV.trophies), mastery: readMastery(CSV.mastery), aiStyles: readAiStyles(CSV.ai_styles),
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
  // Each script runs as soon as it is added, in order. boot.js sets shardfallStarted
  // once everything is in place.
  // A mistake in a card's Effect stops a script while it reads the cards; catch it to say so.
  const errors = [];
  const onError = e => errors.push(e.error || e.message);
  window.addEventListener("error", onError);
  for (const text of code) {
    const el = document.createElement("script");
    el.textContent = text;
    document.body.appendChild(el);
  }
  window.removeEventListener("error", onError);
  const dataMistake = errors.find(e => /^data\//.test(String(e?.message || e)));
  if (dataMistake) { showDataError(dataMistake); return; }   // even if the rest started, the cards are wrong
  if (!window.shardfallStarted) { recoverFromBadLoad(); return; }
  if (DATA.warnings.length) showDataWarnings(DATA.warnings);
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
  const mistake = /^data\//.test(String(err.message || err));   // a mistake in a data file, named in the message
  box.innerHTML = mistake
    ? `<h2>There is a mistake in the card data</h2>
    <p class="detail"></p>
    <p>The message names the file and the row. Fix it there (on GitHub: open the file, press the pencil, change the row, and commit), and the game starts again. The card sheet's Effects guide lists every word an Effect can use.</p>`
    : `<h2>The game data could not be loaded</h2>
    <p>${local
      ? "Browsers block a page opened straight from your computer from reading the data folder. Play from the GitHub Pages link instead, or run a local server in this folder (for example <code>python3 -m http.server</code>, then open http://localhost:8000)."
      : "Check that the data folder is next to index.html and that each CSV file is valid."}</p>
    <p class="detail"></p>`;
  box.querySelector(".detail").textContent = String(err.message || err);
  document.getElementById("app").hidden = true;
  document.body.prepend(box);
  console.error(err);
}

// Mistakes the game can live with (a deck breaking the deck rules): the game still starts, with a
// note at the top of the page listing them, so whoever edited the data sees it at once.
function showDataWarnings(list) {
  const box = document.createElement("div");
  box.className = "data-error data-warning";
  box.setAttribute("role", "alert");
  box.innerHTML = `<h2>The card data has ${list.length === 1 ? "a problem" : list.length + " problems"}</h2><ul></ul><p>The game still works. Fix these in the files named, and this note goes away.</p><p><button type="button" class="btn btn-small">Hide for now</button></p>`;
  for (const w of list) { const li = document.createElement("li"); li.textContent = w; box.querySelector("ul").appendChild(li); }
  box.querySelector("button").addEventListener("click", () => box.remove());
  document.body.prepend(box);
}

// Pages that only need the data (the How to play guide) load this script with data-only.
if (typeof document !== "undefined" && !document.currentScript?.hasAttribute("data-only")) loadGame();
