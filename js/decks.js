// Custom decks: the deck builder screen, saving decks on this device, and a short
// walkthrough the first time someone builds a deck. Saved decks are added to
// DATA.decks (marked custom) so the engine plays them like the starter decks; they
// are kept out of DATA.deckOrder, so the computer only ever picks a starter deck.

const DECK_RULES = {
  min: DATA.rules.min_deck_size ?? 35,
  copies: DATA.rules.max_copies ?? 4,
  unknownCopies: DATA.rules.max_unknown_copies ?? 2,
};
const copyLimit = card => (card.rarity === "Unknown" ? DECK_RULES.unknownCopies : DECK_RULES.copies);
// Cards that can go in a deck: every card the game knows how to play.
const buildable = card => !UNIMPLEMENTED.has(card.name);

// Saved decks: [{ id, name, cards: { cardId: copies } }]. Cards that are no longer in
// data/cards.csv, or over the copy limit after a rules change, are dropped quietly.
function savedDecks() {
  const list = PREFS.get("decks", []);
  if (!Array.isArray(list)) return [];
  return list.filter(d => d && d.id && d.cards).map(d => {
    const cards = {};
    for (const [id, n] of Object.entries(d.cards)) {
      const card = DATA.cardsById[id];
      if (card && buildable(card) && n > 0) cards[id] = Math.min(n, copyLimit(card));
    }
    return { id: String(d.id), name: String(d.name || "My deck").slice(0, 28), cards };
  });
}
const deckSize = cards => Object.values(cards).reduce((a, b) => a + b, 0);

// A deck takes the color and board of the faction it has the most cards from.
function mainFaction(cards) {
  const count = {};
  for (const [id, n] of Object.entries(cards)) {
    const g = DATA.cardsById[id].group;
    if (DATA.factions[g]) count[g] = (count[g] || 0) + n;
  }
  const best = Object.keys(count).sort((a, b) => count[b] - count[a] || DATA.factions[a].order - DATA.factions[b].order)[0];
  return best || "N/A";
}

function registerCustomDecks() {
  for (const id of Object.keys(DATA.decks)) if (DATA.decks[id].custom) delete DATA.decks[id];
  for (const d of savedDecks()) {
    const size = deckSize(d.cards);
    DATA.decks[d.id] = {
      id: d.id, name: d.name, faction: mainFaction(d.cards), custom: true, isPlayable: true, isAI: false,
      size, ready: size >= DECK_RULES.min,
      description: size >= DECK_RULES.min ? `Your deck · ${size} cards` : `Unfinished · ${size} of ${DECK_RULES.min} cards`,
      cards: Object.entries(d.cards).map(([cardId, quantity]) => ({ cardId, quantity })),
    };
  }
}
registerCustomDecks();

// Why a deck can't be played yet, or null when it's ready.
function deckProblem(deckId) {
  const d = DATA.decks[deckId];
  if (!d) return "Choose a deck.";
  if (d.custom && !d.ready) return `${d.name} needs ${DECK_RULES.min - d.size} more card${DECK_RULES.min - d.size === 1 ? "" : "s"} before you can play it. Tap Edit to finish it.`;
  return null;
}

// ---------------------------------------------------------------------------
// Builder screen
// ---------------------------------------------------------------------------
const B = { id: null, name: "", cards: {}, saved: "", faction: "All", type: "All", sheet: false, walk: -1 };
const byId = id => document.getElementById(id);
const TYPES = ["Character", "Spell", "Equipment", "Area"];

// Start a new deck: empty, or a copy of a starter deck to change.
function createDeck() {
  const starters = DATA.deckOrder.filter(id => DATA.decks[id].isPlayable);
  openModal(`<h2 id="modal-title">Create your own deck</h2>
    <p class="sub">Start from scratch, or copy a starter deck and change it.</p>
    <div class="menu-list">
      <button type="button" class="btn btn-primary" data-new="">Start with an empty deck</button>
      ${starters.map(id => `<button type="button" class="btn" data-new="${id}">Copy the ${esc(DATA.decks[id].name)}</button>`).join("")}
    </div>`);
}
byId("modal").addEventListener("click", e => {
  const b = e.target.closest("[data-new]");
  if (!b) return;
  closeModal();
  const from = DATA.decks[b.dataset.new];
  const cards = {};
  for (const en of from?.cards || []) if (buildable(DATA.cardsById[en.cardId])) cards[en.cardId] = en.quantity;
  openBuilder({ id: null, name: from ? `My ${from.faction} deck` : "My deck", cards });
});

