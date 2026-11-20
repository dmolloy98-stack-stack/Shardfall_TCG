// Everything Shardfall keeps in the player's browser, in one place: the list of what is saved,
// the save version and its upgrade steps, and the save code (copy your progress to another
// device). Loaded first (GAME_SCRIPTS in js/data.js), because the other scripts read PREFS as
// they load.

// Every key the game saves, as "shardfall.<key>" in the browser's storage. A new saved key must
// be added here (tools/saves-test.js checks), so it is upgraded and carried by the save code.
const SAVE_KEYS = {
  // Progress: what a player would hate to lose.
  campaign: "campaign stages won",
  decks: "custom decks from the deck builder",
  mastery: "deck mastery points",
  record: "each deck's wins and losses",
  wins: "wins by deck, for the end screen",
  lore: "card stories unlocked",
  trophies: "trophies won",
  tcount: "counts toward trophies",
  welcomed: "has seen the welcome box",
  builderWalk: "has seen the deck builder walkthrough",
  // Choices and settings.
  deck: "the deck picked on the menu",
  opp: "the opponent deck picked on the menu",
  hints: "Settings: beginner hints",
  showLog: "Settings: battle log on the table",
  aiSpeed: "Settings: computer speed",
  heavyFx: "Settings: heavy effects",
  autoFlow: "Settings: draw and skip by themselves",
  passCheck: "Settings: ask before passing early",
  board: "Settings: board look",
  looks: "which board-look update the board choice belongs to",
};

// Saved preferences. Storage can be unavailable (private windows), so every read and write is
// allowed to fail.
const PREFS = {
  get(key, fallback) {
    try { const v = localStorage.getItem("shardfall." + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    if (!SAVE_KEYS[key]) console.warn(`Saving "${key}", which is not in SAVE_KEYS (js/saves.js)`);
    try { localStorage.setItem("shardfall." + key, JSON.stringify(value)); } catch { /* not saved */ }
  },
};

// ---------------------------------------------------------------------------
// Save version and upgrades
// ---------------------------------------------------------------------------
// The version of the saved data's shape. When an update changes how something is saved (renames
// a key, changes a card id inside saved decks, changes a value's form), raise SAVE_VERSION and add
// a step to SAVE_UPGRADES that turns the old form into the new one. Each step runs once, in order,
// the first time a player opens the updated game.
const SAVE_VERSION = 1;
const SAVE_UPGRADES = {
  1: () => { /* the version label itself: nothing to change */ },
};

function saveVersion() {
  const v = PREFS.get("saveVersion", 0);
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

// Brings saved data up to SAVE_VERSION. A save from a newer version of the game (an old copy of
// the page still open somewhere) is left untouched rather than turned back.
function upgradeSaves() {
  let v = saveVersion();
  if (v >= SAVE_VERSION) return v;
  while (v < SAVE_VERSION) {
    v++;
    try { SAVE_UPGRADES[v]?.(); } catch (e) { console.warn(`Save upgrade to version ${v} failed: ${e.message}`); }
  }
  try { localStorage.setItem("shardfall.saveVersion", JSON.stringify(v)); } catch { /* not saved */ }
  return v;
}
upgradeSaves();

// ---------------------------------------------------------------------------
// Save code: copy your progress and settings as one line of text, and load it on another device
// ---------------------------------------------------------------------------
const SAVE_CODE_PREFIX = "SHARDFALL1:";

function toBase64(text) {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
const fromBase64 = code => new TextDecoder().decode(Uint8Array.from(atob(code), ch => ch.charCodeAt(0)));

function exportSave() {
  const data = {};
  for (const key of Object.keys(SAVE_KEYS)) { const v = PREFS.get(key); if (v !== undefined) data[key] = v; }
  return SAVE_CODE_PREFIX + toBase64(JSON.stringify({ v: saveVersion(), data }));
}

// Reads a save code. Returns { data, version } or { error } in plain words; changes nothing.
function readSaveCode(code) {
  const text = String(code || "").replace(/\s+/g, "");
  if (!text.startsWith(SAVE_CODE_PREFIX)) return { error: "That isn't a Shardfall save code. It should start with SHARDFALL1:" };
  let save;
  try { save = JSON.parse(fromBase64(text.slice(SAVE_CODE_PREFIX.length))); } catch { return { error: "That save code is damaged. Copy it again, all of it." }; }
  if (!save || typeof save.data !== "object" || !Number.isInteger(save.v)) return { error: "That save code is damaged. Copy it again, all of it." };
  if (save.v > SAVE_VERSION) return { error: "That save code comes from a newer version of Shardfall. Refresh this page to update it, then try again." };
  const data = {};
  for (const [key, value] of Object.entries(save.data)) if (SAVE_KEYS[key]) data[key] = value;
  return { data, version: save.v };
}

// Replaces this device's progress and settings with a save code's. Returns an error or null.
function importSave(code) {
  const r = readSaveCode(code);
  if (r.error) return r.error;
  try {
    for (const key of Object.keys(SAVE_KEYS)) localStorage.removeItem("shardfall." + key);
    for (const [key, value] of Object.entries(r.data)) localStorage.setItem("shardfall." + key, JSON.stringify(value));
    localStorage.setItem("shardfall.saveVersion", JSON.stringify(r.version));
  } catch { return "This browser won't let Shardfall save (a private window?), so the code can't be loaded here."; }
  upgradeSaves();
  return null;
}
