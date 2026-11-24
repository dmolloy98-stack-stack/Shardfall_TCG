// The big shard fall: the rules. (The numbers are in data/game_rules.csv; the crystal on the table
// and its info window are in js/board-marks.js.)

// Once a match, at the start of round RULES.shardRound (8), a big shard crashes into the middle of
// the table with RULES.shardHealth health (10 today): S.shard = { health, max }. In Battle, characters
// can attack it like a target (attack(uid, "shard")): it never hits back, Challenge and Tower don't
// guard it, and spells can't touch it. Its health is shared, so whoever deals the blow that breaks
// it claims it: they draw RULES.shardDraw card and get their champion's shard bonus below, or draw
// RULES.shardDrawNoChamp cards with a deck that has no champion. An empty deck is never drawn
// from here (it would lose the match), and a full hand burns the card as usual. The table
// stays cracked for the rest of the match (S.shardFell). S.shardChip counts the damage each player
// has dealt to it (the computer uses it, see evaluate in js/ai.js).
// Each champion's shard bonus is its "shard" rule in CHAMPION_RULES (js/rules-champions.js).

function shardFall() {
  if (!RULES.shardRound || S.noShard || S.over || S.shardFell || S.round !== RULES.shardRound) return;
  S.shardFell = true;
  S.shard = { health: RULES.shardHealth, max: RULES.shardHealth };
  S.shardChip = [0, 0];
  log(`THE BIG SHARD FALLS. It crashes into the middle of the table with ${RULES.shardHealth} health. Whoever breaks it claims it.`);
  emit("shardFall", {});
}

// A character hits the shard. Returns true if that blow broke it.
function hitShard(a, amount) {
  const p = ownerOf(a);
  const dealt = Math.min(amount, S.shard.health);
  S.shard.health -= dealt;
  S.shardChip[p.idx] += dealt;
  emit("shardHit", { uid: a.uid, amount: dealt });
  log(`${a.name} hits the big shard for ${dealt}${S.shard.health > 0 ? ` (${S.shard.health} left)` : ""}.`);
  if (S.shard.health > 0) return false;
  claimShard(p);
  return true;
}

function claimShard(p) {
  S.shard = null;
  const rule = p.champ ? CHAMPION_RULES[p.champ.id]?.shard : null;
  const bonus = rule ? () => rule(p, p.champ) : null;
  const n = bonus ? RULES.shardDraw : RULES.shardDrawNoChamp;
  let drawn = 0;
  for (let k = 0; k < n && p.deck.length; k++) { drawCard(p); drawn++; }
  const extra = bonus ? bonus() : "";
  const got = drawn ? `${drawn} card${drawn > 1 ? "s" : ""}` : "no card (the deck is empty)";
  log(`${p.name} breaks the big shard and claims it: ${got}${extra ? `, and ${extra}` : ""}.`);
  emit("shardClaim", { player: p.idx, drawn, extra });
  S.shardBy = p.idx;
}
