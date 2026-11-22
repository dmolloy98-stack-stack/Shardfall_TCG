// Shardfall input: dragging cards from the hand, taps and clicks on the table, and the keyboard.
// Split out of js/ui.js; loaded after js/board.js (GAME_SCRIPTS in js/data.js). Every move a
// player makes goes through act() (js/ui.js) and move() (js/engine.js).

// ---------------------------------------------------------------------------
// Hand: drag to play, tap for details
// ---------------------------------------------------------------------------
let drag = null;
function stagePoint(e) {
  const r = $("#stage").getBoundingClientRect();
  return { x: (e.clientX - r.left) / U.scale, y: (e.clientY - r.top) / U.scale };
}
function handDown(e) {
  const el = e.target.closest(".hand-card");
  if (!el || e.button === 2) return;
  const uid = Number(el.dataset.uid);
  drag = { uid, el, start: stagePoint(e), moved: false, pointerId: e.pointerId, tilt: 0 };
  el.classList.add("held");   // the card lifts toward you as soon as you touch it
  el.setPointerCapture?.(e.pointerId);
}
// Where a card being dragged can go: the frontline for characters, the backline for
// areas and equipment, anywhere on the table for spells.
function dropZone(c) {
  if (c.type === "Character") return { left: 720 - L.frontW / 2 - 12, top: L.bottom.chars - 8, width: L.frontW + 24, height: FIELD_H + 16 };
  if (c.type === "Spell") return { left: 24, top: 70, width: 1392, height: 650 };
  return { left: L.backX - 8, top: L.bottom.backline - 8, width: RULES.maxBackline * L.slot + 6, height: BACK_H + 16 };
}
// While a card is dragged, the spots it can go light up: the border of your front row for a
// character, your empty back-row slots for an area or equipment (and your characters, which
// equipment can also go on). They are stage classes, so a redraw mid-drag keeps them.
const PLACING = ["placing-char", "placing-back", "placing-equip", "placing-off"];
function setPlacing(c) {
  const st = $("#stage");
  st.classList.remove(...PLACING);
  if (!c) return;
  const p = active();
  if (c.type === "Character") st.classList.add("placing-char");
  if ((c.type === "Area" || c.type === "Equipment") && backlineCount(p) < RULES.maxBackline) st.classList.add("placing-back");
  if (c.type === "Equipment" && p.field.chars.length) st.classList.add("placing-equip");
}
function handMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const pt = stagePoint(e);
  if (!drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) > 8) {
    const c = active().hand.find(x => x.uid === drag.uid);
    if (humanTurn() && c && !drag.nudged && /^Needs \d+ mana/.test(playBlocker(c) || "")) { drag.nudged = true; nudgeMana(active().idx); }
    if (!humanTurn() || !c || !canPlay(c)) return;
    drag.moved = true;
    drag.card = c;
    drag.el.classList.add("dragging");
    drag.ghost = document.createElement("div");
    drag.ghost.className = "ghost";
    drag.ghost.innerHTML = cardHTML(c, { costOverride: playCost(c) });
    $("#stage").appendChild(drag.ghost);
    if (c.type === "Spell") {   // a spell can be let go of anywhere on the table
      drag.hint = document.createElement("div");
      drag.hint.className = "drop-hint spell";
      for (const [k, v] of Object.entries(dropZone(c))) drag.hint.style[k] = v + "px";
      $("#stage").appendChild(drag.hint);
    } else setPlacing(c);   // the spots it can go light up
    drag.last = pt;
  }
  if (drag.moved) {
    drag.ghost.style.left = pt.x - CARD_W / 2 + "px";
    drag.ghost.style.top = pt.y - CARD_H / 2 + "px";
    // the card leans the way it is moving, and settles when it stops
    drag.tilt = Math.max(-16, Math.min(16, drag.tilt * 0.6 + (pt.x - drag.last.x) * 0.5));
    drag.last = pt;
    drag.ghost.style.transform = `scale(1.12) rotate(${drag.tilt.toFixed(1)}deg)`;
    // back over the hand, letting go puts the card back
    const back = pt.y >= 740;
    drag.ghost.classList.toggle("invalid", back);
    drag.hint?.classList.toggle("off", back);
    $("#stage").classList.toggle("placing-off", back);
  }
}
function handUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag; drag = null;
  d.ghost?.remove(); d.hint?.remove(); setPlacing(null);
  d.el.classList.remove("dragging", "held");
  if (!d.moved) {
    const c = S.players[viewIdx()].hand.find(x => x.uid === d.uid);
    if (c) showDetail(c, { hand: true });
    return;
  }
  const pt = stagePoint(e);
  dropSpot(d.uid, pt);
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const charEl = under?.closest('.field-card[data-side="bottom"]');
  const c = d.card;
  if (c.type === "Equipment") {
    const inEquipRow = pt.x >= L.backX - 10 && pt.x <= L.backX + RULES.maxBackline * L.slot && pt.y >= L.bottom.backline - 10 && pt.y <= L.bottom.backline + BACK_H + 10;
    if (charEl) act(() => move("play", c.uid, { target: { uid: Number(charEl.dataset.uid) } }));
    else if (inEquipRow) act(() => move("play", c.uid, { toField: true }));
    else if (pt.y < 740 && active().field.chars.length) { U.armed = { uid: c.uid, from: "hand" }; render(); }
    else render();
  } else if (pt.y < 740) act(() => move("play", c.uid));
  else render();
}

