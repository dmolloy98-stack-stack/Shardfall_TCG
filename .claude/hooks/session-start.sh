#!/bin/bash
# Shardfall: a short summary at the start of every session, so Claude starts up to speed.
# It installs nothing (the game needs no libraries) and never stops a session from starting.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "== Shardfall: start of session =="
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
timeout 15 git fetch -q origin main 2>/dev/null
if git rev-parse -q --verify origin/main >/dev/null 2>&1; then
  ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null)
  behind=$(git rev-list --count HEAD..origin/main 2>/dev/null)
  echo "Branch: $branch ($ahead commit(s) not yet on main, $behind on main not here)"
else
  echo "Branch: $branch"
fi
changed=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
[ "$changed" != "0" ] && echo "Uncommitted: $changed file(s)"

node tools/make-status.js --brief 2>/dev/null || echo "(tools/make-status.js could not run)"

# Quick checks only (a few seconds); the full run is node tools/test-all.js, which GitHub also runs.
data=$(node tools/data-test.js . 2>/dev/null | tail -1)
words=$(node tools/words-test.js . 2>/dev/null | tail -1)
echo "Quick checks: card data ${data:-did not run}, words ${words:-did not run}."
echo "Before saying something works: node tools/test-all.js (see CLAUDE.md)."
exit 0
