// Builds the owner's "Shardfall dashboard", a claude.ai page: what waits on the owner, open
// questions, what's left to do, what was finished lately, ideas, balance, skills and links. It is
// made from the project's own files (docs/todo.md, docs/done.md, docs/world.md, the skills, the
// data), the same facts as docs/status.md, so it can't drift.
//   node tools/make-dashboard.js <out.html> [--prs prs.json]
// prs.json (optional) lists pull requests still open, which the repo can't know by itself:
//   [{ "number": 32, "title": "...", "note": "why it waits" }]
// Then publish it to the dashboard's claude.ai address (the backup skill does this after every
// merged pull request; the address is in CLAUDE.md under Links).
const fs = require('fs'), path = require('path');
const { facts } = require('./make-status.js');
const args = process.argv.slice(2);
const out = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--prs');
if (!out) { console.log('Usage: node tools/make-dashboard.js <out.html> [--prs prs.json]'); process.exit(1); }
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const F = facts();
const { DATA } = F;
const REPO = 'https://github.com/dmolloy98-stack-stack/Shardfall_TCG';
const doc = f => `${REPO}/blob/main/${f}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// **bold** and `code` from the docs, as HTML.
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const color = f => DATA.factions[f]?.color || '#c9b48d';
const date = d => { const t = new Date(d + 'T12:00:00Z'); return isNaN(t) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const item = l => l.replace(/^- (\d+\. )?/, '');
const ul = list => `<ul>${list.map(l => `<li>${md(item(l))}</li>`).join('')}</ul>`;

// A markdown file split into its "## " sections: { head, lines }.
function sections(file) {
  const out = [];
  for (const l of read(file).split('\n')) {
    if (/^## /.test(l)) out.push({ head: l.slice(3), lines: [] });
    else if (out.length) out[out.length - 1].lines.push(l);
  }
  return out;
}
// A section's paragraphs, list items and "### " / "**Label.**" sub-headings, in order.
function blocks(lines) {
  const out = []; let para = null;
  for (const l of lines) {
    if (/^### /.test(l)) { out.push({ sub: l.slice(4) }); para = null; }
    else if (/^\*\*[^*]+\*\*\s*$/.test(l.trim())) { out.push({ sub: l.trim().replace(/\*\*/g, '').replace(/\.$/, '') }); para = null; }
    else if (/^(- |\d+\. )/.test(l)) { out.push({ li: l.replace(/^(- |\d+\. )/, '') }); para = null; }
    else if (/^\s+\S/.test(l) && out.length && out[out.length - 1].li !== undefined) out[out.length - 1].li += ' ' + l.trim();
    else if (l.trim()) { if (para) para.p += ' ' + l.trim(); else out.push(para = { p: l.trim() }); }
    else para = null;
  }
  return out;
}
function renderBlocks(bs) {
  let html = '', open = false;
  for (const b of bs) {
    if (b.li !== undefined) { if (!open) { html += '<ul>'; open = true; } html += `<li>${md(b.li)}</li>`; continue; }
    if (open) { html += '</ul>'; open = false; }
    html += b.sub ? `<h4>${md(b.sub)}</h4>` : `<p>${md(b.p)}</p>`;
  }
  return html + (open ? '</ul>' : '');
}

const todo = sections('docs/todo.md');
const find = re => todo.find(s => re.test(s.head));
const waiting = F.waiting ? F.bullets(F.waiting.lines) : [];
const round = F.round ? F.bullets(F.round.lines) : [];
const stillTodo = find(/^Still to do/);
const openPoints = find(/^Open points/);
const offered = F.offered ? F.bullets(F.offered.lines) : [];
const ideaSecs = todo.filter(s => /not yet designed|idea|leveling|levels and mastery/i.test(s.head) && !/^(Offered|Turned|Not doing|Art:)/.test(s.head));
const reminders = todo.filter(s => /^Art:|remind/i.test(s.head));
const parked = todo.filter(s => /^(Not doing|Turned down)/.test(s.head));
const parkedItems = parked.flatMap(s => blocks(s.lines).filter(b => b.li !== undefined).map(b => b.li));

// Open questions: the story's (docs/world.md) and the TBD items in the ideas.
const world = sections('docs/world.md').find(s => /^Open questions/.test(s.head));
const storyQs = world ? blocks(world.lines).filter(b => b.li !== undefined).map(b => b.li) : [];
const tbd = [];
for (const s of ideaSecs) {
  let inTbd = false;
  for (const b of blocks(s.lines)) {
    if (b.sub) inTbd = /TBD|to be decided/i.test(b.sub);
    else if (b.li !== undefined && !/^Not now/.test(b.li) && (inTbd || /not decided|owner is working|owner will|Claude offers options and waits/i.test(b.li))) tbd.push({ from: s.head.replace(/ — .*$/, ''), text: b.li });
  }
}
const pointQs = openPoints ? (() => { const out = []; let sub = ''; for (const b of blocks(openPoints.lines)) { if (b.sub) sub = b.sub; else if (b.li !== undefined) out.push({ from: sub, text: b.li }); } return out; })() : [];

// Recently finished: the newest sections of docs/done.md.
const status = t => (t.match(/^\*\*(Built|Started|Prepared|Planned|Written)[^*]*\*\*/) || [])[1];
const title = t => { const b = [...t.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1]).filter(x => !/^(Built|Started|Prepared|Planned|Written)\b/.test(x)); return b[0] || t.replace(/^\*\*[^*]+\*\*\s*/, ''); };
const done = sections('docs/done.md').slice(0, 4).map(s => {
  const bs = blocks(s.lines);
  const items = bs.filter(b => b.li !== undefined).map(b => ({ st: status(b.li) || 'Built', t: title(b.li) }));
  return { head: s.head, items, summary: items.length ? '' : (bs.find(b => b.p)?.p || '') };
});
const news = DATA.whatsNew.slice(0, 4);

// Pull requests waiting (optional input, shown only when the page can't reach its live list).
const prArg = args.indexOf('--prs');
const prs = prArg >= 0 && fs.existsSync(args[prArg + 1]) ? JSON.parse(fs.readFileSync(args[prArg + 1], 'utf8')) : [];
// The live pull-request panel: the page reads the open list from its own database (document
// prs/open, written by the "Shardfall merge from dashboard" and daily scheduled tasks), and its
// "Merge to main" button writes merge_requests/<number> and wakes that scheduled task. The page
// is published with capabilities db, user and mcp (Claude Code Remote: fire_trigger); later
// publishes leave the capabilities field out so they are kept. Steps: backup skill.
const MERGE_TASK = 'trig_01UAGxMNpmLNdtB7J3pyfJDV';

// Skills and the project agent.
const outside = new Set(Object.keys(JSON.parse(read('skills-lock.json')).skills || {}));
const skills = fs.readdirSync(path.join(root, '.claude/skills')).filter(d => fs.existsSync(path.join(root, '.claude/skills', d, 'SKILL.md'))).sort().map(d => {
  const m = read(`.claude/skills/${d}/SKILL.md`).match(/description:\s*>?\s*\n?([\s\S]*?)\n---/);
  return { d, desc: (m ? m[1] : '').replace(/\s+/g, ' ').trim().split(/(?<=[a-z)])[.:] /)[0].replace(/\.$/, ''), own: !outside.has(d) };
});
const agents = fs.existsSync(path.join(root, '.claude/agents')) ? fs.readdirSync(path.join(root, '.claude/agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')) : [];

const champs = DATA.cardList.filter(c => c.rarity === 'Unknown');
const nTodo = (stillTodo ? blocks(stillTodo.lines).filter(b => b.li !== undefined).length : 0) + round.length;
const nQs = storyQs.length + tbd.length + pointQs.length;
const nDone = done.reduce((n, s) => n + (s.items.length || 1), 0);

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
.tally { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.tally a { text-decoration: none; color: inherit; background: var(--panel); border: 1.5px solid var(--rim); border-radius: 12px; padding: 12px 10px; text-align: center; }
.tally a:hover, .tally a:focus-visible { border-color: var(--brass); outline: none; }
.tally b { display: block; font: 400 2.2rem/1 var(--display); }
.tally span { color: var(--muted); font-size: 0.88rem; line-height: 1.2; display: block; margin-top: 4px; }
.tally .you b { color: var(--brass); } .tally .q b { color: var(--ice); } .tally .ok b { color: var(--good); }
section { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1.5px solid var(--rim); border-radius: 12px; padding: 18px 20px; min-width: 0; scroll-margin-top: 12px; }
section.you { border-color: var(--brass); }
h2 { margin: 0 0 10px; font: 400 1.6rem/1.1 var(--display); color: var(--brass); text-wrap: balance; }
h3 { margin: 16px 0 6px; font-size: 1.02rem; color: var(--parchment); }
h3:first-of-type { margin-top: 4px; }
h3 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
h4 { margin: 10px 0 4px; font-size: 0.95rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
p { margin: 6px 0; }
ul { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; }
li { min-width: 0; }
code { font-size: 0.9em; color: var(--ice); background: rgba(156, 194, 255, 0.08); padding: 0 4px; border-radius: 4px; overflow-wrap: anywhere; }
.note { color: var(--muted); font-size: 0.92rem; margin: 10px 0 0; }
.note a, li a, p a { color: var(--ice); }
.chip { display: inline-block; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 8px; border-radius: 99px; margin-right: 6px; vertical-align: 2px; background: rgba(156, 194, 255, 0.12); color: var(--ice); }
.chip.done { background: rgba(99, 208, 122, 0.15); color: var(--good); }
.chip.part { background: rgba(255, 154, 46, 0.15); color: var(--warn); }
.chip.from { background: rgba(217, 166, 76, 0.13); color: var(--brass); text-transform: none; letter-spacing: 0; font-weight: 700; }
details { border-top: 1px solid rgba(42, 58, 115, 0.7); padding: 8px 0; }
details:first-of-type { border-top: 0; }
summary { cursor: pointer; font-weight: 700; list-style-position: outside; }
summary small { color: var(--muted); font-weight: 400; }
details > div { padding: 4px 0 4px 2px; }
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
.skills { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; padding: 0; list-style: none; }
.skills li { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(42, 58, 115, 0.8); border-radius: 8px; padding: 8px 10px; font-size: 0.93rem; }
.skills li b { display: block; color: var(--ice); font-weight: 700; }
footer { color: var(--muted); font-size: 0.85rem; text-align: center; }
.prs { list-style: none; padding: 0; gap: 10px; }
.pr { display: grid; grid-template-columns: 1fr auto; gap: 6px 14px; align-items: center; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(42, 58, 115, 0.9); border-radius: 10px; padding: 12px 14px; }
.pr .t { font-weight: 700; }
.pr .t a { color: var(--ice); margin-right: 6px; }
.pr .why, .pr .meta { grid-column: 1; color: var(--muted); font-size: 0.93rem; }
.pr .why { color: var(--parchment); }
.pr .act { grid-column: 2; grid-row: 1 / span 3; display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
button { font: 700 0.95rem/1 var(--body); border-radius: 8px; padding: 10px 14px; cursor: pointer; color: var(--parchment); border: 1.5px solid var(--brass); background: linear-gradient(#b36b26, #6e3a12); min-height: 44px; }
button.ghost { border-color: var(--rim); background: linear-gradient(#223066, #101838); }
button:hover, button:focus-visible { outline: 2px solid var(--ice); outline-offset: 2px; }
button[disabled] { opacity: 0.55; cursor: default; outline: none; }
.chip.wait { background: rgba(217, 166, 76, 0.15); color: var(--brass); }
.chip.bad { background: rgba(255, 110, 90, 0.15); color: #ff8a78; }
.pr-foot { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 10px; }
.pr-foot .note { margin: 0; }
.pr-msg { margin: 8px 0 0; color: var(--ice); }
.pr-msg:empty { display: none; }
.merged-line { color: var(--muted); font-size: 0.92rem; margin: 10px 0 0; }
@media (max-width: 520px) { .pr { grid-template-columns: 1fr; } .pr .act { grid-column: 1; grid-row: auto; flex-direction: row; } .pr .act button { flex: 1; } }
@media (max-width: 520px) { .bar { grid-template-columns: 6.5em 1fr 3.4em; } body { font-size: 16px; } .tally { grid-template-columns: repeat(2, 1fr); } section { padding: 16px; } }
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

  <nav class="tally" aria-label="At a glance">
    <a class="you" href="#prs"><b id="tally-prs">${prs.length || '–'}</b><span>PRs to merge</span></a>
    <a class="q" href="#questions"><b>${nQs}</b><span>open questions</span></a>
    <a href="#todo"><b>${nTodo}</b><span>still to do</span></a>
    <a class="ok" href="#done"><b>${nDone}</b><span>finished lately</span></a>
  </nav>

  <section class="you" id="prs" aria-labelledby="h-prs">
    <h2 id="h-prs">Pull requests not merged yet</h2>
    <p class="note" style="margin-top:0">Changes Claude made but held for you. Press <b>Merge to main</b> and Claude runs GitHub's tests and merges only if they all pass.</p>
    <div id="pr-live" aria-live="polite">${prs.length ? `<ul>${prs.map(p => `<li><a href="${REPO}/pull/${Number(p.number)}">#${Number(p.number)}</a> <b>${esc(p.title)}</b>${p.note ? `. ${esc(p.note)}` : ''}</li>`).join('')}</ul>` : '<p class="pr-empty">Loading the live list…</p>'}</div>
    <div class="pr-foot"><span id="pr-checked" class="note"></span><button type="button" id="pr-refresh" class="ghost" hidden>Check GitHub now</button></div>
    <p id="pr-msg" class="pr-msg" role="status"></p>
  </section>

  <section id="you" aria-labelledby="h-you">
    <h2 id="h-you">Other things waiting on you</h2>
    ${waiting.length ? ul(waiting) : '<p>Nothing right now.</p>'}
    ${reminders.map(s => `<h3>Reminder</h3><p>${md(s.head.replace(/^Art: /, 'Art: '))}. Steps are in <a href="${doc('docs/todo.md')}">the to-do list</a>.</p>`).join('')}
  </section>

  <section id="questions" aria-labelledby="h-q">
    <h2 id="h-q">Open questions</h2>
    <p class="note" style="margin-top:0">Design and story calls only you can make. Claude offers options and waits.</p>
    ${tbd.length ? `<h3>Game design</h3><ul>${tbd.map(q => `<li><span class="chip from">${md(q.from)}</span>${md(q.text)}</li>`).join('')}</ul>` : ''}
    ${pointQs.length ? `<h3>On features already built</h3><ul>${pointQs.map(q => `<li><span class="chip from">${md(q.from)}</span>${md(q.text)}</li>`).join('')}</ul>` : ''}
    ${storyQs.length ? `<h3>Story and world</h3><ul>${storyQs.map(q => `<li>${md(q)}</li>`).join('')}</ul><p class="note">From <a href="${doc('docs/world.md')}">the story bible</a>.</p>` : ''}
  </section>

  <section id="todo" aria-labelledby="h-todo">
    <h2 id="h-todo">Still to do</h2>
    ${round.length ? `<h3>${md(F.round.head)}</h3><ul>${round.map(l => { const t = item(l); const st = status(t); return `<li><span class="chip ${st === 'Built' ? 'done' : ''}">${st || 'To do'}</span>${md(t.replace(/^\*\*[^*]+\*\*\s*/, st ? '' : '$&'))}</li>`; }).join('')}</ul>` : '<p>Nothing is being built right now.</p>'}
    ${stillTodo ? `<h3>Left over from earlier rounds</h3>${renderBlocks(blocks(stillTodo.lines))}` : ''}
    ${offered.length ? `<h3>Offered, not picked yet</h3>${ul(offered)}` : ''}
  </section>

  <section id="done" aria-labelledby="h-done">
    <h2 id="h-done">Recently finished</h2>
    ${done.map((s, i) => `<details${i === 0 ? ' open' : ''}><summary>${md(s.head)} <small>${s.items.length ? `· ${s.items.length} items` : ''}</small></summary><div>${s.items.length ? `<ul>${s.items.map(x => `<li><span class="chip ${x.st === 'Built' ? 'done' : 'part'}">${esc(x.st)}</span>${md(x.t)}</li>`).join('')}</ul>` : `<p>${md(s.summary)}</p>`}</div></details>`).join('')}
    <h3>What players noticed</h3>
    ${news.map(u => `<p><b>Update ${esc(u.update)}</b> <small style="color:var(--muted)">${esc(date(u.date))}</small>: ${u.changes.map(esc).join(' ')}</p>`).join('')}
    <p class="note">Everything finished, with your decisions: <a href="${doc('docs/done.md')}">the done list</a>.</p>
  </section>

  <section aria-labelledby="h-ideas">
    <h2 id="h-ideas">Ideas waiting for your design</h2>
    ${ideaSecs.map(s => `<details><summary>${md(s.head.replace(/ — .*$/, ''))}</summary><div>${renderBlocks(blocks(s.lines))}</div></details>`).join('')}
    ${parkedItems.length ? `<details><summary>On hold or turned down <small>· ${parkedItems.length}</small></summary><div><ul>${parkedItems.map(t => `<li>${md(t)}</li>`).join('')}</ul></div></details>` : ''}
  </section>

  <section aria-labelledby="h-bal">
    <h2 id="h-bal">Balance</h2>
    ${F.rates.length ? `<div class="bars" role="list">${F.rates.map(r => `<div class="bar" role="listitem"><span>${esc(r.deck)}</span><span class="track" aria-hidden="true"><span class="band"></span><span class="mid"></span><span class="fill" style="width:${r.rate}%;background:${color(r.fracture)}"></span></span><span class="pct${r.rate < 40 || r.rate > 60 ? ' off' : ''}">${r.rate.toFixed(1)}%</span></div>`).join('')}</div>
    <p class="note">How often each starter deck wins against the others, with the computer playing both sides. The gold band is 40–60%, where a deck counts as fair. ${F.first ? `The player who goes first wins ${F.first}%.` : ''} Measured ${esc(date(F.measured))}.</p>` : '<p>Not measured yet.</p>'}
  </section>

  <section aria-labelledby="h-skills">
    <h2 id="h-skills">Claude's skills for Shardfall</h2>
    <p class="note" style="margin-top:0">Step-by-step recipes Claude follows for routine jobs, so they're done the same way every time.</p>
    <ul class="skills">${skills.filter(s => s.own).map(s => `<li><b>${esc(s.d)}</b>${md(s.desc)}</li>`).join('')}</ul>
    ${agents.length ? `<p class="note">Helper agent: ${agents.map(a => `<code>${esc(a)}</code>`).join(', ')} (a read-only code health check).</p>` : ''}
    <p class="note">General game-making skills from outside: ${skills.filter(s => !s.own).map(s => esc(s.d)).join(', ')}.</p>
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
<script>
(() => {
  // The live pull-request panel. Everything from the database is set as text, never as HTML.
  const REPO = ${JSON.stringify(REPO)}, TASK = ${JSON.stringify(MERGE_TASK)};
  const $ = id => document.getElementById(id);
  const box = $('pr-live'), msg = $('pr-msg'), checked = $('pr-checked'), refresh = $('pr-refresh'), tally = $('tally-prs');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const num = n => Number.isInteger(Number(n)) && Number(n) > 0 ? Number(n) : null;
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const STATUS = {
    requested: ['wait', 'Merge asked for', 'Waiting for Claude to start.'],
    merging: ['wait', 'Merging', 'Claude is running the tests and merging.'],
    merged: ['done', 'Merged', ''],
    failed: ['bad', 'Not merged', ''],
    closed: ['bad', 'Closed', ''],
  };
  let db = null, mcp = null, canWrite = false, open = null, reqs = {}, confirming = null, busy = false;

  function say(text) { msg.textContent = text || ''; }

  async function wake(text) {
    // Wakes the "Shardfall merge from dashboard" scheduled task. The request is already saved, so
    // if this can't run, the daily run picks it up.
    if (!mcp) return 'later';
    try { await mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id: TASK, text }); return 'now'; }
    catch (e) {
      const c = e && e.code;
      if (c === 'server_unavailable' || c === 'upstream_error' || c === 'cancelled') return 'unsure';
      if (c === 'needs_reauth') return 'reauth';
      if (c === 'server_not_connected' || c === 'selection_required') return 'noconn';
      return 'later';
    }
  }
  const WOKE = {
    now: 'Claude has started. This usually takes 10 to 20 minutes; this list updates by itself.',
    later: "Saved. Claude couldn't be woken from this page, so it will happen at the next daily run (about 6:25 am).",
    unsure: "Saved. Claude may or may not have started; if not, it will happen at the next daily run (about 6:25 am).",
    reauth: 'Saved. Reconnect Claude Code Remote in claude.ai Settings → Connectors to start it from here; otherwise it happens at the next daily run.',
    noconn: 'Saved. The Claude Code Remote connector isn’t available here, so it will happen at the next daily run (about 6:25 am).',
  };

  async function merge(pr) {
    if (busy || !db) return;
    busy = true; confirming = null; render();
    const n = num(pr.number);
    try {
      await db.doc('merge_requests/' + n).set({ number: n, title: String(pr.title || ''), status: 'requested', requested_at: new Date().toISOString() });
    } catch (e) {
      busy = false; render();
      say(e && e.code === 'permission_denied' ? 'Only the owner or an editor can ask for a merge.' : 'Couldn’t save the request. Please try again.');
      return;
    }
    say('Saved. Waking Claude…');
    say(WOKE[await wake('Daniel pressed "Merge to main" for pull request #' + n + ' on the dashboard.')]);
    busy = false; render();
  }
  async function cancel(n) {
    if (busy || !db) return;
    busy = true;
    try { await db.doc('merge_requests/' + n).delete(); say('Request cancelled.'); } catch (e) { say('Couldn’t cancel it (Claude may have started already).'); }
    busy = false; render();
  }

  function card(pr) {
    const n = num(pr.number); if (!n) return null;
    const li = el('li', 'pr');
    const t = el('div', 't');
    const a = el('a', null, '#' + n); a.href = REPO + '/pull/' + n; a.target = '_blank'; a.rel = 'noopener';
    t.append(a, document.createTextNode(String(pr.title || 'Untitled')));
    li.append(t);
    if (pr.why) li.append(el('div', 'why', pr.why));
    const r = reqs[n], s = r && STATUS[r.status];
    const meta = el('div', 'meta');
    if (s) { meta.append(el('span', 'chip ' + s[0], s[1])); meta.append(document.createTextNode(r.status === 'failed' || r.status === 'closed' ? String(r.note || 'Claude will explain in the change history.') : s[2])); }
    else meta.textContent = [pr.opened ? 'Opened ' + pr.opened : '', pr.branch ? 'branch ' + pr.branch : ''].filter(Boolean).join(' · ');
    li.append(meta);
    const act = el('div', 'act');
    const pending = r && (r.status === 'requested' || r.status === 'merging');
    if (!canWrite) act.append(el('span', 'note', 'Only the owner can merge.'));
    else if (confirming === n) {
      const yes = el('button', null, 'Yes, merge #' + n); yes.type = 'button'; yes.onclick = () => merge(pr);
      const no = el('button', 'ghost', 'Not yet'); no.type = 'button'; no.onclick = () => { confirming = null; render(); };
      act.append(yes, no);
    } else if (pending) {
      const b = el('button', null, r.status === 'merging' ? 'Merging…' : 'Asked'); b.type = 'button'; b.disabled = true; act.append(b);
      if (r.status === 'requested') { const c = el('button', 'ghost', 'Cancel'); c.type = 'button'; c.onclick = () => cancel(n); act.append(c); }
    } else {
      const b = el('button', null, r && r.status === 'failed' ? 'Try merging again' : 'Merge to main'); b.type = 'button'; b.disabled = busy;
      b.onclick = () => { confirming = n; say(''); render(); };
      act.append(b);
    }
    li.append(act);
    return li;
  }

  function render() {
    if (!open) return;
    const list = (Array.isArray(open.list) ? open.list : []).filter(p => num(p.number));
    tally.textContent = String(list.length);
    box.replaceChildren();
    if (!list.length) box.append(el('p', null, 'Nothing waiting: every pull request has been merged.'));
    else { const ul = el('ul', 'prs'); list.forEach(p => { const c = card(p); if (c) ul.append(c); }); box.append(ul); }
    const merged = (Array.isArray(open.latest_merged) ? open.latest_merged : []).filter(p => num(p.number)).slice(0, 3);
    if (merged.length) box.append(el('p', 'merged-line', 'Latest merged: ' + merged.map(p => '#' + num(p.number) + ' ' + String(p.title || '') + (p.merged ? ' (' + p.merged + ')' : '')).join(' · ')));
    checked.textContent = open.checked_at ? 'Checked with GitHub ' + when(open.checked_at) + '.' : '';
  }

  (async () => {
    db = window.claude && window.claude.use ? await window.claude.use('db') : null;
    if (!db) { if (!box.querySelector('li')) box.replaceChildren(el('p', null, 'Open this page in claude.ai to see the live list and the Merge button.')); return; }
    const user = await claude.use('user');
    canWrite = user ? !!(await user.canEdit()) : false;
    mcp = await claude.use('mcp');
    const slow = setTimeout(() => { if (!open) box.replaceChildren(el('p', null, 'The live list is taking a while to load. Try reopening the page.')); }, 10000);
    db.doc('prs/open').onSnapshot(s => {
      clearTimeout(slow);
      open = s.exists ? (s.data() || {}) : { list: [] };
      if (!s.exists) checked.textContent = 'Not checked with GitHub yet.';
      render();
    }, () => { clearTimeout(slow); box.replaceChildren(el('p', null, 'Couldn’t load the live list. Try reopening the page.')); });
    db.collection('merge_requests').onSnapshot(q => { reqs = {}; q.docs.forEach(d => { reqs[d.id] = d.data() || {}; }); render(); }, () => {});
    if (canWrite) {
      refresh.hidden = false;
      refresh.onclick = async () => {
        refresh.disabled = true; say('Asking Claude to check GitHub…');
        const r = await wake('Daniel pressed "Check GitHub now" on the dashboard: only refresh the open pull request list (step 5), unless a merge request is waiting.');
        say(r === 'now' ? 'Claude is checking GitHub. The list updates by itself in a few minutes.' : 'Couldn’t wake Claude from here. The list is refreshed at every daily run.');
        setTimeout(() => { refresh.disabled = false; }, 60000);
      };
    }
  })();
})();
</script>
`;
fs.writeFileSync(out, html);
console.log(`Wrote ${out}`);
