// The main menu (deck choice, game mode) and the Almanac. Loaded after js/ui.js, which
// shows these screens (showScreen) and shares its names (U, $, esc, medal, cardHTML).

// The start menu has two views (U.menuView):
//   home   three big doors (Campaign, Quick Match, Two Players) and smaller buttons below
//   setup  choosing decks: for a Quick Match (U.setupMode "ai"), Two Players ("hotseat"),
//          the Campaign's deck ("campaign"), or just looking after your decks ("decks")
// The deck choice lists the starter decks, then decks the player built (js/decks.js), then
// a tile to build a new one.
U.menuView = "home";
U.setupMode = "ai";
U.oppDeckId = PREFS.get("opp", "random");   // the other side's deck: "random" or a deck id
const SETUP = {
  ai: { title: "Quick Match", deck: "Choose your deck", opp: "The computer's deck", start: "Start match" },
  hotseat: { title: "Two Players", deck: "Player 1's deck", opp: "Player 2's deck", start: "Start match" },
  campaign: { title: "Your deck for the Campaign", deck: "Choose your deck", opp: null, start: "Back to the Campaign" },
  decks: { title: "My Decks", deck: "Your decks", opp: null, start: null },
};
function renderMenu() {
  if (!DATA.decks[U.deckId]) U.deckId = DATA.deckOrder[0];
  $("#menu-home").hidden = U.menuView !== "home";
  $("#menu-setup").hidden = U.menuView !== "setup";
  if (U.menuView === "home") renderDoors(); else renderSetup();
}

// The three doors. The Campaign shows who is next; Quick Match shows your deck and its title.
function renderDoors() {
  const cleared = campaignCleared(), total = CAMPAIGN.length;
  const next = CAMPAIGN[Math.min(cleared, total - 1)];
  const campChip = cleared >= total ? "Campaign complete" : `Next: ${next.champion} · ${cleared} of ${total} beaten`;
  const deck = DATA.decks[U.deckId], m = masteryOf(U.deckId);
  const door = (sym, chip, title, text, go) => `<span class="door-sym" aria-hidden="true">${sym}</span>${chip ? `<span class="door-chip">${esc(chip)}</span>` : ""}<span class="door-title">${title}</span><span class="door-text">${text}</span><span class="btn door-go">${go}</span>`;
  $("#btn-campaign").innerHTML = door("♛", campChip, "Campaign", "Face each fracture's champion, one by one, and learn what the shards are hiding.", cleared ? "Continue" : "Begin");
  $("#door-quick").innerHTML = door("⚔", `${deck?.name || ""}${m.title ? ` · ★ ${m.title}` : ""}`, "Quick Match", "One match against the computer. Pick your deck and theirs.", "Play");
  $("#door-two").innerHTML = door("⇄", "", "Two Players", "Take turns on one device.", "Play");
}

