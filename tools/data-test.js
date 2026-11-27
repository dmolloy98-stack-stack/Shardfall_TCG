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
  eval(require('./rules-code')(dir) + ';data = DATA;');
} catch (e) {
  console.log('FAIL the game cannot start: ' + e.message);
  console.log('1 FAILED');
  process.exit(1);
}
console.log('PASS every data file reads, and every card\'s Effect makes sense');
// A world's look words (data/factions.csv) must name a look the screen code has: SymbolKey a medallion
// in GLYPHS (js/cards.js), Entrance an .enter-<name> animation (css/style.css), Death a style in
// DEATHS (js/table-effects.js) or "shatter". A typo would quietly fall back to the plain look.
{
  const path = require('path'), read = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const keysOf = (text, name) => { const m = text.match(new RegExp('const ' + name + ' = \\{([^}]*)\\}')); return m ? [...m[1].matchAll(/(?:^|[{,\n])\s*"?([\w/]+)"?\s*:/g)].map(k => k[1]) : []; };
  const glyphs = keysOf(read('js/cards.js'), 'GLYPHS'), deaths = [...keysOf(read('js/table-effects.js'), 'DEATHS'), 'shatter'];
  const css = read('css/style.css');
  let bad = 0;
  for (const f of Object.values(data.factions)) {
    const why = [];
    if (!glyphs.includes(f.symbol)) why.push(`SymbolKey "${f.symbol}" (use one of: ${glyphs.join(', ')})`);
    if (f.entrance && !css.includes('.enter-' + f.entrance + ' ')) why.push(`Entrance "${f.entrance}" (no .enter-${f.entrance} animation in css/style.css)`);
    if (f.death && !deaths.includes(f.death)) why.push(`Death "${f.death}" (use one of: ${deaths.join(', ')})`);
    if (why.length) { bad++; data.warnings.push(`data/factions.csv, ${f.id}: ${why.join('; ')}`); console.log('FAIL ' + data.warnings[data.warnings.length - 1]); }
  }
  if (!bad) console.log(`PASS every world's symbol, entrance and death exist (symbols: ${glyphs.join(', ')}; deaths: ${deaths.join(', ')})`);
}
for (const w of data.warnings) console.log('FAIL ' + w);
if (!data.warnings.length) console.log('PASS every deck keeps the deck rules');
console.log(data.warnings.length ? data.warnings.length + ' FAILED' : 'ALL PASSED');
process.exit(data.warnings.length ? 1 : 0);
