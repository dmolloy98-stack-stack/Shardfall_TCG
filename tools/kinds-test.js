const fs = require('fs');
// Checks the fracture, tribe and class rules and the cards built on them: node tools/kinds-test.js .
const dir = process.argv[2] || '.';
eval(require(require('path').join(__dirname, 'rules-code'))(dir, ['champions', 'ai']) + `
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
{ // Hybrid: Master Rat is from the Mortal and Wild worlds, but a Rat, so Jungle (Monkeys only) skips it
  const p = fresh(); const mr = put(p, 'Master Rat'); const ch = put(p, 'Chimp'); const base = stats(mr).a, cbase = stats(ch).a;
  const j = cardByName('Jungle'); j.owner = 0; p.field.areas.push(j);
  ok('Jungle reaches the Monkey tribe only', stats(mr).a === base && stats(ch).a === cbase + 1, 'rat ' + base + '->' + stats(mr).a + ', chimp ' + cbase + '->' + stats(ch).a);
  ok('Master Rat is both fractures, and a Rat', inGroup(mr, 'Mortal') && inGroup(mr, 'Wild') && !inGroup(mr, 'Undead') && hasTribe(mr, 'Rat'));
}
{ // Weapons Enthusiast: Fighter and Simple, gets Simpledom
  const p = fresh(); const we = put(p, 'Weapons Enthusiast'); const base = stats(we).a;
  const d = cardByName('Simpledom'); d.owner = 0; p.field.areas.push(d);
  ok('Weapons Enthusiast gets Simpledom', stats(we).a === base + 2, 'base ' + base + ' now ' + stats(we).a);
}
{ // Infection adds the Zombie tribe and keeps the character's own fracture, tribes and class
  const p = fresh(); const c = put(p, 'Simple Swordsman');
  makeZombie(c);
  ok('Infection adds the Zombie tribe, keeps Villager, Warrior and Simple', c.tribes.includes('Zombie') && hasTribe(c, 'Villager') && hasClass(c, 'Warrior') && inGroup(c, 'Simple') && !inGroup(c, 'Undead'), JSON.stringify([c.tribes, c.classes, c.groups]));
  const mm = cardByName('Midnight Madness'); mm.owner = 0; p.field.areas.push(mm);
  ok('Midnight Madness (the Undead world) skips an infected Villager', stats(c).a === DATA.cardsByName['Simple Swordsman'].attack);
  ok('Template cards are not changed by infection', !DATA.cardsByName['Simple Swordsman'].tribes.includes('Zombie'));
}
{ // Undead is a fracture (a world); Zombie is a tribe in it
  ok('No tribe families are in use', Object.keys(TRIBE_FAMILIES).length === 0);
  const undead = DATA.cardList.filter(c => c.type === 'Character' && c.group === 'Undead');
  ok('Every Undead character is a Zombie, none has Undead as a tribe', undead.every(c => c.tribes.includes('Zombie') && !c.tribes.includes('Undead')), undead.length + ' cards');
  ok('A Zombie is from the Undead world', inGroup(DATA.cardsByName['Hungry Corpse'], 'Undead'));
  ok('A Villager is not Undead', !inGroup(DATA.cardsByName['Simple Swordsman'], 'Undead'));
  const p = fresh(); const z = put(p, 'Hungry Corpse');
  const mm = cardByName('Midnight Madness'); mm.owner = 0; p.field.areas.push(mm);
  ok('Midnight Madness (Undead) reaches a Zombie', stats(z).a === DATA.cardsByName['Hungry Corpse'].attack + 2);
  const before = S.died.Undead || 0; destroyCharacter(z);
  ok('A Zombie dying counts as an Undead death (Soul Shepard)', (S.died.Undead || 0) === before + 1 && (S.died.Zombie || 0) >= 1);
}
{ // Turtles: Turtle-tribe Students from the Mortal world
  const p = fresh(); const mr = cardByName('Master Rat'); mr.owner = 0; putOnField(mr, p);
  const t = p.field.chars.filter(c => c.token);
  ok('Master Rat summons 4 Turtle Student Turtles', t.length === 4 && t.every(x => hasTribe(x, 'Turtle') && hasClass(x, 'Student') && inGroup(x, 'Mortal')), t.length + ' tokens');
}
{ // Filters
  const p = fresh(); put(p, 'Seasoned Monk'); put(p, 'White Belt Student'); put(p, 'Noob');
  const sel = t => select(parseSelector(t, 'test'), { card: p.field.chars[0], owner: p }).length;
  ok('allies.Mortal (fracture)', sel('allies.Mortal') === 2, sel('allies.Mortal'));
  ok('allies.Fighter (class, now that no world is called Fighter)', sel('allies.Fighter') === 2, sel('allies.Fighter'));
  ok('allies.class:Fighter', sel('allies.class:Fighter') === 2, sel('allies.class:Fighter'));
  ok('allies.Student', sel('allies.Student') === 2, sel('allies.Student'));
  ok('allies.Student.class:Fighter', sel('allies.Student.class:Fighter') === 1, sel('allies.Student.class:Fighter'));
  ok('allies.Martial Artist', sel('allies.Martial Artist') === 2, sel('allies.Martial Artist'));
  ok('allies.Human', sel('allies.Human') === 1, sel('allies.Human'));
}
{ // a misspelt word in an Effect stops the game with a message, instead of quietly matching nothing
  const stops = t => { try { compileEffect(t, 'test'); return false; } catch (e) { return /test:/.test(e.message); } };
  ok('a misspelt tribe in an Effect is caught', stops('aura: buff allies.Monky 1 0'));
  ok('a misspelt skill after has: is caught', stops('play: damage enemies.has:Swfit 1'));
  ok('a correct Effect still reads', !stops('play: damage enemies.Monkey.not:tower 1'));
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
`);