function editDeck(id) {
  const d = savedDecks().find(x => x.id === id);
  if (d) openBuilder(d);
}

function openBuilder(d) {
  Object.assign(B, { id: d.id, name: d.name, cards: { ...d.cards }, faction: "All", type: "All", sheet: false, walk: -1 });
  B.saved = d.id ? JSON.stringify([d.name, d.cards]) : "";
  showScreen("builder");
  if (!PREFS.get("builderWalk", false)) startWalk();
}
const builderDirty = () => JSON.stringify([B.name, B.cards]) !== B.saved;

function renderBuilder() {
  byId("bld-name").value = B.name;
  const factions = ["All", ...Object.keys(DATA.factions), "Neutral"];
  byId("bld-filters").innerHTML =
    `<div class="chip-row" role="group" aria-label="Faction">${factions.map(f => `<button type="button" class="chip" data-faction="${f}" aria-pressed="${f === B.faction}">${esc(f === "All" ? "All factions" : f)}</button>`).join("")}</div>
     <div class="chip-row" role="group" aria-label="Card type">${["All", ...TYPES].map(t => `<button type="button" class="chip" data-type="${t}" aria-pressed="${t === B.type}">${esc(t === "All" ? "All types" : t + "s")}</button>`).join("")}</div>`;
  renderPool();
  renderDeckPanel();
}

function renderPool() {
  const want = B.faction === "Neutral" ? "N/A" : B.faction;
  const cards = DATA.cardList
    .filter(c => buildable(c) && (want === "All" || c.group === want) && (B.type === "All" || c.type === B.type))
    .sort((a, b) => a.manaCost - b.manaCost || a.name.localeCompare(b.name));
  byId("bld-cards").innerHTML = cards.map(c => {
    const n = B.cards[c.id] || 0, max = copyLimit(c);
    return `<div class="bld-card${n ? " in-deck" : ""}${n >= max ? " full" : ""}">
      <button type="button" class="bld-add" data-add="${c.id}" aria-label="Add ${esc(c.name)} (${n} of ${max} in your deck)">${cardHTML(c)}</button>
      ${n ? `<span class="bld-count">${n}/${max}</span>` : ""}
      <button type="button" class="bld-info" data-info="${c.id}" aria-label="Read ${esc(c.name)}">i</button>
    </div>`;
  }).join("") || `<p class="bld-empty">No cards match these filters.</p>`;
}

function renderDeckPanel() {
  const entries = Object.entries(B.cards).map(([id, n]) => ({ card: DATA.cardsById[id], n }))
    .sort((a, b) => a.card.manaCost - b.card.manaCost || a.card.name.localeCompare(b.card.name));
  const size = deckSize(B.cards);
  const need = DECK_RULES.min - size;
  // mana curve: how many cards at each cost, 7 and up together
  const curve = Array(8).fill(0);
  for (const e of entries) curve[Math.min(7, e.card.manaCost)] += e.n;
  const tall = Math.max(4, ...curve);
  const types = Object.fromEntries(TYPES.map(t => [t, 0]));
  for (const e of entries) types[e.card.type] = (types[e.card.type] || 0) + e.n;
  const tips = [];
  if (size && types.Character < 15) tips.push(`Most decks want at least 15 characters; this one has ${types.Character}. Characters are what attack and defend.`);
  if (size >= 10 && curve[1] + curve[2] + curve[3] < size * 0.4) tips.push("Add more cheap cards (1 to 3 mana) so you have something to play in your first turns.");
  const faction = mainFaction(B.cards);

  byId("bld-deck").innerHTML = `
    <button type="button" class="bld-head" data-sheet aria-expanded="${B.sheet}">
      ${medal(faction)}
      <span class="bld-size"><b>${size}</b> / ${DECK_RULES.min} cards</span>
      <span class="bld-status ${need > 0 ? "" : "ok"}">${need > 0 ? `${need} more to play` : "Ready to play"}</span>
      <span class="bld-toggle" aria-hidden="true">${B.sheet ? "▾" : "▴"}</span>
    </button>
    <div class="bld-panel-body">
      <div class="bld-curve" aria-label="Mana curve">
        ${curve.map((n, i) => `<div class="bar" title="${n} card${n === 1 ? "" : "s"} costing ${i}${i === 7 ? " or more" : ""}"><span style="height:${(n / tall) * 100}%"></span><b>${n || ""}</b><small>${i === 7 ? "7+" : i}</small></div>`).join("")}
        <p class="bld-caption">Mana curve: cards at each cost</p>
      </div>
      <div class="bld-types">${TYPES.map(t => `<span><b>${types[t]}</b> ${t === "Character" ? "characters" : t.toLowerCase() + (types[t] === 1 ? "" : "s")}</span>`).join("")}</div>
      ${tips.map(t => `<p class="bld-tip">💡 ${esc(t)}</p>`).join("")}
      ${entries.length ? `<ul class="bld-list">${entries.map(({ card, n }) => `
        <li style="--fc:${DATA.factions[card.group]?.color || "#8a7a63"};--edge:${DATA.rarities[card.rarity]?.color || "#888"}">
          <span class="cost">${card.manaCost}</span>
          <button type="button" class="name" data-info="${card.id}">${esc(card.name)}</button>
          <span class="qty">×${n}</span>
          <button type="button" class="step" data-remove="${card.id}" aria-label="Remove one ${esc(card.name)}">−</button>
          <button type="button" class="step" data-add="${card.id}" aria-label="Add one ${esc(card.name)}" ${n >= copyLimit(card) ? "disabled" : ""}>+</button>
        </li>`).join("")}</ul>`
        : `<p class="bld-empty">Your deck is empty. Tap cards on the left to add them.</p>`}
      <div class="bld-panel-actions">
        ${entries.length ? `<button type="button" class="btn btn-small" data-clear>Remove all cards</button>` : ""}
        ${B.id ? `<button type="button" class="btn btn-small danger" data-delete>Delete deck</button>` : ""}
      </div>
    </div>`;
  byId("bld-deck").classList.toggle("open", B.sheet);
}

