---
name: code-map
description: >
  Keeping Shardfall's code maps current: docs/code-map.md (the written map), the "Shardfall Code
  Map" page and the "Shardfall Code Graph" page (Graphify) on claude.ai. Use when the owner asks
  to refresh the code map or code graph, or after files are added, split or renamed.
---

# The code maps

There are three, for different readers:

| Map | Where | Kept by |
|---|---|---|
| Written map | `docs/code-map.md` (in the repo) | Claude, by hand, in the same change as the code |
| Code Map page | https://claude.ai/artifact/WUQA9uzWYC6oLPL4XnWebz ("Shardfall Code Map") | hand-made HTML page drawn from `docs/code-map.md` |
| Code Graph page | https://claude.ai/artifact/SGGy6xeiMFn14Kob6mknCg ("Shardfall Code Graph") | made by the Graphify tool, then renamed |

## docs/code-map.md

Update it whenever files are added, split or renamed, or the flow between them changes (CLAUDE.md
rule). Sections: the big picture, when you play a card, how a card gets its behaviour, how the
screens connect, **where to change things** (a table: "what you want to change" → files and
function names), size and shape. Plain English; function names only in the right column.

## Refreshing the Code Map page

1. `Artifact` `action: "read"` on the Code Map url; it returns the saved file path of the
   current page (the scratchpad copy may be gone in a new session).
2. Edit that file so it matches `docs/code-map.md` (file list, line counts, flow, the
   "where to change things" table). Keep the page's look.
3. Publish with that `file_path` and the same `url`, no `icon`.

## Refreshing the Code Graph page

```bash
pip install -q graphifyy        # the package name has two y's; the command is graphify
SP=<scratchpad>; rm -rf $SP/gmap && mkdir -p $SP/gmap && cp -r js $SP/gmap/ && (cd $SP/gmap && graphify update .)
sed 's#<title>[^<]*</title>#<title>Shardfall Code Graph</title>#' $SP/gmap/graphify-out/graph.html > $SP/code-graph.html
```

Graphify reads only the copied `js/` folder, so nothing is written into the repo. Read
`$SP/gmap/graphify-out/GRAPH_REPORT.md` for the dot, line and cluster counts. Then `read` the
Code Graph url once (required before publishing to it from a new session) and publish
`$SP/code-graph.html` to it. If the Code Map page quotes Graphify's numbers ("Compared with
Graphify's map"), update them too, with the date.

Tell the owner both links when done. These pages are claude.ai only (private to the owner), not
part of the repo or the Drive backup.
