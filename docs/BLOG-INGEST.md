<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# How Corwin's Emacs blog and build data reach this page

The page fetches nothing after it loads. A person runs two scripts, each saves a small snapshot under
`content/`, and `build.py` turns the snapshots into the "From my Emacs blog" card and the "Recent
Emacs builds" strip. Observed 2026-11-01; what was not seen is marked **not seen**.

## The chain

1. **Source.** The blog at <https://corwin.bru.st/> is titled "Corwin's Emacs Blog". It reads like a Hugo
   site (a `--more--` summary break, "1 of 3" pagination, ox-hugo installed in Corwin's Emacs) but the
   generator tag was **not seen**: the fetch tool returned page text, not HTML. The Hugo source tree
   was **not found** in any folder connected to Avalon (`claude/projects`, `corwi`, `dotfiles`);
   Hugo's own default feed is `index.xml`, which `scripts/fetch-feeds` tries first (the fetch tool
   was refused it, so the feed's contents are **not seen**).
2. **CI rewrite.** `emacs-local-ci` (G:\emacs-local-ci): `crude-ci.sh` notices a new commit and runs
   `build-dist.sh`, whose last step (line ~447) `rsync`s the build to `~/corwin-emacs/emacs-NN` on the
   blog's host and then runs `update-sym-links.sh` there. That script (no local paths leave it; it
   runs on the host) re-points `emacs-NN-latest` links and **rewrites two files after every upload**.
3. **Published JSON/JS**, same array in both (read 2026-11-01):
   - `https://corwin.bru.st/emacs-latest.json`
   - `https://corwin.bru.st/emacs-latest.js`, which is `document.emacsVersionData = [...]` between
     AGPL `@license` lines, loaded by the blog's own widget.

   Shape: `[{"branch": "emacs-32", "latest": "emacs-32-3b92ea", "date": "2026-10-30.21"}, ...]`.
   `branch` is a build folder (`emacs-30`, `emacs-31`, `emacs-32`, `emacs-ucrt-31`, `emacs-ucrt-32`) or
   the literal `emacs-tree-sitter`, whose `latest` is a comma list of grammar names. `latest` is the
   newest release folder name (empty for the ucrt rows, whose folders hold only links). `date` is
   `%F.%H`, the file's local modification date and hour on the host (no zone). It carries no
   success flag and no duration: only builds that were uploaded appear, so it is a record of
   completed builds.
4. **Our site.** `scripts/fetch-ci` reads `emacs-latest.json` (or a saved copy, `--from`) and writes
   `content/ci/builds.json` in the same row shape plus `source` and `fetched`. Every field must match
   a strict pattern, so no path, host name or secret can ride along. `scripts/fetch-feeds` reads the
   blog's RSS 2.0 or Atom feed and writes `content/feeds/emacs-blog.json`
   (`source`, `feed`, `fetched`, `status`, `posts[]` of `title`, `date` as `YYYY-MM-DD` or null, `url`
   on `corwin.bru.st` over https, `tags`). XML with a DOCTYPE or entity is refused. Both keep the old
   snapshot when they read nothing.

## What is committed today

- `content/ci/builds.json`: the real `emacs-latest.js` as published, read 2026-11-01.
- `content/feeds/emacs-blog.json`: the five newest titles seen on the blog's front page on
  2026-11-01, with no dates and every link pointing at the blog's front page, because no feed could
  be read from the build environment. Run `scripts/fetch-feeds` where the blog is reachable to
  replace it with dated posts and their own links.

## Open for Corwin

- Point at the Hugo tree if the card should read its front matter (tags, dates) directly.
- Whether `emacs-latest.json` should also carry a result and a duration: `crude-ci.sh` knows both
  (`health: OK` or `dubious`, and the log's span), but publishes neither today.
