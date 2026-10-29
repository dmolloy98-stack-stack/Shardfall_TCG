// Shardfall tutorial: a short scripted game against a gentle Trainer, teaching one
// idea at a time. A coach box explains each step. When a step points at something,
// the rest of the screen dims and an arrow points to it. Steps the player must do
// (drag a card, attack) wait until it is done, and the engine's actionGuard refuses
// any other move in the meantime. The Trainer's turns are scripted, not the AI.

const TUT = {
  on: false,
  i: 0,            // current step
  ids: {},         // uid of each scripted card, by key
  oppTimer: null,
  nudgeAt: 0,      // time of the last refused move, to shake the coach box
};

const TUT_TRAINER_HEALTH = 3;

function startTutorial() {
  endTutorial();
  clearTimeout(U.aiTimer);
  Object.assign(U, { selected: null, armed: null, curtain: false, ended: false, undo: [] });
  U.spawn.clear(); U.hits.clear(); U.lunges.clear(); U.drawn.clear();
  newGame({ deckId: "simple_starter", opponentDeckId: "simple_starter", mode: "ai" });
  const [me, tr] = S.players;
  tr.name = "Trainer"; tr.faction = "Training";
  tr.health = tr.maxHealth = TUT_TRAINER_HEALTH;
  const make = names => names.map(n => cardByName(n));
  // Hands are fixed, and decks are drawn from the end, so every lesson happens on cue.
  me.hand = make(["Simple Farmer", "Simple Barkeep", "Simplify"]);
  me.deck = make(["Simple Swordsman", "Herd", "Simple Farmer", "Simple Wizard", "Slap", "Sword"]);
  tr.hand = make(["Simple Wanderer", "Simple Bowman", "Breathing Wall"]);
  tr.deck = make(["Simple Swordsman", "Simple Wanderer", "Helm", "Bow", "Simple Farmer"]);
  TUT.ids = {
    farmerA: me.hand[0].uid, barkeep: me.hand[1].uid, simplify: me.hand[2].uid,
    farmerB: me.deck[2].uid, slap: me.deck[4].uid, sword: me.deck[5].uid,
    wanderer: tr.hand[0].uid, bowman: tr.hand[1].uid, wall: tr.hand[2].uid,
  };
  S.log = ["Tutorial: you (Simple) vs the Trainer"];
  TUT.on = true; TUT.i = 0;
  U.tutorial = TUT;
  actionGuard = tutGuard;
  showScreen("game");
  banner("Tutorial");
  render();
}

function endTutorial() {
  clearTimeout(TUT.oppTimer);
  if (!TUT.on) return;
  TUT.on = false;
  U.tutorial = null;
  actionGuard = null;
  const el = document.getElementById("coach");
  if (el) { el.hidden = true; el.innerHTML = ""; }
}

// ---------------------------------------------------------------------------
// Helpers for writing steps
// ---------------------------------------------------------------------------
const tid = key => TUT.ids[key];
const tcard = key => findCardAnywhere(TUT.ids[key]);
const onField = key => !!findChar(TUT.ids[key]);
const q = sel => document.querySelector(sel);
const handEl = key => q(`.hand-card[data-uid="${tid(key)}"]`);
const fieldEl = key => q(`.field-card[data-uid="${tid(key)}"]`);
const actEl = act => q(`[data-act="${act}"]`);
const plateEl = idx => q(`.plate[data-player="${idx}"]`);
const graveEl = idx => q(`.pile.grave[data-player="${idx}"]`);
const selectedEl = () => q(".field-card.selected");
// A rectangle given in stage coordinates (the 1440x1000 board), as a screen rectangle.
function stageRect(x, y, w, h) {
  const r = q("#stage").getBoundingClientRect();
  return new DOMRect(r.left + x * U.scale, r.top + y * U.scale, w * U.scale, h * U.scale);
}
const yourTable = () => stageRect(300, L.bottom.chars - 6, 840, CARD_H + 12);
const targetUid = t => (t && typeof t === "object" ? t.uid : t);

