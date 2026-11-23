// Checks the card data the way the game reads it, and says in plain words what is wrong:
//   node tools/data-test.js .
// It fails on any mistake in data/*.csv: one that stops the game (an unknown skill, a deck naming a
// card that doesn't exist, an Effect the game can't read) or one it can live with (a deck breaking
// the deck rules). GitHub runs it with every test, so an edit made on GitHub shows a red mark with
// the reason. The game itself shows the same message on screen.
const fs = require('fs');
const dir = process.argv[2] || '.';
let data;
try {
  eval(fs.readFileSync(dir + '/js/data.js', 'utf8') + ';data = DATA = buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' +
    ['engine', 'rules-champions', 'rules-events', 'rules-shard', 'effects'].map(f => fs.readFileSync(dir + '/js/' + f + '.js', 'utf8')).join('\n'));
} catch (e) {
  console.log('FAIL the game cannot start: ' + e.message);
  console.log('1 FAILED');
  process.exit(1);
}
console.log('PASS every data file reads, and every card\'s Effect makes sense');
for (const w of data.warnings) console.log('FAIL ' + w);
if (!data.warnings.length) console.log('PASS every deck keeps the deck rules');
console.log(data.warnings.length ? data.warnings.length + ' FAILED' : 'ALL PASSED');
process.exit(data.warnings.length ? 1 : 0);
