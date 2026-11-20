// Shardfall's offline helper (a "service worker"). After one visit the browser keeps a copy of the
// game, so it starts with no internet, and on a slow connection it doesn't wait long for the
// network. Registered by js/boot.js on the real site only (not the claude.ai copy).
//
// How it answers each request for a game file:
//   1. Ask the network, as usual, so an update shows up straight away.
//   2. If the network fails, or takes longer than NETWORK_WAIT_MS, use the saved copy.
//   3. Every file that arrives from the network replaces its saved copy.
// The list of files to save on the first visit is read from js/data.js (DATA_FILES and
// GAME_SCRIPTS), so a new script or table is saved without editing this file.
const CACHE = "shardfall-v1";
const NETWORK_WAIT_MS = 2000;
const PAGES = ["./", "index.html", "guide.html", "css/style.css", "js/data.js", "manifest.webmanifest"];

async function gameFiles() {
  const text = await (await fetch("js/data.js", { cache: "no-cache" })).text();
  const list = name => JSON.parse(text.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1]);
  return [...PAGES, ...list("DATA_FILES").map(n => `data/${n}.csv`), ...list("GAME_SCRIPTS")];
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file must not stop the rest from being saved.
    await Promise.all((await gameFiles()).map(f => cache.add(new Request(f, { cache: "no-cache" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Fonts from Google never change at the same address: saved copy first.
const isFont = url => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isFont(url)) { event.respondWith(fontFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function fontFirst(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // The stylesheet is asked for with "?v=<time>" so browsers never mix old and new; saved copies
  // are matched without it.
  const saved = () => cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req.url.split("?")[0], res.clone());
    return res;
  });
  network.catch(() => {});   // a late failure after the saved copy was used is not an error
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return (await saved()) || (await network);   // slow network: the saved copy if there is one
  } catch {
    const copy = await saved();
    if (copy) return copy;
    throw new Error("offline, and this file was never saved");
  }
}
