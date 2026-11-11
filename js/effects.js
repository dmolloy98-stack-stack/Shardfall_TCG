// Card effects as data.
// What a card does is written in the Effect column of data/cards.csv, using a small set of
// actions (damage, buff, levelUp, fetch, summon...). This file reads that text once when the
// game loads, checks it, and turns it into the EFFECTS and hooks the engine runs. A new card
// built from these actions needs no new code. data/README.md lists every action with examples.
//
// The Effect text is one or more clauses separated by ";". Each clause says when it happens
// and what happens, with the actions separated by ",":
//     play: target character harm, damage target 1+boost
//     endTurn: buff self 0 2
//     cost: set 1 if #allies.Monkey>=3
// Any action may end with "if <number test>", for example "if #allies.Monkey>=3".
//
// A few cards change the core rules (IP Man, The Man Ape, Soul Shepard...). That logic stays
// in the engine as a named rule, and the card's Effect switches it on: "rule: redirect".
// One-off abilities are in SCRIPTS below, and the Effect points to them: "script messenger".

// When a clause happens.
const WHEN = {
  play: "When the spell is cast, the Signal character enters, the area is played, or the ability is used",
  enter: "When the character enters the field",
  endTurn: "At the end of its owner's turn (for equipment: of the holder's owner)",
  attack: "When the character attacks",
  hurt: "When the character takes damage and survives",
  reanimate: "When the character comes back through Reanimate",
  allyLevelUp: "When another of its owner's characters levels up",
  gearEnters: "When equipment enters its owner's field",
  maxLevel: "When the character reaches its last level",
  cost: "Changes the card's mana cost",
  aura: "A lasting bonus while the character or area is on the field: stats, or a skill",
  grants: "Equipment: the holder has this skill",
  rule: "Switches on one of the engine's special rules for this card (see RULE_WORDS)",
};

// The special rules a "rule:" clause can switch on, and what must follow each name.
// The rules themselves are in js/engine.js; search there for the name in quotes.
const RULE_WORDS = {
  lord: "<Faction> <n>: while on the field, that faction's cards get +n, its spells +n, and curses can't target its cards",
  redirect: ": once per turn, the first damage to it or its player goes to an enemy of its player's choice",
  shepherd: "<Faction>: when another card of that faction dies, absorb its stats or return it to hand",
  defend: "<n>: +n to all stats while defending",
  sacrifice: "<Faction>: after its owner's Battle phase, may sacrifice one of that faction for +1 to all stats and a full heal",
  freeEquip: ": its owner's equipment costs nothing",
  equipCostMax: "<n>: equipping this character costs at most n",
  levelGain: "<attack> <health>: what each Level Up gives it",
  levelCap: "<n or none>: how many times it can Level Up",
  survive: "<fights> <CardID>: transforms into that card after living through that many fights",
  activate: ": an area whose play effect can be used once in each of its owner's Setup phases",
  strike: ": equipment whose play effect its holder can use once per Battle phase",
  teach: "<Skill>: equipment that gives its holder the skill for good",
};