// ---------------------------------------------------------------------------
// Board input
// ---------------------------------------------------------------------------
$("#board").addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || !S) return;
  if (performance.now() - U.dragAttackAt < 400) return;   // the release of a drag-to-attack
  const a = el.dataset.act;
  const uid = Number(el.dataset.uid);
  const human = humanTurn();
  if (a === "menu") return showGameMenu();
  if (a === "curtain") { U.curtain = false; yourTurnMoment(); render(); const b = $("#board"); b.classList.remove("rotate-in"); void b.offsetWidth; b.classList.add("rotate-in"); banner(`${active().name}'s turn`); return; }
  if (a === "again") return U.campaign ? playCampaignMatch(U.campaign.stage) : startGame({ opponentDeckId: U.lastOpp });   // the same opponent as last time
  if (a === "camp-next") return campaignNext();
  if (a === "camp-map") return showCampaign();
  if (a === "tomenu") { endTutorial(); U.menuView = "home"; return showScreen("menu"); }
  if (a === "phase") return onPhaseButton();
  if (a === "lore-new") { showNewLore(); return; }
  if (a === "trophies") { showTrophies(); return; }
  if (a === "hist") { showHist(Number(el.dataset.i)); return; }
  if (a === "log") { showLog(); return; }
  if (a === "pass") { if (human && !S.pending && !U.armed) { U.selected = null; passTurn(); } return; }
  if (a === "faceall") { if (human && S.phase === PHASE.BATTLE) { U.selected = null; act(attackAllFaceMove); } return; }
  if (a === "face") { if (U.selected) { const s = U.selected; U.selected = null; act(() => move("attack", s, null)); } return; }
  if (a === "blade") { if (human) { U.selected = null; act(() => move("blade", uid)); } return; }
  if (a === "char") return clickChar(uid);
  if (a === "token") { if (human) act(() => move("token")); return; }
  if (a === "grave") return showGrave(S.players[Number(el.dataset.player)]);
  if (a === "champ") return showChampion(S.players[Number(el.dataset.player)]);
  if (a === "shard") {
    if (human && U.selected != null && S.phase === PHASE.BATTLE && S.shard) { const s = U.selected; U.selected = null; act(() => move("attack", s, "shard")); }
    else showShard();
    return;
  }
  if (a === "deck") { if (human && Number(el.dataset.player) === S.active && S.phase === PHASE.DRAW) onPhaseButton(); return; }
  if (a === "plate") {
    const idx = Number(el.dataset.player);
    if (humanTarget() && isValidTarget({ isPlayer: true, idx })) act(() => move("target", { isPlayer: true, idx }));
    else if (human && U.selected && idx !== S.active && !mustPickGuard(null)) { const s = U.selected; U.selected = null; act(() => move("attack", s, null)); }
    return;
  }
  if (a === "area") {
    const pd = S.pending;
    const found = findArea(uid);
    if (humanTarget() && pd.targetType === "area") act(() => move("target", { uid }));
    else if (human && found.p === active() && canActivateArea(found.c)) act(() => move("area", uid));
    else showDetail(found.c);
    return;
  }
  if (a === "equip") {
    const owner = S.players[Number(el.dataset.player)];
    const e2 = owner.field.equips.find(x => x.uid === uid);
    if (human && owner === active() && canAttachFromField(e2)) { U.armed = U.armed?.uid === uid ? null : { uid, from: "field" }; render(); }
    else showDetail(e2);
  }
});
$("#board").addEventListener("contextmenu", e => {
  e.preventDefault();
  if (cancelSomething()) return;
  const el = e.target.closest("[data-uid]");
  const c = el && findCardAnywhere(Number(el.dataset.uid));
  if (c) showDetail(c, { field: !!findChar(c.uid) });
});
$("#prompt").addEventListener("click", e => { if (e.target.closest('[data-act="cancel"]')) cancelSomething(); });

const hand = $("#hand-layer");
hand.addEventListener("pointerdown", handDown);
hand.addEventListener("pointermove", handMove);
hand.addEventListener("pointerup", handUp);
hand.addEventListener("pointercancel", e => { if (drag) { drag.ghost?.remove(); drag.hint?.remove(); setPlacing(null); drag.el.classList.remove("dragging", "held"); drag = null; } });
hand.addEventListener("contextmenu", e => {
  e.preventDefault();
  const el = e.target.closest(".hand-card");
  const c = el && S.players[viewIdx()].hand.find(x => x.uid === Number(el.dataset.uid));
  if (c) showDetail(c, { hand: true });
});

function cancelSomething() {
  if (U.armed) { U.armed = null; render(); return true; }
  if (U.selected) { U.selected = null; render(); return true; }
  if (S?.pending?.kind === "target" && !S.players[S.pending.owner].isAI) { if (move("cancel")) { render(); return true; } }
  return false;
}
// Keyboard: Space for the next step (Draw card, To battle, ...), E to pass the turn, Escape to
// cancel or close.
document.addEventListener("keydown", e => {
  if (U.screen === "game" && $("#modal").hidden && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest?.("input, textarea")) {
    const press = act => { const b = $(`#board [data-act="${act}"]`); if (b && !b.disabled) { e.preventDefault(); b.click(); } };
    if (e.key === " ") { press("phase"); return; }
    if (e.key === "e" || e.key === "E") { press("pass"); return; }
  }
  if (e.key !== "Escape") return;
  if (!$("#modal").hidden) { if ($("#modal").dataset.dismissable) closeModal(); return; }
  if (U.screen === "game") cancelSomething();
});