function renderSetup() {
  const mode = SETUP[U.setupMode] || SETUP.ai;
  $("#setup-title").textContent = mode.title;
  $("#deck-label").textContent = mode.deck;
  const tile = id => {
    const d = DATA.decks[id];
    const edit = d.custom ? `<button type="button" class="deck-edit btn btn-small" data-edit="${id}" aria-label="Edit ${esc(d.name)}">Edit</button>` : "";
    return `<div class="deck-slot"><button type="button" class="deck-tile${d.custom ? " custom" : ""}" data-deck="${id}" aria-pressed="${id === U.deckId}" style="--fc:${DATA.factions[d.faction]?.color || "#888"}">${medal(d.faction)}<strong>${esc(d.name)}</strong><span>${esc(d.description)}</span>${masteryLine(id)}</button>${edit}</div>`;
  };
  const starters = DATA.deckOrder.filter(id => DATA.decks[id].isPlayable);
  const mine = Object.keys(DATA.decks).filter(id => DATA.decks[id].custom);
  $("#deck-list").innerHTML = [...starters, ...mine].map(tile).join("")
    + `<div class="deck-slot"><button type="button" class="deck-tile create" data-create><span class="plus" aria-hidden="true">+</span><strong>Create your own</strong><span>Build a deck from any cards in the game</span></button></div>`;
  // The other side's deck: random, a starter deck, or (two players) one of your own.
  $("#opp-block").hidden = !mode.opp;
  if (mode.opp) {
    $("#opp-label").textContent = mode.opp;
    const choices = [...starters, ...(U.setupMode === "hotseat" ? mine.filter(id => !deckProblem(id)) : [])];
    if (U.oppDeckId !== "random" && !choices.includes(U.oppDeckId)) U.oppDeckId = "random";
    const opp = (id, name, icon, fc) => `<button type="button" class="opp-tile" data-opp="${id}" aria-pressed="${U.oppDeckId === id}" style="--fc:${fc}">${icon}<span>${esc(name)}</span></button>`;
    $("#opp-list").innerHTML = opp("random", "Random", `<span class="opp-random" aria-hidden="true">?</span>`, "#d9a64c")
      + choices.map(id => opp(id, DATA.decks[id].name, medal(DATA.decks[id].faction), DATA.factions[DATA.decks[id].faction]?.color || "#888")).join("");
  }
  const problem = mode.start && U.setupMode !== "decks" ? deckProblem(U.deckId) : null;
  $("#deck-problem").hidden = !problem;
  $("#deck-problem").textContent = problem || "";
  $("#btn-start").hidden = !mode.start;
  $("#btn-start").textContent = mode.start || "";
  $("#btn-start").disabled = !!problem && U.setupMode !== "campaign";
}
function showMenuHome() { U.menuView = "home"; renderMenu(); }
function showSetup(mode) { U.setupMode = mode; U.menuView = "setup"; renderMenu(); window.scrollTo?.(0, 0); }

$("#menu").addEventListener("click", e => {
  const s = e.target.closest("[data-setup]");
  if (s) showSetup(s.dataset.setup);
});
$("#btn-back").addEventListener("click", () => (U.setupMode === "campaign" ? (showMenuHome(), showCampaign()) : showMenuHome()));
$("#deck-list").addEventListener("click", e => {
  const edit = e.target.closest("[data-edit]");
  if (edit) { editDeck(edit.dataset.edit); return; }
  if (e.target.closest("[data-create]")) { createDeck(); return; }
  const t = e.target.closest("[data-deck]");
  if (t) { U.deckId = t.dataset.deck; PREFS.set("deck", U.deckId); renderMenu(); }
});
$("#opp-list").addEventListener("click", e => {
  const t = e.target.closest("[data-opp]");
  if (t) { U.oppDeckId = t.dataset.opp; PREFS.set("opp", U.oppDeckId); renderMenu(); }
});
$("#btn-start").addEventListener("click", () => {
  if (U.setupMode === "campaign") { showMenuHome(); showCampaign(); return; }
  U.mode = U.setupMode === "hotseat" ? "hotseat" : "ai";
  U.lastOpp = U.oppDeckId === "random" ? undefined : U.oppDeckId;
  startGame({ opponentDeckId: U.lastOpp });
});
$("#btn-almanac").addEventListener("click", () => { U.almanacReturn = "menu"; showScreen("almanac"); });
$("#btn-rules").addEventListener("click", () => showGuide());
$("#btn-settings").addEventListener("click", showSettings);
$("#btn-tutorial").addEventListener("click", startTutorial);
$("#guide-back").addEventListener("click", () => showScreen(U.guideReturn === "game" && S ? "game" : "menu"));
$("#guide-tutorial").addEventListener("click", startTutorial);
$("#alm-back").addEventListener("click", () => showScreen(U.almanacReturn === "game" && S ? "game" : "menu"));

