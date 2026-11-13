// The main menu (deck choice, game mode) and the Almanac. Loaded after js/ui.js, which
// shows these screens (showScreen) and shares its names (U, $, esc, medal, cardHTML).

// The deck choice: the starter decks, then decks the player built (js/decks.js), then
// a tile to build a new one.
function renderMenu() {
  if (!DATA.decks[U.deckId]) U.deckId = DATA.deckOrder[0];
  const tile = id => {
    const d = DATA.decks[id];
    const edit = d.custom ? `<button type="button" class="deck-edit btn btn-small" data-edit="${id}" aria-label="Edit ${esc(d.name)}">Edit</button>` : "";
    return `<div class="deck-slot"><button type="button" class="deck-tile${d.custom ? " custom" : ""}" data-deck="${id}" aria-pressed="${id === U.deckId}" style="--fc:${DATA.factions[d.faction]?.color || "#888"}">${medal(d.faction)}<strong>${esc(d.name)}</strong><span>${esc(d.description)}</span></button>${edit}</div>`;
  };
  const starters = DATA.deckOrder.filter(id => DATA.decks[id].isPlayable);
  const mine = Object.keys(DATA.decks).filter(id => DATA.decks[id].custom);
  $("#deck-list").innerHTML = [...starters, ...mine].map(tile).join("")
    + `<div class="deck-slot"><button type="button" class="deck-tile create" data-create><span class="plus" aria-hidden="true">+</span><strong>Create your own</strong><span>Build a deck from any cards in the game</span></button></div>`;
  const problem = deckProblem(U.deckId);
  $("#deck-problem").hidden = !problem;
  $("#deck-problem").textContent = problem || "";
  $("#btn-start").disabled = !!problem;
  $("#mode-ai").setAttribute("aria-checked", U.mode === "ai");
  $("#mode-hotseat").setAttribute("aria-checked", U.mode === "hotseat");
}
$("#deck-list").addEventListener("click", e => {
  const edit = e.target.closest("[data-edit]");
  if (edit) { editDeck(edit.dataset.edit); return; }
  if (e.target.closest("[data-create]")) { createDeck(); return; }
  const t = e.target.closest("[data-deck]");
  if (t) { U.deckId = t.dataset.deck; PREFS.set("deck", U.deckId); renderMenu(); }
});
$("#mode-ai").addEventListener("click", () => { U.mode = "ai"; renderMenu(); });
$("#mode-hotseat").addEventListener("click", () => { U.mode = "hotseat"; renderMenu(); });
$("#btn-start").addEventListener("click", () => startGame());
$("#btn-almanac").addEventListener("click", () => { U.almanacReturn = "menu"; showScreen("almanac"); });
$("#btn-rules").addEventListener("click", () => showGuide());
$("#btn-settings").addEventListener("click", showSettings);
$("#btn-tutorial").addEventListener("click", startTutorial);
$("#guide-back").addEventListener("click", () => showScreen(U.guideReturn === "game" && S ? "game" : "menu"));
$("#guide-tutorial").addEventListener("click", startTutorial);
$("#alm-back").addEventListener("click", () => showScreen(U.almanacReturn === "game" && S ? "game" : "menu"));

function renderAlmanac() {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === U.almanacTab));
  const filters = ["All", ...Object.keys(DATA.factions), "Unbound"];
  $("#alm-filters").hidden = U.almanacTab !== "cards";
  // Three rows of filters: Fracture (where a card is from), Tribe (species) and Class (job).
  const tribes = ["All", ...new Set(DATA.cardList.flatMap(c => c.tribes))].sort((x, y) => (x === "All" ? -1 : y === "All" ? 1 : x.localeCompare(y)));
  const classes = ["All", ...new Set(DATA.cardList.flatMap(c => c.classes))].sort((x, y) => (x === "All" ? -1 : y === "All" ? 1 : x.localeCompare(y)));
  const row = (label, attr, list, cur) => `<div class="chip-line"><span class="chip-label">${label}</span>${list.map(f => `<button type="button" class="chip" data-${attr}="${esc(f)}" aria-pressed="${f === cur}">${esc(f)}</button>`).join("")}</div>`;
  $("#alm-filters").innerHTML = row("Fracture", "filter", filters, U.almanacFilter) + row("Tribe", "tribe", tribes, U.almanacTribe || "All") + row("Class", "class", classes, U.almanacClass || "All");
  if (U.almanacTab === "skills") {
    $("#alm-content").innerHTML = `<div class="skill-list">${DATA.skillOrder.map(name => {
      const sk = DATA.skills[name];
      const users = DATA.cardList.filter(c => c.skills.includes(name)).length;
      return `<div class="skill-item"><span class="icon">${esc(sk.icon)}</span><strong>${esc(name)}</strong><p>${esc(sk.desc)}</p><small>${users} card${users === 1 ? "" : "s"}</small></div>`;
    }).join("")}</div>`;
    return;
  }
  const fitsKinds = c => (!U.almanacTribe || U.almanacTribe === "All" || hasTribe(c, U.almanacTribe)) && (!U.almanacClass || U.almanacClass === "All" || hasClass(c, U.almanacClass));
  const groups = [...Object.keys(DATA.factions), "N/A"];
  const want = U.almanacFilter === "Unbound" ? "N/A" : U.almanacFilter;
  let h = `<div class="card-grid">`;
  for (const g of groups) {
    if (want !== "All" && want !== g) continue;
    const cards = DATA.cardList.filter(c => (want === "All" ? c.group === g : inGroup(c, g)) && fitsKinds(c)).sort((a, b) => (DATA.rarities[a.rarity]?.order - DATA.rarities[b.rarity]?.order) || a.manaCost - b.manaCost);
    h += `<h2 class="faction-head" style="--fc:${DATA.factions[g]?.color || "#c9b48d"}">${esc(groupLabel(g))} <small style="font-size:.6em;color:var(--muted)">${cards.length} cards</small></h2>`;
    h += cards.map(c => `<button type="button" class="chip-card" data-card="${c.id}" style="appearance:none;border:0;background:none;padding:0">${cardHTML(c)}</button>`).join("");
  }
  $("#alm-content").innerHTML = h + `</div>`;
}
document.querySelector(".tabs").addEventListener("click", e => { const t = e.target.closest("[data-tab]"); if (t) { U.almanacTab = t.dataset.tab; renderAlmanac(); } });
$("#alm-filters").addEventListener("click", e => { const t = e.target.closest("[data-filter]"); if (t) { U.almanacFilter = t.dataset.filter; renderAlmanac(); } });
$("#alm-filters").addEventListener("click", e => {
  const t = e.target.closest("[data-tribe],[data-class]");
  if (!t) return;
  if (t.dataset.tribe) U.almanacTribe = t.dataset.tribe; else U.almanacClass = t.dataset.class;
  renderAlmanac();
});
$("#alm-content").addEventListener("click", e => { const t = e.target.closest("[data-card]"); if (t) showDetail(DATA.cardsById[t.dataset.card]); });
