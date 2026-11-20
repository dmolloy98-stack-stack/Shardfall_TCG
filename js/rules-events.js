// Random events: the rules. (Their names and descriptions are data/events.csv.)
//
// ADDING AN EVENT: add a row to data/events.csv, add its EventID to EVENT_IDS below, and say what it
// does: something that happens once when it lands goes in EVENT_ON_START; something that holds
// while it lasts checks eventNow("its_id") where that rule lives (costs and area bonuses are in
// js/effects.js). Then add a check to tools/events-test.js.

// On the rounds in RULES.eventRounds (4 and 12; a round is one player's turn) a random event, a small
// shard fall, hits the board for both players and lasts that one round. The next event is chosen and
// announced RULES.eventWarn rounds ahead, so each player gets a turn to plan for it. The big shard
// fall in round 8 is separate: see "The big shard fall" below.
// What each event is called and how it is described is in data/events.csv; what it does is here.
const eventNow = id => !!S.event && S.event.id === id;   // used by costFromEffect and auraBonus in js/effects.js
const EVENT_ON_START = {
  tremor() { for (const c of allChars().slice()) if (ownerOf(c).field.chars.includes(c)) dealDamageToCharacter(c, 1); },
  windfall() { for (const p of S.players) if (p.deck.length && p.hand.length < RULES.maxHand) drawCard(p); },   // a full hand or empty deck is skipped, never punished
};
// spell_surge (js/effects.js costFromEffect) and amplified_areas (auraBonus) work while the event lasts.
const EVENT_IDS = ["spell_surge", "tremor", "windfall", "amplified_areas"];

// The next event round from round r on (r itself counts), or Infinity when none is left.
const nextEventRound = r => RULES.eventRounds.find(x => x >= r) ?? Infinity;

function updateEvent() {
  if (!RULES.eventRounds.length || S.noEvents || S.over) return;
  const known = (DATA.eventOrder || []).filter(id => EVENT_IDS.includes(id));
  if (!known.length) return;
  const r = S.round;
  if (S.event && S.event.round < r) {
    const gone = S.event; S.event = null;
    log(`${DATA.events[gone.id].name} is over.`);
    emit("eventEnd", { id: gone.id });
    if (gone.id === "amplified_areas") sweepDeaths();   // bonuses that doubled are gone again
  }
  const at = nextEventRound(r + (S.event ? 1 : 0));
  if (!S.upcoming && at - r <= RULES.eventWarn) {
    const pool = known.filter(id => id !== S.lastEvent);
    const choices = pool.length ? pool : known;
    const id = choices[Math.floor(rand() * choices.length)];
    S.upcoming = { id, round: at };
    S.lastEvent = id;
    log(`A mini shard fall is coming in round ${at}: ${DATA.events[id].name}. ${DATA.events[id].desc}`);
    emit("eventWarn", { id, round: at });
  }
  if (S.upcoming && S.upcoming.round === r) {
    S.event = S.upcoming; S.upcoming = null;
    log(`MINI SHARD FALL: ${DATA.events[S.event.id].name}. ${DATA.events[S.event.id].desc}`);
    emit("eventStart", { id: S.event.id });
    EVENT_ON_START[S.event.id]?.();
  }
}
