const fs = require('fs');
// Checks the Protected rule and the Pierce and Protected skills ("Protected" in js/engine.js): node tools/protected-test.js .
const dir = process.argv[2] || '.';
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'rules-champions', 'rules-events', 'rules-shard', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };
const all = Object.values(DATA.cardsById);
const game = () => { newGame({ deckId: 'simple_starter', opponentDeckId: 'fighter_starter', mode: 'hotseat', seed: 3, events: false, abilities: false }); for (const p of S.players) { p.field.chars.length = 0; p.field.areas.length = 0; } return S.players; };
const put = (p, id) => { const c = newCard(DATA.cardsById[id]); c.owner = p.idx; putOnField(c, p); c.sick = false; c.summoningSick = false; c.hasAttacked = false; return c; };
// plain characters: no guard skills, no Pierce or Overwhelm, no special rules
const plain = all.filter(c => c.type === 'Character' && !c.rules && c.rarity !== 'Unknown' && !(c.skills || []).some(s => ['Challenge', 'Tower', 'Protected', 'Pierce', 'Overwhelm', 'Parry'].includes(s)));
const filler = plain.find(c => c.group === 'Simple').id;
const hit = (p, n) => { const h = p.health; dealDamageToPlayer(p, n); return h - p.health; };

ok('the rule is on at 3 characters', RULES.protectAt === 3, 'protectAt=' + RULES.protectAt);
{
  const [p] = game();
  put(p, filler); put(p, filler);
  ok('2 characters: not Protected, full damage', !isProtected(p) && hit(p, 5) === 5);
  put(p, filler);
  ok('3 characters: Protected', isProtected(p));
  ok('Protected: 5 damage becomes 3 (half, rounded up)', hit(p, 5) === 3);
  ok('Protected: 4 damage becomes 2', hit(p, 4) === 2);
  ok('Protected: 1 damage still does 1', hit(p, 1) === 1);
}
{
  const [p] = game();
  const guard = all.find(c => (c.skills || []).includes('Protected') && c.rarity !== 'Unknown');
  put(p, guard.id);
  ok('one character with the Protected skill makes its player Protected', isProtected(p) && hit(p, 6) === 3, guard.name);
}
{ // attacks
  const [p, q] = game();
  const pierce = all.find(c => (c.skills || []).includes('Pierce') && c.type === 'Character');
  const normal = plain.find(c => c.attack >= 3) || plain[0];
  for (let k = 0; k < 3; k++) put(p, filler);
  const a = put(q, normal.id), b = put(q, pierce.id);
  S.active = 1; S.phase = PHASE.BATTLE; S.pending = null; S.queue.length = 0;
  let h = p.health; attack(a.uid, null);
  ok('an attack on a Protected player deals half', h - p.health === Math.ceil(stats(a).a / 2), normal.name + ' ' + stats(a).a + ' -> ' + (h - p.health));
  h = p.health; attack(b.uid, null);
  ok('a Pierce attack deals full damage to a Protected player', h - p.health === stats(b).a, pierce.name + ' ' + stats(b).a + ' -> ' + (h - p.health));
}
ok('every Challenge character has the Protected skill', all.filter(c => (c.skills || []).includes('Challenge')).every(c => c.skills.includes('Protected')));
const pierceCards = all.filter(c => (c.skills || []).includes('Pierce'));
ok('Pierce is rare: only Cyber and Mortal cards have it', pierceCards.length > 0 && pierceCards.length <= 6 && pierceCards.every(c => ['Cyber', 'Mortal'].includes(c.group)), pierceCards.map(c => c.name).join(', '));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
`);
