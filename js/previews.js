// Previews: what an attack or a spell would do, shown on its target before you commit, and the
// end-of-turn hint on cards that do something when their turn ends. Each is worked out on a copy of
// the game (simulate), so it always matches the rules. Split out of js/fx.js; loaded right after it.

// ---------------------------------------------------------------------------
// Fight preview: what happens if the selected character attacks this target.
// The attack is played out on a copy of the game (simulate), so the preview always
// matches the real rules, skills and abilities included.
// ---------------------------------------------------------------------------
function fightPreview(aUid, tUid) {
  const a = findChar(aUid)?.c;
  if (!a) return null;
  const t = tUid != null ? findChar(tUid)?.c : null;
  // Swift strikes first; otherwise both characters hit at the same time.
  const first = !t || (isSwift(a) && !isSwift(t));
  const theirs = !!t && isSwift(t) && !isSwift(a);
  return simulate(() => {
    const foe = S.players[1 - S.active];
    const hp0 = foe.health;
    const th0 = t ? rawStats(findChar(tUid).c).h : 0;
    // the tutorial's guard would nudge the player about this make-believe attack
    const guard = actionGuard;
    actionGuard = null;
    let ok;
    try { ok = attack(aUid, tUid ?? null); } finally { actionGuard = guard; }
    if (!ok) return null;
    const alive = uid => !!findChar(uid);
    const tAlive = t && alive(tUid);
    return {
      first, theirs, aDies: !alive(aUid), tDies: !!t && !tAlive,
      lethal: S.over && S.winner === S.active,   // this blow wins the match
      dmg: t ? th0 - (tAlive ? Math.max(0, rawStats(findChar(tUid).c).h) : 0) : hp0 - foe.health,
    };
  });
}
function previewBadge(pv, face) {
  if (!pv) return "";
  if (pv.lethal) return `<div class="fight-badge lethal${face ? " face" : ""}" title="This attack wins the match">☠ LETHAL</div>`;
  if (face) return `<div class="fight-badge face">−${pv.dmg}${pv.aDies ? " · yours falls" : ""}</div>`;
  const [cls, text] = pv.tDies && !pv.aDies ? ["win", "Defeats it"] : pv.tDies ? ["trade", "Both fall"] : pv.aDies ? ["lose", "Yours falls"] : ["even", `−${pv.dmg} ♥`];
  const title = pv.first ? "Swift: your character strikes first" : pv.theirs ? "Swift: this enemy strikes first" : "Both strike at the same time";
  return `<div class="fight-badge ${cls}" title="${title}">${pv.first ? "» " : ""}${text}</div>`;
}

// ---------------------------------------------------------------------------
// Spell previews: while you choose a target, each one shows what will happen to it, played
// out on a copy of the game like the fight preview.
// ---------------------------------------------------------------------------
function targetPreview(ref) {
  const pd = S.pending;
  if (!pd || pd.kind !== "target") return null;
  return simulate(() => {
    const look = () => ref.isPlayer ? { hp: S.players[ref.idx].health } : (() => { const f = findChar(ref.uid); if (!f) return null; const r = rawStats(f.c); return { a: r.a, h: r.h }; })();
    const before = look();
    const g = actionGuard; actionGuard = null;
    try { if (!chooseTarget(ref)) return null; } finally { actionGuard = g; }
    const after = look();
    if (ref.isPlayer) { const d = after.hp - before.hp; return d ? { text: d < 0 ? `−${-d}` : `+${d} ♥`, harm: d < 0 } : null; }
    if (before && !after) return { text: "Falls", harm: true };
    if (!before || !after) return null;
    const da = after.a - before.a, dh = after.h - before.h;
    if (!da && !dh) return null;
    if (!da) return { text: `${dh > 0 ? "+" : "−"}${Math.abs(dh)} ♥`, harm: dh < 0 };
    if (!dh) return { text: `${da > 0 ? "+" : "−"}${Math.abs(da)} ⚔`, harm: da < 0 };
    return { text: `${da >= 0 ? "+" : "−"}${Math.abs(da)}/${dh >= 0 ? "+" : "−"}${Math.abs(dh)}`, harm: da + dh < 0 };
  });
}
const targetBadge = pv => (pv ? `<div class="fight-badge spell-pv ${pv.harm ? "harm" : "help"}">${esc(pv.text)}</div>` : "");

// End-of-turn hint: a card that does something at the end of its owner's turn (or holds
// equipment that does) wears a small hourglass, which glows once that turn's Battle begins.
const endsTurn = c => !!(CARD_FX[c.id]?.endTurn || (c.equipped || []).some(e => CARD_FX[e.id]?.endTurn));
function eotBadge(c, owner) {
  if (!endsTurn(c)) return "";
  const what = [c, ...(c.equipped || [])].filter(x => CARD_FX[x.id]?.endTurn).map(x => `${x.name}: ${x.ability || ""}`).join("  ");
  const soon = owner === S.active && S.phase >= PHASE.BATTLE && !S.over;
  return `<div class="eot-badge${soon ? " soon" : ""}" title="At the end of its owner's turn. ${esc(what)}">⏳</div>`;
}
