const fs = require('fs');
// Checks the champion abilities (data/champion_abilities.csv, "Champion abilities" in js/engine.js): node tools/champions-test.js .
const dir = process.argv[2] || '.';
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };
const find = pred => Object.values(DATA.cardsById).find(pred);
const game = (deck, opp, opts) => { newGame({ deckId: deck, opponentDeckId: opp || 'zombie_starter', mode: 'hotseat', seed: 11, ...opts }); for (const p of S.players) { p.field.chars.length = 0; p.field.areas.length = 0; } S.phase = PHASE.SETUP; return S.players[0]; };
const put = (p, id) => { const c = newCard(DATA.cardsById[id]); c.owner = p.idx; putOnField(c, p); return c; };
const base = c => { const r = rawStats(c); return { a: r.a, h: r.h }; };

{ // who gets an ability
  const p = game('simple_starter', 'monkey_starter');
  ok('a Simple deck gets The Simplistic ability, level 1', p.champ && p.champ.id === 'the_simplistic' && p.champ.level === 1);
  ok('a Monkey deck gets The Man Ape ability', S.players[1].champ && S.players[1].champ.id === 'the_man_ape');
  game('simple_starter', 'monkey_starter', { abilities: false });
  ok('abilities: false means none (the tutorial)', !S.players[0].champ && !S.players[1].champ);
  DATA.decks.__nochamp = { ...DATA.decks.simple_starter, cards: DATA.decks.simple_starter.cards.filter(e => DATA.cardsById[e.cardId].rarity !== 'Unknown') };
  game('__nochamp', 'monkey_starter');
  ok('a deck with no champion gets nothing', !S.players[0].champ);
}
{ // The Simplistic: Humble Beginnings
  const p = game('simple_starter');
  const cheap = find(c => c.type === 'Character' && c.group === 'Simple' && c.manaCost === 1 && !c.rules);
  const dear = find(c => c.type === 'Character' && c.group === 'Simple' && c.manaCost >= 2 && c.rarity !== 'Unknown');
  const a = put(p, cheap.id), b = put(p, dear.id);
  const plain = newCard(cheap), plainDear = newCard(dear); plain.owner = 1; plainDear.owner = 1;
  ok('Simplistic: nothing before it levels up, even for a cost-1 character', rawStats(a).h === cheap.health && rawStats(a).a === cheap.attack);
  ok('Simplistic: a dearer Simple character gets nothing', rawStats(b).h === dear.health && rawStats(b).a === dear.attack);
  const before = base(b);
  p.manaMax = 5; startTurn(p);
  ok('Simplistic: at max mana 6 it levels up', p.champ.level === 2);
  ok('Simplistic: then every Simple character gets +1/+1', base(b).a === before.a + 1 && base(b).h === before.h + 1);
}
{ // The Man Ape: Chest Thump
  const p = game('monkey_starter'); const q = S.players[1]; S.active = 0;
  const mk = find(c => c.type === 'Character' && c.group === 'Monkey' && c.manaCost >= 2 && c.rarity !== 'Unknown');
  const other = find(c => c.type === 'Character' && c.group === 'Fighter' && c.rarity !== 'Unknown' && !c.rules);
  const a = put(p, mk.id), b = put(p, other.id); put(q, other.id); put(q, other.id);
  ok('Chest Thump: equal numbers, no bonus', rawStats(a).a === mk.attack && !chestThump(p));
  const c = put(p, mk.id);
  ok('Chest Thump: more characters, +1 Attack on your turn', chestThump(p) && rawStats(a).a === mk.attack + 1);
  ok('Chest Thump: a non-Monkey gets it too', rawStats(b).a === other.attack + 1);
  S.active = 1;
  ok("Chest Thump: not on the opponent's turn", rawStats(a).a === mk.attack);
  S.active = 0; destroyCharacter(c);
  ok('Chest Thump: off again when the numbers even out', !chestThump(p) && rawStats(a).a === mk.attack);
  ok('Chest Thump: no level, no cheaper Monkeys', p.champ.level === 1 && playCost(newCard(mk), p) === mk.manaCost);
}
{ // IP Man: The Bow
  const p = game('fighter_starter');
  const fighters = Object.values(DATA.cardsById).filter(c => c.type === 'Character' && c.group === 'Fighter' && c.rarity !== 'Unknown').sort((x, y) => y.attack - x.attack);
  const strong = put(p, fighters[0].id), weak = put(p, fighters[fighters.length - 1].id);
  for (const c of [strong, weak]) { c.hasAttacked = false; c.sick = false; c.summoningSick = false; }
  S.phase = PHASE.SETUP; S.active = 0; S.pending = null;
  advancePhase();
  const got = [strong, weak].filter(c => c.bow === 2);
  ok('IP Man: at the start of Battle one attacker gets +2', got.length === 1 && S.phase === PHASE.BATTLE, 'got ' + got.map(c => c.name));
  ok('IP Man: it is the strongest ready attacker', got[0] === strong);
  const withBow = rawStats(got[0]).a;
  finishTurn();
  ok('IP Man: the bonus lasts one turn', !strong.bow && rawStats(got[0]).a === withBow - 2);
  // five fights won
  const p2 = game('fighter_starter'); const big = put(p2, fighters[0].id); big.currentHealth = 99; big.baseHealth = 99; big.attack = 9;
  for (let k = 0; k < 5; k++) {
    const foe = put(S.players[1], find(c => c.type === 'Character' && c.rarity === 'Basic' && c.health <= 2 && c.attack <= 1 && c.group !== 'Fighter').id);
    foe.currentHealth = 1; big.hasAttacked = false; big.sick = false; S.phase = PHASE.BATTLE; S.active = 0; S.pending = null;
    attack(big.uid, foe.uid);
    if (k === 3) ok('IP Man: 4 fights won is not enough yet', p2.champ.level === 1 && p2.champ.n === 4, 'n=' + p2.champ.n);
  }
  ok('IP Man: 5 fights won levels it up', p2.champ.level === 2);
  const a = put(p2, fighters[0].id), b = put(p2, fighters[1].id), c = put(p2, fighters[fighters.length - 1].id);
  for (const x of [a, b, c]) { x.hasAttacked = false; x.sick = false; }
  big.hasAttacked = true;
  S.phase = PHASE.SETUP; S.active = 0; advancePhase();
  ok('IP Man: at level 2 two attackers get the bow', p2.field.chars.filter(x => x.bow === 2).length === 2);
}
{ // Boss Level: Boss Phases
  const p = game('digital_starter'); const q = S.players[1];
  const lvl = Object.values(DATA.cardsById).find(c => c.type === 'Character' && c.group === 'Digital' && (c.skills || []).includes('Level Up') && c.rarity !== 'Unknown' && !c.rules);
  const x = put(p, lvl.id);
  ok('Boss Phases: Level Up keeps the usual cap of 3', levelCap(x) === 3);
  ok('Boss Phases: starts in phase 1', p.champ.level === 1 && rawStats(x).a === lvl.attack);
  dealDamageToPlayer(p, p.maxHealth - 17);   // 17 health: still phase 1
  ok('Boss Phases: 17 of 25 health is still phase 1', p.champ.level === 1, 'health ' + p.health);
  dealDamageToPlayer(p, 1);                  // 16
  ok('Boss Phases: 16 of 25 is PHASE 2', p.champ.level === 2);
  ok('Boss Phases: PHASE 2 gives no Attack yet', rawStats(x).a === lvl.attack);
  S.active = 0; S.phase = PHASE.DRAW; const h0 = p.hand.length; doDraw();
  ok('Boss Phases: PHASE 2 draws 2 cards', p.hand.length === h0 + 2, (p.hand.length - h0) + ' drawn');
  healPlayer(p, 5);
  ok('Boss Phases: healing does not go back a phase', p.champ.level === 2 && p.health === 21);
  dealDamageToPlayer(p, 13);                 // 8
  ok('Boss Phases: 8 of 25 is FINAL PHASE', p.champ.level === 3);
  ok('Boss Phases: FINAL PHASE gives every character +1 Attack', rawStats(x).a === lvl.attack + 1);
  const other = put(q, lvl.id);
  ok("Boss Phases: the opponent's characters get nothing", rawStats(other).a === lvl.attack);
  S.phase = PHASE.DRAW; const h1 = p.hand.length; doDraw();
  ok('Boss Phases: FINAL PHASE still draws 2', p.hand.length === Math.min(RULES.maxHand, h1 + 2));
}
{ // Soul Shepard: Challenge, and +1 Health for every Undead that dies
  const card = DATA.cardsById.soul_shepard;
  ok('Soul Shepard has Challenge', card.skills.includes('Challenge'));
  const p = game('zombie_starter', 'simple_starter'); const q = S.players[1];
  const undead = find(c => c.type === 'Character' && (c.tribes || []).includes('Undead') && c.rarity !== 'Unknown');
  const living = find(c => c.type === 'Character' && !(c.tribes || []).includes('Undead') && c.rarity !== 'Unknown' && c.group === 'Simple');
  const inHand = newCard(card); inHand.owner = 0; p.hand.push(inHand);
  const onField = put(p, 'soul_shepard'); const h0 = rawStats(onField).h;
  destroyCharacter(put(p, undead.id));
  ok('Soul Shepard: it grows when your Undead dies', rawStats(onField).h === h0 + 1 && grieveBonus(inHand) === 1);
  destroyCharacter(put(q, undead.id));
  ok("Soul Shepard: it also grows when the opponent's Undead dies", rawStats(onField).h === h0 + 2);
  destroyCharacter(put(q, living.id));
  ok('Soul Shepard: a living character dying changes nothing', rawStats(onField).h === h0 + 2);
  ok('Soul Shepard: it gains no Attack', rawStats(onField).a === card.attack);
  ok('Soul Shepard: it is bigger in the hand too, before it is played', grieveBonus(inHand) === 2);
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
`);
