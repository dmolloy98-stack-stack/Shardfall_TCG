// Explains a card's Effect in plain English, and checks the game can read it.
//   node tools/explain-effect.js "play: target character harm, damage target 2"
//   node tools/explain-effect.js primate            a card by its CardID
//   node tools/explain-effect.js --all              every card, for reading through
// Use it when writing an Effect (in the card sheet or data/cards.csv) to see what the game will
// really do, and to catch mistakes: if the game can't read the text, it says why.
// The clause and "who" words are described in js/effects.js; the actions and narrowing words are
// described below, so a new action or narrowing word (the ability-words skill) adds its description here. tools/test-all.js runs --all and
// fails if a card uses a word this tool doesn't know.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
eval(require('./rules-code')(dir) +
  ';globalThis.GAME = { DATA, TOKENS, RULE_WORDS, WHEN, SELECTOR_WORDS };');   // functions like compileEffect are visible already
const { DATA, TOKENS, RULE_WORDS, WHEN, SELECTOR_WORDS } = GAME;

// The words for each clause and each "who" come from js/effects.js (WHEN, SELECTOR_WORDS), so a new
// word is described once, there.
const WHEN_WORDS = Object.fromEntries(Object.entries(WHEN).map(([k, v]) => [k, v.says]));
const BASES = SELECTOR_WORDS;
const cardName = id => DATA.cardsById[id]?.name || TOKENS[id]?.name || id;
function filterWords(f) {
  if (f === 'other') return 'not this card';
  if (f === 'leveler') return 'with Level Up';
  if (f === 'levels') return 'with a Level to give back';
  if (f === 'strongest') return 'only the one with the most Attack';
  if (f === 'swift') return 'with Swift';
  if (f === 'tower') return 'with Tower';
  if (f === 'enemy') return 'the other player\'s';
  if (f === 'mine') return 'yours';
  let m;
  if ((m = f.match(/^has:(.+)$/))) return `with ${m[1]}`;
  if ((m = f.match(/^cost(<=|>=|=)(\d+)$/))) return `costing ${m[2]}${{ '<=': ' or less', '>=': ' or more', '=': '' }[m[1]]}`;
  if ((m = f.match(/^not:(.+)$/))) return `except ${filterWords(m[1])}`;
  if ((m = f.match(/^(fracture|tribe|class):(.+)$/))) return `${m[2]} (${m[1]})`;
  if (['character', 'spell', 'equipment', 'area'].includes(f)) return `${f}s only`;
  if (DATA.cardsById[f]) return cardName(f);
  return f;   // a fracture, tribe or class name, as written
}
function who(text) {
  const [base, ...filters] = text.split('.');
  if (!BASES[base]) throw new Error(`"${text}": "${base}" is not someone an action can affect`);
  return BASES[base] + (filters.length ? ` (${filters.map(filterWords).join(', ')})` : '');
}
function number(text) {
  return text.replace(/-/g, '+-').split('+').filter(Boolean).map(t => {
    const neg = t.startsWith('-'), body = neg ? t.slice(1) : t;
    let s;
    if (body.includes('*')) s = body.split('*').map(number).join(' × ');
    else if (/^\d+$/.test(body)) s = body;
    else if (body === 'boost') s = 'the Simple spell bonus (+3 while The Simplistic is out)';
    else if (body === 'ripen') s = '1 if Ripen has been cast';
    else if (body === 'amount') s = 'the damage being redirected';
    else if (body === 'statline') s = 'this card\'s Attack plus Health';
    else if (body.startsWith('#')) {
      const m = body.slice(1).match(/^([^<>=]+?)(>=(\d+))?$/);
      s = m[3] ? `1 if there are at least ${m[3]} of ${who(m[1])}, otherwise 0` : `the number of ${who(m[1])}`;
    } else throw new Error(`"${t}" is not a number`);
    return (neg ? 'minus ' : '') + s;
  }).join(' plus ');
}
// "+1 Attack and +2 Health", leaving out a part that is 0.
const statWords = (a, h) => [a !== '0' && `${plus(a)} Attack`, h !== '0' && `${plus(h)} Health`].filter(Boolean).join(' and ') || 'nothing';
const plus = n => (/^\d+$/.test(n) ? `+${n}` : `+(${number(n)})`);
const minus = n => (/^\d+$/.test(n) ? `-${n}` : `-(${number(n)})`);
const ACTION_WORDS = {
  damage: (w, n) => `deal ${number(n)} damage to ${who(w)}`,
  damageAll: (n, o) => `deal ${number(n)} damage to every character${o === 'other' ? ' except this one' : ''} and to both players`,
  buff: (w, a, h) => `${statWords(a, h)} for ${who(w)}`,
  shrink: (w, n) => `${minus(n)} Attack and ${minus(n)} Health for ${who(w)}`,
  setStats: (w, a, h) => `set the stats of ${who(w)} to ${number(a)} Attack and ${number(h)} Health`,
  loseAttack: (w, n) => `${minus(n)} Attack for ${who(w)} (not below 0)`,
  grow: (w, n) => `${plus(n)} Health for good for ${who(w)}`,
  levelUp: (w, n) => `Level Up ${who(w)} ${number(n)} time(s)`,
  levelDown: w => `take back one Level Up from ${who(w)}`,
  destroy: w => `destroy ${who(w)} (Reanimate doesn't help)`,
  destroyArea: w => `destroy the area: ${who(w)}`,
  grant: (w, s, t) => `give ${s} to ${who(w)}${t === 'temp' ? ' until its owner\'s next turn' : ''}`,
  removeSkill: (w, s) => `take ${s} away from ${who(w)}`,
  disable: w => `remove all skills and abilities from ${who(w)}`,
  convert: (w, r) => `turn ${who(w)} into a Zombie on your side${r === 'reanimate' ? ', with Reanimate' : ''}`,
  transform: (w, id) => `turn ${who(w)} into ${cardName(id)}`,
  heal: (w, n) => `${plus(n)} health for ${who(w)}`,
  maxMana: (w, n) => `maximum mana changes by ${number(n)} for ${who(w)}`,
  draw: (w, n) => `${who(w)}: draw ${number(n)} card(s)`,
  discardHand: w => `${who(w)}: discard the whole hand`,
  fetch: id => `take ${cardName(id)} from your deck into your hand`,
  shuffle: () => 'shuffle your deck',
  summon: (id, n) => `put ${number(n)} new ${cardName(id)} onto your field`,
  summonFromDeck: id => `move ${cardName(id)} from your deck onto your field`,
  drainLife: w => `you gain health equal to the Attack plus Health of ${who(w)}`,
  pick: (p, n, to, q) => `you pick up to ${number(n)} from ${who(p)}; they go ${to === 'field' ? 'back onto the field' : 'to your hand'}${q ? ` (asking "${q}")` : ''}`,
  take: (p, n, to) => `the top ${number(n)} from ${who(p)} go ${to === 'field' ? 'onto the field' : 'to your hand'}, no choice`,
  discardDraw: () => 'you discard a card from your hand, then draw one',
  flag: name => `switch on "${name}" for you for the rest of the match`,
  say: (w, t) => `show "${t}" over ${who(w)}`,
  script: name => `run the one-off ability "${name}" (written in code)`,
  reduce: n => `${number(n)} less`,
  set: n => `${number(n)}`,
};
const words = text => (text.match(/"[^"]*"|\S+/g) || []).map(w => w.replace(/^"|"$/g, ''));
const parts = text => splitOutside(text, ',');

function explain(effect) {
  compileEffect(effect, 'this Effect');   // throws the game's own message if the game can't read it
  const lines = [];
  for (const clause of splitOutside(effect, ';')) {
    const [, when, rest] = clause.match(/^(\w+)\s*:\s*(.*)$/);
    const head = WHEN_WORDS[when];
    if (when === 'grants') { lines.push(`${head}: ${parts(rest).join(', ')}.`); continue; }
    if (when === 'counter') { lines.push(`${head} ${words(rest).map(k => ({ character: 'a character', spell: 'a spell', spellSingle: 'a spell aimed at one character', spellMany: 'a spell not aimed at one thing' })[k]).join(' or ')} the other player plays.`); continue; }
    if (when === 'rule') { lines.push(...parts(rest).map(p => { const [name, ...a] = words(p); const [sig, ...desc] = RULE_WORDS[name].split(':'); return `${head} "${name}": ${desc.join(':').trim()}${a.length ? ` (${sig.trim()}: ${a.join(' ')})` : ''}.`; })); continue; }
    const steps = [];
    for (const part of parts(rest)) {
      const w = words(part);
      if (w[0] === 'target') { const [kind, ...f] = w[1].split('.'); steps.push(`pick ${({ character: 'a character', characterOrPlayer: 'a character or a player', area: 'an area' })[kind]}${f.length ? ` (${f.map(filterWords).join(', ')})` : ''} to ${w[2]}`); continue; }
      if (when === 'aura') {
        if (w[0] === 'buff') steps.push(`${statWords(w[2], w[3])} for ${who(w[1])}`);
        else steps.push(`${w[2]} for ${who(w[1])}`);
        continue;
      }
      const [body, cond] = part.split(/\s+if\s+/);
      const [name, ...args] = words(body);
      if (!ACTION_WORDS[name]) throw new Error(`"${name}" has no description in tools/explain-effect.js yet; add one`);
      const atLeast = cond && cond.match(/^#([^<>=+-]+)>=(\d+)$/);
      steps.push(ACTION_WORDS[name](...args) + (!cond ? '' : atLeast ? `, but only if there are at least ${atLeast[2]} of ${who(atLeast[1])}` : `, but only if ${number(cond)} is more than 0`));
    }
    lines.push(`${head}: ${steps.join('; then ')}.`);
  }
  return lines;
}

const arg = process.argv[2];
if (!arg) { console.log('Usage: node tools/explain-effect.js "<Effect text>" | <CardID> | --all'); process.exit(1); }
let failed = 0;
const show = (title, effect) => {
  try { console.log(`${title}\n  ${explain(effect).join('\n  ')}\n`); }
  catch (e) { failed++; console.log(`${title}\n  PROBLEM: ${e.message}\n`); }
};
if (arg === '--all') { for (const c of DATA.cardList) if (c.effect) show(`${c.name} (${c.id}): ${c.effect}`, c.effect); }
else if (DATA.cardsById[arg]) show(`${DATA.cardsById[arg].name}: ${DATA.cardsById[arg].effect || '(no Effect)'}`, DATA.cardsById[arg].effect || '');
else show(arg, arg);
if (arg === '--all') console.log(failed ? `${failed} PROBLEM(S)` : 'EVERY EFFECT EXPLAINED');
process.exit(failed ? 1 : 0);