// The Almanac's Champions tab: every champion's ability explained in full, with pictures drawn by
// the game itself (real cards and the real status line), so they always match the current look.
// The words come from data/champion_abilities.csv. The notes and the before-and-after examples
// are here; keep their numbers in step with "Champion abilities" in js/engine.js.
//   status   sample status lines, as they show under a player's name
//   pairs    before -> after pictures: a card (pick: which card; change: what the ability changes)
//            or two short labels (from, to), each with a caption
const CHAMP_GUIDE = {
  the_simplistic: {
    notes: ["Nothing happens until it levels up.", "It levels up at the start of the turn when you have 6 mana crystals. That is the same turn for every match, so you can plan for it.", "After that, every Simple character you have gets the bonus, and so does every Simple character you play later."],
    status: ["Lv 1 · 4/6 max mana", "Lv 2 · Leveled up"],
    pairs: [{ caption: "When you reach 6 mana crystals: every Simple character gets +1 Attack and +1 Health.", pick: c => c.id === "simple_farmer", change: { attack: 1, health: 1 } }],
  },
  the_man_ape: {
    notes: ["It counts the characters on each side. With more than your opponent, every character you have gets +1 Attack, Monkey or not.", "It only works on your turn, when you attack. Your characters don't get it while defending.", "It switches on and off by itself as characters come and go, even in the middle of your attacks."],
    status: ["4 vs 3 characters · +1 Attack", "2 vs 3 characters"],
    pairs: [{ caption: "With more characters than your opponent, on your turn: +1 Attack.", pick: c => c.group === "Monkey" && c.type === "Character" && c.manaCost === 2, change: { attack: 1 } }],
  },
  ip_man: {
    notes: ["The bow happens by itself when you press To battle. The game picks your strongest character that can attack this turn.", "The +2 Attack lasts until the end of your turn.", "A fight counts as won when your character survives and the enemy character is knocked out. Attacks on the player don't count. Fights you win while defending count too.", "After 5 won fights, your two strongest attackers get the bow each turn."],
    status: ["Lv 1 · 3/5 fights won", "Lv 2 · Leveled up"],
    pairs: [{ caption: "At the start of your Battle phase: your strongest ready attacker gets +2 Attack this turn.", pick: c => c.group === "Fighter" && c.type === "Character" && c.manaCost === 2, change: { attack: 2 } }],
  },
  boss_level: {
    notes: ["It works from your starting health: with 25, PHASE 2 starts at 16 health or less and FINAL PHASE at 8 or less.", "In PHASE 2 you draw 2 cards in your Draw phase instead of 1.", "FINAL PHASE keeps the extra card and gives every character you have +1 Attack and +1 Health, Digital or not.", "Healing never takes you back to an earlier phase."],
    status: ["Phase 1", "Phase 2", "Final phase"],
    pairs: [
      { caption: "PHASE 2: 1 extra card each turn.", from: "🂠 1", to: "🂠 2" },
      { caption: "FINAL PHASE: your characters also get +1 Attack and +1 Health.", pick: c => c.group === "Digital" && c.type === "Character" && c.manaCost === 2, change: { attack: 1, health: 1 } },
    ],
  },
  soul_shepard: {
    notes: ["This one has no levels. It makes the Soul Shepard card itself bigger.", "Every Undead character that dies counts: yours and your opponent's.", "It counts from the start of the match, wherever the card is: in your deck, in your hand or on the table. So the longer the match, the bigger Soul Shepard is when you play it.", "It gains Health only, never Attack."],
    status: ["3 undead fallen"],
    pairs: [{ caption: "After 3 Undead characters have died: Soul Shepard has +3 Health, even in your hand.", pick: c => c.id === "soul_shepard", change: { health: 3 } }],
  },
};
function championsHTML() {
  const pairHTML = pr => {
    let a, b, chg = "";
    if (pr.pick) {
      chg = Object.keys(pr.change).map(k => " chg-" + k).join("");
      const card = DATA.cardList.find(pr.pick);
      if (!card) return "";
      const after = { ...card, attack: card.attack + (pr.change.attack || 0), health: card.health + (pr.change.health || 0) };
      a = cardHTML(card);
      b = cardHTML(after, pr.change.cost ? { costOverride: card.manaCost + pr.change.cost } : {});
    } else { a = `<span class="champ-big">${esc(pr.from)}</span>`; b = `<span class="champ-big">${esc(pr.to)}</span>`; }
    return `<figure class="champ-pair"><div class="champ-pics"><div><small>Before</small>${a}</div><span class="champ-arrow" aria-hidden="true">→</span><div class="${chg.trim()}"><small>After</small>${b}</div></div><figcaption>${esc(pr.caption)}</figcaption></figure>`;
  };
  const one = id => {
    const info = DATA.championAbilities[id], card = DATA.cardsById[id], g = CHAMP_GUIDE[id] || { notes: [], status: [], pairs: [] };
    if (!card) return "";
    const grows = !info.goal;
    return `<article class="champ-entry" style="--fc:${DATA.factions[card.group]?.color || "#c9b48d"}">
      <div class="champ-card">${cardHTML(card)}</div>
      <div class="champ-text">
        <h2>${esc(info.name)}</h2>
        <p class="sub">${esc(card.name)} · ${esc(groupLabel(card.group))} deck</p>
        <dl class="champ-facts">
          <dt>${grows ? "What it does" : "At the start"}</dt><dd>${esc(info.now)}</dd>
          ${grows ? "" : `<dt>Levels up when</dt><dd>${esc(info.when)}</dd><dt>After leveling up</dt><dd>${esc(info.then)}</dd>`}
        </dl>
        <h3>Good to know</h3>
        <ul>${g.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
        <h3>What you see in a match</h3>
        <p class="sub">Under your name, a line shows the ability${grows ? "" : ", its level"} and its progress. Tap it to read the ability.</p>
        <div class="champ-status">${g.status.map((s, i) => `<span class="champ-line${i > 0 ? " lv2" : ""}">★ ${esc(grows ? info.name : info.name)} · ${esc(s)}</span>`).join("")}</div>
        <div class="champ-pairs">${g.pairs.map(pairHTML).join("")}</div>
      </div>
    </article>`;
  };
  return `<div class="champ-intro"><p>Each deck can hold one <b>champion</b>, its Unknown card. A deck with its champion gets the champion's <b>ability</b> from the first turn, even before the champion card is drawn. A deck with no champion gets no ability. Progress starts again every match.</p></div>
    ${Object.keys(DATA.championAbilities).map(one).join("")}`;
}

