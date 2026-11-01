<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# Voice read, 2026-11-01

Corwin noticed that the page "moves a little from first to third person and back". This is a
second read of every place the grammatical person shifts, as the source stood at commit `de2f8bf`
(the live page matched it on 2026-11-01).

## How it was read

Every file under `content/` and the page template `src/index.html` and `src/404.html`, searched for
`Corwin`, `he`, `him`, `his` against `I`, `my`, `me`, `we`, `our`, then each hit read in its
paragraph. The live page was fetched once to confirm it carries the same text.

## What was found (observed)

The page has three voices, and almost everywhere they sit where you would expect:

- **I** (Corwin speaking): the About, the two cards about him (`content/about/`), the five
  involvement cards (`content/involvements/`), the headings "Where I put my time" and "Two cards
  about me".
- **we** (the shop speaking): the idea cards (`content/concepts/`) and the project cards
  (`content/projects/`). The inputloop card moves from "I co-own" in its one-line role to "we" in
  its body, which reads as a person introducing a shop he is half of; it is not a slip.
- **Corwin / he** (spoken about): the places listed below.

### Shifts in the middle of a paragraph

| Where | Text (before) | Read | Done |
|---|---|---|---|
| `content/concepts/whose.txt:20` | "This page was drafted that way too: its commits are Corwin's, with a Mentat byline." | The only sentence in the card prose that names Corwin in the third person; every other line of the page says "I" for him. Accidental. | Changed to "its commits are mine". |
| `content/site.txt:27` (About, last paragraph) | "such as what does Corwin work on, is he on Emacs, how do I reach him, or what is inputloop. ... Below are the places I put my time" | The questions are a visitor's, so "Corwin", "he" and the visitor's "I" are deliberate, but nothing marked them, so the paragraph read as if the voice slipped and came back. | Marked as quoted questions; the wording is unchanged. |
| `content/site.txt:31` (footer) | "Things to ask the prompt: what does Corwin work on, is he on Emacs, ..." | Same as above. | Marked as quoted questions. |

### Shifts at a section boundary (left for Corwin)

| Where | Text | Read |
|---|---|---|
| `content/site.txt:1-5` | `title: Corwin Brust`, `pronouns: he/him`, and the meta `description: Corwin Brust: systems engineer ...` | Name, pronouns and the line search engines show. Third person is normal here. |
| `content/about/glance.txt:1` | Card title "Corwin at a glance", body "I am Corwin Brust." | A title about him over a card in his voice. Tests rely on the title (the prompt finds the overview by it). |
| `content/projects/php-backport.txt`, `content/involvements/inputloop.txt`, `content/concepts/whose.txt` stat lines | "Whose: Corwin's", "Owners: Bryant Frankford and Corwin Brust", "Credit words: Corwin's, Bryant's, ..." | Credit labels, given as the shop's catalog gives them. These have to name people. |
| `src/index.html:176` | Prompt placeholder "what does Corwin work on, is he on Emacs, how do I reach him…" | The visitor's voice, in the box the visitor types into. |
| `src/404.html:16` | "The page about Corwin is one level up." | The 404 page speaks as the site, not as him. Could be "My page is one level up" if he wants one voice everywhere. |
| footer | "© 2026 Corwin Brust and Contributors." | A legal line. |

## The rule (recommended)

**Card and About prose speak as "I" for Corwin and "we" for the shop. Corwin's name and he/him
appear only in titles, labels, credits, legal and meta lines, and in a visitor's question set in
quotation marks.**

The rule is now a check, written twice: `tests/py/test_site.py`
(`test_prose_keeps_one_voice`) and `tests/js/wording.test.mjs` read every card's prose sections
and the About and refuse "Corwin", "he", "him" or "his" outside quotation marks.
`tests/run.sh --prove-red` plants one slip for each reader and both go red.

## Also changed in this commit

- The init-files link now points at `https://git.sr.ht/~mplscorwin/dotfiles` (Corwin, 2026-11-01:
  the GitLab repository is an old copy). Two checks, Python and JavaScript, fail if the GitLab
  address appears anywhere in the built site, each with a planted fault.
- The About's first paragraph adds two facts from Corwin's own sourcehut profile
  (https://sr.ht/~mplscorwin/, read 2026-11-01): he volunteers as an SRE with the FSF's sysops team,
  and he helps maintain Worg. Other candidates found in the same pass are kept in the voice palace
  (C4 `d/voice-palace`) for his yes, not put on the page.
