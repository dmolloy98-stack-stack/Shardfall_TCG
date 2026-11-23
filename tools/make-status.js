// Writes docs/status.md, "Shardfall at a glance": the one page a new session (or anyone) reads to
// be up to speed. Everything on it is worked out from the project's own files, so it can't drift.
//   node tools/make-status.js              rewrite docs/status.md (keeps the last win rates)
//   node tools/make-status.js --winrates   also measure win rates again (about a minute)
//   node tools/make-status.js --check      say whether docs/status.md is up to date; change nothing
//   node tools/make-status.js --brief      a few lines for the start of a session
// Run it before every pull request (pr-cycle skill). GitHub warns when it is out of date.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const OUT = 'docs/status.md';
const args = process.argv.slice(2);

const dir = root;
eval(require('./rules-code')(dir) + ';globalThis.GAME = { DATA, SCRIPTS, RULES };');
const { DATA, SCRIPTS, RULES } = GAME;

// A section of docs/todo.md by the start of its heading, without the heading.
function todoSection(start) {
  const t = read('docs/todo.md');
  const i = t.search(new RegExp(`^## ${start}`, 'm'));
  if (i < 0) return null;
  const body = t.slice(i).split('\n');
  const head = body[0].replace(/^## /, '');
  const end = body.findIndex((l, k) => k > 0 && /^## /.test(l));
  return { head, lines: body.slice(1, end < 0 ? undefined : end) };
}
// The list items of a section, each joined back into one line (an item can run over several).
function bullets(lines) {
  const out = [];
  for (const l of lines) {
    if (/^(- |\d+\. )/.test(l)) out.push(l.replace(/^(\d+\. )/, '- $1'));
    else if (/^\s+\S/.test(l) && out.length) out[out.length - 1] += ' ' + l.trim();
  }
  return out;
}

function winRateBlock() {
  if (args.includes('--winrates')) {
    const out = execFileSync(process.execPath, ['tools/winrates.js', '20'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
    const lines = out.split('\n').filter(l => /%|turns/.test(l)).map(l => l.trim());
    return [`Measured ${new Date().toISOString().slice(0, 10)} with \`node tools/winrates.js 20\` (20 games per pairing):`, '', '```', ...lines, '```'].join('\n');
  }
  const old = fs.existsSync(path.join(root, OUT)) ? read(OUT) : '';
  const m = old.match(/<!-- winrates -->\n([\s\S]*?)\n<!-- \/winrates -->/);
  return m ? m[1] : 'Not measured yet: run `node tools/make-status.js --winrates`.';
}

function build() {
  const cards = DATA.cardList;
  const count = (list, key) => Object.entries(list.reduce((n, c) => { for (const k of [].concat(key(c))) n[k] = (n[k] || 0) + 1; return n; }, {})).map(([k, v]) => `${k} ${v}`).join(', ');
  const starters = DATA.deckOrder.filter(id => DATA.decks[id].isPlayable);
  const champs = cards.filter(c => c.rarity === 'Unknown');
  const news = DATA.whatsNew.slice(0, 3);
  const fp = read('tools/test-all.js').match(/const EXPECTED = \{ ai: (-?\d+), rand: (-?\d+) \};/);
  const tests = (read('tools/test-all.js').match(/for \(const t of \[([^\]]*)\]\)/) || [, ''])[1].replace(/'/g, '').split(',').map(s => s.trim()).filter(Boolean);
  // Skills installed from outside (skills-lock.json) are general game-making skills, not Shardfall's own.
  const outside = new Set(Object.keys(JSON.parse(read('skills-lock.json')).skills || {}));
  const skillDirs = fs.readdirSync(path.join(root, '.claude/skills')).filter(d => fs.existsSync(path.join(root, '.claude/skills', d, 'SKILL.md'))).sort();
  const skill = d => {
    const t = read(`.claude/skills/${d}/SKILL.md`);
    const m = t.match(/description:\s*>?\s*\n?([\s\S]*?)\n---/);
    const desc = (m ? m[1] : '').replace(/\s+/g, ' ').trim();
    return { d, desc, own: !outside.has(d) };
  };
  const skills = skillDirs.map(skill);
  const waiting = todoSection('Waiting on the owner');
  const round = todoSection('Round');
  const docs = fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).sort();
  const tools = fs.readdirSync(path.join(root, 'tools')).filter(f => /\.(js|py)$/.test(f)).length;
  const rulesFiles = JSON.parse(read('js/data.js').match(/const GAME_SCRIPTS = (\[[^\]]*\])/)[1]);

  return `# Shardfall at a glance

Written by \`node tools/make-status.js\` from the project's own files: don't edit it by hand.
Read this first in a new session; then CLAUDE.md, and the files it points to as the task needs.

## Version
${DATA.version}: ${news.map(u => `**Update ${u.update}** (${u.date}): ${u.changes.join(' ')}`).join('\n\n')}

## Waiting on the owner
${waiting ? bullets(waiting.lines).join('\n') || '(nothing)' : '(no "Waiting on the owner" section in docs/todo.md)'}

## Being built now
${round ? `**${round.head}**\n\n${bullets(round.lines).join('\n')}` : 'Nothing: no round is open in docs/todo.md.'}

## The game in numbers
- **Cards:** ${cards.length} (${count(cards, c => c.type)}).
- **By fracture:** ${count(cards, c => c.groups || [c.group])}.
- **Champions:** ${champs.map(c => c.name).join(', ')}.
- **Starter decks:** ${starters.map(id => `${DATA.decks[id].name} (${DATA.decks[id].faction})`).join(', ')}.
- **Ability words:** ${cards.filter(c => c.effect).length} cards have an Effect; only ${Object.keys(SCRIPTS).length} use one-off code (${Object.keys(SCRIPTS).join(', ')}).
- **Rules:** a match starts with ${RULES.startingHealth} health and ${RULES.startingHand} cards; the big shard falls in round ${RULES.shardRound}.

## Balance
<!-- winrates -->
${winRateBlock()}
<!-- /winrates -->

## Safety nets
- \`node tools/test-all.js\` must end EVERYTHING PASSED. It runs: ${tests.join(', ')}, every Effect explained, and the automatic games.
- Play fingerprints: computer games (ai 2) **${fp[1]}**, random games (rand 300) **${fp[2]}**. They change only when play is meant to change (\`node tools/update-expected.js --write\`).
- On every pull request GitHub also runs the balance check, screen tests, picture comparison, speed budget and accessibility check (\`ci-check\` skill to read them).

## Code
- ${rulesFiles.length} game scripts, loaded in this order: ${rulesFiles.map(f => f.replace('js/', '')).join(', ')}.
- ${tools} tools in \`tools/\` (the README's file table lists them).
- Map: \`docs/code-map.md\` (where things are); why: \`docs/how-it-was-built.md\`.

## Skills (\`.claude/skills/\`)
${skills.filter(s => s.own).map(s => `- **${s.d}**: ${s.desc.split('. ')[0].replace(/\.$/, '')}.`).join('\n')}

General game-making skills, not Shardfall's own: ${skills.filter(s => !s.own).map(s => s.d).join(', ')}.

## Documents (\`docs/\`)
${docs.map(f => `- \`docs/${f}\``).join('\n')}
`;
}

// The facts both pages use (this one and tools/make-dashboard.js).
function facts() {
  const fp = read('tools/test-all.js').match(/const EXPECTED = \{ ai: (-?\d+), rand: (-?\d+) \};/);
  const block = winRateBlock();
  const rates = [...block.matchAll(/^(\w+_starter)\s+([\d.]+)%/gm)].map(m => ({ deck: DATA.decks[m[1]]?.name || m[1], fracture: DATA.decks[m[1]]?.faction, rate: Number(m[2]) }));
  const measured = (block.match(/Measured (\d{4}-\d\d-\d\d)/) || [])[1] || null;
  const first = (block.match(/First player wins: ([\d.]+)%/) || [])[1];
  const sectionNames = (read('docs/todo.md').match(/^## .+$/gm) || []).map(h => h.slice(3));
  return { DATA, SCRIPTS, RULES, fp, rates, measured, first, waiting: todoSection('Waiting on the owner'), round: todoSection('Round'), offered: todoSection('Offered, not picked yet'), sectionNames, bullets, todoSection };
}
module.exports = { facts };
if (require.main !== module) return;

const now = build();
if (args.includes('--check')) {
  const old = fs.existsSync(path.join(root, OUT)) ? read(OUT) : '';
  if (old === now) { console.log('docs/status.md is up to date'); process.exit(0); }
  console.log('docs/status.md is out of date: run node tools/make-status.js');
  process.exit(1);
}
if (args.includes('--brief')) {
  const old = fs.existsSync(path.join(root, OUT)) ? read(OUT) : '';
  const waiting = todoSection('Waiting on the owner'), round = todoSection('Round');
  console.log(`Shardfall: ${DATA.version}. Read docs/status.md first (it is ${old === now ? 'up to date' : 'OUT OF DATE: run node tools/make-status.js'}).`);
  if (round) console.log(`Being built: ${round.head}`);
  if (waiting) console.log(`Waiting on the owner: ${bullets(waiting.lines).map(l => (l.match(/\*\*(.+?)\*\*/) || [, l])[1]).join('; ')}`);
  process.exit(0);
}
fs.writeFileSync(path.join(root, OUT), now);
console.log(`Wrote ${OUT}`);
