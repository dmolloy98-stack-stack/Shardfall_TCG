// Small page helpers every screen file uses, loaded before all of them (GAME_SCRIPTS in js/data.js),
// so any screen file can use them, even while it loads.
//   $("#board")      the first element matching a CSS selector
//   byId("modal")    an element by its id
//   esc(text)        text made safe to put inside HTML (names, card text, anything a player typed)
const $ = sel => document.querySelector(sel);
const byId = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
