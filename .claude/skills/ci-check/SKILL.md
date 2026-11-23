---
name: ci-check
description: >
  Reading GitHub's results for a Shardfall pull request properly: not just the green or red mark,
  but the logs of every check (rules tests, balance, screen tests, accessibility, picture
  comparison, speed budget, status page), what each warning means, and when it is safe to merge.
  Use before merging any pull request, and whenever a check is red.
---

# Reading GitHub's checks

`.github/workflows/tests.yml` runs three jobs. **A green mark is not enough**: on pull request #30
the jobs were green while three checks had never run (a test tool was missing, and its crash was
hidden). Read the logs before every merge.

## The jobs and what to look for

`mcp__github__pull_request_read` with `method: "get_check_runs"` lists them; then
`mcp__github__get_job_logs` with the job's `job_id`, `return_content: true`, `tail_lines` about 120.

| Job | Must say | Warnings it can give (never red) |
|---|---|---|
| `test` | `EVERYTHING PASSED` | "Status page" (run `node tools/make-status.js`, commit) |
| `balance` | the win-rate table | a deck outside 40–60% |
| `screen` | `ALL SCREEN TESTS PASSED (16)` (or the current count), `NO ACCESSIBILITY PROBLEMS FOUND`, a `same`/`CHANGED` line for every picture scene, and the speed table ending `WITHIN THE SPEED BUDGET` | accessibility problems, scenes that look different, over the speed budget |

If a line is missing, the check didn't run, even if the job is green: find out why before merging.

## Judging the warnings

- **Pictures:** a new What's new row always changes the menu (the version line) and the What's new
  scene. Any other changed scene must be one this pull request meant to change. If not, run
  `node tools/picture-test.js <main copy> <scratchpad>/pics` locally and look at
  `report.html`. The run also keeps the pictures as the "picture-changes" file on the run's page,
  for the owner.
- **Speed:** over budget is a person's call: say which measure and by how much, and whether the new
  feature is worth it. Loading time moves a few percent between runs; a redraw or the computer's
  turn rising more than 15% is real.
- **Balance:** a deck outside 40–60% after a card or rule change is for the owner (`balance` skill).
  Twenty games per pairing still varies by a few percent from run to run.
- **Accessibility:** fix it in the same pull request when it's simple (`browser-check` skill).

## A red job

`get_job_logs` with `run_id` and `failed_only: true`. Find the cause, fix it, push; never switch a
test off and never re-run hoping for a different result (a job gets one re-run at most, and only
with a reason). A step that sends its output through `tee` uses `shell: bash`, so a crash turns it
red; a new tool step should too.

## Merging

Only when every job is green, every "must say" line is there, and every warning is either expected
or explained to the owner (`pr-cycle` skill).
