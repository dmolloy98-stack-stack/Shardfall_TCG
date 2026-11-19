// The campaign: one match against the computer for each faction's champion.
// Each champion plays its faction's starter deck and starts with its champion card in hand.
// Progress is saved in the browser (PREFS "campaign"). Who the champions are, what they say
// in a match and how the computer plays them is in js/champions.js; the story is docs/world.md.
// Adding a champion: add a stage here, an entry in CHAMPIONS, and a starter deck for its faction.

const CAMPAIGN = [
  {
    faction: "Simple", champion: "The Simplistic",
    intro: "A shard comes down in a quiet turnip field. The Simplistic is already standing over it, insisting everything was fine before all this.",
    win: "The Simplistic shrugs and steps aside. \"Keep it simple,\" it says. \"Start small, then level up.\" It says it exactly as it said it before.",
  },
  {
    faction: "Monkey", champion: "The Man Ape",
    intro: "Deep in a jungle that wasn't there last week, The Man Ape sits on a pile of shards like a hoard of bananas. The troop watches from the trees. The ground still hums where the jungle first appeared.",
    win: "The troop scatters. The Man Ape lets the shard go, but keeps one eye on it.",
  },
  {
    faction: "Fighter", champion: "IP Man",
    intro: "Since his world broke, IP Man has trained on a cliff edge above the falling shards. He bows before every fight and expects a bow back. He swears the sky flickered, just once, a moment before the break.",
    win: "IP Man bows once more. \"Again tomorrow,\" he says, and he means it.",
  },
  {
    faction: "Digital", champion: "Boss Level",
    intro: "A shard has landed in a server room humming in the middle of nowhere. Boss Level loads in with a health bar nobody has seen the end of. Its desktop wallpaper is a quiet turnip field.",
    win: "Boss Level flickers. GAME OVER, the screens read, though nobody is sure for whom. Somewhere in the code, a turnip field keeps loading.",
  },
  {
    faction: "Zombie", champion: "Soul Shepard",
    intro: "The other champions all say the Zombies caused the Shardfall. Soul Shepard waits among the graves, gathering the fallen, and does not argue.",
    win: "Soul Shepard lowers its crook. Among the souls it gathered are faces from every world, not only its own. The shards keep falling.",
  },
];

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const campaignCleared = () => Math.max(0, Math.min(CAMPAIGN.length, PREFS.get("campaign", 0) || 0));
const campaignDeck = faction => DATA.deckOrder.find(id => DATA.decks[id].isPlayable && DATA.decks[id].faction === faction);

function showCampaign() {
  const cleared = campaignCleared();
  const deck = DATA.decks[U.deckId];
  const problem = deckProblem(U.deckId);
  const rows = CAMPAIGN.map((st, i) => {
    const state = i < cleared ? "cleared" : i === cleared ? "next" : "locked";
    const label = { cleared: "✓ Beaten", next: "Next", locked: "🔒 Locked" }[state];
    const play = state !== "locked" && !problem && campaignDeck(st.faction)
      ? `<button type="button" class="btn btn-small${state === "next" ? " btn-primary" : ""}" data-camp="${i}">${state === "cleared" ? "Replay" : "Fight"}</button>` : "";
    return `<li class="camp-stage ${state}" style="--fc:${DATA.factions[st.faction]?.color || "#888"}">
      ${medal(st.faction, "camp-medal")}
      <div class="camp-who"><b>${i + 1}. ${esc(st.champion)}</b><span>${esc(st.faction)} champion · ${label}</span></div>
      ${play}</li>`;
  }).join("");
  const done = cleared >= CAMPAIGN.length
    ? `<p class="camp-done">All ${NUMBER_WORDS[CAMPAIGN.length] || CAMPAIGN.length} champions beaten. The shards are still falling, though.</p>` : "";
  openModal(`<h2 id="modal-title">Campaign</h2>
    <p class="sub">Beat each fracture's champion in turn. Each one plays its fracture's deck and starts with its champion in hand.</p>
    <p class="camp-deck">Your deck: <b>${esc(deck?.name || "none")}</b> <button type="button" class="btn btn-small" data-camp-deck>Change deck</button></p>
    ${problem ? `<p class="deck-problem">${esc(problem)}</p>` : ""}
    <ol class="camp-list">${rows}</ol>${done}
    <div class="detail-actions">
      <button type="button" class="btn" data-camp-close>Close</button>
      ${cleared ? `<button type="button" class="btn btn-small camp-reset" data-camp-reset>Start over</button>` : ""}
    </div>`);
}

