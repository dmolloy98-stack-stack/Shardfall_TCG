---
name: tool-check
description: >
  Judging whether an outside website, library, GitHub project, AI agent or skill the owner found
  would help Shardfall (for example animation libraries, code-mapping tools, art generators).
  Use when the owner shares a link or asks "is this useful for the game?".
---

# Is this tool useful for Shardfall?

## Safety first

- **Ask the owner before downloading or installing anything from GitHub** (owner's standing
  rule). Reading a README or web page is fine.
- Never paste keys or passwords in chat; API keys go through the secure form.
- Read a page with WebFetch (or the web-fetch agent). If the site blocks automated reading, say
  so and judge from other sources; don't guess.

## Questions to answer

1. **What is it, in one plain sentence?**
2. **Does it fit how Shardfall is built?** Plain HTML, CSS and JavaScript, **no build step**, no
   frameworks (no React, no npm bundling). It runs on GitHub Pages and as a single claude.ai
   page. A library is only usable if it works as one file from a CDN (the claude.ai page only
   allows cdnjs, jsdelivr, unpkg) or can be copied in as plain CSS/JS. Often the best answer is
   "use the idea, not the library" (as with Animate.css's heartBeat).
3. **Is it about art or sound?** Those are the owner's area. Explain how it would work for the
   owner (as with ComfyUI on their RTX 4060), but Claude doesn't make art or sound.
4. **Is it for Claude's own work** (skills, agents, code maps)? Then the questions are: does it
   save real time on jobs we repeat, and does it need installing (ask first)?
5. **Cost and lock-in:** free? needs an account or key? hard to undo?

## Answer format

Yes / no / partly, in the first line. Then a short reason per question that mattered, and a
recommendation. If yes: what Claude would do with it, as a numbered option the owner can pick.
Past answers: React Bits (needs React; ideas only), Animate.css (borrowed the heartBeat idea),
Graphify (run once; makes the Code Graph page), taste-skill and archify (the owner asked to try them).
