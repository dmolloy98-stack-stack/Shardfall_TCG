// Pop-up windows: the modal box, card details, the game menu, choices, the full battle log,
// and Settings. Split out of js/ui.js; loaded after it (GAME_SCRIPTS in js/data.js).

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function openModal(html, { dismissable = true } = {}) {
  $("#modal-content").innerHTML = html;
  $("#modal").hidden = false;
  $("#modal").dataset.dismissable = dismissable ? "1" : "";
  const first = $("#modal-content").querySelector("button");
  first?.focus({ preventScroll: true });
}
function closeModal() {
  $("#modal").hidden = true;
  $("#modal-content").innerHTML = "";
  openModal.choose = false;
}

function skillRows(c) {
  return (c.skills || []).map(s => {
    const sk = DATA.skills[s];
    return `<div class="detail-skill"><span class="icon">${esc(sk?.icon || "•")}</span><span><b>${esc(s)}</b> · ${esc(sk?.desc || "")}</span></div>`;
  }).join("");
}

// "Tribe: Human, Monkey · Class: Master": what a character is and what it does.
function kindsLine(c) {
  if (c.type !== "Character" || !(c.tribes?.length || c.classes?.length)) return "";
  const part = (label, list, kind) => list?.length ? `<span class="kinds-part"><b>${label}</b> ${list.map(n => `${tagBadge(kind, n)}${esc(n)}`).join(", ")}</span>` : "";
  return `<p class="kinds">${part(c.tribes?.length > 1 ? "Tribes" : "Tribe", c.tribes, "tribe")}${part(c.classes?.length > 1 ? "Classes" : "Class", c.classes, "class")}</p>`;
}
function showDetail(c, ctx = {}) {
  let actions = "", extra = "";
  if (ctx.field && c.owner != null && findChar(c.uid)) {
    const st = stats(c), raw = rawStats(c);
    extra += `<div class="statline"><span class="a">⚔ ${st.a}</span><span class="h">♥ ${Math.max(0, raw.h)}</span></div>`;
    if (c.equipped?.length) extra += `<p><b>Equipped:</b> ${c.equipped.map(e => `${esc(e.name)} (+${e.attack}/+${e.health})`).join(", ")}</p>`;
    if (st.parry && !hasSkill(c, "Parry")) extra += `<p>Has Parry from an area.</p>`;
    if (c.disabled) extra += `<p class="reason">Disabled: this character has no abilities.</p>`;
  }
  if (ctx.hand && humanTurn() && S.players[viewIdx()] === active()) {
    const blocker = playBlocker(c);
    if (blocker) actions = `<p class="reason">${esc(blocker)}</p>`;
    else if (c.type === "Equipment") {
      const p = active();
      const btns = [];
      if (p.field.chars.length) btns.push(`<button type="button" class="btn btn-primary" data-m="arm" data-uid="${c.uid}">Equip to a character</button>`);
      if (backlineCount(p) < RULES.maxBackline && p.mana >= playCost(c, p)) btns.push(`<button type="button" class="btn" data-m="tofield" data-uid="${c.uid}">Save it on the ${esc(BACKLINE())}</button>`);
      actions = `<div class="detail-actions">${btns.join("")}</div>`;
    } else actions = `<div class="detail-actions"><button type="button" class="btn btn-primary" data-m="play" data-uid="${c.uid}">Play for ${playCost(c)} mana</button></div>`;
  }
  if (counterKinds(c)) extra += `<p class="reason">Counter spell: you can't play it on your own turn. When the other player plays a card it can stop, the game asks you. It costs mana you left unspent on your turn.</p>`;
  const ability = c.ability;
  const spellFx = c.type === "Spell" && EFFECTS[c.id]?.target ? EFFECTS[c.id] : null;
  const spellKind = spellFx ? (spellFx.intent === "help" ? " · Buff spell" : " · Curse spell") : "";
  openModal(`<div class="detail">
    ${cardHTML(c, ctx.field && findChar(c.uid) ? { field: true } : {})}
    <div class="detail-text">
      <div><h2 id="modal-title">${esc(c.name)}</h2><p class="sub">${esc(c.type)} · ${esc(c.rarity)} · ${esc(fractureLabel(c))} · ${c.manaCost} mana${spellKind}</p>${kindsLine(c)}</div>
      ${ability ? `<p class="ability">${esc(ability)}</p>` : ""}
      ${loreHTML(c)}
      ${skillRows(c)}
      ${extra}
      ${actions}
      <div class="detail-actions"><button type="button" class="btn btn-small" data-close>Close</button></div>
    </div>
  </div>`);
}

