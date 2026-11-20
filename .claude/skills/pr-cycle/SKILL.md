---
name: pr-cycle
description: >
  Shardfall pull-request routine: pushing the work branch, opening a PR when the owner asks,
  merging it once GitHub's tests pass, and what to do after a merge (restart the branch from
  main, log the merge).
  Use when the owner asks to push, open a PR, or says a PR was merged.
---

# Pushing, pull requests and merges

Work branch: the one the session names (so far `claude/peaceful-dirac-7u4ysi`). Repo
`dmolloy98-stack-stack/Shardfall_TCG`. Owner rules: push only after a bigger change or when asked;
**open a PR only when the owner asks**. Once a PR is open, **Claude merges it as soon as GitHub's
tests pass** (the owner chose this), without waiting to be asked.

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

## Merging

1. Wait for the tests: `mcp__github__pull_request_read` with `method: "get_check_runs"`. While
   they are still running, check again in a few minutes (`send_later`), not with `sleep`.
2. All `success` → `mcp__github__merge_pull_request`, `merge_method: "merge"`.
   Any failure → fix it and push, or tell the owner what is failing. Never merge a red PR.
3. Tell the owner in one or two lines that it is merged and live on GitHub Pages in a few minutes.
4. Then do the after-merge steps below.

## After a merge (by Claude or the owner)

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
