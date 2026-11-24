// The campaign: one match against the computer for each champion (the strongest of a tribe).
// Each champion plays its fracture's starter deck and starts with its champion card in hand.
// Progress is saved in the browser (PREFS "campaign"). Who the champions are, what they say
// in a match and how the computer plays them is in js/champions.js; the story is docs/world.md.
// Adding a champion: add a stage here, an entry in CHAMPIONS, and a starter deck for its faction.

// Each stage: the champion's fracture and champion card (its CardID; the name shown is the card's), the story card before the match (intro, then a
// short scene and the champion's words to the Shardkeeper), and the line after a win.
const CAMPAIGN = [
  {
    faction: "Simple", champion: "the_simplistic",
    scene: "The turnip rows are perfectly straight, every one exactly the same.",
    says: "Nice turnips. Nice day. Why fight?",
    intro: "A shard comes down in a quiet turnip field. The Simplistic is already standing over it, insisting everything was fine before all this.",
    win: "The Simplistic shrugs and steps aside. \"Keep it simple,\" it says. \"Start small, then level up.\" It says it exactly as it said it before.",
  },
  {
    faction: "Wild", champion: "the_man_ape",
    scene: "The Man Ape peels a banana on top of its shard pile.",
    says: "My jungle. My shards. You want some? Earn them.",
    intro: "Deep in a jungle that wasn't there last week, The Man Ape sits on a pile of shards like a hoard of bananas. The troop watches from the trees. The ground still hums where the jungle first appeared.",
    win: "The troop scatters. The Man Ape lets the shard go, but keeps one eye on it.",
  },
  {
    faction: "Mortal", champion: "ip_man",
    scene: "He is sweeping the courtyard. One stone is cracked in a perfect square.",
    says: "*bows* Every fight is a lesson. Shall we study?",
    intro: "Since his world broke, IP Man has trained on a cliff edge above the falling shards. He bows before every fight and expects a bow back. He swears the sky flickered, just once, a moment before the break.",
    win: "IP Man bows once more. \"Again tomorrow,\" he says, and he means it.",
  },
  {
    faction: "Cyber", champion: "boss_level",
    scene: "The air hums like a computer fan. For a blink, a progress bar hangs at 99%.",
    says: "PLAYER 2 HAS ENTERED. Difficulty: adjusting…",
    intro: "A shard has landed in a server room humming in the middle of nowhere. Boss Level loads in with a health bar nobody has seen the end of. Its desktop wallpaper is a quiet turnip field.",
    win: "Boss Level flickers. GAME OVER, the screens read, though nobody is sure for whom. Somewhere in the code, a turnip field keeps loading.",
  },
  {
    faction: "Undead", champion: "soul_shepard",
    scene: "Grey stones, quiet. Soul Shepard walks among them, humming.",
    says: "They say I started all this. I only tend what's left.",
    intro: "The other champions all say the Zombies caused the Shardfall. Soul Shepard waits among the graves, gathering the fallen, and does not argue.",
    win: "Soul Shepard lowers its crook. Among the souls it gathered are faces from every world, not only its own. The shards keep falling.",
  },
];

