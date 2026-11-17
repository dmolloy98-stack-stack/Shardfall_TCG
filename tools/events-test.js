const fs = require('fs');
// Checks the random events (data/events.csv, js/engine.js "Random events"): node tools/events-test.js .
const dir = process.argv[2] || '.';
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };
const fresh = opts => { newGame({ deckId: 'simple_starter', opponentDeckId: 'zombie_starter', mode: 'hotseat', seed: 7, abilities: false, ...opts }); for (const p of S.players) { p.field.chars.length = 0; p.field.areas.length = 0; } return S.players[0]; };
const put = (p, name) => { const c = cardByName(name); c.owner = p.idx; putOnField(c, p); return c; };
// Play on to the start of round n: end the turn, draw the card.
const toRound = n => { let guard = 0; while (S.round < n && guard++ < 50) { S.pending = null; S.phase = PHASE.SETUP; endTurn(); if (S.over) return; if (S.phase === PHASE.DRAW) doDraw(); } };

{ // schedule: mini shard falls in rounds 4 and 12 (game_rules.csv), announced two rounds ahead, one round long
  fresh();
  const seen = {};
  for (let r = 1; r <= 14; r++) { toRound(r); seen[r] = { up: S.upcoming && S.upcoming.round, now: S.event && S.event.id, id: S.upcoming && S.upcoming.id }; if (S.over) break; }
  ok('the rule lists rounds 4 and 12', RULES.eventRounds.join() === '4,12', RULES.eventRounds.join());
  ok('nothing announced in round 1', !seen[1].up);
  ok('round 2 announces an event for round 4', seen[2].up === 4);
  ok('round 3 still shows it, no event yet', seen[3].up === 4 && !seen[3].now);
  ok('round 4 the event is on', !!seen[4].now && !seen[4].up);
  ok('the event announced is the one that hits', seen[4].now === seen[2].id);
  ok('round 5 the event is over', !seen[5].now);
  ok('nothing is announced in rounds 5 to 9', [5, 6, 7, 8, 9].every(r => !seen[r].up && !seen[r].now));
  ok('round 10 announces the next event for round 12', seen[10].up === 12);
  ok('round 12 the second event is on', !!seen[12].now);
  ok('round 13 it is over, and no more come', !seen[13].now && !seen[13].up && !seen[14].up);
  ok('the second event is a different one', seen[12].now !== seen[4].now);
}
{ // spell surge: spells cost 1 less, nothing else does
  const p = fresh(); const spell = Object.values(DATA.cardsById).find(c => c.type === 'Spell' && c.manaCost >= 2 && !CARD_FX[c.id]?.cost);
  const ch = cardByName('Simple Farmer');
  const before = playCost(cardByName(spell.name), p), chBefore = playCost(ch, p);
  S.event = { id: 'spell_surge', round: S.round };
  ok('spell surge: a spell costs 1 less', playCost(cardByName(spell.name), p) === before - 1, spell.name + ' ' + before + '->' + playCost(cardByName(spell.name), p));
  ok('spell surge: a character costs the same', playCost(ch, p) === chBefore);
  S.event = null;
  ok('after it ends the spell costs full price', playCost(cardByName(spell.name), p) === before);
}
{ // tremor: every character on both sides takes 1 damage, a 1-health character dies
  const p = fresh(); const q = S.players[1];
  const a = put(p, 'Simple Farmer'), b = put(q, 'Simple Bowman');
  const ha = a.currentHealth, hb = b.currentHealth;
  S.event = { id: 'tremor', round: S.round }; EVENT_ON_START.tremor();
  ok('tremor: both sides take 1', a.currentHealth === ha - 1 && b.currentHealth === hb - 1);
  const c = put(p, 'Simple Farmer'); c.currentHealth = 1; EVENT_ON_START.tremor();
  ok('tremor: a 1-health character dies', !p.field.chars.includes(c) && p.grave.includes(c));
}
{ // windfall: each player draws an extra card; an empty deck is skipped, not a loss
  const p = fresh(); const q = S.players[1];
  const h0 = p.hand.length, h1 = q.hand.length;
  EVENT_ON_START.windfall();
  ok('windfall: both players draw 1', p.hand.length === h0 + 1 && q.hand.length === h1 + 1);
  p.deck.length = 0; EVENT_ON_START.windfall();
  ok('windfall: an empty deck is skipped, the game goes on', !S.over);
  const full = fresh(); while (full.hand.length < RULES.maxHand) full.hand.push(cardByName('Simple Farmer')); const g0 = full.grave.length;
  EVENT_ON_START.windfall();
  ok('windfall: a full hand is skipped, no card burns', full.hand.length === RULES.maxHand && full.grave.length === g0);
}
{ // amplified areas: area bonuses are doubled while it lasts
  const p = fresh(); const farmer = put(p, 'Simple Farmer'); const area = cardByName('Simpledom'); area.owner = p.idx; putOnField(area, p);
  const base = stats(farmer);
  S.event = { id: 'amplified_areas', round: S.round };
  const dbl = stats(farmer);
  ok('amplified areas: the area gives double', dbl.a === base.a + 2 && dbl.h === base.h + 2, base.a + '/' + base.h + ' -> ' + dbl.a + '/' + dbl.h);
  S.event = null;
  ok('amplified areas: back to normal after', stats(farmer).a === base.a && stats(farmer).h === base.h);
}
{ // switches: events off by rule, and off for the tutorial
  fresh({ events: false }); toRound(13);
  ok('events: false means no events', !S.event && !S.upcoming && !S.lastEvent);
  const was = RULES.eventRounds; RULES.eventRounds = []; fresh(); toRound(13); RULES.eventRounds = was;
  ok('an empty event_rounds means no events', !S.event && !S.upcoming && !S.lastEvent);
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
`);
