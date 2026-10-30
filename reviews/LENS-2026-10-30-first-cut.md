produced-by: lens · subject: public/index.html (built from this tree) · sha256: 2d9e886ee0e982b9153bef5d31f5ca9d042d12df68a9229f1748217ec0917997 · 2026-10-30
<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# LENS · aboutcorwin.com, first cut · 2026-10-30

A dated record: appended to with dated sections, never edited.

```
LENS · aboutcorwin.com first cut · 2026-10-30
a  my view:            A public page that is honest about Corwin and generous about the shop: it names
                       only public work, credits Bryant and Brigidt as the catalog does, works with
                       scripts off, and shows off the UI tricks without hiding content behind them.
b  the view I ascribe: Corwin wants a page that sounds like him (plain, community-minded), features
                       all of inputloop rather than himself, and is technically a little showy for the
                       Emacs/LibreJS crowd (mode-line, no-JS, prompt) without being a toy.
                       (his words: the session prompt, "not being shovinsitic toward my own stuff";
                       "honesty, diligence, outreach" in his preferences)
c  their pull on mine: The mode-line, the parallax and the card mechanics are his specification; I would
                       have built a quieter page. The family line is there because he said in the
                       session it is fine to mention his dad and grandfather.
d  my pull on theirs:  I chose the voice (first person, the shop page's four words), which projects I
                       counted as "his involvements" from public sources, and that private repos stay
                       off the page. He has not seen any of it yet: every one of those is a proposal.
persona / inverse:     The shop's voice says: say what it is, whose it is, whether a stranger can use it.
                       / The inverse (a stranger, sceptical, on a phone with scripts blocked) says: the
                       page is long; the parallax words are noise; "Display" and "Ask the page" are
                       unexplained until the bottom; a family line on a work page reads as name-dropping
                       unless it is his own words.
principles reframe:    see below
notes: written
```

## What each view saw (observed)

- The page names 7 public inputloop repositories and no private one; a test fails if a private name or
  link appears. Corwin's involvements come from EmacsConf pages, Emacs's ob-perl.el header, and Savannah.
- With scripts off, every card's full text is present; tests check it card by card.
- The search runs offline and says which tags it matched.

## What the inverse found (judged; each with a falsifier)

1. **The family line is the one place the page touches third parties.** Principle 5 puts family and
   non-participants off-limits by construction; Corwin lifted that for his dad and grandfather in this
   session. Concern: Corwin's, to confirm the words. Falsifier: he reads the line and keeps it as is.
2. **The page is long for a first visit.** Concern: the reader's. Falsifier: a phone visitor finds the
   prompt or a given card in under a minute (the contents nav and the mode-line link both reach it).
3. **The private c4 model is published inside the site** (`js/chamber.model.js`, GPL, Corwin's own
   copyright). It is generic force-layout code with no private content, but it is the first piece of
   private c4 to be served publicly. Concern: Corwin's. Falsifier: he confirms publishing it is fine
   (or the file is replaced by a fresh implementation).
4. **This repository names gitcha** (gitcha-ci.org, BUILDING.md) as he asked; gitcha is private. The
   public page does not. Concern: Corwin's and Bryant's, before this repository is made public.
   Falsifier: they decide gitcha may be named, or the file is dropped from a public mirror.

## Principles reframe

1. *Universalism and egalitarianism first.* The page is readable by anyone: scripts off, screen
   readers, keyboard, reduced motion, phone width, high contrast. That is argued from "everyone gets
   the same page", not from taste, and it is tested.
2. *Four freedoms.* Every script is free and labelled so LibreJS can run it; the source is the
   running file; the site builds from plain text with a standard-library program anyone can read.
3. *The software-freedom movement.* The cards lead with upstream GNU work (Emacs on Windows, Org,
   EmacsConf, Dungeon on Savannah) before the shop, and the Ideas say why the shop publishes freely.
4. *The wider community.* Credit is given as the shop's catalog gives it; numbers carry the date they
   were counted, so a reader can check them.

A preference, labelled so: the Emacs look (mode-line, minibuffer). It is a choice of voice, not a
principle.

## Openings (the guard's other half)

- An Emacs surface over the same content: `content/` is plain text, so an `about-corwin.el` that reads
  it into an Org buffer is small, and would be the C4 "one model, many surfaces" test for this site.
- Bryant's page could share `build.py` and the card format, so the two pages read as a pair.
- The offline taxonomy is a reusable piece: the shop page's catalog could get the same prompt.

## 2026-10-30, later: what the second reader found, and what changed

An independent reviewer (a fresh session given the code and the requirements, not this record) read
the site. Everything below was confirmed and changed; prove-red grew from 15 to 19 planted faults.

- **Private detail in served files** (inverse finding 3, sharpened): the served model named the c4
  repository path, a commit and internal note names. Now the served header is neutral, the code is
  byte-identical to the original, provenance lives only in PROVENANCE.md, and a test scans every file
  in `public/` for private names.
- **An overstated claim**: "sends nothing unless you open a door" is not true of NextTime's map
  tiles. Narrowed, with the exception named.
- **Search precision**: the shop's own card tied every field together. Hubs and the view/window
  items no longer teach associations, a card is shown only for a word it says itself, spread counts
  0.3, and a name prefix must be most of the name. "php" went from 13 cards to 2.
- **Filters and prompt disagreed**: each now clears the other; the echo counts what is visible; a CSS
  counter says how many are left with scripts off.
- **Accessibility**: the mode-line's name now starts with its visible words (2.5.3); the single-key
  `/` shortcut is gone (2.1.4); results follow the prompt in tab order; window buttons carry
  `aria-expanded`; the Motion button now wins over the system setting, parallax included.
- **Smaller**: navigation help split for scripts on and off; build errors on a new `do` word or a
  malformed link are reported, not thrown; assets carry content hashes; the fly-down yields to the
  wheel, touch or a key; no TODO ships in the page.

Inverse finding 1 (family) widened at Corwin's word in the session: his dad Steven, his grandparents
Bill and Jean, his wife Dee, each linked, and his Minicon and science fiction fandom. It is still his
to confirm the wording. Findings 2 and 4 stand as written.
