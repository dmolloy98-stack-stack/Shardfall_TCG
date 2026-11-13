const fs = require('fs');
// Checks the fracture, tribe and class rules and the cards built on them: node tools/kinds-test.js .
const dir = process.argv[2] || '.';
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };
const fresh = () => { newGame({ deckId: 'fighter_starter', opponentDeckId: 'zombie_starter', mode: 'ai', seed: 5 }); const p = S.players[0]; p.field.chars.length = 0; S.players[1].field.chars.length = 0; p.field.areas.length = 0; return p; };
const put = (p, name) => { const c = cardByName(name); c.owner = p.idx; putOnField(c, p); return c; };

{ // Speedrunner: +1 attack per other Swift character
  const p = fresh(); const sr = put(p, 'Speedrunner'); const base = stats(sr).a;
  put(p, 'Smart Monkey'); put(p, 'Seasoned Monk'); put(p, 'Chimp');
  ok('Speedrunner +1 attack per other Swift', stats(sr).a === base + 2, 'base ' + base + ' now ' + stats(sr).a);
}
{ // Sensei: +1/+1 to every Student, any fracture; not to others
  const p = fresh(); const wb = put(p, 'White Belt Student'), noob = put(p, 'Noob'), baby = put(p, 'Baby Monkey'), monk = put(p, 'Seasoned Monk');
  const b = [wb, noob, baby, monk].map(c => stats(c).a + stats(c).h);
  put(p, 'Sensei');
  const a = [wb, noob, baby, monk].map(c => stats(c).a + stats(c).h);
  ok('Sensei +1/+1 to all Students', a[0] === b[0] + 2 && a[1] === b[1] + 2 && a[2] === b[2] + 2 && a[3] === b[3], JSON.stringify([b, a]));
}
{ // 5th Degree Master: Parry only for Student Fighters
  const p = fresh(); const wb = put(p, 'White Belt Student'), noob = put(p, 'Noob'), baby = put(p, 'Baby Monkey');
  const before = [wb, noob, baby].map(c => stats(c).parry);
  put(p, '5th Degree Master');
  const after = [wb, noob, baby].map(c => stats(c).parry);
  ok('5th Degree Master gives Parry to Fighter Students only', !before[0] && after[0] && !after[1] && !after[2], JSON.stringify(after));
}
{ // Simple Defender: +1 health to other Towers at end of turn
  const p = fresh(); const sd = put(p, 'Simple Defender'), bw = put(p, 'Breathing Wall'), ch = put(p, 'Chimp');
  const hb = [sd, bw, ch].map(c => stats(c).h);
  S.active = 0; endTurn();
  const ha = [sd, bw, ch].map(c => stats(c).h);
  ok('Simple Defender: self +2, other Tower +1, others 0', ha[0] === hb[0] + 2 && ha[1] === hb[1] + 1 && ha[2] === hb[2], JSON.stringify([hb, ha]));
}
{ // Hybrid: Master Rat counts as Monkey (Jungle) and Fighter (Dojo)
  const p = fresh(); const mr = put(p, 'Master Rat'); const base = stats(mr).a;
  const j = cardByName('Jungle'); j.owner = 0; p.field.areas.push(j);
  ok('Master Rat gets Jungle (Monkey)', stats(mr).a === base + 1, 'base ' + base + ' now ' + stats(mr).a);
  ok('Master Rat is both fractures', inGroup(mr, 'Fighter') && inGroup(mr, 'Monkey') && !inGroup(mr, 'Zombie'));
}
{ // Weapons Enthusiast: Fighter and Simple, gets Simpledom
  const p = fresh(); const we = put(p, 'Weapons Enthusiast'); const base = stats(we).a;
  const d = cardByName('Simpledom'); d.owner = 0; p.field.areas.push(d);
  ok('Weapons Enthusiast gets Simpledom', stats(we).a === base + 2, 'base ' + base + ' now ' + stats(we).a);
}
{ // Midnight Madness reaches an infected Human Warrior as Undead; infection adds a tribe and keeps class
  const p = fresh(); const c = put(p, 'Simple Swordsman');
  makeZombie(c);
  ok('Infection adds Undead, keeps Human and Warrior', hasTribe(c, 'Undead') && hasTribe(c, 'Human') && hasClass(c, 'Warrior') && inGroup(c, 'Zombie') && !inGroup(c, 'Simple'), JSON.stringify([c.tribes, c.classes, c.groups]));
  ok('Template cards are not changed by infection', !DATA.cardsByName['Simple Swordsman'].tribes.includes('Undead'));
}
{ // Turtles: Animal Students
  const p = fresh(); const mr = cardByName('Master Rat'); mr.owner = 0; putOnField(mr, p);
  const t = p.field.chars.filter(c => c.token);
  ok('Master Rat summons 4 Animal Student Turtles', t.length === 4 && t.every(x => hasTribe(x, 'Animal') && hasClass(x, 'Student')), t.length + ' tokens');
}
{ // Filters
  const p = fresh(); put(p, 'Seasoned Monk'); put(p, 'White Belt Student'); put(p, 'Noob');
  const sel = t => select(parseSelector(t, 'test'), { card: p.field.chars[0], owner: p }).length;
  ok('allies.Fighter (fracture)', sel('allies.Fighter') === 2, sel('allies.Fighter'));
  ok('allies.class:Fighter', sel('allies.class:Fighter') === 2, sel('allies.class:Fighter'));
  ok('allies.Student', sel('allies.Student') === 2, sel('allies.Student'));
  ok('allies.Student.class:Fighter', sel('allies.Student.class:Fighter') === 1, sel('allies.Student.class:Fighter'));
  ok('allies.Human', sel('allies.Human') === 3, sel('allies.Human'));
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
`);
