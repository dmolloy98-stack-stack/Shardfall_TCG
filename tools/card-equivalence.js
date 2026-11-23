// "Same play" check for card changes: plays each card on the same prepared table in an older
// version of the game and in this one, and says whether it plays out exactly the same.
//   node tools/card-equivalence.js <older game folder>              cards whose Effect changed
//   node tools/card-equivalence.js <older game folder> card_a card_b these cards
//   node tools/card-equivalence.js <older game folder> --all        every card (after a change to
//                                                                    the ability words or rules)
// The older folder is usually main: git worktree add /tmp/main origin/main
// Use it whenever a card's Effect, an ability word or a rule it uses is rewritten without meaning
// to change play (the ability-words skill). The big automatic games miss cards that no starter
// deck holds; this plays every one asked for.
// Each card is played on a table with two plain characters, a Level Up character and an area on
// each side and plenty of mana (as in tools/cards-test.js); its question is answered the same way
// each time; then the computer plays both sides to round 6. The table is compared right after the
// card and at the end, leaving out words (names, ability text), so rewording a card isn't a change.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

if (process.argv[2] === '--child') runChild(process.argv[3]);
else main();

function main() {
  const here = path.join(__dirname, '..');
  const args = process.argv.slice(2);
  const before = args[0] && path.resolve(args[0]);
  if (!before || !fs.existsSync(path.join(before, 'js/data.js'))) { console.log('Usage: node tools/card-equivalence.js <older game folder> [card ids | --all]'); process.exit(1); }
  eval(fs.readFileSync(path.join(here, 'js/data.js'), 'utf8').split('function rgb(')[0]);   // parseCSVLine
  const effects = dir => {
    const lines = fs.readFileSync(path.join(dir, 'data/cards.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const head = parseCSVLine(lines[0]);
    return Object.fromEntries(lines.slice(1).map(l => { const c = parseCSVLine(l); return [c[head.indexOf('CardID')], c[head.indexOf('Effect')]]; }));
  };
  const was = effects(before), now = effects(here);
  let ids = args.slice(1).filter(a => !a.startsWith('--'));
  if (args.includes('--all')) ids = Object.keys(now).filter(id => id in was);
  else if (!ids.length) ids = Object.keys(now).filter(id => id in was && was[id] !== now[id]);
  const added = Object.keys(now).filter(id => !(id in was));
  if (added.length) console.log(`New cards (nothing to compare with): ${added.join(', ')}`);
  if (!ids.length) { console.log("No card's Effect changed. Name cards, or use --all after a change to the ability words or rules."); return; }
  const run = (dir, label) => {
    try {
      const out = execFileSync(process.execPath, [__filename, '--child', dir], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CARDS: ids.join(',') } });
      return JSON.parse(out.slice(out.indexOf('RESULT ') + 7).split('\n')[0]);
    } catch (e) {
      const why = String(e.stderr || e.message).split('\n').find(l => /Error:/.test(l)) || 'it stopped with an error';
      console.log(`The ${label} version could not run its cards: ${why.replace(/^.*Error:\s*/, '')}`);
      process.exit(1);
    }
  };
  const a = run(before, 'older'), b = run(here, 'current');
  let differ = 0;
  for (const id of ids) {
    const x = a[id], y = b[id];
    let verdict;
    if (!y) verdict = 'not played in this version';
    else if (typeof y[0] === 'string') verdict = 'PROBLEM in this version: ' + y[0].slice(9);
    else if (!x || typeof x[0] === 'string') verdict = 'could not be played in the older version, so nothing to compare';
    else if (x[0] !== y[0]) verdict = 'DIFFERENT right after the card';
    else if (JSON.stringify(x.slice(1)) !== JSON.stringify(y.slice(1))) verdict = 'same after the card, DIFFERENT after the computer plays on';
    else verdict = 'same';
    if (verdict !== 'same') differ++;
    console.log(`${verdict === 'same' ? 'SAME     ' : 'CHECK    '}${id}${verdict === 'same' ? '' : ': ' + verdict}`);
  }
  console.log(differ ? `\n${differ} CARD${differ > 1 ? 'S' : ''} PLAY DIFFERENTLY (fine only if that change is meant)` : `\nALL ${ids.length} CARDS PLAY THE SAME`);
  process.exitCode = differ ? 1 : 0;
}

