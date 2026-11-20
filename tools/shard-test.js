const fs = require('fs');
// Checks the big shard fall (js/rules-shard.js): node tools/shard-test.js .
const dir = process.argv[2] || '.';
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'rules-champions', 'rules-events', 'rules-shard', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };
const find = pred => Object.values(DATA.cardsById).find(pred);
// A match with empty tables, where the big shard has just fallen and it is player 0's Battle phase.
const game = (deck, opp, opts) => {
  newGame({ deckId: deck, opponentDeckId: opp || 'zombie_starter', mode: 'hotseat', seed: 21, events: false, ...opts });
  for (const p of S.players) { p.field.chars.length = 0; p.field.areas.length = 0; }
  S.round = RULES.shardRound; S.active = 0; shardFall(); S.phase = PHASE.BATTLE; S.pending = null;
  return S.players[0];
};
const put = (p, id) => { const c = newCard(DATA.cardsById[id]); c.owner = p.idx; putOnField(c, p); c.hasAttacked = false; return c; };
const hitter = (p, atk) => { const c = put(p, find(c => c.type === 'Character' && c.rarity === 'Basic' && !c.rules && !(c.skills || []).length && c.group !== 'Wild').id); c.attack = atk; c.baseAttack = atk; c.hasAttacked = false; return c; };
const NOCHAMP = '__nochamp';
DATA.decks[NOCHAMP] = { ...DATA.decks.simple_starter, cards: DATA.decks.simple_starter.cards.filter(e => DATA.cardsById[e.cardId].rarity !== 'Unknown') };

{ // when it falls
  ok('the rules: round 8, 10 health, 1 card, 2 with no champion', RULES.shardRound === 8 && RULES.shardHealth === 10 && RULES.shardDraw === 1 && RULES.shardDrawNoChamp === 2);
  newGame({ deckId: 'simple_starter', opponentDeckId: 'zombie_starter', mode: 'hotseat', seed: 21, events: false });
  let seen = 0;
  for (let r = 1; r <= 9 && !S.over; r++) { if (S.shard && !seen) seen = S.round; S.pending = null; S.phase = PHASE.SETUP; endTurn(); if (S.phase === PHASE.DRAW && !S.over) doDraw(); }
  ok('it falls at the start of round 8, not before', seen === 8 || (S.shard && S.round >= 8 && S.shardFell), 'seen ' + seen);
  S.shard = null; S.round = 8; shardFall();
  ok('it falls only once a match', !S.shard);
  newGame({ deckId: 'simple_starter', opponentDeckId: 'zombie_starter', mode: 'hotseat', seed: 21, shard: false }); S.round = 8; shardFall();
  ok('shard: false (the tutorial) means no shard', !S.shard && !S.shardFell);
  const was = RULES.shardRound; RULES.shardRound = 0; newGame({ deckId: 'simple_starter', mode: 'hotseat', seed: 21 }); S.round = 8; shardFall(); RULES.shardRound = was;
  ok('shard_round 0 means no shard', !S.shard);
}
{ // attacking it
  const p = game('simple_starter'); const q = S.players[1];
  const a = hitter(p, 4); const startHp = rawStats(a).h;
  const guard = put(q, find(c => (c.skills || []).includes('Challenge') && c.rarity !== 'Unknown').id);
  ok('it has 10 health', S.shard.health === 10);
  attack(a.uid, 'shard');
  ok('an attack takes its Attack off the shard', S.shard.health === 6);
  ok('it never hits back', rawStats(a).h === startHp);
  ok('Challenge does not protect it', rawStats(guard).h === DATA.cardsById[guard.id].health);
  ok('the attacker has used its attack', a.hasAttacked && !attack(a.uid, 'shard'));
  ok('a spell cannot pick it', !validTargets({ target: 'any', intent: 'harm' }, { card: a, owner: p, spell: true }).some(t => t === 'shard' || t?.shard));
  S.phase = PHASE.SETUP; const b = hitter(p, 5);
  ok('no attacks on it outside Battle', !attack(b.uid, 'shard') && S.shard.health === 6);
}
{ // shared health: whoever breaks it claims it
  const p = game('simple_starter', 'zombie_starter'); const q = S.players[1];
  attack(hitter(p, 5).uid, 'shard');
  ok('5 damage leaves 5', S.shard.health === 5 && S.shardChip[0] === 5);
  S.active = 1; S.phase = PHASE.BATTLE; const z = hitter(q, 7); const h0 = q.health, c0 = q.hand.length, d0 = q.deck.length;
  attack(z.uid, 'shard');
  ok('the other player breaks it and claims it', !S.shard && S.shardBy === 1);
  ok('the claimer draws 1 card (it has a champion)', q.hand.length === c0 + 1 && q.deck.length === d0 - 1);
  ok('no health is gained', q.health === h0);
  ok('the extra damage is not counted past its health', S.shardChip[1] === 5);
}
{ // a deck with no champion
  const p = game(NOCHAMP); const c0 = p.hand.length;
  attack(hitter(p, 15).uid, 'shard');
  ok('no champion: draws 2 cards', p.hand.length === c0 + 2);
}
{ // an empty deck is not drawn from, so breaking the shard never loses the match
  const p = game('simple_starter'); p.deck.length = 0;
  attack(hitter(p, 15).uid, 'shard');
  ok('an empty deck: the shard is claimed and the match goes on', S.shardBy === 0 && !S.over);
}
{ // each champion's bonus
  let p = game('simple_starter'); const hurt = hitter(p, 1); hurt.currentHealth = 1; const hh = hitter(p, 15);
  attack(hh.uid, 'shard');
  ok('The Simplistic: its characters are fully healed', rawStats(hurt).h === DATA.cardsById[hurt.id].health);

  p = game('monkey_starter'); attack(hitter(p, 15).uid, 'shard');
  const chimp = p.field.chars.find(c => c.id === 'chimp');
  ok('The Man Ape: a free 2/2 Monkey (before Chest Thump)', !!chimp && rawStats(chimp).a - (chestThump(p) ? 1 : 0) === 2 && rawStats(chimp).h === 2, chimp ? rawStats(chimp).a + '/' + rawStats(chimp).h : 'none');

  p = game('fighter_starter'); const weak = hitter(p, 1), strong = hitter(p, 6); const breaker = hitter(p, 15);
  strong.hasAttacked = true; attack(breaker.uid, 'shard');
  ok('IP Man: its strongest character gets Swift', isSwift(breaker) && !isSwift(weak));

  p = game('digital_starter'); attack(hitter(p, 15).uid, 'shard');
  ok('Boss Level: jumps to the next phase', p.champ.level === 2);

  p = game('zombie_starter'); const dead = hitter(p, 2); const deadId = dead.id; destroyCharacter(dead);
  const inHand = () => p.hand.filter(c => c.id === deadId).length, before = inHand();
  attack(hitter(p, 15).uid, 'shard');
  ok('Soul Shepard: its last fallen character returns to the hand', inHand() === before + 1 && !p.grave.some(c => c.id === deadId && c.type === 'Character'));
}
{ // the computer goes for it when it can break it
  const p = game('simple_starter'); S.players[0].isAI = true;
  S.shard.health = 3; hitter(p, 4);
  let guard = 0; while (S.active === 0 && S.phase === PHASE.BATTLE && guard++ < 10) aiStep();
  ok('the computer breaks a nearly broken shard', S.shardBy === 0);
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
`);
