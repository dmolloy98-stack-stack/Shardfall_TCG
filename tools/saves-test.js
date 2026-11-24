// Checks saved progress (js/saves.js): node tools/saves-test.js .
//   - every key the game saves is listed in SAVE_KEYS
//   - old saves (before the version label) are kept and labelled
//   - a save code carries progress and settings to a fresh browser exactly, and bad codes are refused
const fs = require('fs');
const dir = process.argv[2] || '.';
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };

// A pretend browser storage, so js/saves.js can run here.
function fakeStorage(start = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
}
const source = fs.readFileSync(dir + '/js/saves.js', 'utf8');
function load(storage) {
  const localStorage = storage;   // eslint-disable-line no-unused-vars
  const console = { warn: () => {} };   // eslint-disable-line no-unused-vars
  return eval(source + ';({ SAVE_KEYS, SAVE_VERSION, PREFS, exportSave, readSaveCode, importSave, saveVersion })');
}

// 1. Every key the code saves or reads is listed.
const used = new Set();
for (const f of fs.readdirSync(dir + '/js')) {
  const text = fs.readFileSync(dir + '/js/' + f, 'utf8');
  for (const m of text.matchAll(/PREFS\.(?:get|set)\("([A-Za-z0-9_]+)"/g)) used.add(m[1]);
}
const { SAVE_KEYS, SAVE_VERSION } = load(fakeStorage());
const missing = [...used].filter(k => !SAVE_KEYS[k] && k !== 'saveVersion');
ok('every saved key is listed in SAVE_KEYS', !missing.length, missing.join(', '));
ok('the game saves something', used.size > 5);

// 2. A save from before the version label keeps its data and gets labelled.
const old = fakeStorage({ 'shardfall.campaign': '3', 'shardfall.decks': JSON.stringify([{ id: 'd1', name: 'Mine', cards: { simple_farmer: 2 } }]) });
const g1 = load(old);
ok('an old save is labelled with the current version', g1.saveVersion() === SAVE_VERSION);
ok('an old save keeps its progress', g1.PREFS.get('campaign') === 3 && g1.PREFS.get('decks')[0].name === 'Mine');

// A save from a newer game is left alone.
const newer = fakeStorage({ 'shardfall.saveVersion': String(SAVE_VERSION + 5), 'shardfall.campaign': '2' });
const g2 = load(newer);
ok('a save from a newer version is not turned back', g2.saveVersion() === SAVE_VERSION + 5 && g2.PREFS.get('campaign') === 2);

// 3. Save code: there and back again.
const home = fakeStorage({
  'shardfall.campaign': '4', 'shardfall.hints': 'false', 'shardfall.lore': JSON.stringify(['simple_farmer', 'slap']),
  'shardfall.decks': JSON.stringify([{ id: 'd9', name: 'Crème brûlée ✦ 火', cards: { simple_farmer: 3 } }]),
  'shardfall.somethingElse': '"not ours"',
});
const g3 = load(home);
const code = g3.exportSave();
ok('a save code is one line of plain text', /^SHARDFALL1:[A-Za-z0-9+/=]+$/.test(code));
const away = fakeStorage({ 'shardfall.campaign': '1', 'shardfall.trophies': '{"x":1}' });
const g4 = load(away);
ok('a good code loads', g4.importSave('  ' + code.slice(0, 20) + '\n' + code.slice(20) + '  ') === null);
ok('progress arrives exactly', g4.PREFS.get('campaign') === 4 && g4.PREFS.get('hints') === false && g4.PREFS.get('lore').join() === 'simple_farmer,slap');
ok('names with accents and symbols survive', g4.PREFS.get('decks')[0].name === 'Crème brûlée ✦ 火');
ok("this device's old progress is replaced, not mixed in", g4.PREFS.get('trophies') === undefined);
ok('keys that are not the game\'s are not carried', !('shardfall.somethingElse' in away.dump()));
ok('the version label comes along', g4.saveVersion() === SAVE_VERSION);

// Bad codes change nothing.
const before = JSON.stringify(away.dump());
ok('a random text is refused', !!g4.importSave('hello there'));
ok('a damaged code is refused', !!g4.importSave(code.slice(0, code.length - 12) + '!!!'));
const future = 'SHARDFALL1:' + Buffer.from(JSON.stringify({ v: SAVE_VERSION + 1, data: { campaign: 9 } })).toString('base64');
ok('a code from a newer version is refused', /newer version/.test(g4.importSave(future) || ''));
ok('refused codes change nothing', JSON.stringify(away.dump()) === before);

// 4. A load that fails half way puts the old progress back.
const start = { 'shardfall.campaign': '4', 'shardfall.hints': 'false', 'shardfall.saveVersion': String(SAVE_VERSION) };
const full = fakeStorage(start);
let failedOnce = false;   // storage runs out once, then (after the old values are put back) works
const flaky = { ...full, setItem(k, v) { if (k === 'shardfall.hints' && !failedOnce) { failedOnce = true; throw new Error('storage full'); } return full.setItem(k, v); } };
const g5 = load(fakeStorage({ 'shardfall.campaign': '7', 'shardfall.hints': 'true' }));
const goodCode = g5.exportSave();
const g6 = load(flaky);
const msg = g6.importSave(goodCode);
ok('a load that fails half way says so', /old progress was kept/.test(msg || ''));
ok('a load that fails half way keeps the old progress', JSON.stringify(Object.entries(full.dump()).sort()) === JSON.stringify(Object.entries(start).sort()));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