// The story card shown before a match.
function playCampaignMatch(i) {
  const st = CAMPAIGN[i];
  if (!st || i > campaignCleared()) return;
  openModal(`<div class="camp-intro" style="--fc:${DATA.factions[st.faction]?.color || "#888"}">
      ${medal(st.faction, "camp-medal big")}
      <p class="camp-step">Match ${i + 1} of ${CAMPAIGN.length}</p>
      <h2 id="modal-title">${esc(st.champion)}</h2>
      ${CHAMPIONS[st.champion] ? `<p class="camp-tag">${esc(CHAMPIONS[st.champion].tag)}</p>` : ""}
      <p class="camp-story">${esc(st.intro)}</p>
      <div class="detail-actions"><button type="button" class="btn btn-primary" data-camp-go="${i}">Begin</button><button type="button" class="btn" data-camp-back>Back</button></div>
    </div>`, { dismissable: true });
}

function beginCampaignMatch(i) {
  const st = CAMPAIGN[i];
  closeModal();
  startGame({
    campaign: { stage: i },
    opponentDeckId: campaignDeck(st.faction),
    setup: S => {
      const foe = S.players[1];
      foe.name = st.champion;
      foe.champion = st.champion;   // js/champions.js: its lines, and how the computer plays it
      // The champion starts in hand, so it shows up in the match.
      const k = foe.deck.findIndex(c => c.name === st.champion);
      if (k >= 0 && !foe.hand.some(c => c.name === st.champion)) {
        const champ = foe.deck.splice(k, 1)[0];
        foe.deck.unshift(foe.hand.pop());
        foe.hand.push(champ);
        shuffle(foe.deck);
      }
      S.log.push(`${st.champion} challenges ${S.players[0].name}.`);
    },
  });
  championMatchStarts();
}

function campaignNext() {
  const next = U.campaign ? U.campaign.stage + 1 : campaignCleared();
  if (next < CAMPAIGN.length && next <= campaignCleared()) playCampaignMatch(next);
  else { showScreen("menu"); showCampaign(); }
}

// What the end screen shows after a campaign match.
function campaignEndHTML(won) {
  const i = U.campaign.stage, st = CAMPAIGN[i];
  const last = i === CAMPAIGN.length - 1;
  const story = won ? `<p class="camp-story end">${esc(st.win)}</p>` : `<p class="camp-story end">${esc(st.champion)} holds on to the shard. Try again?</p>`;
  const actions = won
    ? (last ? `<button type="button" class="btn btn-primary" data-act="camp-map">Campaign complete</button>`
            : `<button type="button" class="btn btn-primary" data-act="camp-next">Next: ${esc(CAMPAIGN[i + 1].champion)}</button>`)
      + `<button type="button" class="btn" data-act="tomenu">Main menu</button>`
    : `<button type="button" class="btn btn-primary" data-act="again">Try again</button><button type="button" class="btn" data-act="camp-map">Campaign</button><button type="button" class="btn" data-act="tomenu">Main menu</button>`;
  return { story, actions };
}

// A win unlocks the next match.
onGameEvent((type, d) => {
  if (type !== "gameOver" || !U.campaign || U.tutorial || d.winner !== 0) return;
  if (U.campaign.stage >= campaignCleared()) PREFS.set("campaign", U.campaign.stage + 1);
});

document.getElementById("btn-campaign").addEventListener("click", showCampaign);
document.getElementById("modal-content").addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-camp]")) playCampaignMatch(Number(t.closest("[data-camp]").dataset.camp));
  else if (t.closest("[data-camp-go]")) beginCampaignMatch(Number(t.closest("[data-camp-go]").dataset.campGo));
  else if (t.closest("[data-camp-back]")) showCampaign();
  else if (t.closest("[data-camp-close]")) closeModal();
  else if (t.closest("[data-camp-deck]")) { closeModal(); showScreen("menu"); showSetup("campaign"); }
  else if (t.closest("[data-camp-reset]")) {
    // Ask once more on the button itself before wiping progress.
    const b = t.closest("[data-camp-reset]");
    if (b.dataset.sure) { PREFS.set("campaign", 0); showCampaign(); }
    else { b.dataset.sure = "1"; b.textContent = "Tap again to lock all champions"; }
  }
});