// The Protected rule ("Protected" in js/engine.js), explained at the top of the Skills tab.
function protectedRuleHTML() {
  if (!RULES.protectAt) return "";
  const icon = k => esc(DATA.skills[k]?.icon || "");
  const names = k => DATA.cardList.filter(c => c.skills.includes(k)).map(c => esc(c.name)).join(", ");
  return `<section class="rule-box">
    <h2>${icon("Protected")} Rule: Protected</h2>
    <p>A player with <b>${RULES.protectAt} or more characters</b> on their side of the table is <b>Protected</b>. A Protected player takes <b>half</b> of any damage, rounded up.</p>
    <table class="rule-table"><tr><th>Damage</th><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr>
      <tr><th>Protected takes</th><td>1</td><td>1</td><td>2</td><td>2</td><td>3</td><td>3</td><td>4</td></tr></table>
    <ul>
      <li>It counts every character on that side, Towers included. Drop below ${RULES.protectAt} and the protection is gone at once.</li>
      <li>A character with the <b>${icon("Protected")} Protected</b> skill makes its player Protected on its own, however many characters there are. These cards have it: ${names("Protected")}.</li>
      <li>It halves all damage to the player: attacks, Overwhelm and spells.</li>
      <li>A character with <b>${icon("Pierce")} Pierce</b> ignores it: its attacks hit the player for full damage. These cards have it: ${names("Pierce")}.</li>
      <li>The player's name plate shows <b>${icon("Protected")} Protected · half damage</b> while it is on.</li>
    </ul>
  </section>`;
}

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
    $("#alm-content").innerHTML = protectedRuleHTML() + `<div class="skill-list">${DATA.skillOrder.map(name => {
      const sk = DATA.skills[name];
      const users = DATA.cardList.filter(c => c.skills.includes(name)).length;
      return `<div class="skill-item"><span class="icon">${esc(sk.icon)}</span><strong>${esc(name)}</strong><p>${esc(sk.desc)}</p><small>${users} card${users === 1 ? "" : "s"}</small></div>`;
    }).join("")}</div>`;
    return;
  }
  if (U.almanacTab === "champions") { $("#alm-content").innerHTML = championsHTML(); return; }
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
