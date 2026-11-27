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

// The shared start of every rules test, added after the rules code:
//   eval(rulesCode(dir, [...]) + rulesCode.kit + `...the test...`)
//   ok(name, passed, detail)   prints PASS or FAIL and counts failures (fails)
//   putCard(p, idOrName)       a new copy of a card on p's frontline (by CardID, or by name)
module.exports.kit = `
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!cond) fails++; };
const putCard = (p, idOrName) => { const c = cardById(idOrName) || cardByName(idOrName); c.owner = p.idx; putOnField(c, p); return c; };
`;

// The prepared table that tools/cards-test.js and tools/card-equivalence.js play every card on, added
// after the rules code: eval(rulesCode(dir, [...]) + rulesCode.cardTable + `...`). The test defines
// bad(card, why) itself, before it uses anything here.
//   cards, plain, leveler, area   the cards the table is built from
//   problemsNow()                  what is broken on the table now, or null
//   answer()                       answers whatever the game is asking; an error in words, or null
//   table()                        a fresh table: two plain characters, a Level Up character and an area a side, plenty of mana
module.exports.cardTable = `
const cards = Object.values(DATA.cardsById);
// Plain characters for the table: no ability and no skills, so they don't get in the way.
const plain = cards.filter(c => c.type === 'Character' && !c.effect && !(c.skills || []).length && c.rarity !== 'Unknown');
// Some cards need a particular target: a character with Level Up, or an area.
const leveler = cards.find(c => c.type === 'Character' && (c.skills || []).includes('Level Up') && c.rarity !== 'Unknown');
const area = cards.find(c => c.type === 'Area' && /^aura:/.test(c.effect || ''));
if (plain.length < 2 || !leveler || !area) throw new Error('cards-test needs two plain characters (no ability, no skills), a Level Up character and an area with an aura in data/cards.csv');

function problemsNow() {
  for (const p of S.players) {
    if (!(p.mana >= 0)) return 'negative or broken mana';
    if (!Number.isFinite(p.health)) return 'broken health';
    if (p.hand.length > RULES.maxHand) return 'hand over the limit';
    for (const c of p.field.chars) {
      const r = rawStats(c);
      if (!Number.isFinite(r.a) || !Number.isFinite(r.h)) return 'broken stats on ' + c.name;
      if (r.h <= 0 && !S.pending && !S.over) return c.name + ' stays on the table with no health';
      if (c.owner !== p.idx) return c.name + ' is on the wrong side';
    }
  }
  const all = S.players.flatMap(p => [...p.hand, ...p.deck, ...p.grave, ...p.field.chars, ...p.field.areas, ...p.field.equips]).map(c => c.uid);
  if (new Set(all).size !== all.length) return 'the same card is in two places';
  return null;
}

// Answers whatever the game is asking: the first allowed target, or the first cards and option.
function answer() {
  for (let k = 0; k < 20 && S.pending && !S.over; k++) {
    const pd = S.pending;
    if (pd.kind === 'target') {
      const t = pendingTargets(pd)[0];
      if (!(t ? move('target', t.isPlayer ? t : { uid: t.uid }) : move('cancel'))) return 'its question could not be answered';
    } else {
      const picks = pd.resolve === 'counter' ? [] : pd.cards.slice(0, pd.pick || 1).map(c => c.uid);
      if (!move('choose', picks, pd.options ? pd.options[0].id : null)) return 'its choice could not be answered';
    }
  }
  return S.pending && !S.over ? 'the game keeps asking questions' : null;
}

function table() {
  newGame({ deckId: 'simple_starter', opponentDeckId: 'zombie_starter', mode: 'hotseat', seed: 77, events: false, shard: false, abilities: false });
  for (const p of S.players) {
    p.hand.length = 0;
    p.manaMax = 10;
    p.mana = 30;   // enough for every card, even before a discount kicks in
    p.hasDrawn = true;
    for (const tpl of [...plain.slice(0, 2), leveler]) putOnField(newCard(tpl), p);
    const a = newCard(area); a.owner = p.idx; a.placed = 1; p.field.areas.push(a);
  }
  S.phase = PHASE.SETUP;
}
`;