// ---------------------------------------------------------------------------
// Speech: the champion says a line in the match log and in a bubble by its health plate.
// At most one line every 7 seconds, and 8 a match, so it stays a seasoning. It speaks in the
// campaign, and in any match against the computer as the champion of the computer's deck.
// ---------------------------------------------------------------------------
const SAY = { at: 0, n: 0, said: new Set() };
// The champion speaking for the computer: its campaign champion, or its deck's champion card.
// (Only for speech: how the computer plays is unchanged, see championOf in js/champions.js.)
function speakerName(foe) {
  if (foe.champion && CHAMPIONS[foe.champion]) return foe.champion;
  const name = foe.champ ? DATA.cardsById[foe.champ.id]?.name : null;
  return name && CHAMPIONS[name] ? name : null;
}
const speaking = () => typeof S !== "undefined" && S && S.mode === "ai" && !U.tutorial && S.players[1].isAI;
function championSay(key, { force = false, once = false } = {}) {
  if (!speaking()) return;
  const foe = S.players[1];
  const who = speakerName(foe);
  const ch = who && CHAMPIONS[who];
  const lines = ch?.lines[key];
  if (!lines || !lines.length) return;
  if (once && SAY.said.has(key)) return;
  const now = performance.now();
  if (!force && (now - SAY.at < 7000 || SAY.n >= 8)) return;
  SAY.at = now; SAY.n++; SAY.said.add(key);
  const line = lines[Math.floor(Math.random() * lines.length)];
  log(`${who}: "${line}"`);
  const p = plateCenter(1);
  const el = fxDiv("champ-say", `left:${p.x + 185}px;top:${p.y + 40}px`, 4200);
  el.textContent = line;
}

// The end screen: the champion remembers the match, naming your card that dealt the most damage.
function recallHTML() {
  if (!speaking() || S.winner == null) return "";
  const who = speakerName(S.players[1]);
  const lines = who && CHAMPIONS[who].lines[S.winner === 1 ? "recallWin" : "recallLose"];
  if (!lines?.length) return "";
  const best = Object.values(U.stats?.byCard || {}).sort((a, b) => b.n - a.n)[0];
  let line = lines[0];
  if (/\{card\}|\{n\}/.test(line)) {
    if (!best) return "";
    line = line.replaceAll("{card}", best.name).replaceAll("{n}", best.n);
  }
  return `<p class="recall">"${esc(line)}" <span>${esc(who)}</span></p>`;
}

function championMatchStarts() {
  SAY.at = 0; SAY.n = 0; SAY.said = new Set();
  setTimeout(() => championSay("start", { force: true }), 900);
}

onGameEvent((type, d) => {
  if (!speaking()) return;
  const foe = S.players[1];
  const who = speakerName(foe);
  if (!who) return;
  if (type === "play" && d.player === 1 && d.card.name === who) {
    championSay("champion", { force: true, once: true });
  } else if (type === "shardClaim") {
    championSay(d.player === 1 ? "shardWon" : "shardLost", { force: true, once: true });
  } else if (type === "death" && foe.grave.some(c => c.uid === d.uid && c.name === who)) {
    championSay("fell", { force: true, once: true });
  } else if (type === "turn" && d.player === 1 && who === "The Man Ape" && chestThump(foe)) {
    championSay("outnumber", { once: true });
  } else if (type === "playerDamage" && d.player === 1 && foe.health > 0) {   // the killing blow has its own moment
    if (foe.health <= 5) championSay("brink", { once: true, force: true });
    else if (foe.health / foe.maxHealth < 0.5) championSay("low", { once: true, force: true });
    else if (d.amount >= 3) championSay("hurt");
  } else if (type === "playerDamage" && d.player === 0 && d.amount >= 4) {
    championSay("hit");
  } else if (type === "gameOver") {
    championSay(d.winner === 1 ? "win" : "lose", { force: true });
  }
});