function addCard(id) {
  const c = DATA.cardsById[id];
  const n = B.cards[id] || 0;
  if (n >= copyLimit(c)) {
    flashNote(`You can have at most ${copyLimit(c)} copies of ${c.name}${c.rarity === "Unknown" ? " (Unknown rarity)" : ""}.`);
    return;
  }
  B.cards[id] = n + 1;
  renderPool(); renderDeckPanel();
}
function removeCard(id) {
  if (!B.cards[id]) return;
  if (--B.cards[id] <= 0) delete B.cards[id];
  renderPool(); renderDeckPanel();
}

let noteTimer = 0;
function flashNote(text) {
  const el = byId("bld-note");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function saveDeck() {
  B.name = byId("bld-name").value.trim() || "My deck";
  const list = PREFS.get("decks", []);
  const decks = Array.isArray(list) ? list : [];
  if (!B.id) B.id = "my-" + Date.now().toString(36);
  const entry = { id: B.id, name: B.name, cards: { ...B.cards } };
  const i = decks.findIndex(d => d.id === B.id);
  if (i >= 0) decks[i] = entry; else decks.push(entry);
  PREFS.set("decks", decks);
  registerCustomDecks();
  B.saved = JSON.stringify([B.name, B.cards]);
  U.deckId = B.id;
  PREFS.set("deck", B.id);
  showScreen("menu");
}

function deleteDeck() {
  openModal(`<h2 id="modal-title">Delete ${esc(B.name)}?</h2>
    <p>This can't be undone.</p>
    <div class="detail-actions"><button type="button" class="btn danger" data-bld="delete">Delete deck</button><button type="button" class="btn" data-close>Keep it</button></div>`);
}
function leaveBuilder() {
  if (!builderDirty()) { showScreen("menu"); return; }
  openModal(`<h2 id="modal-title">Save your changes?</h2>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-bld="save">Save deck</button><button type="button" class="btn" data-bld="discard">Leave without saving</button><button type="button" class="btn" data-close>Keep building</button></div>`);
}
byId("modal").addEventListener("click", e => {
  const b = e.target.closest("[data-bld]");
  if (!b) return;
  closeModal();
  const what = b.dataset.bld;
  if (what === "save") saveDeck();
  else if (what === "discard") showScreen("menu");
  else if (what === "delete") {
    const list = PREFS.get("decks", []);
    PREFS.set("decks", (Array.isArray(list) ? list : []).filter(d => d.id !== B.id));
    registerCustomDecks();
    if (U.deckId === B.id) U.deckId = DATA.deckOrder[0];
    showScreen("menu");
  }
});

byId("builder").addEventListener("click", e => {
  const t = e.target;
  const f = t.closest("[data-faction]");
  if (f) { B.faction = f.dataset.faction; renderBuilder(); return; }
  const ty = t.closest("[data-type]");
  if (ty) { B.type = ty.dataset.type; renderBuilder(); return; }
  const info = t.closest("[data-info]");
  if (info) { showDetail(DATA.cardsById[info.dataset.info]); return; }
  const add = t.closest("[data-add]");
  if (add) { addCard(add.dataset.add); return; }
  const rm = t.closest("[data-remove]");
  if (rm) { removeCard(rm.dataset.remove); return; }
  if (t.closest("[data-sheet]")) { B.sheet = !B.sheet; renderDeckPanel(); return; }
  if (t.closest("[data-clear]")) { B.cards = {}; renderPool(); renderDeckPanel(); return; }
  if (t.closest("[data-delete]")) { deleteDeck(); return; }
  if (t.closest("#bld-back")) { leaveBuilder(); return; }
  if (t.closest("#bld-save")) { saveDeck(); return; }
  if (t.closest("#bld-help")) { startWalk(); return; }
  const w = t.closest("[data-walk]");
  if (w) {
    if (w.dataset.walk === "next") B.walk++;
    else if (w.dataset.walk === "back") B.walk--;
    else B.walk = WALK.length;
    showWalk();
  }
});
byId("bld-name").addEventListener("input", e => { B.name = e.target.value; });

// ---------------------------------------------------------------------------
// Walkthrough: a few steps that point at each part of the builder.
// ---------------------------------------------------------------------------
const WALK = [
  { at: "#bld-cards", title: "Pick your cards", text: "Every card in the game is here. Tap a card to add a copy to your deck. Tap the <b>i</b> on a card to read it first." },
  { at: "#bld-filters", title: "Filter", text: "Show one faction or one type of card. You can mix factions, but cards from the same faction are made to work together. Rally, for example, needs three characters of one faction." },
  { at: ".bld-head", sheet: true, title: "Your deck", text: `A deck needs at least <b>${DECK_RULES.min} cards</b>. You can have up to ${DECK_RULES.copies} copies of a card (${DECK_RULES.unknownCopies} for Unknown rarity). Tap <b>−</b> in the list to take one out.` },
  { at: ".bld-curve", sheet: true, title: "Mana curve", text: "How many cards cost each amount. Keep plenty of cheap cards (1 to 3 mana) so you have something to play in your first turns, and only a few big, expensive ones." },
  { at: ".bld-types", sheet: true, title: "Card types", text: "Characters do the fighting, so most decks want at least 15. Spells, equipment and areas back them up." },
  { at: ".builder-bar", title: "Name it and save", text: "Give your deck a name at the top and press <b>Save deck</b>. It appears on the main menu next to the starter decks, ready to play." },
];
function startWalk() { B.walk = 0; showWalk(); }
function showWalk() {
  const box = byId("bld-walk");
  document.querySelectorAll(".bld-focus").forEach(el => el.classList.remove("bld-focus"));
  if (B.walk < 0 || B.walk >= WALK.length) {
    box.hidden = true;
    if (B.walk >= WALK.length) { PREFS.set("builderWalk", true); B.walk = -1; B.sheet = false; renderDeckPanel(); }
    return;
  }
  const step = WALK[B.walk];
  if (B.sheet !== !!step.sheet) { B.sheet = !!step.sheet; renderDeckPanel(); }
  const target = document.querySelector("#builder " + step.at);
  target?.classList.add("bld-focus");
  target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const last = B.walk === WALK.length - 1;
  box.innerHTML = `<p class="step-count">Building a deck · ${B.walk + 1} of ${WALK.length}</p>
    <h3>${step.title}</h3><p>${step.text}</p>
    <div class="walk-actions">
      ${B.walk ? `<button type="button" class="btn btn-small" data-walk="back">Back</button>` : `<button type="button" class="link-btn" data-walk="skip">Skip</button>`}
      <button type="button" class="btn btn-small btn-primary" data-walk="${last ? "skip" : "next"}">${last ? "Start building" : "Next"}</button>
    </div>`;
  box.hidden = false;
  // Keep the box clear of what it points at: at the bottom, unless that's where the target is.
  const r = target?.getBoundingClientRect();
  box.classList.toggle("at-top", !!r && r.top > innerHeight * 0.55 && !step.sheet);
  box.classList.toggle("beside-sheet", !!step.sheet);
}
