// Starts the game. Loaded last, once every other script is in place.

// ---------------------------------------------------------------------------
// Boot. Keeps an in-progress game across live updates of the hosted page.
// ---------------------------------------------------------------------------
window.claude?.hot?.snapshot?.(() => ({ S: U.tutorial ? null : S, screen: U.screen, deckId: U.deckId, mode: U.mode }));
window.shardfallStarted = true;
function boot(saved) {
  if (saved?.deckId) U.deckId = saved.deckId;
  if (saved?.mode) U.mode = saved.mode;
  if (saved?.S) { S = saved.S; U.ended = S.over; showScreen(saved.screen === "almanac" ? "almanac" : "game"); return; }
  showScreen("menu");
  if (location.hash === "#tutorial") startTutorial();
  else if (location.hash === "#how-to-play") showGuide();
  // the cold open plays every time (js/intro.js), except from a #menu link; new players
  // are then offered the tutorial
  else if (location.hash === "#menu") { if (!PREFS.get("welcomed", false)) showWelcome(); }
  else playIntro(() => { if (!PREFS.get("welcomed", false)) showWelcome(); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