function showGrave(p) {
  openModal(`<h2 id="modal-title">${esc(p.name)}'s graveyard</h2><p class="sub">${p.grave.length} card${p.grave.length === 1 ? "" : "s"}</p>
    <div class="modal-cards">${p.grave.length ? p.grave.map(c => `<button type="button" data-m="detail" data-uid="${c.uid}">${cardHTML(c)}</button>`).join("") : "<p>Nothing here yet.</p>"}</div>
    <div class="detail-actions" style="margin-top:16px"><button type="button" class="btn btn-small" data-close>Close</button></div>`);
}

function showChoose() {
  const pd = S.pending;
  openModal.choose = true;
  const picked = new Set();
  const max = pd.pick || 1;
  const draw = () => {
    const options = pd.options || [{ id: "ok", label: "Confirm" }];
    const needPick = pd.resolve !== "messenger" && pd.resolve !== "shepard";
    $("#modal-content").innerHTML = `<h2 id="modal-title">${esc(pd.title)}</h2><p class="sub">${esc(pd.prompt)}</p>
      <div class="modal-cards">${pd.cards.map(c => `<button type="button" class="${picked.has(c.uid) ? "picked" : ""}" data-pick="${c.uid}">${cardHTML(c)}</button>`).join("")}</div>
      <div class="detail-actions" style="margin-top:16px">${options.map(o => `<button type="button" class="btn${o === options[0] ? " btn-primary" : ""}" data-opt="${o.id}" ${needPick && !picked.size && pd.required ? "disabled" : ""}>${esc(o.label)}</button>`).join("")}
      ${pd.required ? "" : `<button type="button" class="btn btn-small" data-opt="__skip">Skip</button>`}</div>`;
  };
  openModal("", { dismissable: false });
  draw();
  $("#modal-content").onclick = e => {
    const pick = e.target.closest("[data-pick]");
    if (pick) {
      const uid = Number(pick.dataset.pick);
      if (picked.has(uid)) picked.delete(uid);
      else { if (picked.size >= max) picked.delete(picked.values().next().value); picked.add(uid); }
      draw(); return;
    }
    const opt = e.target.closest("[data-opt]");
    if (!opt) return;
    $("#modal-content").onclick = null;
    closeModal();
    if (opt.dataset.opt === "__skip") act(() => resolveChoice([], null));
    else act(() => resolveChoice([...picked], opt.dataset.opt));
  };
}

// Settings: beginner hints and the board skin. Opened from the main menu or the game menu.
function showSettings() {
  openModal(`<h2 id="modal-title">Settings</h2>
    <div class="menu-list">
      <button type="button" class="btn" data-set="hints" aria-pressed="${U.hints}">Beginner hints: ${U.hints ? "On" : "Off"}</button>
      <button type="button" class="btn" data-set="log" aria-pressed="${U.showLog}">Battle log on the table: ${U.showLog ? "Shown" : "Hidden"}</button>
      <button type="button" class="btn" data-set="speed" title="How fast the computer plays its turn">Computer speed: ${AI_SPEEDS[U.aiSpeed].name}</button>
      <button type="button" class="btn" data-set="fx" aria-pressed="${U.heavyFx}" title="The always-on glows, shimmers and falling shards. Turn off if the game feels slow on this device">Heavy effects: ${U.heavyFx ? "On" : "Off"}</button>
      <button type="button" class="btn" data-set="flow" aria-pressed="${U.autoFlow}" title="Draw your card by itself, and skip Battle when nothing can attack">Draw and skip by themselves: ${U.autoFlow ? "On" : "Off"}</button>
      <button type="button" class="btn" data-set="passcheck" aria-pressed="${U.passCheck}" title="Ask before you pass with mana and playable cards, or characters that can still attack">Ask before passing early: ${U.passCheck ? "On" : "Off"}</button>
      ${U.screen === "game" ? `<button type="button" class="btn" data-set="readlog">Read the battle log</button>` : ""}
      ${U.screen === "menu" ? `<button type="button" class="btn" data-set="intro">Watch the intro</button>` : ""}
    </div>
    <div class="menu-skins"><h3>Board</h3><div class="skin-list compact">${skinButtons("data-skin")}</div></div>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-set="done">${U.screen === "game" ? "Back to the game menu" : "Done"}</button></div>`);
}

