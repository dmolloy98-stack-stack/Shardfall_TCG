// Replays the match inside a player's bug report: node tools/replay-report.js <report file> [.]
// The report is the text from the game's "Something went wrong" window (a file holding it).
// It plays the match again move by move and prints the error and the last moves. A crash in the
// rules shows here. If the replay finishes cleanly, the problem was on the screen side
// (js/ui.js and friends): the report's "where" lines name the file.
const fs = require('fs');
const file = process.argv[2];
const dir = process.argv[3] || '.';
if (!file) { console.log('Usage: node tools/replay-report.js <report file> [game folder]'); process.exit(1); }
const text = fs.readFileSync(file, 'utf8');
const report = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' + ['engine', 'rules-champions', 'rules-events', 'rules-shard', 'effects', 'champions', 'ai'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n') + `
console.log('Error: ' + report.error);
for (const l of report.where || []) console.log('   ' + l);
console.log('Screen: ' + report.screen + (report.tutorial ? ' (tutorial)' : '') + ' · ' + report.when);
const rec = report.match;
if (!rec) { console.log('No match in the report (the error happened outside a match).'); process.exit(0); }
if (rec.setup.scripted) { console.log('A tutorial lesson: lessons are scripted and are not replayed.'); process.exit(0); }
newGame({ ...rec.setup });
let i = 0;
try {
  for (; i < rec.moves.length; i++) {
    const [by, name, ...d] = rec.moves[i];
    if (decider() !== by) throw new Error('it was player ' + (by + 1) + "'s move, but the game was waiting for player " + (decider() + 1));
    if (move(name, ...d) === false) throw new Error('the rules refused it (has a card or rule changed since?)');
  }
  console.log('The match replays cleanly through all ' + rec.moves.length + ' moves, so the error was on the screen side.');
} catch (e) {
  console.log('Replay stopped at move ' + (i + 1) + ' of ' + rec.moves.length + ' ' + JSON.stringify(rec.moves[i]) + ': ' + e.message);
  if (e.stack) console.log(e.stack.split('\\n').slice(1, 5).join('\\n'));
}
console.log('Moves before that: ' + rec.moves.slice(Math.max(0, i - 6), i).map(m => JSON.stringify(m)).join(' '));
console.log('Last lines of the battle log:');
for (const l of S.log.slice(-10)) console.log('   ' + l);
`);
