// The campaign: five matches against the computer, one for each faction's champion.
// Each champion plays its faction's starter deck and starts with its champion card in hand.
// Progress is saved in the browser (PREFS "campaign"). The story text is a placeholder until
// the champions' personalities are decided (docs/world.md).

const CAMPAIGN = [
  {
    faction: "Simple", champion: "The Simplistic",
    intro: "A shard comes down in a quiet turnip field. The Simplistic is already standing over it, insisting everything was fine before all this.",
    win: "The Simplistic shrugs and steps aside. \"Keep it simple,\" it says. It is the only advice it has ever given.",
  },
  {
    faction: "Monkey", champion: "The Man Ape",
    intro: "Deep in a jungle that wasn't there last week, The Man Ape sits on a pile of shards like a hoard of bananas. The troop watches from the trees.",
    win: "The troop scatters. The Man Ape lets the shard go, but keeps one eye on it.",
  },
  {
    faction: "Fighter", champion: "IP Man",
    intro: "Since his world broke, IP Man has trained on a cliff edge above the falling shards. He bows before every fight and expects a bow back.",
    win: "IP Man bows once more. \"Again tomorrow,\" he says, and he means it.",
  },
  {
    faction: "Digital", champion: "Boss Level",
    intro: "A shard has landed in a server room humming in the middle of nowhere. Boss Level loads in with a health bar nobody has seen the end of.",
    win: "Boss Level flickers. GAME OVER, the screens read, though nobody is sure for whom.",
  },
  {
    faction: "Zombie", champion: "Soul Shepard",
    intro: "The other champions all say the Zombies caused the Shardfall. Soul Shepard waits among the graves, gathering the fallen, and does not argue.",
    win: "Soul Shepard lowers its crook. Among the souls it gathered are faces from every world, not only its own. The shards keep falling.",
  },
];

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
    ? `<p class="camp-done">All five champions beaten. The shards are still falling, though.</p>` : "";
  openModal(`<h2 id="modal-title">Campaign</h2>
    <p class="sub">Beat each faction's champion in turn. Each one plays its faction's deck and starts with its champion in hand.</p>
    <p class="camp-deck">Your deck: <b>${esc(deck?.name || "none")}</b> <span>(change it on the main menu)</span></p>
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
  else if (t.closest("[data-camp-reset]")) {
    // Ask once more on the button itself before wiping progress.
    const b = t.closest("[data-camp-reset]");
    if (b.dataset.sure) { PREFS.set("campaign", 0); showCampaign(); }
    else { b.dataset.sure = "1"; b.textContent = "Tap again to lock all champions"; }
  }
});
