<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# To any agent working in this repository

This is aboutcorwin.com. Read README.md, then DESIGN.md before changing how the page works.

## Who commits, and how the agent's part is said

As in every inputloop repository (the full rule: ils4's AGENTS.md, section 1): commits are authored by
the person the work is for, `Corwin Brust <corwin@bru.st>`, unsigned (signing is his act, by hand).
The agent's part is a byline, the last line of the message: `Mentat (for Corwin, <model>)`, with the
serving model as the session reports it. No vendor trailers, no session links. If your own
environment forbids naming the model, write `Mentat (for Corwin)` and say so in the hand-back.

## Where work lands

Work lands on `main` once it exists and the checks are green; a branch a hosting harness assigns is
a staging post. Nothing here lets a session make the repository public, rewrite history, or
force-push.

## Before every push

- `make check` (or `sh tests/run.sh`) green, and `make prove-red` ending `PROVE-RED OK`.
- A new promise gets a check, and the check gets a planted fault in `tests/run.sh --prove-red`.
- Link only public repositories (`build.PUBLIC_REPOS`); a private project's name stays off the page.
- Every script keeps its LibreJS labels and its row in `jslicense.html` (the build refuses otherwise).
- No inline script, no `style=""`, nothing loaded from another host: the CSP forbids them.
- The request-log sentence lives in `privacy-log.txt`, rendered from the logreq register
  (`lo1re render REGISTER aboutcorwin.com notefile`). Never edit it by hand and never type it into
  build.py; `tests/py/test_privacy.py` checks its stamp and that it has one home.
- Numbers only with the date they were counted; credit as the shop's catalog gives it.

## Data

The content store was chosen, not defaulted: one text file per card. DESIGN.md, "The content store",
lays out the four stores and why.
