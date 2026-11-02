<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# Provenance

## src/js/chamber.model.js

- From: inputloop/c4, `showroom/views/chamber/chamber.model.js`
- Commit: `925ce5895bd05c277b303f049368b3f5f1e4571f` (2026-10-14)
- Licence: GPL-3.0-or-later, Copyright 2026 Corwin Brust (the file's own header)
- Changes: none to the code. The header comment was replaced by a shorter one for publication (the
  original named private paths and notes), the GNU LibreJS `@license` line was added above it, and
  `// @license-end` below. `git diff --no-index` against the original shows only those lines.
- Used by: `src/js/taxonomy.js`, which lays the site's tags out as a tension field with it, and
  `tests/js/taxonomy.test.mjs`, which checks it still converges on its own.

## build_tone.py: the Flesch-Kincaid count

- From: the voice palace in inputloop/c4, `d/voice-palace/readability/fk.py` (Corwin's,
  GPL-3.0-or-later; its rules in `readability/SPEC.md` there, read 2026-11-01).
- Changes: the word, sentence and syllable rules are the same; the counting was folded into
  `count()` and `fk()` to take a list of paragraphs, and `[[keep]]` paragraphs and Markdown links
  are set aside first (`tests/spec/TONE.txt`, 2). The palace's awk twin, fk.awk, was not copied:
  here the second reading meter is Coleman-Liau in JavaScript, which shares no method with it.

## Ideas, not code

The window pictures in `src/js/windows.js` were written for this site; their ideas come from C4's
showroom and `h/` demos (named here, not in the served files) (LAB orb, Spell Ball, chamber, DUNGEON-play, LENS viz, the front door's Emacs
look). The four browsing words (do, bring, whose, state) come from the inputloop organization page
(inputloop/.github `profile/catalog.tsv`). The logos in `src/logos/` are plain monograms drawn for
this site, not any project's own mark.
