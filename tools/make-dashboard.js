// Builds the owner's "Shardfall dashboard", a claude.ai page: what's new, what waits on the owner,
// what's being built, balance, and links. It is made from the project's own files (the same facts
// as docs/status.md), so it can't drift.
//   node tools/make-dashboard.js <out.html>
// Then publish it to the dashboard's claude.ai address (the backup skill does this after every
// merged pull request; the address is in CLAUDE.md under Links).
const fs = require('fs'), path = require('path');
const { facts } = require('./make-status.js');
const out = process.argv[2];
if (!out) { console.log('Usage: node tools/make-dashboard.js <out.html>'); process.exit(1); }
const F = facts();
const { DATA } = F;
const REPO = 'https://github.com/dmolloy98-stack-stack/Shardfall_TCG';
const doc = f => `${REPO}/blob/main/${f}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// **bold** and `code` from the to-do list, as HTML.
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const color = f => DATA.factions[f]?.color || '#c9b48d';

const waiting = F.waiting ? F.bullets(F.waiting.lines) : [];
const round = F.round ? F.bullets(F.round.lines) : [];
const offered = F.offered ? F.bullets(F.offered.lines) : [];
const ideas = F.sectionNames.filter(n => /not yet designed|idea|leveling|levels and mastery/i.test(n) && !/^Offered|^Turned|^Not doing/.test(n)).map(n => n.replace(/ — .*$/, ''));
const news = DATA.whatsNew.slice(0, 5);
const champs = DATA.cardList.filter(c => c.rarity === 'Unknown');
const date = d => { const t = new Date(d + 'T12:00:00Z'); return isNaN(t) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const built = s => /\*\*Built/.test(s);

const html = `<title>Shardfall Dashboard</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Alegreya+Sans:wght@400;500;700;800&display=swap">
<style>
/* Layout: one column of panels on the game's night-crystal table; the gold title band on top. */
:root {
  color-scheme: dark;
  --table: #070a18; --panel: #0e1430; --rim: #2a3a73; --ice: #9cc2ff;
  --brass: #d9a64c; --parchment: #f2e7cf; --muted: #b7a68a; --good: #63d07a; --warn: #ff9a2e;
  --display: "IM Fell English SC", "Palatino Linotype", Georgia, serif;
  --body: "Alegreya Sans", "Gill Sans", "Trebuchet MS", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: radial-gradient(ellipse at top, #16204a, var(--table) 60%) fixed, var(--table); color: var(--parchment); font: 17px/1.5 var(--body); }
.wrap { max-width: 920px; margin: 0 auto; padding-block: 28px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 18px; }
header { display: grid; gap: 6px; }
h1 { margin: 0; font: 400 clamp(2.6rem, 9vw, 4.2rem)/1 var(--display); color: var(--brass); letter-spacing: 0.04em; text-shadow: 0 0 30px rgba(217, 166, 76, 0.3); }
.version { color: var(--muted); }
.links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.links a { color: var(--parchment); text-decoration: none; border: 1.5px solid var(--rim); background: linear-gradient(#223066, #101838); border-radius: 8px; padding: 8px 14px; font-weight: 700; }
.links a.play { border-color: var(--brass); background: linear-gradient(#b36b26, #6e3a12); }
.links a:hover, .links a:focus-visible { border-color: var(--brass); outline: none; }
section { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1.5px solid var(--rim); border-radius: 12px; padding: 18px 20px; min-width: 0; }
section.you { border-color: var(--brass); }
h2 { margin: 0 0 10px; font: 400 1.6rem/1.1 var(--display); color: var(--brass); text-wrap: balance; }
h3 { margin: 14px 0 4px; font-size: 1.02rem; color: var(--parchment); }
h3 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
ul { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; }
li { min-width: 0; }
code { font-size: 0.9em; color: var(--ice); background: rgba(156, 194, 255, 0.08); padding: 0 4px; border-radius: 4px; overflow-wrap: anywhere; }
.note { color: var(--muted); font-size: 0.92rem; margin: 10px 0 0; }
.note a, li a { color: var(--ice); }
.chip { display: inline-block; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 8px; border-radius: 99px; margin-right: 6px; vertical-align: 2px; }
.chip.done { background: rgba(99, 208, 122, 0.15); color: var(--good); }
.chip.next { background: rgba(156, 194, 255, 0.12); color: var(--ice); }
.bars { display: grid; gap: 8px; }
.bar { display: grid; grid-template-columns: minmax(7.5em, 10em) 1fr 3.6em; gap: 10px; align-items: center; }
.track { position: relative; height: 16px; border-radius: 8px; background: rgba(255, 255, 255, 0.06); overflow: hidden; }
.band { position: absolute; top: 0; bottom: 0; left: 40%; width: 20%; background: rgba(217, 166, 76, 0.14); }
.mid { position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: rgba(242, 231, 207, 0.35); }
.fill { position: absolute; top: 3px; bottom: 3px; left: 0; border-radius: 6px; }
.pct { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
.pct.off { color: var(--warn); }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.fact b { display: block; font: 400 1.9rem/1 var(--display); color: var(--parchment); }
.fact span { color: var(--muted); font-size: 0.92rem; }
footer { color: var(--muted); font-size: 0.85rem; text-align: center; }
@media (max-width: 520px) { .bar { grid-template-columns: 6.5em 1fr 3.4em; } body { font-size: 16px; } }
</style>
<div class="wrap">
  <header>
    <h1>Shardfall</h1>
    <div class="version">${esc(DATA.version)} · ${esc(date(news[0]?.date))} · ${DATA.cardList.length} cards, ${champs.length} champions, ${DATA.deckOrder.filter(id => DATA.decks[id].isPlayable).length} starter decks</div>
    <nav class="links" aria-label="Links">
      <a class="play" href="https://dmolloy98-stack-stack.github.io/Shardfall_TCG/">Play Shardfall</a>
      <a href="https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1">Playable claude.ai copy</a>
      <a href="https://docs.google.com/spreadsheets/d/1RzePfEgUN4QJsLTDGnhU7xaTa0_snq2lVswEUy5JNX0">Card sheet</a>
      <a href="${REPO}">GitHub</a>
    </nav>
  </header>

  <section class="you" aria-labelledby="h-you">
    <h2 id="h-you">Waiting on you</h2>
    ${waiting.length ? `<ul>${waiting.map(l => `<li>${md(l.replace(/^- /, ''))}</li>`).join('')}</ul>` : '<p>Nothing right now.</p>'}
    <p class="note">Full list: <a href="${doc('docs/todo.md')}">the to-do list</a>.</p>
  </section>

  <section aria-labelledby="h-now">
    <h2 id="h-now">Being built</h2>
    ${round.length ? `<h3>${md(F.round.head)}</h3><ul>${round.map(l => { const t = l.replace(/^- \d+\. /, '').replace(/^- /, ''); return `<li><span class="chip ${built(t) ? 'done' : 'next'}">${built(t) ? 'Built' : 'To do'}</span>${md(t.replace(/^\*\*Built[^*]*\*\*\s*/, ''))}</li>`; }).join('')}</ul>` : '<p>Nothing is being built right now.</p>'}
  </section>

  <section aria-labelledby="h-new">
    <h2 id="h-new">What's new</h2>
    ${news.map(u => `<h3>Update ${esc(u.update)}<small>${esc(date(u.date))}</small></h3><ul>${u.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`).join('')}
  </section>

  <section aria-labelledby="h-bal">
    <h2 id="h-bal">Balance</h2>
    ${F.rates.length ? `<div class="bars" role="list">${F.rates.map(r => `<div class="bar" role="listitem"><span>${esc(r.deck)}</span><span class="track" aria-hidden="true"><span class="band"></span><span class="mid"></span><span class="fill" style="width:${r.rate}%;background:${color(r.fracture)}"></span></span><span class="pct${r.rate < 40 || r.rate > 60 ? ' off' : ''}">${r.rate.toFixed(1)}%</span></div>`).join('')}</div>
    <p class="note">How often each starter deck wins against the others, with the computer playing both sides. The gold band is 40–60%, where a deck counts as fair. ${F.first ? `The player who goes first wins ${F.first}%.` : ''} Measured ${esc(date(F.measured))}.</p>` : '<p>Not measured yet.</p>'}
  </section>

  <section aria-labelledby="h-ideas">
    <h2 id="h-ideas">Ideas waiting for your design</h2>
    <ul>${ideas.map(n => `<li>${md(n)}</li>`).join('')}</ul>
    ${offered.length ? `<h3>Offered, not picked yet</h3><ul>${offered.map(l => `<li>${md(l.replace(/^- /, ''))}</li>`).join('')}</ul>` : ''}
    <p class="note">Details for each are in <a href="${doc('docs/todo.md')}">the to-do list</a>; finished work is in <a href="${doc('docs/done.md')}">the done list</a>.</p>
  </section>

  <section aria-labelledby="h-game">
    <h2 id="h-game">The game in numbers</h2>
    <div class="facts">
      <div class="fact"><b>${DATA.cardList.length}</b><span>cards: ${['Character', 'Spell', 'Equipment', 'Area'].map(t => `${DATA.cardList.filter(c => c.type === t).length} ${t.toLowerCase()}s`).join(', ')}</span></div>
      <div class="fact"><b>${champs.length}</b><span>champions: ${esc(champs.map(c => c.name).join(', '))}</span></div>
      <div class="fact"><b>${Object.keys(DATA.factions).length}</b><span>worlds: ${esc(Object.keys(DATA.factions).join(', '))}</span></div>
      <div class="fact"><b>${DATA.cardList.filter(c => c.effect && !/script /.test(c.effect)).length}</b><span>cards written in ability words, ${DATA.cardList.filter(c => /script /.test(c.effect || '')).length} with one-off code</span></div>
    </div>
  </section>

  <footer>Made by Claude from the project's own files with every update. Nothing here is typed by hand.</footer>
</div>
`;
fs.writeFileSync(out, html);
console.log(`Wrote ${out}`);
