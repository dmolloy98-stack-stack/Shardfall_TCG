// Checks the owner's card sheet ("Shardfall – card and deck builder") against the game's data files
// and lists every difference in plain words. The game files are the master copy.
//   node tools/sheet-check.js <sheet.xlsx>    the whole sheet downloaded as an .xlsx file (easiest)
//   node tools/sheet-check.js <sheet.json>    or the tabs as Claude reads them with get_values,
// one entry per tab, each the "values" array of rows:
//   { "Cards": [...], "Decks": [...], "Deck cards": [...], "Fractures": [...], "Skills": [...] }
// Ranges to read: Cards!A1:Q400, Decks!A1:H100, 'Deck cards'!A1:E2000, Fractures!A1:G50,
// Skills!A1:F100, and the mirror tabs listed in MIRRORS below. How each tab maps to a file is in the
// sheet-sync skill.
// Rows whose Status isn't "In game" (Draft, Ready) are listed as waiting, not compared.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const file = process.argv[2];
if (!file) { console.log('Usage: node tools/sheet-check.js <sheet.json>'); process.exit(1); }
// An .xlsx download of the whole sheet (the Google Drive connector's download_file_content with
// the xlsx export type) is read through tools/sheet-export.py.
const sheet = file.endsWith('.xlsx')
  ? JSON.parse(require('child_process').execFileSync('python3', [path.join(__dirname, 'sheet-export.py'), file], { encoding: 'utf8', maxBuffer: 64 << 20 }))
  : JSON.parse(fs.readFileSync(file, 'utf8'));

