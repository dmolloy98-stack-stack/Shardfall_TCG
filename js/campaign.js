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
