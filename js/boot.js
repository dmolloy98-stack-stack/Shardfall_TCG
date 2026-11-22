// Starts the game. Loaded last, once every other script is in place.

// ---------------------------------------------------------------------------
// Boot. Keeps an in-progress game across live updates of the hosted page.
// ---------------------------------------------------------------------------
window.claude?.hot?.snapshot?.(() => ({ S: U.tutorial ? null : S, screen: U.screen, deckId: U.deckId, mode: U.mode }));
window.shardfallStarted = true;
// The offline helper (sw.js): keeps a copy of the game so it starts with no internet. Only on the
// real site (or a test server on this computer), never in the one-file or claude.ai copies.
if ("serviceWorker" in navigator && typeof EMBEDDED_FILES === "undefined" && /(^|\.)github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname)) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* no offline copy; the game works as usual */ });
}
function boot(saved) {
  fillWords();   // the menu's words from data/ui_text.csv
  if (saved?.deckId) U.deckId = saved.deckId;
  if (saved?.mode) U.mode = saved.mode;
  if (saved?.S) { S = { ...baseState(), ...saved.S }; U.ended = S.over; showScreen(saved.screen === "almanac" ? "almanac" : "game"); return; }
  showScreen("menu");
  if (location.hash === "#tutorial") startTutorial();
  else if (location.hash === "#how-to-play") showGuide();
  // the cold open plays every time (js/intro.js), except from a #menu link; new players
  // are then offered the tutorial
  else if (location.hash === "#menu") { if (!PREFS.get("welcomed", false)) showWelcome(); }
  else playIntro(() => { if (!PREFS.get("welcomed", false)) showWelcome(); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
