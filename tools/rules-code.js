// The game's rules as one piece of code, for tests and tools that run the game without a browser.
//   eval(require('./rules-code')(dir, ['champions', 'ai']) + `...test code...`)
// It reads js/data.js, loads the data, then every script in GAME_SCRIPTS from js/engine.js to
// js/effects.js (the rules), plus any extra js/ files named. Because the list comes from
// GAME_SCRIPTS, splitting or adding a rules file needs no change in the tools. The code it returns
// expects `fs` and `dir` to exist where it is evaluated.
const fs = require('fs'), path = require('path');
module.exports = (dir, also = []) => {
  const data = fs.readFileSync(path.join(dir, 'js/data.js'), 'utf8');
  const list = JSON.parse(data.match(/const GAME_SCRIPTS = (\[[^\]]*\])/)[1]);
  const from = list.indexOf('js/engine.js'), to = list.indexOf('js/effects.js');
  const rules = from >= 0 && to >= from ? list.slice(from, to + 1) : ['js/engine.js', 'js/effects.js'];
  const files = [...rules, ...also.map(f => `js/${f}.js`)].filter(f => fs.existsSync(path.join(dir, f)));
  return data + ';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));' +
    files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
};
