<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# about-corwin

The source of **aboutcorwin.com**: a page about Corwin Brust and the places he puts his time (GNU Emacs
for Windows, EmacsConf, Org Babel's Perl support, Dungeon) that opens into a portfolio of inputloop,
the free software shop he keeps with Bryant Frankford.

It is one page of HTML and CSS that reads well with scripts turned off. The scripts, all free and
labelled for GNU LibreJS, add moving windows on each card, a parallax portfolio, cards that grow
into index cards, an Emacs-style mode-line, and a prompt that searches the cards by meaning with no
server behind it.

- `content/`: the words. One plain text file per card, plus `site.txt` and `vocabulary.txt`.
- `src/`: the page template, the stylesheet, the scripts, the logos, `.htaccess`.
- `build.py`: turns the two into `public/`. Python 3.8 or later, standard library only.
- `tests/`: Python, JavaScript and browser checks, and `tests/run.sh --prove-red`, which breaks a
  copy on purpose to show that each check can fail.
- [DESIGN.md](DESIGN.md) says why it is made this way; [ACCESSIBILITY.md](ACCESSIBILITY.md) says what
  it can and cannot do for people using assistive technology; [BUILDING.md](BUILDING.md) covers
  every place it builds (Linux, macOS, Windows, Guix, a container, GitHub, Gitea, Forgejo, gitcha)
  and how to put it on Dreamhost.

## Quick start

```sh
python3 build.py                         # writes public/
python3 -m http.server -d public 8000    # then open http://127.0.0.1:8000/
```

Or open `public/index.html` straight from disk: everything works from `file://` too.

To run every check: `make check` (needs node 18+ and `npm install` for the browser checks; `make
check-fast` skips the browser). Windows without make: `.\build.ps1 check`.

## Change the words

Edit a file in `content/`, then build. A card file looks like this:

```
title: Dungeon
role: I co-founded Dungeon, an engine for tabletop-style dungeon crawls that runs inside GNU Emacs.
order: 4                 # position in its section
window: fog              # which picture plays in the window (content/windows/)
logo: dungeon            # optional: src/logos/dungeon.svg shows when you hover the window
do: play                 # the shop page's four words: do, bring, whose, state
bring: an-emacs
whose: community
state: upstream
tags: emacs, game, tabletop
link: Label | https://...
stat: Label | value      # the back of the card
score: Label | 3 | 2026-10   # the scoreboard: a count and the date it was counted

== summary ==
What it is.
== function ==
What it does.
== practice ==
How we practise it.
== presentation ==
How its window shows it.
```

Every tag must be in `content/vocabulary.txt`; the build stops on one that is not, and says which.
The build also reads the prose for vocabulary words, so a card is found by what it says, not only by
its tags. Keep prose under 500 words per card. Link only repositories that are public.

## Open items for Corwin

- `src/index.html` has a `TODO(Corwin)`: a line in your own words, if you want one, and your GPG
  fingerprint, which this page does not guess. The Find me list points to the Windows section of the
  Emacs download page, where it is listed.
- The family and fandom paragraph in `content/site.txt` (Steven, Bill and Jean Brust, Dee Brust,
  Minicon) was written from what you said in the session; trim or reword it as you like. Jean's link
  is *Defending Principles*, the book of Bill's writing she edited and introduced (no WSWS page about
  her own life turned up). Minicon links to mnstf.org/minicon/, because minicon.org's https
  certificate does not verify (it redirects there over plain http).
- fourSwordsFromThePast's credit is "not yet written in its README", as the shop page has it.

## Licence

Words, content and logos: CC-BY-SA-4.0. Code (`build.py`, `src/js/`, `src/css/`, tests, scripts):
GPL-3.0-or-later. Full texts in `LICENSES/`. `src/js/chamber.model.js` comes from C4; see
[PROVENANCE.md](PROVENANCE.md).

Copyright 2026 Corwin Brust and Contributors. Drafted with Mentat, Claude models working for inputloop.
