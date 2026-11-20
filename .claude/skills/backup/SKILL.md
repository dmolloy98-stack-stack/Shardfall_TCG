---
name: backup
description: >
  Shardfall's Google Drive backup, run after every commit or push in this repo: the change-history
  doc entry, the Versions folder with the changed files, and the rebuilt claude.ai playable page.
  Use whenever a Shardfall change is committed or pushed, or a pull request is opened or merged.
---

# Backing up a change to Google Drive

CLAUDE.md requires this after every commit or push. Do all three steps in the same session, then
tell the owner in one line what was backed up (and plainly if any step could not be done, and why).

## 1. Change-history entry

Doc "Shardfall – change history", id `1VgEvb0g2XFoKijpIuHbUGW3qd4rwSltwpoT-HX3rNyc`.
Newest entry goes at the very top.

- Do **not** `read_doc` it: it is over 200,000 characters and the result overflows. Insert at
  index 1 without reading. Only if the top must be checked, read the saved result file with
  `jq -r '.content.tabs[0].documentTab.body.content[1:12][] | select(.paragraph) | [.paragraph.elements[].textRun.content // ""] | join("")'`.
- One `mcp__Google_Docs__update_doc` call with a single `insertText` at `{"index": 1}`. The text is
  the whole entry ending in a blank line:

```
YYYY-MM-DD · <Short title> (commit <id>, pushed to <branch>; no PR yet)
<What changed for the player, in plain words, 1–3 sentences. No function names.>
Files: <path>, <path>, ...

```

Wording of the first line for the other cases (copy these):
- Committed only: `(commit abc1234, committed locally; not pushed yet)`
- PR opened: `YYYY-MM-DD · Pull request #N opened (commits a, b, c)` + one summary line.
- PR merged: `YYYY-MM-DD · Pull request #N merged into main (merge commit abc1234)` +
  `The work branch was restarted from the latest main.`

## 2. Changed files to a new Versions folder

Versions folder id `1l1zWvI4KZCiJUaEmxoQcwoSO2TP-TlX6` (inside "GitHub mirror"
`1wGnqPjK3m_GWr2FIwBJ8dd1sKn0-tubD`). Skip this step for a PR opened/merged entry with no new files.

1. List the files: `git show --name-only --format= <commit>` (or `git diff --name-only <from>..<to>`).
2. Create the folder: `mcp__Google_Drive__create_file` with `title: "YYYY-MM-DD · <Short title>"`,
   `contentMimeType: "application/vnd.google-apps.folder"`, `parentId` = Versions id. Keep its id.
3. Get hashes in one go: `sha256sum <files>` (absolute paths).
4. Upload every text file, all calls in parallel in one message:
   - `title`: repository path with `/` → `__` (`js/ui.js` → `js__ui.js`, `.claude/skills/backup/SKILL.md` → `.claude__skills__backup__SKILL.md`)
   - `base64Content`: `sha256:<hash>:<absolute path>` (a file reference; never type the base64)
   - `contentMimeType: "text/plain"`, `disableConversionToGoogleType: true`, `parentId` = new folder id
5. Images and other binary files can't go through the connector: name them to the owner.

## 3. Playable copy

```bash
node tools/build-single.js --page /tmp/claude-0/-home-user-Shardfall-TCG/<session>/scratchpad/artifact/shardfall.html
```

Use the session's scratchpad folder (it may need `mkdir -p .../artifact`). Then publish with the
Artifact tool, `file_path` = that file, `url: "https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1"`
(no `icon` on a republish). In a new session the publish is refused until the artifact is read:
do `action: "read"` on that url first, then publish. Skip this step only when no game file changed
(for example docs-only or a PR opened/merged entry), and say so.