// A champion's name as players read it: its card's name, so renaming the card renames it everywhere.
const champName = id => DATA.cardsById[id]?.name || id;
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
      <div class="camp-who"><b>${i + 1}. ${esc(champName(st.champion))}</b><span>${esc(st.faction)} champion · ${label}</span></div>
      ${play}</li>`;
  }).join("");
  const done = cleared >= CAMPAIGN.length
    ? `<p class="camp-done">All ${NUMBER_WORDS[CAMPAIGN.length] || CAMPAIGN.length} champions beaten. The shards are still falling, though.</p>` : "";
  openModal(`<h2 id="modal-title">Campaign</h2>
    <p class="sub">Beat each champion in turn. Each one plays its own starter deck and starts with its champion in hand.</p>
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
      <h2 id="modal-title">${esc(champName(st.champion))}</h2>
      ${CHAMPIONS[st.champion] ? `<p class="camp-tag">${esc(CHAMPIONS[st.champion].tag)}</p>` : ""}
      <p class="camp-story">${esc(st.intro)}</p>
      ${st.scene ? `<p class="camp-scene">${esc(st.scene)}</p>` : ""}
      ${st.says ? `<p class="camp-says">“${esc(st.says)}”</p>` : ""}
      <div class="detail-actions"><button type="button" class="btn btn-primary" data-camp-go="${i}">Begin</button><button type="button" class="btn" data-camp-back>Back</button></div>
    </div>`, { dismissable: true });
}

function beginCampaignMatch(i) {
  const st = CAMPAIGN[i];
  closeModal();
  startGame({
    campaign: { stage: i },
    opponentDeckId: campaignDeck(st.faction),
    foeChampion: st.champion,   // the champion starts with its card in hand (campaignChampion in js/engine.js)
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
  const story = won ? `<p class="camp-story end">${esc(st.win)}</p>` : `<p class="camp-story end">${esc(champName(st.champion))} holds on to the shard. Try again?</p>`;
  const actions = won
    ? (last ? `<button type="button" class="btn btn-primary" data-act="camp-map">Campaign complete</button>`
            : `<button type="button" class="btn btn-primary" data-act="camp-next">Next: ${esc(champName(CAMPAIGN[i + 1].champion))}</button>`)
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
// The campaign windows' buttons (their clicks come through the #modal handler in js/panels.js).
function campaignClick(b) {
  const d = b.dataset;
  if (d.camp != null) playCampaignMatch(Number(d.camp));
  else if (d.campGo != null) beginCampaignMatch(Number(d.campGo));
  else if (d.campBack != null) showCampaign();
  else if (d.campClose != null) closeModal();
  else if (d.campDeck != null) { closeModal(); showScreen("menu"); showSetup("campaign"); }
  else if (d.campReset != null) {
    // Ask once more on the button itself before wiping progress.
    if (d.sure) { PREFS.set("campaign", 0); showCampaign(); }
    else { d.sure = "1"; b.textContent = "Tap again to lock all champions"; }
  }
}

// ---------------------------------------------------------------------------
// Speech: the champion says a line in the match log and in a bubble by its health plate.
// At most one line every 7 seconds, and 8 a match, so it stays a seasoning. It speaks in the
// campaign, and in any match against the computer as the champion of the computer's deck.
// ---------------------------------------------------------------------------
const SAY = { at: 0, n: 0, said: new Set() };
// The champion speaking for the computer (its CardID): its campaign champion, or its deck's champion card.
// (Only for speech: how the computer plays is unchanged, see championOf in js/champions.js.)
function speakerName(foe) {
  if (foe.champion && CHAMPIONS[foe.champion]) return foe.champion;
  const id = foe.champ?.id;
  return id && CHAMPIONS[id] ? id : null;
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
  log(`${champName(who)}: "${line}"`);
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
  return `<p class="recall">"${esc(line)}" <span>${esc(champName(who))}</span></p>`;
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
  if (type === "play" && d.player === 1 && d.card.id === who) {
    championSay("champion", { force: true, once: true });
  } else if (type === "shardClaim") {
    championSay(d.player === 1 ? "shardWon" : "shardLost", { force: true, once: true });
  } else if (type === "death" && foe.grave.some(c => c.uid === d.uid && c.id === who)) {
    championSay("fell", { force: true, once: true });
  } else if (type === "turn" && d.player === 1 && foe.field.chars.length > S.players[0].field.chars.length) {   // only champions with an "outnumber" line say it
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

// ---------------------------------------------------------------------------
// Card stories: every card has a short description (the Description column of data/cards.csv,
// "Flavor text" in the card sheet). It stays hidden until you play that card once; then it
// shows when you read the card (in a match, the Almanac or the deck builder). Kept on this
// device (PREFS "lore": the CardIDs unlocked). The end screen lists the ones a match unlocked.
// ---------------------------------------------------------------------------
const loreKnown = id => (PREFS.get("lore", []) || []).includes(id);
function loreHTML(c) {
  if (!c.description) return "";
  return loreKnown(c.id) ? `<p class="lore">“${esc(c.description)}”</p>` : `<p class="lore locked">??? Play this card to unlock its story.</p>`;
}
onGameEvent((type, d) => {
  if (type === "newGame") U.newLore = [];
  if (type !== "play" || !S || S.players[d.player]?.isAI) return;
  const id = d.card.id;
  if (!DATA.cardsById[id]?.description || loreKnown(id)) return;
  PREFS.set("lore", [...(PREFS.get("lore", []) || []), id]);
  (U.newLore || (U.newLore = [])).push(id);
});
// The end screen: one quiet line naming the stories this match unlocked; tap it to read them.
function newLoreHTML() {
  const ids = U.newLore || [];
  if (!ids.length) return "";
  const names = ids.slice(0, 3).map(id => DATA.cardsById[id]?.name).filter(Boolean);
  const more = ids.length > 3 ? ` and ${ids.length - 3} more` : "";
  return `<button type="button" class="lore-new" data-act="lore-new">📜 New card ${ids.length === 1 ? "story" : "stories"}: ${esc(names.join(", "))}${more} · read</button>`;
}
function showNewLore() {
  const ids = U.newLore || [];
  openModal(`<h2 id="modal-title">New card stories</h2>
    <div class="lore-list">${ids.map(id => { const c = DATA.cardsById[id]; return c ? `<div class="lore-item">${medal(c.group)}<div><b>${esc(c.name)}</b><p>“${esc(c.description)}”</p></div></div>` : ""; }).join("")}</div>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-close>Close</button></div>`);
}
const loreCount = () => DATA.cardList.filter(c => c.description && loreKnown(c.id)).length;

// ---------------------------------------------------------------------------
// Trophies: things to achieve, earned in matches against the computer (campaign included) and
// kept on this device. PREFS "trophies": { id: date earned }; PREFS "tcount": running totals
// for the ones that build up over many matches. The Trophies button on the start menu shows
// them all; the end screen names any a match just earned.
// ---------------------------------------------------------------------------
const STARTERS = () => DATA.deckOrder.filter(id => DATA.decks[id].isPlayable);
const TROPHIES = [
  { id: "troop_night", name: "Troop Night", how: "Win with 5 or more Monkeys on your side" },
  { id: "shardbreaker", name: "Shardbreaker", how: "Break the big shard 3 times", count: "shards", goal: 3 },
  { id: "untouchable", name: "Untouchable", how: "Win without taking any damage" },
  { id: "brink", name: "Back from the Brink", how: "Win after dropping to 5 health or less" },
  { id: "overkill", name: "Overkill", how: "Deal 10 or more damage in one hit" },
  { id: "spell_slinger", name: "Spell Slinger", how: "Cast 5 spells in one match" },
  { id: "full_house", name: "Full House", how: "Have 7 characters on your side at once" },
  { id: "maxed_out", name: "Maxed Out", how: "Get a character to Level 3" },
  { id: "grave_robber", name: "Grave Robber", how: "Bring 5 characters back from the graveyard", count: "revived", goal: 5 },
  { id: "five_worlds", name: "Five Worlds", how: "Win at least once with each starter deck" },
  { id: "shardkeeper", name: "Shardkeeper", how: "Beat the Campaign" },
  // one for each starter deck's top mastery title
  ...Object.entries(MASTERY_TITLES).filter(([id]) => id !== "custom").map(([id, titles]) => ({ id: "top_" + id, deck: id, name: titles[titles.length - 1], how: `Reach the top mastery title with the ${DATA.decks[id]?.name || id}` })),
];
const trophiesWon = () => PREFS.get("trophies", {}) || {};
const tcount = () => PREFS.get("tcount", {}) || {};
function earnTrophy(id) {
  const won = trophiesWon();
  if (won[id]) return;
  won[id] = new Date().toISOString().slice(0, 10);
  PREFS.set("trophies", won);
  (U.newTrophies || (U.newTrophies = [])).push(id);
}
function bumpCount(key, n = 1) {
  const c = tcount(); c[key] = (c[key] || 0) + n; PREFS.set("tcount", c);
  for (const t of TROPHIES) if (t.count === key && c[key] >= t.goal) earnTrophy(t.id);
}
// What one match tracks for the trophies (the player at the bottom against the computer).
const trophyMatch = () => S && S.mode === "ai" && !U.tutorial && !S.players[0].isAI;
let TM = null;
onGameEvent((type, d) => {
  if (type === "newGame") { U.newTrophies = []; TM = { hurt: false, low: Infinity, spells: 0, grave: new Set() }; return; }
  if (!trophyMatch() || !TM) return;
  const me = S.players[0];
  if (type === "playerDamage" && d.player === 0) { TM.hurt = true; TM.low = Math.min(TM.low, me.health); }
  if ((type === "playerDamage" && d.player === 1 && d.amount >= 10) || (type === "charDamage" && d.amount >= 10 && findChar(d.uid)?.p.idx === 1)) earnTrophy("overkill");
  if (type === "play" && d.player === 0 && d.card.type === "Spell" && ++TM.spells >= 5) earnTrophy("spell_slinger");
  if (type === "shardClaim" && d.player === 0) bumpCount("shards");
  if (type === "reanimate" && d.player === 0) bumpCount("revived");
  if (me.field.chars.length >= 7) earnTrophy("full_house");
  if (me.field.chars.some(c => (c.levelUpCount || 0) >= 3)) earnTrophy("maxed_out");
  // a character leaving your graveyard (back to your hand or the table) was brought back
  const now = new Set(me.grave.filter(c => c.type === "Character").map(c => c.uid));
  let back = 0;
  for (const uid of TM.grave) if (!now.has(uid) && (me.hand.some(c => c.uid === uid) || me.field.chars.some(c => c.uid === uid))) back++;
  TM.grave = now;
  if (back) bumpCount("revived", back);
  if (type === "gameOver") {
    if (d.winner === 0) {
      if (me.field.chars.filter(c => hasTribe(c, "Monkey")).length >= 5) earnTrophy("troop_night");
      if (!TM.hurt) earnTrophy("untouchable");
      if (TM.low <= 5) earnTrophy("brink");
      const rec = PREFS.get("record", {}) || {};
      if (STARTERS().every(id => rec[id]?.w > 0)) earnTrophy("five_worlds");
    }
    if (campaignCleared() >= CAMPAIGN.length) earnTrophy("shardkeeper");
    for (const t of TROPHIES) if (t.deck && masteryOf(t.deck).level >= MASTERY_STEPS.length) earnTrophy(t.id);
  }
});
// The end screen: one quiet line for trophies this match earned.
function newTrophiesHTML() {
  const ids = U.newTrophies || [];
  if (!ids.length) return "";
  const names = ids.map(id => TROPHIES.find(t => t.id === id)?.name).filter(Boolean);
  return `<button type="button" class="lore-new trophy-new" data-act="trophies">🏆 New ${names.length > 1 ? "trophies" : "trophy"}: ${esc(names.join(", "))}</button>`;
}
// The Trophy case.
function showTrophies() {
  const won = trophiesWon(), counts = tcount();
  const n = TROPHIES.filter(t => won[t.id]).length;
  openModal(`<h2 id="modal-title">Trophies</h2><p class="sub">${n} of ${TROPHIES.length} earned. Trophies are earned in matches against the computer.</p>
    <div class="trophy-grid">${TROPHIES.map(t => {
      const got = won[t.id];
      const prog = t.count && !got ? ` <small>${Math.min(counts[t.count] || 0, t.goal)} / ${t.goal}</small>` : "";
      return `<div class="trophy${got ? " got" : ""}"><span class="trophy-cup" aria-hidden="true">🏆</span><b>${esc(t.name)}</b><span>${esc(t.how)}${prog}</span>${got ? `<em>Earned ${esc(got)}</em>` : `<em>Not earned yet</em>`}</div>`;
    }).join("")}</div>
    <div class="detail-actions"><button type="button" class="btn btn-primary" data-close>Close</button></div>`);
}
