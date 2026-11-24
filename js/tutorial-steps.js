// The tutorial's lessons, one entry per step, in order. The machinery that runs them (the Trainer,
// the coach box, the helpers these steps use, like tcard() and yourTable()) is js/tutorial.js,
// loaded just before this file. The words here are what new players read: plain and short.

// Step kinds:
//   next: true          the player reads it and presses Next
//   done()              the step ends when this becomes true (after any render)
//   allow(name, ...)    which engine actions are accepted while the step is open
//   opp: [...]          the Trainer's scripted moves, played one by one
//   back: "id"          return to an earlier step when this step's setup is undone
const TUT_STEPS = [
  {
    title: "Welcome to Shardfall",
    text: "This lesson teaches you the game by playing a short one, one step at a time.<br><br>Each player has <b>health</b>, shown in these life crystals. The crystal is green while its owner is healthy, turns orange as they take damage, then red and cracked when they are close to losing. Bring the other player's health down to <b>0</b> to win.",
    target: () => [plateEl(0), plateEl(1)], next: true,
  },
  {
    text: `You sit at the bottom of the table. Your opponent, the <b>Trainer</b>, sits at the top.<br><br>Real games start at ${RULES.startingHealth} health each. The Trainer starts with only 3, so this lesson is quick.`,
    target: () => [plateEl(1)], next: true,
  },
  {
    title: "Your hand",
    text: "These are the cards in your <b>hand</b>. Only you can see them. You play cards from your hand to do everything in Shardfall.",
    target: () => [...document.querySelectorAll(".hand-card")], union: true, next: true,
  },
  {
    title: "Reading a card",
    wide: true,
    text: () => `${anatomyHTML(cardById("simple_bowman"))}
      <p>Most cards are <b>characters</b>, who fight for you. The three numbers at the bottom are their stats. Tap any card during a game to read its full ability text.</p>`,
    next: true,
  },
  {
    title: "Mana",
    text: "Playing a card costs <b>mana</b>: the number in the orange diamond in the card's corner.<br><br>Your mana is the row of crystals: lit ones can be spent. You have <b>1</b> right now. Each turn your crystals refill, and you get <b>1 more</b> than the turn before.",
    target: () => [$('.mana[data-player="0"]'), handEl("farmerA")], next: true,
  },
  {
    title: "The four steps of a turn",
    text: "Every turn goes through four steps, in order:<ol><li><b>Draw</b>: take a card from your deck.</li><li><b>Setup</b>: play cards from your hand.</li><li><b>Battle</b>: your characters attack.</li><li><b>End</b>: pass the turn.</li></ol>The lit-up step is where you are, and the big crystal on the left glows in the color of whoever's turn it is: <b style=\"color:#4cc9f0\">blue</b> for you. The player who goes first skips their first Draw, so you start in Setup.",
    target: () => [$(".phases"), $(".turn-crystal")], next: true,
  },
  {
    title: "Play a character",
    text: "Drag <b>Simple Farmer</b> up onto the table. (Or tap it, then press <b>Play</b>.) It costs 1 mana.",
    target: () => [handEl("farmerA"), yourTable()], drag: true,
    allow: (name, uid) => name === "playCard" && uid === tid("farmerA"),
    done: () => onField("farmerA"),
  },
  {
    title: "Abilities",
    text: "Most cards also have an <b>ability</b>: something special they do. The Farmer's says <i>“When played, search your deck for a Simple Farmer and add it to your hand.”</i><br><br>So a second Farmer just jumped into your hand.",
    target: () => [handEl("farmerB")], next: true,
  },
  {
    text: "Your Farmer is on the table now. A character <b>can't attack on the turn it is played</b> (unless it has the Rush skill), so it will be ready next turn.",
    target: () => [fieldEl("farmerA")], next: true,
  },
  {
    text: "You've used all your mana. Press <b>To battle →</b> to move to the Battle step.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    text: "This is the <b>Battle</b> step, where characters attack. Your Farmer is new, so nothing can attack yet. Press <b>To end →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.END,
  },
  {
    text: "In the <b>End</b> step, some cards do something special. Press <b>Pass turn →</b> to hand the turn to the Trainer.",
    target: () => [actEl("phase")],
    allow: name => name === "endTurn",
    done: () => S.active === 1,
  },
  {
    text: "The Trainer's turn. Watch what it does.",
    opp: [
      () => move("draw"),
      () => move("token"),
      () => move("play", tid("husk")),
      () => move("next"), () => move("next"), () => move("end"),
    ],
  },
  {
    text: "The Trainer played <b>Patched Husk</b>: Attack 0, Health 1.<br><br>It also used its <b>+1</b> token. The player who goes second gets 1 extra mana, once per game, to make up for going second.",
    target: () => [fieldEl("husk"), $('.mana[data-player="1"]')], next: true,
  },
  {
    title: "Draw",
    text: "Your turn again. It starts with the <b>Draw</b> step: press <b>Draw card</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "doDraw",
    done: () => S.phase === PHASE.SETUP,
  },
  {
    text: "You drew a <b>Sword</b>, and you have 2 mana now. First, drag your second <b>Simple Farmer</b> onto the table.",
    target: () => [handEl("farmerB"), yourTable()], drag: true,
    allow: (name, uid) => name === "playCard" && uid === tid("farmerB"),
    done: () => onField("farmerB"),
  },
  {
    title: "Equipment",
    text: "<b>Equipment</b> attaches to a character and adds its numbers to the character's. The Sword adds +1 Attack.<br><br>Drag the <b>Sword</b> onto the Farmer on the <b>left</b>, the one that has been here since last turn.",
    target: () => [handEl("sword"), fieldEl("farmerA")], drag: true,
    allow: (name, uid, opts) => name === "playCard" && uid === tid("sword") && targetUid(opts?.target) === tid("farmerA"),
    done: () => tcard("farmerA")?.equipped?.length > 0,
  },
  {
    text: "Your Farmer now has <b>2 Attack</b>. An underlined number means a bonus from equipment or another card.",
    target: () => [fieldEl("farmerA")], next: true,
  },
  {
    text: "Now press <b>To battle →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    id: "pick-attacker",
    title: "Attack!",
    text: "Characters with a <b>green outline</b> can attack. Tap your equipped <b>Farmer</b> to choose it.",
    target: () => [fieldEl("farmerA")],
    done: () => U.selected === tid("farmerA"),
  },
  {
    title: "How a fight works",
    text: "Now tap the Trainer's <b>Patched Husk</b> to attack it.<br><br>In a fight, both characters hit <b>at the same time</b>. Your Farmer deals 2 damage and the Husk has 1 Health, so it is knocked out. The Husk has 0 Attack, so your Farmer takes no damage.",
    target: () => [fieldEl("husk"), fieldEl("farmerA")],
    allow: (name, a, t) => name === "attack" && a === tid("farmerA") && t === tid("husk"),
    done: () => !onField("husk"),
    back: () => U.selected !== tid("farmerA") && "pick-attacker",
  },
  {
    title: "The graveyard",
    text: "Knocked out! Defeated cards go to the <b>graveyard</b>. Tap a GRAVE pile at any time to look through it.<br><br>Damage stays on a character until it is knocked out. It doesn't heal at the end of a turn.",
    target: () => [graveEl(1)], next: true,
  },
  {
    text: "Your second Farmer is new, so it waits. Press <b>To end →</b>, then <b>Pass turn →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase" || name === "endTurn",
    done: () => S.active === 1,
  },
  {
    text: "The Trainer's turn.",
    opp: [
      () => move("draw"),
      () => move("play", tid("bowman")),
      () => move("next"),
      () => move("attack", tid("bowman"), tcard("farmerB") ? tid("farmerB") : null),
      () => move("next"), () => move("end"),
    ],
  },
  {
    title: "Swift strikes first",
    text: "The Trainer played <b>Simple Bowman</b>. It has the <b>Rush</b> skill (➜), so it could attack on the turn it was played.<br><br>It also has <b>Swift</b> (»): a Swift character strikes <b>first</b>. Its hit knocked your Farmer out before your Farmer could hit back.",
    target: () => [fieldEl("bowman"), graveEl(0)], next: true,
  },
  {
    text: "Your turn. Press <b>Draw card</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "doDraw",
    done: () => S.phase === PHASE.SETUP,
  },
  {
    title: "Spells",
    text: "You drew <b>Slap</b>, a <b>spell</b>. A spell does its thing once, then goes to the graveyard. Slap makes a character lose 1 Health.<br><br>Play Slap, then tap the <b>Bowman</b> as its target.",
    target: () => (S.pending ? [fieldEl("bowman")] : [handEl("slap"), fieldEl("bowman")]),
    allow: (name, x) => (name === "playCard" && x === tid("slap")) || (name === "chooseTarget" && targetUid(x) === tid("bowman")),
    done: () => !onField("bowman"),
  },
  {
    title: "Skills",
    text: "Look at <b>Simple Barkeep</b>: it has the <b>Signal</b> skill (⌁). A skill is a keyword with its own rule. Signal means <i>“use this card's ability when it enters the table.”</i><br><br>Play the Barkeep, then give your equipped <b>Farmer</b> +1 Health.",
    target: () => (S.pending ? [fieldEl("farmerA")] : [handEl("barkeep"), fieldEl("farmerA")]),
    allow: (name, x) => (name === "playCard" && x === tid("barkeep")) || (name === "chooseTarget" && targetUid(x) === tid("farmerA")),
    done: () => onField("barkeep") && !S.pending,
  },
  {
    text: "Press <b>To battle →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    title: "Attack the player",
    text: () => `The Trainer has no characters left to protect it. Tap your <b>Farmer</b>, then press <b>Attack ${S.players[1].name} directly</b>.`,
    target: () => (U.selected === tid("farmerA") ? [actEl("face"), fieldEl("farmerA")] : [fieldEl("farmerA")]),
    allow: (name, a, t) => name === "attack" && a === tid("farmerA") && t == null,
    done: () => S.players[1].health < TUT_TRAINER_HEALTH,
  },
  {
    text: () => `A direct hit! The Trainer is down to <b>${S.players[1].health} health</b>. Press <b>To end →</b>, then <b>Pass turn →</b>.`,
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase" || name === "endTurn",
    done: () => S.active === 1,
  },
  {
    text: "The Trainer's turn.",
    opp: [
      () => move("draw"),
      () => move("play", tid("wall")),
      () => move("next"), () => move("next"), () => move("end"),
    ],
  },
  {
    title: "Challenge and Tower",
    text: "The Trainer played <b>Breathing Wall</b>, which has two skills:<ul><li><b>! Challenge</b>: while it is on the table, your attacks must go to it first.</li><li><b>▰ Tower</b>: it never attacks. It only blocks, and it also has to be attacked first.</li></ul>With 5 Health, your characters can't break through it… on their own.",
    target: () => [fieldEl("wall")], next: true,
  },
  {
    title: "Champion abilities",
    text: "Each deck has one special card, its <b>champion</b> (the Unknown rarity). If your deck holds it, you get the champion's <b>ability</b> from the first turn, even before you draw the card.<br><br>Every ability is always on. Some <b>level up</b> once in a match.",
    next: true,
  },
  {
    text: () => {
      const a = DATA.championAbilities.the_simplistic;
      const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
      return `The Simple deck's is <b>${a.name}</b>. ${a.now}<br><br>When ${lower(a.when).replace(/\.$/, "")}, it levels up: ${lower(a.then)}<br><br>In a real game it shows under your name, with its level. Tap it to read it.`;
    },
    next: true,
  },
  {
    text: "Press <b>Draw card</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "doDraw",
    done: () => S.phase === PHASE.SETUP,
  },
  {
    title: "Cards work together",
    text: "This is where cards combine. <b>Simplify</b> turns a character's stats into 1 / 1 / 1. Play Simplify, then tap the <b>Breathing Wall</b>.",
    target: () => (S.pending ? [fieldEl("wall")] : [handEl("simplify"), fieldEl("wall")]),
    allow: (name, x) => (name === "playCard" && x === tid("simplify")) || (name === "chooseTarget" && targetUid(x) === tid("wall")),
    done: () => !S.pending && tcard("wall")?.currentHealth === 1,
  },
  {
    text: "Press <b>To battle →</b>.",
    target: () => [actEl("phase")],
    allow: name => name === "advancePhase",
    done: () => S.phase === PHASE.BATTLE,
  },
  {
    text: "The Wall has just 1 Health now. Tap one of your characters, then tap the <b>Wall</b>. Because of Challenge, it has to be attacked first anyway.",
    target: () => (U.selected ? [fieldEl("wall"), selectedEl()] : [fieldEl("farmerA"), fieldEl("barkeep")]),
    allow: (name, a, t) => name === "attack" && (t === tid("wall") || t == null),
    done: () => !onField("wall"),
  },
  {
    title: "Finish it",
    text: () => `The way is clear. Tap your other character, then press <b>Attack ${S.players[1].name} directly</b> to win.`,
    target: () => (U.selected ? [actEl("face"), selectedEl()] : S.players[0].field.chars.filter(c => canAttack(c)).map(c => $(`.field-card[data-uid="${c.uid}"]`))),
    allow: (name, a, t) => name === "attack" && t == null,
    done: () => S.over,
  },
  {
    title: "You won!",
    final: true,
    text: `<p>You now know the basics:</p><ul>
      <li>Play cards in <b>Setup</b>, paying their <b>mana</b> cost.</li>
      <li>Characters fight in <b>Battle</b>. Both hit at once, unless one has <b>Swift</b>.</li>
      <li><b>Equipment</b> and <b>spells</b> change the fight.</li>
      <li><b>Skills</b> like Rush, Signal and Challenge add special rules.</li>
      <li>Your deck's <b>champion</b> gives it an <b>ability</b> from turn one, and some abilities <b>level up</b> once in a match.</li>
      <li>In round 8 a <b>big shard</b> falls into the middle of the table. Break it to claim it.</li>
      <li>Bring the other player to <b>0 health</b> to win.</li></ul>
      <p>Next, try a real game against the computer with the Simple deck. Beginner hints will guide you, and you can turn them off any time.</p>`,
  },
];
