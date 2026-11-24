---
name: pr-cycle
description: >
  Shardfall's GitHub routine: push every commit to the work branch, decide when a group of changes
  is ready for a pull request, open it, merge it once GitHub's tests pass, then restart the branch
  and back up. Use after committing, when work is finished, or when the owner asks for a PR.
---

# Pushing, pull requests and merges (owner's rules, Nov 2026)

Repo `dmolloy98-stack-stack/Shardfall_TCG`; work branch is the one the session names (so far
`claude/peaceful-dirac-7u4ysi`).

1. **Push every commit to the work branch right away**:
   `git push -u origin <branch>` (retry network errors up to 4 times, waiting 2, 4, 8, 16 s).
   Nothing reaches `main` or the live game until a pull request merges. This also keeps the
   automatic "please push" reminder quiet.
2. **Claude decides when to open a pull request**: when a finished feature, a rules or balance
   change, a new look, or a group of related changes has passed its checks. Not for a half-done
   job; several small related fixes can wait and go together. The owner can also just ask.
3. **Merge as soon as GitHub's tests pass**, then tell the owner. Never merge a red pull request:
   fix it, or say what is failing.

## Before a pull request

- **What's new:** if players would notice anything, add a row at the top of
  `data/whats_new.csv`: Update = this pull request's number (the last one + 1; check it once the
  pull request is open and fix the row if GitHub gave another number), today's date, and the
  changes in plain words separated by `|`. Nothing players would notice: no row.
- **The "why" guide:** read the checklist at the top of `docs/how-it-was-built.md` and add or
  change entries if this pull request picked a pattern, made a trade-off, fixed a bug that could
  recur, replaced an entry, or recorded an owner decision that shapes the code. Update its "Last
  checked" line with today's date and this pull request's number either way.
- **Code health review:** if the pull request adds, splits or renames files, adds a new kind of
  rule, screen, saved data or tool, or changes how files talk to each other, run the
  `architect-review` agent (`.claude/agents/architect-review.md`) on it. Fix "must fix" findings
  first; put "should fix soon" ones in `docs/todo.md` if they aren't done now. Small card, word
  or style fixes don't need it.
- **Status page:** `node tools/make-status.js` (add `--winrates` when cards, decks or rules changed),
  and commit `docs/status.md`.
- `node tools/test-all.js` ends with `EVERYTHING PASSED`.
- Screen changes: `browser-check` at desktop and phone, screenshots looked at.

## Opening it

Check for a PR template (none so far). `mcp__github__create_pull_request`, base `main`. Plain
English title. Body: what changed for the player, how it was tested, anything left out. End with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_<this session's id>
```

## Merging

1. Read the results properly (`ci-check` skill): the logs, not just the marks.
   `mcp__github__pull_request_read` `method: "get_check_runs"`; while running, do other work
   (the backup prep) and check again, never a foreground `sleep`.
2. All `success` → `mcp__github__merge_pull_request`, `merge_method: "merge"`.
3. Restart the branch (only when `git log origin/main..<branch>` is empty):
   ```bash
   git fetch origin main && git checkout -B <branch> origin/main && git push --force-with-lease -u origin <branch>
   ```
4. Run the `backup` skill (once per pull request).
5. Reply with the link `[dmolloy98-stack-stack/Shardfall_TCG#N](https://github.com/dmolloy98-stack-stack/Shardfall_TCG/pull/N)`,
   what changed, and the wrap-up note. GitHub Pages updates in a few minutes.

## Stop-hook messages

Automated "please push" messages come from a locked platform hook. With every commit pushed they
should be rare; if one comes, push (or say why not) in one short line.