// ---------------------------------------------------------------------------
// Deck mastery: each deck earns points from its matches against the computer (100 for a win,
// 40 otherwise, 20 more for claiming the big shard). Points reach five levels, each with a
// title. Kept on this device (PREFS "mastery": { deckId: points }).
// ---------------------------------------------------------------------------
const MASTERY_STEPS = [100, 300, 600, 1000, 1500];
const MASTERY_TITLES = {
  simple_starter: ["Turnip Picker", "Field Hand", "Village Regular", "Simple Elder", "The Simplest"],
  monkey_starter: ["Banana Fetcher", "Troop Cousin", "Branch Swinger", "Silverback", "Jungle King"],
  zombie_starter: ["Fresh Corpse", "Shambler", "Grave Walker", "Horde Caller", "Soul Keeper"],
  fighter_starter: ["White Belt", "Yellow Belt", "Black Belt", "Sensei", "Grandmaster"],
  digital_starter: ["Noob", "Casual", "Speedrunner", "Pro Gamer", "Final Boss"],
  custom: ["Novice", "Adept", "Veteran", "Master", "Legend"],   // decks you built
};
const MASTERY_POINTS = { win: 100, loss: 40, shard: 20 };
function masteryOf(deckId, pts) {
  if (pts == null) pts = (PREFS.get("mastery", {}) || {})[deckId] || 0;
  const level = MASTERY_STEPS.filter(s => pts >= s).length;
  const titles = MASTERY_TITLES[deckId] || MASTERY_TITLES.custom;
  const prev = level ? MASTERY_STEPS[level - 1] : 0, next = MASTERY_STEPS[level] ?? null;
  return { pts, level, title: level ? titles[level - 1] : null, prev, next, frac: next ? (pts - prev) / (next - prev) : 1 };
}
// A deck's wins and losses against the computer: { w, l }.
const deckRecord = deckId => (PREFS.get("record", {}) || {})[deckId] || { w: 0, l: 0 };
const recordText = deckId => { const r = deckRecord(deckId); return r.w + r.l ? `${r.w} won · ${r.l} lost` : ""; };
// The line under a deck on the main menu.
function masteryLine(deckId) {
  const m = masteryOf(deckId);
  const rec = recordText(deckId);
  const bar = `<i class="mbar"><b style="width:${(m.frac * 100).toFixed(0)}%"></b></i>`;
  return `<em class="deck-mastery">${m.title ? `★ ${esc(m.title)}` : "No title yet"}${bar}<small>${m.next ? `${m.pts} / ${m.next}` : "Max level"}</small>${rec ? `<small class="deck-record">${rec}</small>` : ""}</em>`;
}
onGameEvent((type, d) => {
  if (type === "newGame") U.masteryGain = null;
  if (type !== "gameOver" || U.tutorial || !S || S.mode !== "ai" || S.players[0].isAI) return;
  const id = S.players[0].deckId;
  const all = PREFS.get("mastery", {}) || {};
  const before = all[id] || 0;
  const gain = (d.winner === 0 ? MASTERY_POINTS.win : MASTERY_POINTS.loss) + (S.shardBy === 0 ? MASTERY_POINTS.shard : 0);
  all[id] = before + gain;
  PREFS.set("mastery", all);
  // the deck's record against the computer (shown on the menu and in the deck builder)
  const rec = PREFS.get("record", {}) || {};
  const r = rec[id] || (rec[id] = { w: 0, l: 0 });
  if (d.winner === 0) r.w++; else r.l++;
  PREFS.set("record", rec);
  U.masteryGain = { id, before, after: before + gain, gain };
});
// The end screen: points earned, the bar filling, and a new title if one was reached.
function masteryHTML() {
  const g = U.masteryGain;
  if (!g) return "";
  const a = masteryOf(g.id, g.before), b = masteryOf(g.id, g.after);
  const up = b.level > a.level;
  const from = up ? 0 : a.frac;
  const name = DATA.decks[g.id]?.name || "Your deck";
  return `<div class="mastery-end${up ? " up" : ""}"><span>${esc(name)} mastery <b>+${g.gain}</b></span>
    <i class="mbar"><b style="--from:${(from * 100).toFixed(0)}%;--to:${(b.frac * 100).toFixed(0)}%"></b></i>
    <small>${up ? `New title: <b>★ ${esc(b.title)}</b>` : b.title ? `★ ${esc(b.title)}` : "No title yet"}${b.next ? ` · ${b.pts} / ${b.next}` : " · Max level"}</small></div>`;
}
