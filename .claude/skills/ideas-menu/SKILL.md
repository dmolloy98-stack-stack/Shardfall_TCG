---
name: ideas-menu
description: >
  Answering Shardfall "what's next / what can be improved / look at other games for ideas"
  questions: the format the owner likes, the games to draw from, and the list of ideas already
  turned down or on hold so they aren't offered again. Use whenever the owner asks for
  suggestions, next steps, improvements or inspiration.
---

# Offering ideas

## Before suggesting anything

1. Read `docs/todo.md`, especially **"Turned down or on hold"** and **"Offered, not picked yet"**
   near the end; `docs/done.md` lists what's already built. Don't offer a
   turned-down idea again; an on-hold idea can be mentioned only as "on hold since …, want to
   pick it up?".
2. Skim the top of the Drive change history or `git log --oneline -30` so ideas don't repeat
   what was just built.
3. Respect the scope the owner gives ("excluding art and sound", "focus on feel"). **Art and
   sound are always out of scope** unless the owner raises them.

## Format the owner likes

- A **numbered list**, so the owner can answer "1, 3 and 5" or "I like everything except 11".
- Each item: a short bold name, one or two plain sentences on what the player would notice,
  and where it comes from ("like the Kraber's hit sound in Apex: …"). An example helps when the
  idea is hard to picture. Flag big ones honestly ("this is a big project").
- Group them if there are many (feel, clarity, reasons to keep playing…). 8–16 items is normal
  for "what's next"; 2–3 options with a recommendation for a specific design question.
- End with a recommendation, then wait. Build exactly the numbers picked, nothing more.
- No jargon, no function names.

## Games to draw from

The owner knows Hearthstone, Magic: The Gathering (Arena) and Teamfight Tactics, and has played
the big digital card games **except Legends of Runeterra and Gwent**; not the solo deckbuilders
(Slay the Spire etc.) or physical card games. Non-card games the owner pointed
to for feel: Apex Legends (the Kraber), Deadlock, Cyberpunk 2077, Borderlands and Overwatch
(shields), *Arcane* and *Adventure Time* (tone). The goal is inspiration, never copying a game.

## After the owner picks

- Record what was turned down or put on hold in `docs/todo.md` → "Turned down or on hold"
  (one line each: the idea, the date, the owner's reason if given).
- Big picked items that won't be built now go in `docs/todo.md` as their own section.
- Offered items the owner didn't pick (without turning them down) go under "Offered, not picked
  yet" in `docs/todo.md`, so they can be offered again later as a reminder, not as new.
- When a picked list is finished, move it from `docs/todo.md` to `docs/done.md`.