// Step kinds:
//   next: true          the player reads it and presses Next
//   done()              the step ends when this becomes true (after any render)
//   allow(name, ...)    which engine actions are accepted while the step is open
//   opp: [...]          the Trainer's scripted moves, played one by one
//   back: "id"          return to an earlier step when this step's setup is undone
const TUT_STEPS = [
  {
    title: "Welcome to Shardfall",
    text: "This lesson teaches you the game by playing a short one, one step at a time.<br><br>Each player has <b>health</b>, shown on these bars. Bring the other player's health down to <b>0</b> to win.",
    target: () => [plateEl(0), plateEl(1)], next: true,
  },
  {
    text: "You sit at the bottom of the table. Your opponent, the <b>Trainer</b>, sits at the top.<br><br>Real games start at 20 health each. The Trainer starts with only 3, so this lesson is quick.",
    target: () => [plateEl(1)], next: true,
  },
  {
    title: "Your hand",
    text: "These are the cards in your <b>hand</b>. Only you can see them. You play cards from your hand to do everything in Shardfall.",
    target: () => [...document.querySelectorAll(".hand-card")], union: true, next: true,
  },
  {
    title: "Reading a card",
    wide: true,
    text: () => `${anatomyHTML(cardByName("Simple Bowman"))}
      <p>Most cards are <b>characters</b>, who fight for you. The three numbers at the bottom are their stats. Tap any card during a game to read its full ability text.</p>`,
    next: true,
  },
  {
    title: "Mana",
    text: "Playing a card costs <b>mana</b>: the number in the orange diamond in the card's corner.<br><br>You have <b>1</b> mana right now. Each turn your mana refills, and you get <b>1 more</b> than the turn before.",
    target: () => [q('.mana[data-player="0"]'), handEl("farmerA")], next: true,
  },
  {
    title: "The four steps of a turn",
    text: "Every turn goes through four steps, in order:<ol><li><b>Draw</b>: take a card from your deck.</li><li><b>Setup</b>: play cards from your hand.</li><li><b>Battle</b>: your characters attack.</li><li><b>End</b>: pass the turn.</li></ol>The lit-up step is where you are. The player who goes first skips their first Draw, so you start in Setup.",
    target: () => [q(".phases")], next: true,
  },
  {
    title: "Play a character",
    text: "Drag <b>Simple Farmer</b> up onto the table. (Or tap it, then press <b>Play</b>.) It costs 1 mana.",
    target: () => [handEl("farmerA"), yourTable()], drag: true,
    allow: (name, uid) => name === "playCard" && uid === tid("farmerA"),
    done: () => onField("farmerA"),
  },
  {
    title: "Abilities",
    text: "Most cards also have an <b>ability</b>: something special they do. The Farmer's says <i>“When played, search your deck for a Simple Farmer and add it to your hand.”</i><br><br>So a second Farmer just jumped into your hand.",
    target: () => [handEl("farmerB")], next: true,
  },
  {
    text: "Your Farmer is on the table now. A character <b>can't attack on the turn it is played</b> (unless it has the Rush skill), so it will be ready next turn.",
    target: () => [fieldEl("farmerA")], next: true,
  },
  {
    text: "You've used all your mana. Press <b>To battle →</b> to move to the Battle step.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    text: "This is the <b>Battle</b> step, where characters attack. Your Farmer is new, so nothing can attack yet. Press <b>To end →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.END,
  },
  {
    text: "In the <b>End</b> step, some cards do something special. Press <b>Pass turn →</b> to hand the turn to the Trainer.",
    target: () => [actEl("phase")],
    allow: name => name === "endTurn",
    done: () => S.active === 1,
  },
  {
    text: "The Trainer's turn. Watch what it does.",
    opp: [
      () => doDraw(),
      () => useManaToken(),
      () => playCard(tid("wanderer")),
      () => advancePhase(), () => advancePhase(), () => endTurn(),
    ],
  },
  {
    text: "The Trainer played <b>Simple Wanderer</b>: Attack 1, Health 2, Speed 1.<br><br>It also used its <b>+1</b> token. The player who goes second gets 1 extra mana, once per game, to make up for going second.",
    target: () => [fieldEl("wanderer"), q('.mana[data-player="1"]')], next: true,
  },
  {
    title: "Draw",
    text: "Your turn again. It starts with the <b>Draw</b> step: press <b>Draw card</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "doDraw",
    done: () => S.phase === PHASE.SETUP,
  },
  {
    text: "You drew a <b>Sword</b>, and you have 2 mana now. First, drag your second <b>Simple Farmer</b> onto the table.",
    target: () => [handEl("farmerB"), yourTable()], drag: true,
    allow: (name, uid) => name === "playCard" && uid === tid("farmerB"),
    done: () => onField("farmerB"),
  },
  {
    title: "Equipment",
    text: "<b>Equipment</b> attaches to a character and adds its numbers to the character's. The Sword adds +1 Attack.<br><br>Drag the <b>Sword</b> onto the Farmer on the <b>left</b>, the one that has been here since last turn.",
    target: () => [handEl("sword"), fieldEl("farmerA")], drag: true,
    allow: (name, uid, opts) => name === "playCard" && uid === tid("sword") && targetUid(opts?.target) === tid("farmerA"),
    done: () => tcard("farmerA")?.equipped?.length > 0,
  },
  {
    text: "Your Farmer now has <b>2 Attack</b>. An underlined number means a bonus from equipment or another card.",
    target: () => [fieldEl("farmerA")], next: true,
  },
  {
    text: "Now press <b>To battle →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    id: "pick-attacker",
    title: "Attack!",
    text: "Characters with a <b>green outline</b> can attack. Tap your equipped <b>Farmer</b> to choose it.",
    target: () => [fieldEl("farmerA")],
    done: () => U.selected === tid("farmerA"),
  },
  {
    title: "How a fight works",
    text: "Now tap the Trainer's <b>Simple Wanderer</b> to attack it.<br><br>The character with higher <b>⚡ Speed</b> hits first. Both have Speed 1, and on a tie the <b>attacker</b> hits first. Your Farmer deals 2 damage and the Wanderer has 2 Health, so it is knocked out before it can hit back.",
    target: () => [fieldEl("wanderer"), fieldEl("farmerA")],
    allow: (name, a, t) => name === "attack" && a === tid("farmerA") && t === tid("wanderer"),
    done: () => !onField("wanderer"),
    back: () => U.selected !== tid("farmerA") && "pick-attacker",
  },
  {
    title: "The graveyard",
    text: "Knocked out! Defeated cards go to the <b>graveyard</b>. Tap a GRAVE pile at any time to look through it.<br><br>Damage stays on a character until it is knocked out. It doesn't heal at the end of a turn.",
    target: () => [graveEl(1)], next: true,
  },
  {
    text: "Your second Farmer is new, so it waits. Press <b>To end →</b>, then <b>Pass turn →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase" || name === "endTurn",
    done: () => S.active === 1,
  },
  {
    text: "The Trainer's turn.",
    opp: [
      () => doDraw(),
      () => playCard(tid("bowman")),
      () => advancePhase(),
      () => attack(tid("bowman"), tcard("farmerB") ? tid("farmerB") : null),
      () => advancePhase(), () => endTurn(),
    ],
  },
  {
    title: "Speed matters",
    text: "The Trainer played <b>Simple Bowman</b>. It has the <b>Rush</b> skill (➜), so it could attack on the turn it was played.<br><br>Its Speed 2 beat your Farmer's Speed 1, so it struck first and knocked your Farmer out before it could hit back.",
    target: () => [fieldEl("bowman"), graveEl(0)], next: true,
  },
  {
    text: "Your turn. Press <b>Draw card</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "doDraw",
    done: () => S.phase === PHASE.SETUP,
  },
  {
    title: "Spells",
    text: "You drew <b>Slap</b>, a <b>spell</b>. A spell does its thing once, then goes to the graveyard. Slap makes a character lose 1 Health.<br><br>Play Slap, then tap the <b>Bowman</b> as its target.",
    target: () => (S.pending ? [fieldEl("bowman")] : [handEl("slap"), fieldEl("bowman")]),
    allow: (name, x) => (name === "playCard" && x === tid("slap")) || (name === "chooseTarget" && targetUid(x) === tid("bowman")),
    done: () => !onField("bowman"),
  },
  {
    title: "Skills",
    text: "Look at <b>Simple Barkeep</b>: it has the <b>Signal</b> skill (⌁). A skill is a keyword with its own rule. Signal means <i>“use this card's ability when it enters the table.”</i><br><br>Play the Barkeep, then give your equipped <b>Farmer</b> +1 Health.",
    target: () => (S.pending ? [fieldEl("farmerA")] : [handEl("barkeep"), fieldEl("farmerA")]),
    allow: (name, x) => (name === "playCard" && x === tid("barkeep")) || (name === "chooseTarget" && targetUid(x) === tid("farmerA")),
    done: () => onField("barkeep") && !S.pending,
  },
  {
    text: "Press <b>To battle →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    title: "Attack the player",
    text: () => `The Trainer has no characters left to protect it. Tap your <b>Farmer</b>, then press <b>Attack ${S.players[1].name} directly</b>.`,
    target: () => (U.selected === tid("farmerA") ? [actEl("face"), fieldEl("farmerA")] : [fieldEl("farmerA")]),
    allow: (name, a, t) => name === "attack" && a === tid("farmerA") && t == null,
    done: () => S.players[1].health < TUT_TRAINER_HEALTH,
  },
  {
    text: () => `A direct hit! The Trainer is down to <b>${S.players[1].health} health</b>. Press <b>To end →</b>, then <b>Pass turn →</b>.`,
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase" || name === "endTurn",
    done: () => S.active === 1,
  },
  {
    text: "The Trainer's turn.",
    opp: [
      () => doDraw(),
      () => playCard(tid("wall")),
      () => advancePhase(), () => advancePhase(), () => endTurn(),
    ],
  },
  {
    title: "Challenge and Tower",
    text: "The Trainer played <b>Breathing Wall</b>, which has two skills:<ul><li><b>! Challenge</b>: while it is on the table, your attacks must go to it first.</li><li><b>▰ Tower</b>: it never attacks. It only blocks.</li></ul>With 5 Health, your characters can't break through it… on their own.",
    target: () => [fieldEl("wall")], next: true,
  },
  {
    text: "Press <b>Draw card</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "doDraw",
    done: () => S.phase === PHASE.SETUP,
  },
  {
    title: "Cards work together",
    text: "This is where cards combine. <b>Simplify</b> turns a character's stats into 1 / 1 / 1. Play Simplify, then tap the <b>Breathing Wall</b>.",
    target: () => (S.pending ? [fieldEl("wall")] : [handEl("simplify"), fieldEl("wall")]),
    allow: (name, x) => (name === "playCard" && x === tid("simplify")) || (name === "chooseTarget" && targetUid(x) === tid("wall")),
    done: () => !S.pending && tcard("wall")?.currentHealth === 1,
  },
  {
    text: "Press <b>To battle →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    text: "The Wall has just 1 Health now. Tap one of your characters, then tap the <b>Wall</b>. Because of Challenge, it has to be attacked first anyway.",
    target: () => (U.selected ? [fieldEl("wall"), selectedEl()] : [fieldEl("farmerA"), fieldEl("barkeep")]),
    allow: (name, a, t) => name === "attack" && (t === tid("wall") || t == null),
    done: () => !onField("wall"),
  },
  {
    title: "Finish it",
    text: () => `The way is clear. Tap your other character, then press <b>Attack ${S.players[1].name} directly</b> to win.`,
    target: () => (U.selected ? [actEl("face"), selectedEl()] : S.players[0].field.chars.filter(c => canAttack(c)).map(c => q(`.field-card[data-uid="${c.uid}"]`))),
    allow: (name, a, t) => name === "attack" && t == null,
    done: () => S.over,
  },
  {
    title: "You won!",
    final: true,
    text: `<p>You now know the basics:</p><ul>
      <li>Play cards in <b>Setup</b>, paying their <b>mana</b> cost.</li>
      <li>Characters fight in <b>Battle</b>. Higher <b>⚡ Speed</b> hits first.</li>
      <li><b>Equipment</b> and <b>spells</b> change the fight.</li>
      <li><b>Skills</b> like Rush, Signal and Challenge add special rules.</li>
      <li>Bring the other player to <b>0 health</b> to win.</li></ul>
      <p>Next, try a real game against the computer with the Simple deck. Beginner hints will guide you, and you can turn them off any time.</p>`,
  },
];

