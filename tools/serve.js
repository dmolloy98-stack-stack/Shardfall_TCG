// Lets a Playwright browser load the game straight from disk at http://game.local/,
// with no web server (cloud sessions can't start one). Used by browser checks:
//   const serve = require('/home/user/Shardfall_TCG/tools/serve');
//   const ctx = await browser.newContext(...); await serve(ctx);
//   await page.goto('http://game.local/#menu');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
module.exports = async ctx => {
  await ctx.route('http://game.local/**', route => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
};
