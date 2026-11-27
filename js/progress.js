// Progress kept on this device, earned in matches: deck mastery (points and titles), each deck's
// record, card stories, and trophies. Split out of js/campaign.js; loaded right after it
// (GAME_SCRIPTS in js/data.js). The titles, trophy names and goal numbers are data files
// (data/mastery.csv, data/trophies.csv, mastery_* rows in data/game_rules.csv).

// ---------------------------------------------------------------------------
// Deck mastery: each deck earns points from its matches against the computer (MASTERY_POINTS: for a
// win, otherwise, and more for claiming the big shard). Points reach five levels, each with a
// title. Kept on this device (PREFS "mastery": { deckId: points }).
// ---------------------------------------------------------------------------
// The titles are data/mastery.csv; the points are mastery_* rows in data/game_rules.csv.
const MASTERY_STEPS = String(DATA.rules.mastery_steps ?? "100|300|600|1000|1500").split("|").map(Number).filter(n => n > 0);
const MASTERY_TITLES = DATA.mastery;   // DeckID -> titles; "custom" for decks you built
const MASTERY_POINTS = { win: DATA.rules.mastery_win ?? 100, loss: DATA.rules.mastery_loss ?? 40, shard: DATA.rules.mastery_shard ?? 20 };
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
  if (type !== "gameOver" || !S || !matchRule("progress") || !isHere(S.players[0])) return;
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
  if (type !== "play" || !S || !isHere(S.players[d.player])) return;
  const id = d.card.id;
  if (!DATA.cardsById[id]?.description || loreKnown(id)) return;
  PREFS.set("lore", [...(PREFS.get("lore", []) || []), id]);
  U.newLore.push(id);
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
// Names, words and goal numbers are data/trophies.csv; what each one checks is in the match watcher
// below, by TrophyID. Counted trophies (built up over many matches) name their running total here.
const TROPHY_COUNTS = { shardbreaker: "shards", grave_robber: "revived" };
const TROPHIES = [
  ...DATA.trophies.map(t => ({ ...t, how: t.how.replace("{goal}", t.goal ?? ""), count: TROPHY_COUNTS[t.id] })),
  // one for each starter deck's top mastery title
  ...Object.entries(MASTERY_TITLES).filter(([id]) => id !== "custom").map(([id, titles]) => ({ id: "top_" + id, deck: id, name: titles[titles.length - 1], how: `Reach the top mastery title with the ${DATA.decks[id]?.name || id}` })),
];
// The goal number a trophy checks (data/trophies.csv).
const goalOf = id => TROPHIES.find(t => t.id === id)?.goal;
const trophiesWon = () => PREFS.get("trophies", {}) || {};
const tcount = () => PREFS.get("tcount", {}) || {};
function earnTrophy(id) {
  const won = trophiesWon();
  if (won[id]) return;
  won[id] = new Date().toISOString().slice(0, 10);
  PREFS.set("trophies", won);
  U.newTrophies.push(id);
}
function bumpCount(key, n = 1) {
  const c = tcount(); c[key] = (c[key] || 0) + n; PREFS.set("tcount", c);
  for (const t of TROPHIES) if (t.count === key && c[key] >= t.goal) earnTrophy(t.id);
}
// What one match tracks for the trophies (the player at the bottom against the computer).
const trophyMatch = () => S && matchRule("progress") && isHere(S.players[0]);
let TROPHY_MATCH = null;
onGameEvent((type, d) => {
  if (type === "newGame") { U.newTrophies = []; TROPHY_MATCH = { hurt: false, low: Infinity, spells: 0, grave: new Set() }; return; }
  if (!trophyMatch() || !TROPHY_MATCH) return;
  const me = S.players[0];
  if (type === "playerDamage" && d.player === 0) { TROPHY_MATCH.hurt = true; TROPHY_MATCH.low = Math.min(TROPHY_MATCH.low, me.health); }
  if ((type === "playerDamage" && d.player === 1 && d.amount >= goalOf("overkill")) || (type === "charDamage" && d.amount >= goalOf("overkill") && findChar(d.uid)?.p.idx === 1)) earnTrophy("overkill");
  if (type === "play" && d.player === 0 && d.card.type === "Spell" && ++TROPHY_MATCH.spells >= goalOf("spell_slinger")) earnTrophy("spell_slinger");
  if (type === "shardClaim" && d.player === 0) bumpCount("shards");
  if (type === "reanimate" && d.player === 0) bumpCount("revived");
  if (me.field.chars.length >= goalOf("full_house")) earnTrophy("full_house");
  if (me.field.chars.some(c => (c.levelUpCount || 0) >= goalOf("maxed_out"))) earnTrophy("maxed_out");
  // a character leaving your graveyard (back to your hand or the table) was brought back
  const now = new Set(me.grave.filter(c => c.type === "Character").map(c => c.uid));
  let back = 0;
  for (const uid of TROPHY_MATCH.grave) if (!now.has(uid) && (me.hand.some(c => c.uid === uid) || me.field.chars.some(c => c.uid === uid))) back++;
  TROPHY_MATCH.grave = now;
  if (back) bumpCount("revived", back);
  if (type === "gameOver") {
    if (d.winner === 0) {
      if (me.field.chars.filter(c => hasTribe(c, "Monkey")).length >= goalOf("troop_night")) earnTrophy("troop_night");
      if (!TROPHY_MATCH.hurt) earnTrophy("untouchable");
      if (TROPHY_MATCH.low <= goalOf("brink")) earnTrophy("brink");
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

// ---------------------------------------------------------------------------
// This match's numbers: running totals for the end screen (cards played, damage dealt, the biggest
// hit), the card that dealt the most damage (for the champion's line), and the end screen's badges.
// ---------------------------------------------------------------------------
function resetMatchStats() {
  U.stats = { played: [0, 0], dealt: [0, 0], biggest: 0, low: [1, 1], byCard: {} };
  U.endBadges = [];
}
// Damage from a fight is credited to the card that dealt it (the attacker, or the defender
// hitting back), for the champion's line on the end screen.
function creditFight(victimUid, amount) {
  const st = U.stats;
  if (!st || performance.now() - U.lungeAt > 80 || !U.lastAttacker) return;
  const dealer = victimUid === U.lastAttacker ? U.lastTarget : U.lastAttacker;
  const c = dealer != null ? findCard(dealer) : null;
  if (!c || c.owner !== viewIdx()) return;
  const e = st.byCard[dealer] || (st.byCard[dealer] = { name: c.name, n: 0 });
  e.n += amount;
}
function countDamage(victimIdx, amount) {
  const st = U.stats;
  if (!st) return;
  st.dealt[1 - victimIdx] += amount;
  st.biggest = Math.max(st.biggest, amount);
}

// Little achievements for the end screen ("Flawless", "First win", …).
function endBadges(winner) {
  const st = U.stats || {};
  // little achievements, shown on the end screen
  const badges = [];
  if (winner != null) {
    const w = S.players[winner];
    if (w.health >= w.maxHealth) badges.push(["Flawless", "Won without taking a hit"]);
    if ((st.low?.[winner] ?? 1) < 0.35) badges.push(["Comeback", "Won from red health"]);
    if (matchRule("progress") && isHere(S.players[winner])) {
      const wins = PREFS.get("wins", {}) || {};
      const id = S.players[0].deckId;
      if (!wins[id]) badges.push(["First win", `with ${DATA.decks[id]?.name || "this deck"}`]);
      wins[id] = (wins[id] || 0) + 1;
      PREFS.set("wins", wins);
    }
  }
  if (st.biggest >= 8) badges.push(["Massive hit", `${st.biggest} damage in one blow`]);
  return badges;
}

function endStatsHTML() {
  const st = U.stats;
  if (!st) return "";
  const [me, them] = [viewIdx(), 1 - viewIdx()];
  const row = (label, a, b) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
  return `<table class="end-stats"><tr><th></th><td>${esc(S.players[me].name)}</td><td>${esc(S.players[them].name)}</td></tr>
    ${row("Cards played", st.played[me], st.played[them])}${row("Damage dealt", st.dealt[me], st.dealt[them])}</table>
    <p class="end-sub">Biggest hit: ${st.biggest} · ${S.round} turn${S.round === 1 ? "" : "s"}</p>
    ${U.endBadges?.length ? `<div class="end-badges">${U.endBadges.map(([t, s]) => `<div class="end-badge"><b>${esc(t)}</b><span>${esc(s)}</span></div>`).join("")}</div>` : ""}`;
}