// ---------------------------------------------------------------------------
// Running the steps
// ---------------------------------------------------------------------------
const tutStep = () => TUT_STEPS[TUT.i];

function tutGuard(name, ...args) {
  if (!TUT.on || !S) return true;
  if (S.active === 1) return true;          // the Trainer's scripted moves
  const st = tutStep();
  if (st.allow && st.allow(name, ...args)) return true;
  TUT.nudgeAt = performance.now();
  setTimeout(() => renderCoach(), 0);
  return false;
}

function tutGoto(i) {
  TUT.i = Math.max(0, Math.min(TUT_STEPS.length - 1, i));
  const st = tutStep();
  if (st.opp) runTrainer(0);
}

// Called after every render: move on when the current step is done.
function tutUpdate() {
  if (!TUT.on) return;
  for (let guard = 0; guard < 5; guard++) {
    const st = tutStep();
    const back = st.back?.();
    if (back && !(st.done && st.done())) { tutGoto(TUT_STEPS.findIndex(s => s.id === back)); continue; }
    const finished = st.opp ? S.active === 0 && st.started : st.done && st.done();
    if (!finished) break;
    tutGoto(TUT.i + 1);
  }
}

function runTrainer(k) {
  const st = tutStep();
  st.started = true;
  clearTimeout(TUT.oppTimer);
  TUT.oppTimer = setTimeout(() => {
    if (!TUT.on || tutStep() !== st) return;
    // Pause while the player is reading a card or looking at another screen.
    if (U.screen !== "game" || !$("#modal").hidden) { runTrainer(k); return; }
    st.opp[k]();
    render();
    if (k + 1 < st.opp.length) runTrainer(k + 1);
  }, k === 0 ? 1400 : 1100);
}

