// Packs the whole game into one self-contained HTML file that plays without a server:
// open it straight from a download folder, a USB stick or a backup. The CSV data and the
// game scripts are embedded, and fetch() is pointed at the embedded copies.
//
//   node tools/build-single.js [out.html]      (default: shardfall-single.html)
//   node tools/build-single.js --page out.html  page body only, for a claude.ai artifact,
//                                               whose host adds the doctype, head and body

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const args = process.argv.slice(2);
const pageOnly = args.includes("--page");
const out = args.find(a => a !== "--page") || path.join(root, "shardfall-single.html");

// Everything data.js fetches: the CSV tables and the scripts in GAME_SCRIPTS.
const dataJs = read("js/data.js");
const list = name => JSON.parse(dataJs.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1]);
const files = {};
for (const n of list("DATA_FILES")) files[`data/${n}.csv`] = read(`data/${n}.csv`);
for (const s of list("GAME_SCRIPTS")) files[s] = read(s);

// Text inside <script> or <style> must not close the tag early.
const safe = s => s.replace(/<\/(script|style)/gi, "<\\/$1");

const shim = `<script>
const EMBEDDED_FILES = ${safe(JSON.stringify(files))};
const realFetch = window.fetch.bind(window);
window.fetch = (url, opts) => {
  const key = String(url).split("?")[0];
  return key in EMBEDDED_FILES ? Promise.resolve(new Response(EMBEDDED_FILES[key])) : realFetch(url, opts);
};
</script>`;

let html = read("index.html");
const swap = (pattern, replacement) => {
  if (!pattern.test(html)) throw new Error(`index.html no longer matches ${pattern}`);
  html = html.replace(pattern, () => replacement);
};
swap(/<script>document\.write\('<link rel="stylesheet" href="css\/style\.css[^\n]*<\/script>/, `<style>\n${safe(read("css/style.css"))}\n</style>`);
swap(/<script>document\.write\('<script src="js\/data\.js[^\n]*<\/script>/, `${shim}\n<script>\n${safe(dataJs)}\n</script>`);
swap(/<script>document\.write\('<link rel="stylesheet" href="css\/skins\.css[^\n]*<\/script>/, `<style>\n${safe(read("css/skins.css"))}\n</style>`);
swap(/<noscript><link rel="stylesheet" href="css\/style\.css"><link rel="stylesheet" href="css\/skins\.css"><\/noscript>\n/, "");
if (pageOnly) {
  for (const tag of [/^<!doctype html>\n/i, /^<html[^>]*>\n/m, /^<head>\n/m, /^<meta charset[^>]*>\n/m,
    /^<meta name="viewport"[^>]*>\n/m, /^<\/head>\n/m, /^<body>\n/m, /^<\/body>\n/m, /^<\/html>\n?/m]) swap(tag, "");
}

fs.writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
