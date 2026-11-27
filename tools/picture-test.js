// Picture comparison: photographs the same scenes from an older version of the game and from this
// one, on the same computer, and flags every scene that looks different, with a before / after /
// difference picture side by side.
//   node tools/picture-test.js <older game folder> [output folder]
// The older folder is usually main: git worktree add /tmp/main origin/main
// Output: <output>/report.html (open it in a browser) and the pictures; the last line says
// "NO PICTURE CHANGES" or "N SCENES LOOK DIFFERENT". GitHub runs this on every pull request and
// attaches the report to the run ("picture-changes"). A change is a warning, never a failure:
// many look changes are on purpose.
// To keep pictures steady, animations are switched off, the falling-shard background is hidden,
// and every match uses a fixed seed.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const serve = require('./serve');
const here = path.join(__dirname, '..');
const before = process.argv[2] && path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || 'picture-changes');
if (!before || !fs.existsSync(path.join(before, 'index.html'))) { console.log('Usage: node tools/picture-test.js <older game folder> [output folder]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const SIZES = { desk: { viewport: { width: 1280, height: 800 } }, phone: devices['iPhone 15 Pro Max landscape'] };
const STILL = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  #storm, .fx-layer, #fx-layer, #banner { display: none !important; }`;

// Each scene: a name and the steps that set it up, run inside the page.
const match = r => `newGame({ deckId: 'zombie_starter', opponentDeckId: 'fighter_starter', mode: 'ai', seed: 7 });
  U.campaign = null; U.curtain = false; U.ended = false; U.undo = [];
  S.players[0].isAI = true; let n = 0;
  while (!S.over && S.round < ${r} && n++ < 600) aiDecide().run();
  S.players[0].isAI = false; showScreen('game'); render();`;
const SCENES = [
  ['menu', ''],
  ['settings', 'showSettings()'],
  ['whats-new', 'showWhatsNew()'],
  ['almanac', "U.almanacTab = 'cards'; showScreen('almanac'); renderAlmanac()"],
  ['card-detail', "showDetail(DATA.cardsById.simple_farmer)"],
  ['campaign', 'showCampaign()'],
  ['match', match(4)],
  ['match-late', match(9)],
  ['end-screen', match(4) + " S.over = true; S.winner = 0; U.ended = true; render();"],
  // the other board skins (css/skins.css), on the same match
  ...['glass', 'altar', 'battlefield', 'warmap'].map(k => [`match-${k}`, match(4) + ` setSkin('${k}'); render();`]),
];

async function shoot(browser, root, size, scene) {
  const ctx = await browser.newContext({ ...SIZES[size], reducedMotion: 'reduce' });
  await serve(ctx, root);
  const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem('shardfall.welcomed', 'true'); localStorage.setItem('shardfall.hints', 'false'); localStorage.setItem('shardfall.heavyFx', 'false'); } catch {} });
  await pg.goto('http://game.local/#menu');
  await pg.waitForSelector('#btn-campaign', { state: 'attached' });
  await pg.addStyleTag({ content: STILL });
  let error = null;
  try { if (scene[1]) await pg.evaluate(scene[1]); } catch (e) { error = e.message.split('\n')[0]; }
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(400);
  const png = await pg.screenshot();
  await ctx.close();
  return { png, error };
}

// Compares two pictures in the browser (no extra libraries): how many pixels differ, and a
// picture of the differences in red.
async function compare(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const get = img => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = get(ia), db = get(ib);
    const out = new OffscreenCanvas(w, h), ox = out.getContext('2d'), od = ox.createImageData(w, h);
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      const grey = (db[i] + db[i + 1] + db[i + 2]) / 12;
      if (d > 24) { changed++; od.data.set([255, 40, 40, 255], i); } else od.data.set([grey, grey, grey, 255], i);
    }
    ox.putImageData(od, 0, 0);
    const blob = await out.convertToBlob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return { share: changed / (w * h), diff: btoa(s), sizeChanged: ia.width !== ib.width || ia.height !== ib.height };
  }, [a.toString('base64'), b.toString('base64')]);
}

(async () => {
  const browser = await chromium.launch();
  const cmp = await (await browser.newContext()).newPage();
  const rows = [];
  for (const size of Object.keys(SIZES)) {
    for (const scene of SCENES) {
      const name = `${size}-${scene[0]}`;
      const old = await shoot(browser, before, size, scene);
      const now = await shoot(browser, here, size, scene);
      const r = await compare(cmp, old.png, now.png);
      const changed = r.share > 0.001 || r.sizeChanged;   // more than 0.1% of the picture
      if (changed) {
        fs.writeFileSync(path.join(outDir, `${name}-before.png`), old.png);
        fs.writeFileSync(path.join(outDir, `${name}-after.png`), now.png);
        fs.writeFileSync(path.join(outDir, `${name}-diff.png`), Buffer.from(r.diff, 'base64'));
      }
      const note = now.error ? ` (the scene could not be set up: ${now.error})` : '';
      rows.push({ name, changed, share: r.share, note });
      console.log(`${changed ? 'CHANGED' : 'same   '}  ${name}${changed ? `  ${(r.share * 100).toFixed(1)}% of the picture` : ''}${note}`);
    }
  }
  await browser.close();
  const changed = rows.filter(r => r.changed);
  const html = `<!doctype html><meta charset="utf-8"><title>Picture changes</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px}h2{margin:28px 0 8px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}img{width:100%;border:1px solid #444}small{color:#aaa}</style>
<h1>Picture changes</h1><p>${changed.length ? `${changed.length} scene(s) look different. Left: before. Middle: after. Right: the differences in red.` : 'Every scene looks the same as before.'}</p>
${changed.map(r => `<h2>${r.name} <small>${(r.share * 100).toFixed(1)}% of the picture${r.note}</small></h2><div class="row"><img src="${r.name}-before.png"><img src="${r.name}-after.png"><img src="${r.name}-diff.png"></div>`).join('')}`;
  fs.writeFileSync(path.join(outDir, 'report.html'), html);
  console.log(`\nReport: ${path.join(outDir, 'report.html')}`);
  if (process.env.GITHUB_ACTIONS && changed.length) console.log(`::warning title=Picture changes::${changed.map(r => r.name).join(', ')} look different. Open the run's "picture-changes" file and its report.html to see before and after.`);
  console.log(changed.length ? `${changed.length} SCENE${changed.length > 1 ? 'S LOOK' : ' LOOKS'} DIFFERENT` : 'NO PICTURE CHANGES');
})();