function tutNext() {
  if (!TUT.on || !tutStep().next) return;
  tutGoto(TUT.i + 1);
  render();
}

// ---------------------------------------------------------------------------
// Coach box, spotlight and arrow
// ---------------------------------------------------------------------------
function renderCoach() {
  const el = document.getElementById("coach");
  if (!TUT.on || U.screen !== "game") { el.hidden = true; return; }
  const st = tutStep();
  const text = typeof st.text === "function" ? st.text() : st.text;
  const nudging = performance.now() - TUT.nudgeAt < 2500;

  let rects = (st.target?.() || []).filter(Boolean).map(x => (x instanceof Element ? x.getBoundingClientRect() : x)).filter(r => r.width > 0);
  if (st.union && rects.length) rects = [unionRect(rects)];
  const dim = !st.opp && !st.final;

  const progress = Math.round((TUT_STEPS.indexOf(st) / (TUT_STEPS.length - 1)) * 100);
  let foot = "";
  if (st.final) {
    foot = `<button type="button" class="btn btn-primary" data-coach="play">Play a real game</button><button type="button" class="btn" data-coach="guide">How to play</button><button type="button" class="btn" data-coach="menu">Main menu</button>`;
  } else {
    foot = `<span class="coach-progress" role="progressbar" aria-label="Tutorial progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></span><button type="button" class="coach-quit" data-coach="quit">Leave tutorial</button>${st.next ? `<button type="button" class="btn btn-primary" data-coach="next">Next</button>` : ""}`;
  }
  el.hidden = false;
  el.innerHTML = `<svg class="coach-svg" aria-hidden="true"></svg>
    <div class="coach-box${st.wide ? " wide" : ""}${nudging ? " nudge" : ""}" role="dialog" aria-live="polite" aria-label="Tutorial">
      ${st.title ? `<h2>${st.title}</h2>` : ""}
      <div class="coach-text">${text}</div>
      ${nudging ? `<p class="coach-nudge">Let's stick to the highlighted step for now.</p>` : ""}
      <div class="coach-foot">${foot}</div>
    </div>`;

  const box = el.querySelector(".coach-box");
  const vw = el.clientWidth, vh = el.clientHeight;
  // Keep clear of the targets and of the board's own prompt bar.
  const prompt = document.getElementById("prompt");
  const avoid = prompt.hidden ? rects : [...rects, prompt.getBoundingClientRect()];
  const pos = st.opp ? placeAside(box.offsetWidth, box.offsetHeight, vw, vh) : placeCoach(box.offsetWidth, box.offsetHeight, rects, avoid, vw, vh, st.wide || st.final || !rects.length);
  box.style.left = pos.x + "px"; box.style.top = pos.y + "px";

  // Dim everything except the targets, outline them, and point at the first one.
  const pad = 8;
  const holes = rects.map(r => `<rect x="${r.left - pad}" y="${r.top - pad}" width="${r.width + pad * 2}" height="${r.height + pad * 2}" rx="12"/>`).join("");
  let svg = "";
  if (dim) {
    svg += `<defs><mask id="coach-mask"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${holes}</g></mask>
      <marker id="coach-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd27a"/></marker></defs>
      <rect width="100%" height="100%" fill="rgba(6,3,1,0.62)" mask="url(#coach-mask)"/>`;
    svg += `<g class="coach-ring">${holes}</g>`;
  }
  if (dim && rects.length) {
    // Drag steps point from the card to where it goes; others from the box to the target.
    const dragging = st.drag && rects.length > 1;
    const from = dragging ? rects[0] : null;
    const b = dragging ? { left: from.left, top: from.top, right: from.right, bottom: from.bottom } : { left: pos.x, top: pos.y, right: pos.x + box.offsetWidth, bottom: pos.y + box.offsetHeight };
    const t = dragging ? rects[1] : rects[0];
    const tc = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
    const bc = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
    const start = edgePoint(b, bc, tc, dragging ? pad + 4 : 6);
    const end = dragging ? tc : edgePoint({ left: t.left - pad, top: t.top - pad, right: t.right + pad, bottom: t.bottom + pad }, tc, bc, 8);
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    if (dist > 40) {
      const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
      const bend = Math.min(80, dist * 0.2);
      const cx = mx - ((end.y - start.y) / dist) * bend, cy = my + ((end.x - start.x) / dist) * bend;
      svg += `<path class="coach-arrow" d="M${start.x} ${start.y} Q${cx} ${cy} ${end.x} ${end.y}" marker-end="url(#coach-head)"/>`;
    }
  }
  el.querySelector(".coach-svg").innerHTML = svg;
}

function unionRect(rs) {
  const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
  const r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
  return new DOMRect(l, t, r - l, b - t);
}

// Where the line from `from` toward `to` leaves rectangle r, pushed out by gap.
function edgePoint(r, from, to, gap) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const hw = (r.right - r.left) / 2 + gap, hh = (r.bottom - r.top) / 2 + gap;
  const k = 1 / Math.max(Math.abs(dx) / hw || 0, Math.abs(dy) / hh || 0, 1e-6);
  return { x: from.x + dx * Math.min(k, 1), y: from.y + dy * Math.min(k, 1) };
}

// Pick a spot for the coach box that does not cover what it is talking about:
// the empty space beside the board first, then around the targets, then corners.
// During the Trainer's turn the box steps aside so the whole table is visible:
// beside the board when there is room, otherwise in the bottom-left corner.
function placeAside(bw, bh, vw, vh) {
  const sr = q("#stage").getBoundingClientRect();
  if (sr.left >= bw + 24) return { x: (sr.left - bw) / 2, y: (vh - bh) / 2 };
  return { x: 12, y: vh - bh - 12 };
}

function placeCoach(bw, bh, rects, avoid, vw, vh, center) {
  const m = 12;
  const clamp = p => ({ x: Math.max(m, Math.min(vw - bw - m, p.x)), y: Math.max(m, Math.min(vh - bh - m, p.y)) });
  if (center) return clamp({ x: (vw - bw) / 2, y: (vh - bh) / 2 });
  const sr = q("#stage").getBoundingClientRect();
  const u = unionRect(rects);
  const ux = u.left + u.width / 2, uy = u.top + u.height / 2;
  const cands = [];
  const gl = sr.left, gr = vw - sr.right;
  const sideFirst = ux > vw / 2 ? ["L", "R"] : ["R", "L"];
  for (const s of sideFirst) {
    if (s === "L" && gl >= bw + m * 2) cands.push({ x: (gl - bw) / 2, y: uy - bh / 2 });
    if (s === "R" && gr >= bw + m * 2) cands.push({ x: sr.right + (gr - bw) / 2, y: uy - bh / 2 });
  }
  const gap = 56;
  const vertical = uy > vh / 2 ? [{ x: ux - bw / 2, y: u.top - bh - gap }, { x: ux - bw / 2, y: u.bottom + gap }] : [{ x: ux - bw / 2, y: u.bottom + gap }, { x: ux - bw / 2, y: u.top - bh - gap }];
  cands.push(...vertical, { x: u.right + gap, y: uy - bh / 2 }, { x: u.left - bw - gap, y: uy - bh / 2 });
  cands.push({ x: m, y: m }, { x: vw - bw - m, y: m }, { x: m, y: vh - bh - m }, { x: vw - bw - m, y: vh - bh - m });
  const hits = p => avoid.some(r => p.x < r.right + 10 && p.x + bw > r.left - 10 && p.y < r.bottom + 10 && p.y + bh > r.top - 10);
  for (const c of cands) {
    const p = clamp(c);
    if (!hits(p)) return p;
  }
  return clamp(cands[cands.length - 1]);
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-coach]");
  if (!b) return;
  const what = b.dataset.coach;
  if (what === "next") tutNext();
  else if (what === "quit") { endTutorial(); showScreen("menu"); }
  else if (what === "play") { endTutorial(); U.deckId = "simple_starter"; U.mode = "ai"; startGame(); }
  else if (what === "guide") { endTutorial(); showScreen("menu"); showGuide(); }
  else if (what === "menu") { endTutorial(); showScreen("menu"); }
});

// ---------------------------------------------------------------------------
// Card anatomy: a large card with its parts labelled. Used by the tutorial and
// for the picture in the How to play guide. Sizes are in em so it scales.
// ---------------------------------------------------------------------------
function anatomyHTML(c) {
  // Points on the card (in card em units, the card is 9.5 x 13.5) and where each label sits.
  const K = 1.1, X0 = 11.8, Y0 = 0.4;
  const parts = [
    { side: "L", y: 0.6, px: 1.25, py: 1.25, t: "Faction", d: "The family it belongs to" },
    { side: "L", y: 3.3, px: 1.2, py: 3.1, t: "Card type", d: "Character, Spell, Equipment or Area" },
    { side: "L", y: 9.4, px: 2.6, py: 10, t: "Skills", d: "Keywords with special rules" },
    { side: "L", y: 12.4, px: 1.3, py: 13.15, t: "⚔ Attack", d: "Damage it deals" },
    { side: "R", y: 0.6, px: 9.1, py: 1.3, t: "Mana cost", d: "What it costs to play" },
    { side: "R", y: 5.2, px: 9.3, py: 6.5, t: "Rarity", d: "The edge color" },
    { side: "R", y: 9.6, px: 4.9, py: 13.15, t: "♥ Health", d: "Damage it can take" },
    { side: "R", y: 12.6, px: 8.5, py: 13.15, t: "⚡ Speed", d: "Higher strikes first" },
  ];
  const lines = parts.map(p => {
    const x = X0 + p.px * K, y = Y0 + p.py * K;
    const lx = p.side === "L" ? 10.9 : 23.6, ly = p.y + 0.75;
    return `<path d="M${lx} ${ly} L${x} ${y}"/><circle cx="${x}" cy="${y}" r="0.28"/>`;
  }).join("");
  const labels = parts.map(p => `<div class="anat-label ${p.side}" style="top:${p.y}em"><b>${p.t}</b><span>${p.d}</span></div>`).join("");
  return `<div class="anatomy"><div class="anat-card" style="left:${X0}em;top:${Y0}em">${cardHTML(c)}</div>
    <svg viewBox="0 0 35 15.8" aria-hidden="true">${lines}</svg>${labels}</div>`;
}
