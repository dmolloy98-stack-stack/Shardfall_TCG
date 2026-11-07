# Notes for Claude

## Back up every change to Google Drive

The owner wants everything on GitHub also kept in Google Drive, with a full history,
as a backup. Every time a change is pushed to this repository (or committed, if GitHub
can't be reached), in the same session:

1. **Change history.** Add an entry at the top of the Google Doc
   "Shardfall – change history" (Drive folder "Shardfall _ CardGame" → "GitHub mirror"):
   date, PR number and commit ids, what changed in plain words, and the files touched.
   Doc id: `1VgEvb0g2XFoKijpIuHbUGW3qd4rwSltwpoT-HX3rNyc`.
2. **Changed files.** Upload the new version of every text file the change touched to a
   new folder in "GitHub mirror" → "Versions", named `YYYY-MM-DD · <short title>`, keeping
   each file's repository path in its name (for example `js__engine.js`). Older versions
   stay in their earlier folders, so the folders are the file history.
   Folder ids: "GitHub mirror" `1wGnqPjK3m_GWr2FIwBJ8dd1sKn0-tubD`,
   "Versions" `1l1zWvI4KZCiJUaEmxoQcwoSO2TP-TlX6`.
3. **Playable copy.** Rebuild the page with `node tools/build-single.js --page <file>` and
   republish it to the claude.ai page https://claude.ai/artifact/5hWErf72EZxcunSyP4CXX1.

Tell the owner when a backup step could not be done and why. Binary files (images) and
the git history file can't be uploaded through the Drive connector; say so rather than
skipping them silently.
