const fs = require('fs');
// Plays every card in data/cards.csv at least once: node tools/cards-test.js .
// Whole-match tests only meet the cards that happen to be drawn, so a rarely drawn card could
// break without anyone noticing. For each card this test sets up a table with two plain
// characters on each side and 10 mana, plays the card (counter spells answer a card the other
// player plays), answers any question it asks, then lets the computer play both sides for a few
// turns so its other abilities (end of turn, attacks, deaths) get a chance to run.
// It fails on a crash, a card that can't be played, or a broken table (see check()).
const dir = process.argv[2] || '.';
eval(require(require('path').join(__dirname, 'rules-code'))(dir, ['champions', 'ai']) + `
let fails = 0, passes = 0;
const bad = (card, why) => { console.log('FAIL ' + card.name + ' (' + card.id + '): ' + why); fails++; };
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
    if (!why && me.hand.includes(card) && card.type !== 'Spell') why = 'it is still in the hand after being played';
    // A few turns of the computer playing both sides.
    for (const p of S.players) p.isAI = true;
    for (let steps = 0; !why && !S.over && S.round < 6 && steps < 400; steps++) { aiStep(); why = problemsNow(); }
    if (why) bad(tpl, why); else passes++;
  } catch (e) { bad(tpl, 'crash: ' + e.message + ' ' + (e.stack || '').split('\\n')[1].trim()); }
}
{ // every kind of "choose" window the code opens has an entry in CHOICES (js/rules-play.js),
  // and every computer answer in AI_CHOICES (js/ai.js) belongs to one
  const used = new Set();
  for (const f of fs.readdirSync(dir + '/js')) for (const m of fs.readFileSync(dir + '/js/' + f, 'utf8').matchAll(/resolve: "(\\w+)"/g)) used.add(m[1]);
  for (const r of used) if (!CHOICES[r]) { console.log('FAIL choose window "' + r + '" has no entry in CHOICES (js/rules-play.js)'); fails++; }
  for (const r of Object.keys(AI_CHOICES)) if (!CHOICES[r]) { console.log('FAIL AI_CHOICES has "' + r + '", which is not in CHOICES'); fails++; }
  if (used.size < 7) { console.log('FAIL found only ' + used.size + ' kinds of choose window in the code; the search is broken'); fails++; }
}
console.log(passes + ' of ' + cards.length + ' cards played without a problem');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
`);