// Runs inside one game folder: plays each card in CARDS and prints RESULT {id: [after card, after play, round, health]}.
function runChild(dir) {
eval(require(require('path').join(__dirname, 'rules-code'))(dir, ['champions', 'ai']) + `
let fails = 0, passes = 0;
if (typeof move === 'undefined') { var move = (n, ...a) => ({ play: (u, o) => playCard(u, o || {}), target: chooseTarget, choose: resolveChoice, cancel: cancelPending })[n](...a); }
const ONLY = process.env.CARDS.split(',');
const hash = x => { let h = 0; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return h; };
const sorted = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const key = () => hash(JSON.stringify(S, (k, v) => (k === 'log' || k === 'effect' || k === 'ability' || k === 'description' || k === 'moves' || k === 'setup' || k === 'prompt' || k === 'title') ? undefined : sorted(v)));
const OUT = {};
const bad = (card, why) => { OUT[card.id] = ['problem: ' + why]; fails++; };
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

for (const tpl of cards) {
  if (!ONLY.includes(tpl.id)) continue;
  try {
    table();
    const [me, foe] = S.players;
    let card;
    if (counterKinds(tpl)) {
      // A counter spell: the other player holds it and answers a card played now.
      card = newCard(tpl); foe.hand.push(card);
      // Find a card it can stop: play each candidate on a copy of the table until one opens the counter window.
      const opens = c => simulate(() => { muted--; try { const b = newCard(c); S.players[0].hand.push(b); move('play', b.uid);
        if (S.pending?.kind === 'target') { const t = pendingTargets(S.pending).find(x => !x.isPlayer) || pendingTargets(S.pending)[0]; if (t) move('target', t.isPlayer ? t : { uid: t.uid }); }
        return S.pending?.resolve === 'counter' && S.pending.cards.some(x => x.uid === card.uid); } finally { muted++; } });
      const bait = cards.find(c => (c.type === 'Character' || c.type === 'Spell') && !counterKinds(c) && opens(c));
      if (!bait) { bad(tpl, 'no card found that it can counter'); continue; }
      const b = newCard(bait); me.hand.push(b);
      move('play', b.uid);
      if (S.pending?.kind === 'target') { const t = pendingTargets(S.pending).find(x => !x.isPlayer) || pendingTargets(S.pending)[0]; if (t) move('target', t.isPlayer ? t : { uid: t.uid }); }
      if (S.pending?.resolve !== 'counter') { bad(tpl, 'the counter window did not open'); continue; }
      if (!move('choose', [card.uid], 'counter')) { bad(tpl, 'it could not be used to counter'); continue; }
    } else {
      card = newCard(tpl); me.hand.push(card);
      if (!canPlay(card, me)) { bad(tpl, 'it cannot be played: ' + playBlocker(card, me)); continue; }
      const ok = tpl.type === 'Equipment' ? move('play', card.uid, { target: { uid: me.field.chars[0].uid } }) : move('play', card.uid);
      if (!ok) { bad(tpl, 'the rules refused to play it'); continue; }
    }
    let why = answer() || problemsNow();
    OUT[tpl.id] = [key()];
    if (!why && me.hand.includes(card) && card.type !== 'Spell') why = 'it is still in the hand after being played';
    // A few turns of the computer playing both sides.
    for (const p of S.players) p.isAI = true;
    for (let steps = 0; !why && !S.over && S.round < 6 && steps < 400; steps++) { aiStep(); why = problemsNow(); }
    OUT[tpl.id].push(key(), S.round, S.players.map(p => p.health).join('/'));
    if (why) bad(tpl, why); else passes++;
  } catch (e) { bad(tpl, 'crash: ' + e.message + ' ' + (e.stack || '').split('\\n')[1].trim()); }
}
console.log('RESULT ' + JSON.stringify(OUT));
`);
}