function showGameMenu() {
  const canUndo = U.undo.length && humanTurn();
  if (U.tutorial) {
    openModal(`<h2 id="modal-title">Tutorial</h2>
      <div class="menu-list">
        <button type="button" class="btn" data-m="resume">Resume</button>
        <button type="button" class="btn" data-m="restart">Start the tutorial over</button>
        <button type="button" class="btn" data-m="rules">How to play</button>
        <button type="button" class="btn" data-m="mainmenu">Leave tutorial</button>
      </div>`);
    return;
  }
  openModal(`<h2 id="modal-title">Game menu</h2>
    <div class="menu-list">
      <button type="button" class="btn" data-m="resume">Resume</button>
      <button type="button" class="btn" data-m="restart">${esc(DATA.text("button_restart", "Restart"))}</button>
      <button type="button" class="btn" data-m="settings">Settings</button>
      <button type="button" class="btn" data-m="log">Battle log</button>
      <button type="button" class="btn" data-m="almanac">${esc(DATA.text("button_almanac", "Almanac"))}</button>
      <button type="button" class="btn" data-m="rules">How to play</button>
      <button type="button" class="btn" data-m="mainmenu">${esc(DATA.text("button_main_menu", "Main menu"))}</button>
    </div>
    <div class="dev"><h3>Testing tools</h3><div class="row">
      <button type="button" class="btn btn-small" data-m="undo" ${canUndo ? "" : "disabled"}>Undo (${U.undo.length})</button>
      <button type="button" class="btn btn-small" data-m="mana" ${humanTurn() ? "" : "disabled"}>+1 mana</button>
      <button type="button" class="btn btn-small" data-m="qadraw" ${humanTurn() ? "" : "disabled"}>Draw a card</button>
    </div></div>`);
}

$("#modal").addEventListener("click", e => {
  if (e.target.closest("[data-close]") && $("#modal").dataset.dismissable) { closeModal(); return; }
  const skin = e.target.closest("[data-skin]");
  if (skin) { setSkin(skin.dataset.skin); render(); showSettings(); return; }
  const set = e.target.closest("[data-set]");
  if (set) {
    if (set.dataset.set === "hints") { setHints(!U.hints); showSettings(); }
    else if (set.dataset.set === "log") { U.showLog = !U.showLog; PREFS.set("showLog", U.showLog); if (U.screen === "game") render(); showSettings(); }
    else if (set.dataset.set === "speed") { const ids = Object.keys(AI_SPEEDS); U.aiSpeed = ids[(ids.indexOf(U.aiSpeed) + 1) % ids.length]; PREFS.set("aiSpeed", U.aiSpeed); showSettings(); }
    else if (set.dataset.set === "readlog") showLog();
    else if (set.dataset.set === "fx") { U.heavyFx = !U.heavyFx; PREFS.set("heavyFx", U.heavyFx); applyHeavyFx(); if (U.screen === "menu") { storm.stop(); storm.start(); } showSettings(); }
    else if (set.dataset.set === "flow") { U.autoFlow = !U.autoFlow; PREFS.set("autoFlow", U.autoFlow); showSettings(); }
    else if (set.dataset.set === "passcheck") { U.passCheck = !U.passCheck; PREFS.set("passCheck", U.passCheck); showSettings(); }
    else if (set.dataset.set === "intro") { closeModal(); playIntro(); }
    else if (U.screen === "game") showGameMenu();
    else closeModal();
    return;
  }
  const b = e.target.closest("[data-m]");
  if (!b) return;
  const m = b.dataset.m, uid = Number(b.dataset.uid);
  if (m === "detail") { const c = findCardAnywhere(uid); if (c) showDetail(c); return; }
  closeModal();
  if (m === "play") act(() => playCard(uid));
  else if (m === "arm") { U.armed = { uid, from: "hand" }; render(); }
  else if (m === "tofield") act(() => playCard(uid, { toField: true }));
  else if (m === "restart") U.tutorial ? startTutorial() : U.campaign ? playCampaignMatch(U.campaign.stage) : startGame();
  else if (m === "settings") showSettings();
  else if (m === "log") showLog();
  else if (m === "passok") act(endTurn);
  else if (m === "passnever") { U.passCheck = false; PREFS.set("passCheck", false); act(endTurn); }
  else if (m === "almanac") { U.almanacReturn = "game"; clearTimeout(U.aiTimer); showScreen("almanac"); }
  else if (m === "rules") showGuide();
  else if (m === "mainmenu") { endTutorial(); clearTimeout(U.aiTimer); U.menuView = "home"; showScreen("menu"); }
  else if (m === "undo") { if (U.undo.length) { S = U.undo.pop(); if (S.histLen != null) U.hist.length = Math.min(U.hist.length, S.histLen); U.selected = null; U.armed = null; U.ended = S.over; render(); } }
  else if (m === "mana") act(() => { active().mana++; });
  else if (m === "qadraw") act(() => { drawCard(active()); });
});
