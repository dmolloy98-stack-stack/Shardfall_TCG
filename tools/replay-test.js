const fs = require('fs');
// Recorded test matches: node tools/replay-test.js .
// A few whole matches are kept as move lists in tools/recorded-matches.json (how each match was set
// up, every move, and a short check of the table after each move). This test plays them again and
// says which match, and which move, first plays out differently.
//
// When a change is MEANT to alter how the game plays (a card, a rule, the computer), record the
// matches again and commit the new file in the same change:
//   node tools/replay-test.js . --update
const dir = process.argv[2] || '.';
const UPDATE = process.argv.includes('--update');
const FILE = dir + '/tools/recorded-matches.json';
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'rules-champions', 'rules-events', 'rules-shard', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
// The matches to record: the computer plays both sides. Between them they cover every starter
// deck, a campaign match, a custom deck list, and an opponent picked at random.
const mixed = [...DATA.decks.simple_starter.cards.slice(0, 8), ...DATA.decks.fighter_starter.cards.slice(0, 8)];
const MATCHES = [
  { name: 'Simple v Wild', setup: { deckId: 'simple_starter', opponentDeckId: 'monkey_starter', mode: 'ai', seed: 101 } },
  { name: 'Mortal v Undead', setup: { deckId: 'fighter_starter', opponentDeckId: 'zombie_starter', mode: 'ai', seed: 202 } },
  { name: 'Cyber v Simple', setup: { deckId: 'digital_starter', opponentDeckId: 'simple_starter', mode: 'ai', seed: 303 } },
  { name: 'Campaign: Soul Shepard', setup: { deckId: 'monkey_starter', opponentDeckId: 'zombie_starter', mode: 'ai', seed: 404, foeChampion: 'Soul Shepard' } },
  { name: 'Custom deck v Cyber', setup: { deckId: 'custom_test', opponentDeckId: 'digital_starter', mode: 'ai', seed: 505, lists: [mixed, DATA.decks.digital_starter.cards] } },
  { name: 'Random opponent', setup: { deckId: 'zombie_starter', mode: 'ai', seed: 606 } },
];

// What matters on the table after a move, as a short code. Names and wording are left out on
// purpose, so renaming a card or rewording its text doesn't count as playing differently.
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const tableCheck = () => hash(JSON.stringify([S.round, S.active, S.phase, S.over, S.winner, S.rng, S.pending ? [S.pending.kind, S.pending.owner] : 0,
  S.players.map(p => [p.health, p.maxHealth, p.mana, p.manaMax, p.hand.map(c => c.id), p.deck.length, p.grave.length,
    p.field.chars.map(c => { const r = rawStats(c); return [c.id, r.a, r.h]; }), p.field.areas.map(c => c.id), p.field.equips.map(c => c.id)])]));
const summary = () => ({ winner: S.winner, round: S.round, health: S.players.map(p => p.health) });

// A move in words, for messages: "Player 2: play Smart Monkey".
const cardName = uid => { for (const p of S.players) for (const c of [...p.hand, ...p.field.chars, ...p.field.areas, ...p.field.equips]) if (c.uid === uid) return c.name; return uid; };
const say = ([by, name, ...d]) => 'Player ' + (by + 1) + ': ' + name + (typeof d[0] === 'number' ? ' ' + cardName(d[0]) : d.length ? ' ' + JSON.stringify(d) : '');

if (UPDATE) {
  const out = [];
  for (const m of MATCHES) {
    newGame(m.setup); S.players[0].isAI = true;
    const checks = []; let steps = 0;
    while (!S.over && steps < 6000) { const n = S.moves.length; aiStep(); steps++; while (checks.length < S.moves.length) checks.push(tableCheck()); }
    if (!S.over) throw new Error(m.name + ': the match never ended');
    out.push({ name: m.name, setup: S.setup, moves: S.moves, checks, end: summary() });
    console.log('recorded ' + m.name + ': ' + S.moves.length + ' moves, ' + (S.winner == null ? 'a draw' : 'player ' + (S.winner + 1) + ' won') + ' in round ' + S.round);
  }
  fs.writeFileSync(FILE, '[\\n' + out.map(m => JSON.stringify(m)).join(',\\n') + '\\n]\\n');
  console.log('ALL PASSED');
  process.exit(0);
}

let fails = 0;
const recorded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (recorded.length !== MATCHES.length) { console.log('FAIL the recorded matches are out of date: run node tools/replay-test.js . --update'); fails++; }
for (const m of recorded) {
  let problem = null;
  try {
    newGame({ ...m.setup });
    for (let i = 0; i < m.moves.length && !problem; i++) {
      const [by, name, ...d] = m.moves[i];
      const what = say(m.moves[i]);
      if (decider() !== by) problem = 'move ' + (i + 1) + ' (' + what + '): the game was waiting for player ' + (decider() + 1);
      else if (move(name, ...d) === false) problem = 'move ' + (i + 1) + ' (' + what + '): the rules refused it';
      else if (tableCheck() !== m.checks[i]) problem = 'move ' + (i + 1) + ' (' + what + ') leaves the table different';
    }
    if (!problem && JSON.stringify(summary()) !== JSON.stringify(m.end)) problem = 'the ending is different';
  } catch (e) { problem = 'it crashed: ' + e.message; }
  console.log((problem ? 'FAIL ' : 'PASS ') + m.name + (problem ? ': plays differently from ' + problem : ' (' + m.moves.length + ' moves)'));
  if (problem) fails++;
}
if (fails) console.log('\\nIf this change is meant to alter play, record the matches again: node tools/replay-test.js . --update');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
`);
