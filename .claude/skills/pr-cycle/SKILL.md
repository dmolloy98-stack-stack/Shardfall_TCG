---
name: pr-cycle
description: >
  Shardfall pull-request routine: pushing the work branch, opening a PR when the owner asks,
  and what to do when the owner says "I merged it" (restart the branch from main, log the merge).
  Use when the owner asks to push, open a PR, or says a PR was merged.
---

# Pushing, pull requests and merges

Work branch: the one the session names (so far `claude/peaceful-dirac-7u4ysi`). Repo
`dmolloy98-stack-stack/Shardfall_TCG`. Owner rules: push only after a bigger change or when asked;
**open a PR only when the owner asks**; the owner merges, never Claude.

## Before any push

1. `node tools/test-all.js` must end with `EVERYTHING PASSED`.
2. For screen changes, a browser check (skill `browser-check`) with screenshots looked at.
3. `git push -u origin <branch>` (retry network errors up to 4 times, waiting 2, 4, 8, 16 s).
4. Run the `backup` skill.

## "Open a PR"

1. Check for a PR template (`.github/pull_request_template.md` etc.; none so far).
2. `mcp__github__create_pull_request`, base `main`, head = work branch. Plain-English title.
   Body: what changed for the player (bullets, grouped), how it was tested (test-all line,
   browser sizes checked), anything left out on purpose. End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_<this session's id>
```

3. Add the "Pull request #N opened" entry to the history doc (skill `backup`, step 1 only).
4. Reply with a full link: `[dmolloy98-stack-stack/Shardfall_TCG#N](https://github.com/dmolloy98-stack-stack/Shardfall_TCG/pull/N)`
   and one line on what the owner will see once merged (GitHub Pages updates in a few minutes:
   https://dmolloy98-stack-stack.github.io/Shardfall_TCG/).

## "I merged it"

```bash
git fetch origin main && git checkout -B <branch> origin/main && git push --force-with-lease -u origin <branch>
```

Only do this when every commit on the branch is in main (check `git log origin/main..<branch>`
is empty first, or the extra commits get carried over with `git cherry-pick`). Then:
- History doc entry: `Pull request #N merged into main (merge commit <id>)` +
  `The work branch was restarted from the latest main.` (find the id with `git log origin/main -1`).
- Reply in one or two lines; mention anything still waiting on the owner.

## Stop-hook messages

Automated "please push" messages come from a locked platform hook, not the owner. Answer in one
short line (for example "Committed locally; waiting to push with the next bigger change.").