// The game's CSV files, as rows keyed by their header.
eval(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8').split('function rgb(')[0]);   // parseCSVLine
function table(name) {
  const lines = fs.readFileSync(path.join(root, 'data', name + '.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  const head = parseCSVLine(lines[0]);
  return lines.slice(1).map((l, i) => { const c = parseCSVLine(l); const o = { _line: i + 2 }; head.forEach((h, k) => (o[h] = c[k] ?? '')); return o; });
}
// A sheet tab as rows keyed by its header row.
function tab(name) {
  const v = sheet[name];
  if (!v) return null;
  const head = v[0];
  return v.slice(1).map((r, i) => { const o = { _row: i + 2 }; head.forEach((h, k) => (o[h] = String(r[k] ?? '').trim())); return o; });
}

const diffs = [], waiting = [];
const differ = text => diffs.push(text);
const none = v => (v === '---' || v === '' ? '' : v);
const list = v => none(v).split(/\s*[+,]\s*/).filter(Boolean).join(', ');   // "A+B" and "A, B" both become "A, B"
const same = (a, b) => String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
const field = (what, game, sh) => { if (!same(game, sh)) differ(`${what}: the game has "${game}", the sheet has "${sh}".`); };

// Cards
const cards = table('cards'), sCards = tab('Cards');
if (!sCards) differ('The Cards tab is missing from the sheet file.');
else {
  const byId = Object.fromEntries(sCards.filter(r => r.CardID).map(r => [r.CardID, r]));
  const shifted = [];   // a card's sheet row should be its line in cards.csv; one missing row shifts all after it
  for (const c of cards) {
    const r = byId[c.CardID];
    const who = `${c.Name} (${c.CardID})`;
    if (!r) { differ(`${who} is in the game but not in the sheet.`); continue; }
    if (r.Status !== 'In game') continue;
    if (r._row !== c._line) shifted.push(`${who} (sheet row ${r._row}, cards.csv line ${c._line})`);
    field(`${who}, Name`, c.Name, r.Name);
    field(`${who}, Cost`, c.Cost, r.Cost);
    field(`${who}, Rarity`, c.Rarity, r.Rarity);
    field(`${who}, Type`, c.Type, r.Type);
    field(`${who}, Tribes`, list(c.Tribes), list(r.Tribes));
    field(`${who}, Classes`, list(c.Classes), list(r.Classes));
    field(`${who}, Fracture`, list(c.Fracture), list(r.Fracture));
    const [a, h] = none(c.Stats) ? c.Stats.split('+') : ['', ''];
    field(`${who}, Attack`, a, r.Attack);
    field(`${who}, Health`, h, r.Health);
    field(`${who}, Skills`, list(c.Skills), list(r.Skills));
    field(`${who}, Ability`, none(c.Ability), r['Ability (what players read)']);
    field(`${who}, Effect`, c.Effect, r['Effect (what the game does)']);
    field(`${who}, Flavor text`, c.Description, r['Flavor text']);
  }
  if (shifted.length) differ(`${shifted.length} card${shifted.length > 1 ? 's are' : ' is'} on a different sheet row than in cards.csv, starting with ${shifted[0]}. A row was probably added, removed or moved.`);
  const inGame = new Set(cards.map(c => c.CardID));
  for (const r of sCards) {
    if (!r.CardID && !r.Name) continue;
    if (r.Status !== 'In game') waiting.push(`Card "${r.Name || r.CardID}" (row ${r._row}) is ${r.Status || 'without a Status'}.`);
    else if (!inGame.has(r.CardID)) differ(`Card "${r.Name}" (${r.CardID}, row ${r._row}) says In game, but the game doesn't have it.`);
  }
}

// Decks and their cards
const decks = table('decks'), sDecks = tab('Decks'), sDeckCards = tab('Deck cards');
if (!sDecks || !sDeckCards) differ('The Decks or Deck cards tab is missing from the sheet file.');
else {
  const byId = Object.fromEntries(sDecks.filter(r => r.DeckID).map(r => [r.DeckID, r]));
  for (const d of decks) {
    const r = byId[d.DeckID], who = `Deck ${d.Name} (${d.DeckID})`;
    if (!r) { differ(`${who} is in the game but not in the sheet.`); continue; }
    if (r.Status !== 'In game') continue;
    field(`${who}, Name`, d.Name, r.Name);
    field(`${who}, Fracture`, d.Faction, r.Fracture);
    field(`${who}, Description`, d.Description, r.Description);
    field(`${who}, On menu`, d.IsPlayable === 'true' ? 'TRUE' : 'FALSE', r['On menu'].toUpperCase());
    const game = Object.fromEntries(d.CardList.split('|').filter(Boolean).map(e => { const [id, n] = e.split(':'); return [id, Number(n)]; }));
    const sh = {};
    for (const x of sDeckCards) if (x.DeckID === d.DeckID && x.CardID && Number(x.Copies) > 0) sh[x.CardID] = (sh[x.CardID] || 0) + Number(x.Copies);
    for (const id of new Set([...Object.keys(game), ...Object.keys(sh)])) {
      if ((game[id] || 0) !== (sh[id] || 0)) differ(`${who}: the game has ${game[id] || 0} ${id}, the sheet has ${sh[id] || 0}.`);
    }
  }
  for (const r of sDecks) if (r.DeckID && r.Status !== 'In game') waiting.push(`Deck "${r.Name || r.DeckID}" is ${r.Status || 'without a Status'}.`);
}

// Fractures (factions.csv)
const facs = table('factions'), sFacs = tab('Fractures');
if (!sFacs) differ('The Fractures tab is missing from the sheet file.');
else {
  const byId = Object.fromEntries(sFacs.filter(r => r.FactionID).map(r => [r.FactionID, r]));
  for (const f of facs) {
    const r = byId[f.FactionID], who = `Fracture ${f.Name}`;
    if (!r) { differ(`${who} is in the game but not in the sheet.`); continue; }
    if (r.Status !== 'In game') continue;
    field(`${who}, Name`, f.Name, r.Name);
    field(`${who}, Symbol`, f.SymbolKey, r.Symbol);
    field(`${who}, Description`, f.Description, r.Description);
    const hex = (r.Color || '').replace('#', '');
    const rgb = [0, 2, 4].map(k => parseInt(hex.slice(k, k + 2), 16) / 255);
    const game = [f.ColorR, f.ColorG, f.ColorB].map(Number);
    if (hex.length !== 6 || rgb.some((v, k) => Math.abs(v - game[k]) > 0.006)) differ(`${who}, Color: the game has ${game.join(' ')} (0 to 1), the sheet has ${r.Color}.`);
  }
  for (const r of sFacs) if (r.FactionID && r.Status !== 'In game') waiting.push(`Fracture "${r.Name || r.FactionID}" is ${r.Status || 'without a Status'}.`);
}

// Skills
const skills = table('skills'), sSkills = tab('Skills');
if (!sSkills) differ('The Skills tab is missing from the sheet file.');
else {
  const byId = Object.fromEntries(sSkills.filter(r => r.SkillID).map(r => [r.SkillID, r]));
  for (const s of skills) {
    const r = byId[s.SkillID], who = `Skill ${s.Name}`;
    if (!r) { differ(`${who} is in the game but not in the sheet.`); continue; }
    if (r.Status !== 'In game') continue;
    field(`${who}, Name`, s.Name, r.Name);
    field(`${who}, Icon`, s.IconKey, r.Icon);
    field(`${who}, Description`, s.Description, r.Description);
  }
  for (const r of sSkills) if (r.SkillID && r.Status !== 'In game') waiting.push(`Skill "${r.Name || r.SkillID}" is ${r.Status || 'without a Status'}.`);
}

// Tabs that mirror a data file exactly, for the owner to read: the same columns, the same rows in the
// same order (only rows the game reads; # comment lines are left out). Numbers are compared as numbers.
const MIRRORS = { 'Game rules': 'game_rules', 'Champion abilities': 'champion_abilities', 'Random events': 'events', 'Trophies': 'trophies', 'Deck mastery': 'mastery', 'Computer styles': 'ai_styles' };
for (const [tabName, file] of Object.entries(MIRRORS)) {
  const rows = table(file), sRows = tab(tabName);
  if (!sRows) { differ(`The ${tabName} tab is missing from the sheet file.`); continue; }
  const cols = Object.keys(rows[0] || {}).filter(k => k !== '_line');
  const sheetRows = sRows.filter(r => cols.some(c => r[c]));
  if (sheetRows.length !== rows.length) differ(`${tabName}: the game has ${rows.length} rows, the sheet has ${sheetRows.length}.`);
  rows.forEach((g, i) => {
    const r = sheetRows[i] || {};
    for (const c of cols) {
      const a = g[c] ?? '', b = r[c] ?? '';
      if (!(same(a, b) || (a !== '' && b !== '' && Number(a) === Number(b)))) differ(`${tabName}, row ${i + 2}, ${c}: the game has "${a}", the sheet has "${b}".`);
    }
  });
}

if (waiting.length) { console.log('Waiting in the sheet (not compared):'); for (const w of waiting) console.log('  ' + w); console.log(''); }
for (const d of diffs) console.log('DIFFERENT  ' + d);
console.log(diffs.length ? `\n${diffs.length} DIFFERENCE${diffs.length > 1 ? 'S' : ''} (the game files are the master copy)` : 'THE SHEET MATCHES THE GAME');
process.exit(diffs.length ? 1 : 0);
