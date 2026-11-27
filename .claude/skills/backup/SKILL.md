---
name: backup
description: >
  Shardfall's Google Drive backup, done once per merged pull request: one change-history doc
  entry, one patch file in a new Versions folder, a full snapshot once a month, and the rebuilt
  claude.ai playable page. Use right after merging a Shardfall pull request.
---

# Backing up to Google Drive (once per pull request)

The owner wants everything on GitHub also kept in Drive with a full history. Since Nov 2026 this
is done **once per merged pull request**, not per commit (every commit is already pushed to the
work branch on GitHub). Older Versions folders hold one file per changed file; newer ones hold one
patch. Tell the owner in one line what was backed up, and plainly if a step failed and why.

## 1. Change-history entry

Doc "Shardfall – change history", id `1VgEvb0g2XFoKijpIuHbUGW3qd4rwSltwpoT-HX3rNyc`, newest at the
top. **Never `read_doc` it** (over 200,000 characters). One `mcp__Google_Docs__update_doc` call,
one `insertText` at `{"index": 1}`:

```
YYYY-MM-DD · <Short title>: pull request #N merged (merge commit abc1234)
<What changed for the player, plain words, 1–4 sentences. Win-rate or test notes if relevant.>
The work branch was restarted from the latest main.
Files: <path>, <path>, ...

```

## 2. One patch file (and a monthly snapshot)

1. Make the patch for the whole pull request (base = the main commit the branch started from,
   usually the previous merge, `git log --merges -2 --format=%h origin/main`):
   ```bash
   node tools/drive-bundle.js patch <base> <merge commit> <scratchpad>/PR-N.txt
   sha256sum <scratchpad>/PR-N.txt
   ```
2. Create the folder in Versions (`1l1zWvI4KZCiJUaEmxoQcwoSO2TP-TlX6`):
   `mcp__Google_Drive__create_file`, `title: "YYYY-MM-DD · PR #N · <short title>"`,
   `contentMimeType: "application/vnd.google-apps.folder"`.
3. Upload the patch into it: `title: "PR-N changes.txt"`, `base64Content: "sha256:<hash>:<path>"`,
   `contentMimeType: "text/plain"`, `disableConversionToGoogleType: true`.
4. **Monthly full snapshot.** Search Drive for a folder named `YYYY-MM · Full snapshot` for the
   current month (`mcp__Google_Drive__search_files`, title contains it). If none exists:
   `node tools/drive-bundle.js snapshot <scratchpad>/snapshot.txt`, create that folder in Versions
   and upload `Shardfall snapshot YYYY-MM-DD.txt` the same way. Images are listed but not included
   (say so).

## 3. Playable copy

Only when a game file changed (js, css, data, index.html):

```bash
node tools/build-single.js --page <scratchpad>/artifact/shardfall.html
```

Then publish with the Artifact tool, `file_path` = that file, `url:
"https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1"`, no `icon`. In a new session `read` that url
first (a publish to an artifact the session hasn't read is refused).

## 4. The owner's dashboard

After every merged pull request (once `docs/status.md` is current on main):

```bash
node tools/make-dashboard.js <scratchpad>/dashboard/shardfall-dashboard.html
```

Publish it with the Artifact tool, `file_path` = that file, `url:
"https://claude.ai/artifact/VC8opzKwdKLh5srrGCBwcr"`, no `icon` (in a new session `read` that url
first). It is built from the project's files, so never edit it by hand.

**Leave out the `capabilities` field** on this publish. The page keeps its own small database and
the right to wake a scheduled task (both declared once, 27 Nov 2026); leaving the field out keeps
them, while passing it (even `{}`) would switch off the pull-request panel and its Merge button.

**The pull-request panel** at the top reads the open pull requests from the page's database, not
from the build. Whenever a run opens, merges or closes a pull request (and only then; the owner
doesn't want it refreshed on a schedule), write the list with the ArtifactData tool, `url` above:
`set` document `open` in collection `prs` (`get` it first for `if_version`) as
`{checked_at, list: [{number, title, why, opened, branch}], latest_merged: [{number, title, merged}]}`,
where `why` is one plain sentence (what it changes and why it was held). No links: the page makes
them. The owner's **Merge to main** button writes `merge_requests/<number>` with status
`requested` and wakes the "Shardfall merge from dashboard" scheduled task
(`trig_01UAGxMNpmLNdtB7J3pyfJDV`, also in `tools/make-dashboard.js`), which merges only when every
GitHub check passed and sets the status to `merged` or `failed` with a plain-words note.

## Restoring from the backups

When the owner wants the game back from Drive (GitHub gone, or a check that the backups work):
1. In Versions (`1l1zWvI4KZCiJUaEmxoQcwoSO2TP-TlX6`), find the newest `YYYY-MM · Full snapshot`
   folder and every `… · PR #N · …` folder made after that snapshot's date.
2. Download the snapshot and each `PR-N changes.txt` with `mcp__Google_Drive__download_file_content`
   (each is saved to a file; the result names it).
3. `node tools/restore.js <new empty folder> <snapshot file> <patch files, oldest first> [--compare]`.
   It unpacks, applies the patches, runs every test and ends `RESTORE WORKED`. `--compare` also
   checks it against this checkout. Images aren't in the backups; it lists them.
Tested 22 Nov 2026: the 2026-11 snapshot plus PR-29 rebuilt update 29 exactly.