// ---------------------------------------------------------------------------
// Reading the text
// ---------------------------------------------------------------------------
// Split on a separator, but not inside "quotes".
function splitOutside(text, sep) {
  const out = []; let cur = "", q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const words = text => (text.match(/"[^"]*"|\S+/g) || []).map(w => w.replace(/^"|"$/g, ""));

// Who an action affects. "allies.Monkey.other" = your Monkey characters except this card.
const SELECTOR_BASES = ["self", "target", "holder", "allies", "enemies", "everyone", "me", "foe", "gear"];
function parseSelector(text, where) {
  const [base, ...filters] = text.split(".");
  if (!SELECTOR_BASES.includes(base)) throw new Error(`${where}: "${text}" is not someone an action can affect. Use one of: ${SELECTOR_BASES.join(", ")}.`);
  return { base, filters };
}
function selectorFilter(f) {
  if (f === "other") return (c, ctx) => c !== ctx.card;
  if (f === "leveler") return c => hasSkill(c, "Level Up");
  if (f === "levels") return c => c.keptLevels > 0;
  if (f === "enemy") return (c, ctx) => c.owner !== ctx.owner.idx;
  if (f === "mine") return (c, ctx) => c.owner === ctx.owner.idx;
  if (f === "strongest") return null;   // handled after filtering
  if (DATA.factions[f]) return c => c.group === f;    // a faction: allies.Monkey
  if (/^[A-Z]/.test(f)) return c => c.race === f;     // a race: allies.Undead (the Race column)
  return c => c.id === f;                             // a CardID
}
function select(sel, ctx) {
  let list;
  switch (sel.base) {
    case "self": list = ctx.card ? [ctx.card] : []; break;
    case "target": list = ctx.target ? [ctx.target] : []; break;
    case "holder": list = ctx.holder ? [ctx.holder] : []; break;
    case "allies": list = ctx.owner.field.chars.slice(); break;
    case "enemies": list = foeOf(ctx.owner).field.chars.slice(); break;
    case "everyone": list = allChars(); break;
    case "me": return [ctx.owner];
    case "foe": return [foeOf(ctx.owner)];
    case "gear": return S.players.flatMap(p => p.field.equips);
  }
  for (const f of sel.filters) { const fn = selectorFilter(f); if (fn) list = list.filter(c => !c.isPlayer && fn(c, ctx)); }
  if (sel.filters.includes("strongest") && list.length) list = [list.reduce((a, b) => (stats(b).a > stats(a).a ? b : a))];
  return list;
}

// Numbers: whole numbers and these words, joined with + or -:
//   #allies.Monkey      how many there are       #allies.Monkey>=3   1 if at least 3, else 0
//   boost               The Simplistic's +3 on Simple spells
//   ripen               1 after Ripen was cast   amount   the damage being redirected (IP Man)
function parseNumber(text, where) {
  const terms = text.replace(/-/g, "+-").split("+").filter(Boolean).map(t => {
    const neg = t.startsWith("-"); const body = neg ? t.slice(1) : t;
    let fn;
    if (/^\d+$/.test(body)) { const n = Number(body); fn = () => n; }
    else if (body === "boost") fn = ctx => spellBoost(ctx);
    else if (body === "ripen") fn = ctx => (ctx.owner.ripen ? 1 : 0);
    else if (body === "amount") fn = ctx => ctx.amount || 0;
    else if (body.startsWith("#")) {
      const m = body.slice(1).match(/^([^<>=]+?)(>=(\d+))?$/);
      if (!m) throw new Error(`${where}: "${t}" is not a number.`);
      const sel = parseSelector(m[1], where), min = m[3] != null ? Number(m[3]) : null;
      fn = ctx => { const n = select(sel, ctx).length; return min == null ? n : n >= min ? 1 : 0; };
    } else throw new Error(`${where}: "${t}" is not a number.`);
    return neg ? ctx => -fn(ctx) : fn;
  });
  if (!terms.length) throw new Error(`${where}: a number is missing.`);
  return ctx => terms.reduce((n, f) => n + f(ctx), 0);
}

// Each action: what it needs (s = selector, n = number, w = word, c = CardID) and what it does.
const chars = list => list.filter(x => x && !x.isPlayer && !S.players.includes(x));
const players = list => list.filter(x => x && (x.isPlayer || S.players.includes(x))).map(x => (x.isPlayer ? S.players[x.idx] : x));
const ACTIONS = {
  // damage and stats
  damage: ["sn", (ctx, who, n) => {
    const amt = n(ctx), list = who(ctx);
    for (const c of chars(list)) dealDamageToCharacter(c, amt);
    for (const p of players(list)) dealDamageToPlayer(p, amt);
  }],
  damageAll: ["n", (ctx, n) => damageEverything(n(ctx))],
  buff: ["snn", (ctx, who, a, h) => { for (const c of chars(who(ctx))) { c.attack += a(ctx); c.currentHealth += h(ctx); } }],
  shrink: ["sn", (ctx, who, n) => {   // loses attack and health
    const amt = n(ctx);
    for (const c of chars(who(ctx))) { c.attack -= amt; c.currentHealth -= amt; emit("charDamage", { uid: c.uid, amount: amt }); checkDeath(c); }
  }],
  setStats: ["snn", (ctx, who, a, h) => { for (const c of chars(who(ctx))) { c.attack = a(ctx); c.currentHealth = h(ctx); } }],
  loseAttack: ["sn", (ctx, who, n) => { for (const c of chars(who(ctx))) c.attack = Math.max(0, c.attack - n(ctx)); }],
  grow: ["sn", (ctx, who, n) => { for (const c of chars(who(ctx))) { c.currentHealth += n(ctx); c.baseHealth += n(ctx); } }],
  levelUp: ["sn", (ctx, who, n) => { for (const c of chars(who(ctx))) levelUp(c, n(ctx)); }],
  destroy: ["s", (ctx, who) => { for (const c of chars(who(ctx))) destroyCharacter(c); }],
  destroyArea: ["s", (ctx, who) => {
    for (const a of who(ctx)) { const f = findArea(a.uid); if (f) { f.p.field.areas.splice(f.i, 1); f.p.grave.push(a); log(`${a.name} was destroyed.`); } }
    sweepDeaths();
  }],
  // skills
  grant: ["sww?", (ctx, who, skill, temp) => {
    for (const c of chars(who(ctx))) {
      if (hasSkill(c, skill)) continue;
      c.skills.push(skill);
      if (skill === "Reanimate") c.reanimated = false;
      if (temp === "temp") (c.tempSkills = c.tempSkills || []).push(skill);
    }
  }],
  removeSkill: ["sw", (ctx, who, skill) => { for (const c of chars(who(ctx))) removeSkill(c, skill); }],
  disable: ["s", (ctx, who) => {
    for (const c of chars(who(ctx))) { c.skills = []; c.disabled = true; c.ability = ""; updateRally(ownerOf(c)); emit("text", { uid: c.uid, text: "DISABLED", color: "#c9c9c9" }); }
    sweepDeaths();
  }],
  convert: ["sw?", (ctx, who, extra) => {
    for (const c of chars(who(ctx))) convertToZombie(ctx, c, extra === "reanimate");
    // Changing faction or side can take away a bonus that was keeping a character alive
    // (The Simplistic's +3, an area). Without this check it stayed on the table at 0 health.
    sweepDeaths();
  }],
  transform: ["sc", (ctx, who, id) => { for (const c of chars(who(ctx))) transformCharacter(c, id); }],
  // players and cards
  heal: ["sn", (ctx, who, n) => { for (const p of players(who(ctx))) healPlayer(p, n(ctx)); }],
  maxMana: ["sn", (ctx, who, n) => {
    for (const p of players(who(ctx))) { const k = n(ctx); p.manaMax = Math.max(0, p.manaMax + k); p.mana = k > 0 ? p.mana + k : Math.min(p.mana, p.manaMax); }
  }],
  draw: ["sn", (ctx, who, n) => { for (const p of players(who(ctx))) for (let k = n(ctx); k > 0; k--) drawCard(p); }],
  discardHand: ["s", (ctx, who) => { for (const p of players(who(ctx))) while (p.hand.length) p.grave.push(p.hand.pop()); }],
  fetch: ["c", (ctx, id) => { const c = takeFromDeck(ctx.owner, x => x.id === id); if (c) addToHand(ctx.owner, c); }],
  shuffle: ["", ctx => shuffle(ctx.owner.deck)],
  summon: ["cn", (ctx, id, n) => {
    for (let k = n(ctx); k > 0; k--) { const c = newCard(DATA.cardsById[id]); if (!putOnField(c, ctx.owner)) break; }
  }],
  summonFromDeck: ["c", (ctx, id) => {
    if (ctx.owner.field.chars.length >= RULES.maxChars) return;
    const c = takeFromDeck(ctx.owner, x => x.id === id);
    if (c) { putOnField(c, ctx.owner); log(`${c.name} comes to the field from ${ctx.owner.name}'s deck.`); }
  }],
  flag: ["w", (ctx, name) => { ctx.owner[name] = true; }],
  say: ["sww?", (ctx, who, text, color) => { for (const c of chars(who(ctx))) emit("text", { uid: c.uid, text, color: color || "#ffffff" }); }],
  script: ["w", (ctx, name) => SCRIPTS[name](ctx)],
  // cost clauses only
  reduce: ["n", null], set: ["n", null],
};
const TARGET_KINDS = { character: "char", characterOrPlayer: "charOrPlayer", area: "area" };

function parseAction(text, where) {
  let [body, cond] = text.split(/\s+if\s+/);
  const [name, ...args] = words(body);
  const def = ACTIONS[name];
  if (!def) throw new Error(`${where}: "${name}" is not an action. Known actions: ${Object.keys(ACTIONS).join(", ")}.`);
  const sig = [...def[0].matchAll(/(\w)(\?)?/g)].map(m => ({ k: m[1], optional: !!m[2] }));
  const needed = sig.filter(x => !x.optional).length;
  if (args.length < needed || args.length > sig.length) throw new Error(`${where}: "${body.trim()}" has the wrong number of parts.`);
  const parsed = args.map((a, i) => {
    const k = sig[i].k;
    if (k === "s") { const sel = parseSelector(a, where); return ctx => select(sel, ctx); }
    if (k === "n") return parseNumber(a, where);
    if (k === "c") { if (!DATA.cardsById[a] && !TOKEN_EFFECTS[a]) throw new Error(`${where}: "${a}" is not a CardID.`); return a; }
    if (name === "script" && !SCRIPTS[a]) throw new Error(`${where}: there is no script called "${a}".`);
    return a;
  });
  const test = cond ? parseNumber(cond, where) : null;
  return { name, args: parsed, test, run: ctx => { if (!test || test(ctx) > 0) def[1](ctx, ...parsed); } };
}

// Turn a card's Effect text into { play, enter, endTurn, ..., cost, aura, grants }.
function compileEffect(text, where) {
  const out = {};
  for (const clause of splitOutside(text, ";")) {
    const m = clause.match(/^(\w+)\s*:\s*(.*)$/);
    if (!m || !WHEN[m[1]]) throw new Error(`${where}: "${clause}" must start with one of: ${Object.keys(WHEN).join(", ")}, then a colon.`);
    const [, when, rest] = m;
    const parts = splitOutside(rest, ",");
    if (when === "grants") { out.grants = parts; continue; }
    if (when === "rule") {
      out.rule = out.rule || {};
      for (const part of parts) {
        const [name, ...args] = words(part);
        if (!RULE_WORDS[name]) throw new Error(`${where}: "${name}" is not a rule. Known rules: ${Object.keys(RULE_WORDS).join(", ")}.`);
        const needs = RULE_WORDS[name].split(":")[0].split(">").length - 1;
        if (args.length !== needs) throw new Error(`${where}: write this rule as "${name} ${RULE_WORDS[name].split(":")[0]}".`);
        out.rule[name] = args;
      }
      continue;
    }
    const block = out[when] || (out[when] = { steps: [] });
    for (const part of parts) {
      const w = words(part);
      if (w[0] === "target") {
        if (when !== "play") throw new Error(`${where}: only a play clause can pick a target.`);
        const [kind, ...filters] = (w[1] || "").split(".");
        if (!TARGET_KINDS[kind] || !["harm", "help", "steal"].includes(w[2])) throw new Error(`${where}: write a target as "target character|characterOrPlayer|area harm|help|steal".`);
        block.target = TARGET_KINDS[kind]; block.intent = w[2];
        const fs = filters.map(selectorFilter).filter(Boolean);
        if (fs.length) block.filter = (c, ctx) => fs.every(f => f(c, ctx));
        if (filters.includes("enemy")) block.players = (idx, ctx) => idx !== ctx.owner.idx;
      } else if (when === "aura") {
        if (w[0] === "buff" && w.length === 4) block.steps.push({ sel: parseSelector(w[1], where), a: parseNumber(w[2], where), h: parseNumber(w[3], where) });
        else if (w[0] === "grant" && w.length === 3) (block.grants = block.grants || []).push({ sel: parseSelector(w[1], where), skill: w[2] });
        else throw new Error(`${where}: an aura is written "aura: buff <who> <attack> <health>" or "aura: grant <who> <Skill>".`);
      } else {
        block.steps.push(parseAction(part, where));
      }
    }
  }
  return out;
}

// One-off abilities that don't fit the actions above.
const SCRIPTS = {
  messenger(ctx) {
    const foe = foeOf(ctx.owner);
    const top = foe.deck[foe.deck.length - 1];
    if (!top) return;
    ask({
      kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: `Top of ${foe.name}'s deck`,
      prompt: "Put this card on top of your deck, or discard it.",
      cards: [top], options: [{ id: "take", label: "Put on my deck" }, { id: "discard", label: "Discard it" }],
      resolve: "messenger",
    });
  },
  simplicity(ctx) {
    const hit = foeOf(ctx.owner).field.chars.slice();
    const n = 2 + spellBoost(ctx);
    for (const c of hit) { c.attack -= n; c.currentHealth -= n; }
    healPlayer(ctx.owner, n * hit.length);
    for (const c of hit) { emit("charDamage", { uid: c.uid, amount: n }); checkDeath(c); }
  },
  primate(ctx) {
    const picks = ctx.owner.deck.filter(n => n.group === "Monkey" && n.type === "Character" && n.name !== "Primate" && n.manaCost <= 2).slice(-2);
    for (const n of picks) {
      if (ctx.owner.field.chars.length >= RULES.maxChars) break;
      ctx.owner.deck.splice(ctx.owner.deck.indexOf(n), 1);
      putOnField(n, ctx.owner);
    }
  },
  callOfTheJungle(ctx) {
    const cards = ctx.owner.grave.filter(c => c.group === "Monkey" && !c.token);
    if (cards.length) ask({ kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Call of the Jungle", prompt: "Pick up to 3 Monkey cards to return to your hand.", cards, pick: 3, resolve: "toHand" });
  },
  soulSuction(ctx) {
    const st = stats(ctx.target);
    healPlayer(ctx.owner, st.a + st.h);
    dealDamageToCharacter(ctx.target, 99999);
  },
  rottenFinger(ctx) {
    if (ctx.owner.hand.length) ask({ kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Rotten Finger", prompt: "Pick a card from your hand to discard. Then you draw a card.", cards: ctx.owner.hand.slice(), pick: 1, required: true, resolve: "discardDraw" });
  },
  riseFromTheDead(ctx) {
    const cards = ctx.owner.grave.filter(c => c.race === "Undead" && c.type === "Character");
    if (!cards.length || ctx.owner.field.chars.length >= RULES.maxChars) return;
    ask({ kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Rise from the Dead", prompt: "Pick an Undead character from your graveyard to bring back to the field.", cards, pick: 1, options: [{ id: "field", label: "Bring it back to the field" }], resolve: "rise" });
  },
  keepComing() {
    for (const c of allChars()) if (c.group === "Zombie") {
      if (hasSkill(c, "Reanimate")) c.currentHealth += 3;
      else { c.skills.push("Reanimate"); c.reanimated = false; }
    }
  },
  dataTransfer(ctx) { if (levelDown(ctx.target)) healPlayer(ctx.owner, 2); },
  digitalDrainage(ctx) {
    const levelers = ctx.owner.field.chars.filter(c => hasSkill(c, "Level Up"));
    for (const c of levelers) levelUp(c, 3);
    const alive = levelers.filter(c => ctx.owner.field.chars.includes(c));
    if (!alive.length) return;
    const top = alive.reduce((a, b) => (stats(b).a > stats(a).a ? b : a));
    const drain = top.levelUpCount || 0;
    for (const c of foeOf(ctx.owner).field.chars) { c.attack -= drain; emit("text", { uid: c.uid, text: `-${drain} ATK`, color: "#ff8a6b" }); }
  },
  callBack(ctx) {
    const cards = S.players.flatMap(p => p.grave).filter(c => c.type === "Character" && !c.token);
    if (cards.length) ask({ kind: "choose", source: ctx.card, owner: ctx.owner.idx, title: "Call Back", prompt: "Pick a character from either graveyard to add to your hand.", cards, pick: 1, resolve: "toHand" });
  },
  zombombadier(ctx) {
    const c = ctx.card, d = c.attack + c.health;
    for (const q of S.players) {
      for (const x of q.field.chars.filter(x => x !== c)) dealDamageToCharacter(x, d);
      dealDamageToPlayer(q, d);
    }
  },
  masterRat(ctx) {
    for (let k = 0; k < 4; k++) {
      const turtle = {
        uid: S.nextUid++, id: "turtle", name: "Turtle", rarity: "Basic", type: "Character", race: "Animal", group: "Fighter",
        manaCost: 0, attack: 1, health: 1, skills: [], ability: "Gain +1 to each stat for every other Turtle on the field",
        description: "", artKey: "turtle", token: true,
      };
      if (!putOnField(turtle, ctx.owner)) break;
    }
  },
};

// Effects for cards made during play that aren't in cards.csv.
const TOKEN_EFFECTS = { turtle: "aura: buff self #allies.turtle.other #allies.turtle.other" };

// ---------------------------------------------------------------------------
// Building the game's tables
// ---------------------------------------------------------------------------
const CARD_FX = {};   // CardID -> compiled effect
for (const card of DATA.cardList) if (card.effect) CARD_FX[card.id] = compileEffect(card.effect, `data/cards.csv, ${card.id}, Effect`);
for (const [id, text] of Object.entries(TOKEN_EFFECTS)) CARD_FX[id] = compileEffect(text, `token ${id}`);

const runSteps = (steps, ctx) => { for (const s of steps) s.run(ctx); };

// EFFECTS[CardID]: the play clause in the shape the engine and the computer player use:
// { target, intent, filter, players, apply(ctx, target), now(ctx) }.
const EFFECTS = {};
for (const card of DATA.cardList) {
  const play = CARD_FX[card.id]?.play;
  if (!play) continue;
  EFFECTS[card.id] = play.target
    ? { target: play.target, intent: play.intent, filter: play.filter, players: play.players, apply: (ctx, t) => runSteps(play.steps, { ...ctx, target: t }) }
    : { now: ctx => runSteps(play.steps, ctx) };
}

// Run one card's clause for an event. ctx needs owner; card defaults to c.
function runHook(c, when, ctx) {
  if (!c || c.disabled) return;
  const block = CARD_FX[c.id]?.[when];
  if (block?.steps) runSteps(block.steps, { card: c, ...ctx });
}

// A card's special rule from its Effect ("rule: defend 10" gives ["10"]), or undefined when it
// doesn't have that rule. A disabled card has none.
const cardRule = (c, name) => (c && !c.disabled ? CARD_FX[c.id]?.rule?.[name] : undefined);

// Mana cost after "cost:" clauses ("reduce N", "set N if ...").
function costFromEffect(c, p) {
  const block = CARD_FX[c.id]?.cost;
  let cost = c.manaCost;
  if (!block) return cost;
  const ctx = { card: c, owner: p };
  for (const s of block.steps) {
    if (s.test && !(s.test(ctx) > 0)) continue;
    if (s.name === "reduce") cost = Math.max(0, cost - s.args[0](ctx));
    else if (s.name === "set") cost = s.args[0](ctx);
  }
  return cost;
}

// Cards on a player's side that can have an aura: their characters and their areas.
const auraSources = p => [...p.field.chars, ...p.field.areas].filter(src => !src.disabled && CARD_FX[src.id]?.aura);

// Stat bonuses a character gets from aura clauses on its own side (itself included).
function auraBonus(c, p) {
  let a = 0, h = 0;
  for (const src of auraSources(p)) {
    const ctx = { card: src, owner: p };
    for (const st of CARD_FX[src.id].aura.steps) if (select(st.sel, ctx).includes(c)) { a += st.a(ctx); h += st.h(ctx); }
  }
  return { a, h };
}

// A skill a character has without it being printed on the card: from equipment it holds
// ("grants: Swift") or from an aura on its side ("aura: grant allies.Fighter Parry").
// The rules look here for Swift and Parry.
function grantsSkill(c, skill) {
  if ((c.equipped || []).some(e => !e.disabled && CARD_FX[e.id]?.grants?.includes(skill))) return true;
  const p = ownerOf(c);
  return auraSources(p).some(src => (CARD_FX[src.id].aura.grants || []).some(g => g.skill === skill && select(g.sel, { card: src, owner: p }).includes(c)));
}
