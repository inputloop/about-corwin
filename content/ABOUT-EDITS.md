<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# Corwin's hand edits to the About, kept as rules

Read this before rewriting the About (`content/site.txt`, `== about ==`) or any of its tone
versions (`content/sections/about.txt`). Each heading below is one correction Corwin made by hand;
the `rule:` lines under it say the correction so a machine can check it. A rewrite that drops one
of these is wrong even if every other check is green: the point of this file is that he never has
to make the same correction twice.

How the rules are checked: `build_tone.py` (Python) and `tests/js/tone.test.mjs` (JavaScript) each
read this file, separately, and hold the About's base text and all eleven tone versions to every
rule. Each correction also has a planted fault in `tests/run.sh --prove-red`.

Rule kinds (one per line, `rule: KIND | TEXT`):

- `has`: every version holds TEXT exactly, letter for letter (links included).
- `match`: every version matches TEXT, a regular expression, ignoring case.
- `never`: no version matches TEXT, a regular expression, ignoring case.

Wording is free around these: a version may say the rest of a sentence in its own warmth and
reading level, but not lose or bend what a rule holds.

## 1. The family list (2026-11-02)

His words: "educators and writers, fans and scientists who organize." It replaced "writers,
organizers and fans".

rule: has | educators and writers, fans and scientists who organize
rule: never | writers, organizers and fans

## 2. Two links for his dad (2026-11-02)

Each part of the name links: the first to Dream Café, his dad's own site; the second to his
Wikipedia article.

rule: has | [Steven](https://dreamcafe.com/) [Brust](https://en.wikipedia.org/wiki/Steven_Brust)
rule: never | \[Steven Brust\]\(

## 3. "Their parents", not "my grandparents" (2026-11-02)

rule: match | \btheir parents\b
rule: never | grandparent

## 4. Jean and Bill Brust, Jean first, a link on each first name (2026-11-02)

His form: "Jean (link) and Bill (link) Brust". Jean's link is her page in the University of
Minnesota's Minnesota Election Archive; Bill's is the 1991 resolution in his honour on the World
Socialist Web Site.

rule: has | [Jean](https://mn.electionarchives.lib.umn.edu/candidate/jean-t-brust/) and [Bill](https://www.wsws.org/en/special/library/fi-19-1/15.html) Brust
rule: never | \[Bill Brust\]|\[Jean Brust\]

## 5. The marriage, in his words (2026-11-02)

His words: "I'm married to Dee" or "In 2006 I married Dee". Warm versions use the first, the
others the second; formal versions may say it of "Corwin Brust". The year is in every version.

rule: match | (I'm married to|I married|Corwin Brust married) \[Dee Brust\]
rule: has | 2006
rule: never | I am married

## 6. The kids (2026-11-02)

His words, to be reworded to fit: "we have five kids, one out of college and one just starting,
the rest in primary school." No names, no ages, nothing more than that.

rule: has | five kids
rule: has | out of college
rule: has | just starting college
rule: has | primary school
rule: never | \b(son|daughter|aged?|years old)\b

## 7. Minicon (2026-11-02)

His words: "I co-chaired Minicon 37 in 2002." Say that and only that; the sentence that says it
names no one else.

rule: has | co-chaired [Minicon 37](https://mnstf.org/minicon/) in 2002
rule: never | (have run|ran) a \[?Minicon
