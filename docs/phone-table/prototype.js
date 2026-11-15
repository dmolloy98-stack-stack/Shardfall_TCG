// PROTOTYPE: a phone-only table for Shardfall. Not part of the game.
//
// Idea: the rules (engine.js) and the normal table (ui.js render()) stay exactly as they are.
// This script draws a SECOND view of the same game state S, sized for a phone held
// sideways, at the phone's real pixel size (no shrinking). The normal table is still drawn
// underneath, invisible, and every tap on the phone view "presses" the matching element on
// it. So all game logic, undo, AI timing, modals and hints keep working unchanged, and the
// phone view is only a different drawing.
(() => {
  const css = `
  #pt { position: fixed; inset: 0; z-index: 4; display: none; background: radial-gradient(ellipse at 50% 50%, #241634, #0d0815 75%);
    font-family: "Alegreya Sans", sans-serif; color: #f2e7cf; user-select: none; -webkit-user-select: none;
    grid-template-columns: calc(96px + env(safe-area-inset-left)) 1fr calc(104px + env(safe-area-inset-right));
    grid-template-rows: 100%; }
  body.pt-on.pt-game #pt { display: grid; }
  body.pt-on.pt-game #stage-wrap, body.pt-on.pt-game #controls, body.pt-on.pt-game #sideinfo { opacity: 0; pointer-events: none; }
  #pt-toggle { position: fixed; z-index: 6; left: 50%; transform: translateX(-50%); bottom: 2px; font: 700 10px sans-serif; padding: 2px 8px;
    border-radius: 9px; border: 1px solid #c9a24a; background: #1c1226cc; color: #f2d48a; }
  body:not(.pt-game) #pt-toggle { display: none; }

  .pt-side { display: flex; flex-direction: column; justify-content: space-between; gap: 6px; padding: 6px 6px 6px calc(6px + env(safe-area-inset-left)); }
  .pt-right { padding: 6px calc(6px + env(safe-area-inset-right)) 6px 6px; justify-content: center; }
  .pt-player { border: 2px solid var(--pc); border-radius: 10px; background: #160e20; padding: 5px 6px; display: grid; gap: 1px; }
  .pt-player.attackable { box-shadow: 0 0 0 2px #e0533a, 0 0 12px #e0533a; }
  .pt-player.targetable { box-shadow: 0 0 0 2px #59c3ff, 0 0 12px #59c3ff; }
  .pt-name { font-weight: 800; font-size: 12px; color: var(--pc); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pt-life { font-size: 22px; font-weight: 800; line-height: 1; }
  .pt-life small { font-size: 11px; color: #b8a98c; font-weight: 500; }
  .pt-mana { font-size: 13px; color: #a9c8ff; font-weight: 700; }
  .pt-meta { font-size: 10.5px; color: #b8a98c; }
  .pt-round { text-align: center; font-size: 11px; color: #b8a98c; }
  .pt-round b { display: block; color: #f2d48a; font-size: 13px; }

  .pt-btn { display: block; width: 100%; margin: 4px 0; padding: 7px 4px; border-radius: 9px; border: 2px solid #7a5a2a;
    background: linear-gradient(#6b4626, #3d2614); color: #f6e4bd; font: 800 13px "Alegreya Sans", sans-serif; }
  .pt-btn[disabled] { opacity: 0.4; }
  .pt-btn.go { border-color: #f2d48a; box-shadow: 0 0 10px #f2d48a88; }
  .pt-btn.red { border-color: #e0533a; background: linear-gradient(#8e2a1a, #571408); }

  .pt-center { display: grid; min-width: 0; grid-template-rows: 22px 1fr 24px 1fr 22px var(--hand); }
  .pt-back { display: flex; gap: 4px; align-items: center; justify-content: center; overflow: hidden; }
  .pt-chip { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 6px; background: #e8dcc0; color: #2b1d10; border-left: 4px solid var(--fc); white-space: nowrap; }
  .pt-chip.empty { background: none; color: #6d5f78; border: 1px dashed #4a3b58; }
  .pt-row { display: flex; gap: 6px; align-items: center; justify-content: center; min-height: 0; }
  .pt-mid { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; border-top: 1px solid #5b3f80; border-bottom: 1px solid #5b3f80; }
  .pt-mid .ph { padding: 0 6px; border-radius: 5px; color: #8d7fa0; font-weight: 700; font-size: 10.5px; }
  .pt-mid .ph.on { background: #f2d48a; color: #2b1d10; }
  .pt-mid .msg { color: #f2d48a; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* A compact card made for phones: fewer things, each bigger. */
  .pc { --w: calc(var(--ch) * 0.7); position: relative; width: var(--w); height: var(--ch); flex: none; border-radius: 8px;
    background: linear-gradient(170deg, #f6ecd4, #e1cfa8); color: #22160b; box-shadow: inset 0 0 0 2px var(--edge), 0 3px 6px #000a;
    display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; }
  .pc .n { font-weight: 800; font-size: 11.5px; line-height: 1.05; text-align: center; padding: 4px 3px 0; max-height: 2.2em; overflow: hidden; }
  .pc .art { display: grid; place-items: center; font-size: 20px; margin: 2px 5px; border-radius: 5px;
    background: color-mix(in srgb, var(--fc) 30%, #efe3c8); }
  .pc .art svg { width: 55%; height: 55%; opacity: .85; }
  .pc .sk { position: absolute; left: 0; right: 0; bottom: 22px; text-align: center; font-size: 12px; }
  .pc .st { display: flex; justify-content: space-between; padding: 0 5px 3px; font-weight: 800; font-size: 16px; }
  .pc .st .a { color: #b2341f; } .pc .st .h { color: #1f7a3a; } .pc .st .h.low { color: #d8461d; }
  .pc .cost { position: absolute; right: 2px; top: 2px; width: 18px; height: 18px; display: grid; place-items: center; font: 800 11px sans-serif;
    color: #fff4d6; background: radial-gradient(circle at 35% 30%, #f3b347, #9a4f12); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
  .pc.ready { box-shadow: inset 0 0 0 2px var(--edge), 0 0 0 2px #63e08a, 0 0 10px #63e08a; }
  .pc.selected { box-shadow: inset 0 0 0 2px var(--edge), 0 0 0 3px #f2d48a, 0 0 14px #f2d48a; transform: translateY(-4px); }
  .pc.attackable { box-shadow: inset 0 0 0 2px var(--edge), 0 0 0 2px #e0533a, 0 0 12px #e0533a; }
  .pc.targetable { box-shadow: inset 0 0 0 2px var(--edge), 0 0 0 2px #59c3ff, 0 0 12px #59c3ff; }
  .pc.spent { filter: brightness(0.62) saturate(0.7); }
  .pc.playable { box-shadow: inset 0 0 0 2px var(--edge), 0 0 0 2px #63e08a, 0 0 8px #63e08a; }

  .pt-hand { display: flex; justify-content: center; align-items: flex-start; overflow: visible; }
  .pt-hand .pc { margin: 0 -6px; transition: transform .15s; }
  .pt-hand .pc:active { transform: translateY(-30px) scale(1.08); z-index: 3; }
  `;
  document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
  document.getElementById("game").insertAdjacentHTML("afterend", `<div id="pt"></div><button id="pt-toggle" type="button">Phone table (prototype): on</button>`);
  const pt = document.getElementById("pt"), tog = document.getElementById("pt-toggle");

  // On by default on a short, wide screen (a phone held sideways).
  let on = innerHeight < 520 && innerWidth > innerHeight;
  const setOn = v => { on = v; document.body.classList.toggle("pt-on", on); tog.textContent = `Phone table (prototype): ${on ? "on" : "off"}`; if (on) draw(); else onResize?.(); };
  tog.addEventListener("click", () => setOn(!on));

  const board = () => document.getElementById("board");
  // State flags come from the hidden table, so "can it attack / be targeted" is decided in one place.
  const flags = (sel, keys) => { const el = board().querySelector(sel); return el ? keys.filter(k => el.classList.contains(k)) : []; };

  function card(c, o = {}) {
    const edge = DATA.rarities[c.rarity]?.color || "#8f97a3", fc = DATA.factions[c.group]?.color || "#7a6d5c";
    const icons = (c.skills || []).map(s => DATA.skills[s]?.icon || "•").join(" ");
    let st = "";
    if (c.type === "Character" || c.type === "Equipment") {
      if (o.field) { const s = stats(c), r = rawStats(c); st = `<div class="st"><span class="a">⚔${s.a}</span><span class="h${c.currentHealth < (c.baseHealth ?? c.health) ? " low" : ""}">♥${Math.max(0, r.h)}</span></div>`; }
      else st = `<div class="st"><span class="a">⚔${c.attack}</span><span class="h">♥${c.health}</span></div>`;
    } else st = `<div class="st" style="font-size:10px;justify-content:center">${esc(c.type)}</div>`;
    return `<div class="pc ${(o.cls || []).join(" ")}" style="--edge:${edge};--fc:${fc}" data-pt="${o.act}" data-uid="${c.uid}">
      ${o.cost != null ? `<div class="cost">${o.cost}</div>` : ""}<div class="n">${esc(c.name)}</div>
      <div class="art">${glyph(c.group)}</div>${icons ? `<div class="sk">${icons}</div>` : ""}${st}</div>`;
  }

  function draw() {
    if (!on || typeof S === "undefined" || !S || U.screen !== "game") return;
    const me = S.players[viewIdx()], them = S.players[1 - viewIdx()];
    // Row height from the real screen: two character rows and a hand that peeks up from the bottom.
    const hand = Math.round(innerHeight * 0.24), ch = Math.min(130, Math.floor((innerHeight - 22 * 2 - 24 - hand - 8) / 2));
    const player = (p, side) => `<div class="pt-player ${flags(`.plate[data-player="${p.idx}"]`, ["attackable", "targetable"]).join(" ")}" style="--pc:${PLAYER_COLORS[p.idx]}" data-pt="plate" data-player="${p.idx}">
      <span class="pt-name">${esc(p.name)}</span><span class="pt-life">♥ ${Math.max(0, p.health)} <small>/ ${p.maxHealth}</small></span>
      <span class="pt-mana">◆ ${p.mana} / ${p.manaMax}</span><span class="pt-meta">Hand ${p.hand.length} · Deck ${p.deck.length}</span></div>`;
    const back = p => { const list = [...p.field.areas, ...p.field.equips];
      return list.length ? list.map(c => `<span class="pt-chip" style="--fc:${DATA.factions[c.group]?.color || "#888"}" data-pt="detail" data-uid="${c.uid}">${esc(c.name)}</span>`).join("")
        : `<span class="pt-chip empty">no areas or equipment</span>`; };
    const row = p => p.field.chars.map(c => card(c, { field: true, act: "char",
      cls: flags(`.field-card[data-uid="${c.uid}"]`, ["ready", "selected", "attackable", "targetable", "spent"]) })).join("");
    const prompt = document.getElementById("prompt");
    const msg = !prompt.hidden ? prompt.querySelector("span")?.textContent : board().querySelector(".instruction")?.textContent || "";
    const btn = (act, cls = "") => { const b = board().querySelector(`[data-act="${act}"]`); return b ? `<button type="button" class="pt-btn ${cls}" data-pt="press" data-act="${act}" ${b.disabled ? "disabled" : ""}>${esc(b.textContent.trim())}</button>` : ""; };
    const playable = new Set([...document.querySelectorAll("#hand-layer .hand-card.playable")].map(e => Number(e.dataset.uid)));

    pt.innerHTML = `
      <div class="pt-side">${player(them)}<div class="pt-round"><b>Round ${S.round}</b>${esc(active().name)}</div>${player(me)}</div>
      <div class="pt-center" style="--hand:${hand}px;--ch:${ch}px">
        <div class="pt-back">${back(them)}</div>
        <div class="pt-row">${row(them)}</div>
        <div class="pt-mid">${DATA.phases.map((ph, i) => `<span class="ph${i === S.phase ? " on" : ""}">${esc(ph.name)}</span>`).join("")}<span class="msg">${esc(msg)}</span></div>
        <div class="pt-row">${row(me)}</div>
        <div class="pt-back">${back(me)}</div>
        <div class="pt-hand">${U.curtain ? "" : me.hand.map(c => card(c, { act: "hand", cost: playCost(c, me), cls: playable.has(c.uid) ? ["playable"] : [] })).join("")}</div>
      </div>
      <div class="pt-side pt-right">${btn("menu")}${btn("faceall", "red")}${btn("face", "red")}${btn("phase", S.phase === PHASE.DRAW ? "go" : "")}${btn("pass")}${btn("curtain", "go")}${btn("again", "go")}${btn("tomenu")}</div>`;
  }

  // Every tap is passed on to the hidden table, so the game's own input code handles it.
  pt.addEventListener("click", e => {
    const t = e.target.closest("[data-pt]");
    if (!t) return;
    const kind = t.dataset.pt, uid = Number(t.dataset.uid);
    if (kind === "press") board().querySelector(`[data-act="${t.dataset.act}"]`)?.click();
    else if (kind === "char") board().querySelector(`.field-card[data-uid="${uid}"]`)?.click();
    else if (kind === "plate") board().querySelector(`.plate[data-player="${t.dataset.player}"]`)?.click();
    else if (kind === "detail") { const c = findCardAnywhere(uid); if (c) showDetail(c); }
    else if (kind === "hand") { const c = S.players[viewIdx()].hand.find(x => x.uid === uid); if (c) showDetail(c, { hand: true }); }   // the detail window has the Play button
  });

  // Redraw whenever the game redraws. render is a global function, so wrapping it is enough.
  // Only on the match screen: showScreen is wrapped the same way.
  const baseShow = showScreen;
  showScreen = function (name) { document.body.classList.toggle("pt-game", name === "game"); return baseShow.apply(this, arguments); };
  const baseRender = render;
  render = function () { baseRender.apply(this, arguments); draw(); };
  addEventListener("resize", () => { if (on) draw(); });
  setOn(on);
})();
