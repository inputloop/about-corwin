<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# Design

What the page has to be, the choices that follow, and the ones we turned down.

## Scripts are a layer, not a requirement

Many of the people who will read this page browse with GNU LibreJS, NoScript, a text browser, a
screen reader, or Emacs's own eww. So the page is written first as HTML and CSS that stand on their
own, and the scripts are added on top.

| With scripts off | With scripts on |
|---|---|
| Every card's introduction, back and scoreboard open under a native `<details>` | A click grows the card into an index card; the window opens the featured view |
| Each window shows a still picture drawn in CSS gradients | Each window plays its canvas picture; offscreen ones sleep |
| The portfolio's parallax runs where the browser ties CSS animation to scrolling (`animation-timeline: view()`) | The same, plus a script fallback where the browser cannot |
| The mode-line's position counter is CSS too: a registered integer property animated by the root scroll timeline and printed with `counter()` | The script writes Top, a percentage, or Bot, and the section name |
| The mode-line is `position: sticky` at the bottom, and the minibuffer follows it in the flow, so at the end of the page the mode-line gains a second line by itself | The same; a click on the mode-line flies the page down and opens the prompt |
| The quick filters are radio buttons, and `body:has(#f-play:checked)` hides the rest; a CSS counter says how many are left | The same, plus the prompt (each clears the other) |

What scripts never do: fetch anything, set a cookie, or store anything except your Motion choice
(in your own browser). The content security policy in `src/.htaccess` enforces the first:
`connect-src 'none'`, scripts only from this site, no inline script, no inline style attributes.
That is also why the build never writes a `style=""` attribute: tilts and colours come from classes
and `:nth-child`.

**LibreJS.** Each script starts with a `@license` magnet line for the GPL and ends with
`@license-end`, and `jslicense.html` is a JavaScript Web Labels table linked with `rel="jslicense"`.
Nothing is minified, so the source column links to the very file that runs. The build refuses a
script without the labels, and the tests check the table lists exactly the scripts the page loads.

## Accessibility

The rules we built to, and the tests that hold them, are in [ACCESSIBILITY.md](ACCESSIBILITY.md).
In short: real landmarks and a skip link; one `h1` and no skipped heading levels; every window is a
button named "More about X" (the same words as its tooltip); the prompt's answer is a polite status
line that names the tags it matched; Okabe-Ito colours, always paired with a shape; contrast
measured in both themes; motion starts still when the system asks for reduced motion, and a Motion
button in the masthead turns it on or off either way.

## Voice

Plain words, first person for Corwin's own parts and "we" for the shop, after the shop's public page:
say what a thing is, what it does, who made it and whether a stranger can use it today. No hype; a
number only when it can be counted, and then with the date it was counted. Credit as the shop's
catalog gives it: NextTime is Brigidt's, Quantum 3D5 is Bryant's, and fourSwordsFromThePast's
credit is "not yet written", because its README does not say yet. Each card explains how its own
navigation works once, matter-of-factly, in its introduction.

## What is on the page, and what is not

Only what is public. Of inputloop's repositories, GitHub reported seven public on 2026-10-29, corwin.cloud was public by 2026-11-01, on 2026-11-01 so were topology (branch corwin), about-corwin, gitcha, ta, three-phase-transcription and journal, and on 2026-11-04 so was pubs (the picture book's folder, linked from its card beside the page ghostlights.theater serves); those
are the only ones the page links, and `build.PUBLIC_REPOS` plus a test enforce it. Corwin's
involvements are taken from public sources: the EmacsConf talk pages (2020, 2023), the
`Maintainer:` line of `ob-perl.el` in Emacs, the Dungeon repository on Savannah, and Corwin's own
word in the session for the gnu.org Windows page and the family line. The ideas cards draw on the
shop's public page and the public vibrobeast-skills.

## The content store

The house rule asks that a new body of data not become a table by reflex. The four stores, weighed:

- **A leaf tree, one file per value** (`content/dungeon/title`, `.../role`, ...): very easy to
  diff, but a card's prose would be scattered over a dozen files, and prose is most of a card.
- **Prose with a marker window**: natural for the long text, awkward for the dozen short facts.
- **A table with a descriptor** (TSV): good for the short facts, bad for paragraphs, and a single
  file everyone edits at once.
- **Prose.**

Chosen: **one plain text file per card, a header of `key: value` lines, then prose under
`== layer ==` headings.** It is prose with a small marker window, one file per card, so a card is
read and changed in one place, a diff names the card, and the layers the taxonomy reads are the
headings a writer already uses. `content/vocabulary.txt` is one tag per line for the same reason.
The build writes the index (`public/taxonomy.json`, embedded in the page) as JSON, because it is
read by code, not people.

## The prompt: a taxonomy, balanced the way chamber balances

Every card is written in four layers: summary, function, practice, presentation. `build.py` reads
each layer for the words in `content/vocabulary.txt` and weighs a hit by its layer (title 1.0,
role and summary 0.8, function 0.6, practice 0.5, presentation 0.4), plus the card's own tags and
its four shop-page words (do, bring, whose, state) at 1.0. The views (business card, introduction,
back, scoreboard, window) and the twelve window pictures are described the same way, so they are in
the same taxonomy.

In the browser, `src/js/taxonomy.js`:

1. measures association between tags as normalized pointwise mutual information over the cards
   (Python recomputes it in the tests and the two must agree). The views and windows are left out
   of this step, and so is a hub: a card naming more than 1.5 times the median number of tags (the
   shop's own card names every field it works in, and would tie them all together);
2. lays the tags out as a tension field with C4's `chamber.model.js`, seeded so it settles the same
   way everywhere; associated tags pull together, all push apart, and the field settles toward
   balance (the Ideas card "How the prompt finds things" shows it live, with its balance reading);
3. matches the prompt's words to tags: exact, plural, prefix, or one typo (sharing the first
   letter), with exact matches winning, so "numbers" is never read as "members"; names are matched
   too, so "vibrobest" finds vibrobeast, but a prefix names a card only when it is most of the
   name ("quantum" names Quantum 3D5; "back" does not name the backport);
4. spreads each match one step along the associations, then scores cards per facet, damping a
   facet by how many of its tags lit up so no one facet drowns the rest. A tag reached only by
   spreading counts 0.3 against 1 for a direct hit, and a card is shown only for a word it says
   itself (or its name); spreading ranks, it does not admit;
5. nudges each card by how close its centroid sits to the query's centroid in the field;
6. reads the view and window items separately: "numbers" opens the scoreboard, "facts" the back,
   "show me" the window grown large; "fog" means a map, and the window it names (the fog map) adds
   a lean toward the card that shows it, so Dungeon comes first. Words about
   how to see a thing count for only 0.3 when scoring cards, so they choose views, not subjects.

The echo area always says which tags matched, so the guess can be checked. The quick filters and
the prompt narrow the same deck, so using one clears the other, and the echo counts the cards you
can see. Without scripts, a CSS counter under the filters says how many are left.

## Questions about Corwin

A visitor will ask the prompt who he is, what he works on, whether he is on Emacs, how to reach him
and what inputloop is. Two cards of a fourth kind, `about` (content/about/), answer the first
three of those: "Corwin at a glance" and "Find me". Their words are in the vocabulary as `profile`,
`work` and `contact` (`reach`, `mail`, `mastodon`, `irc`, `about me`, `who is corwin`), and the
node checks pin each question to the card that answers it. A tag's own label counts as one of its
words in the prose, so a tag called `about` would have lit up every card that says "about"; that
is why it is `profile`. The footer and About text are `content/site.txt` layers (`about`,
`footer`), and each carries the date it was last checked.

## Windows

Each picture is a small canvas renderer in `src/js/windows.js`, drawn from ideas in C4's showroom:
the orb (LAB orb), shells (Spell Ball), the tension field (chamber), fog of war (DUNGEON-play),
planes in depth (LENS viz), and the Emacs buffer with its mode-line (the front door's Emacs look).
One loop draws the windows on screen at up to 30 frames a second; with motion off each draws one
still frame and the loop stops. Who decides: with scripts off, the system's reduced-motion setting;
with scripts on, the Motion button, which starts from that setting and sets `motion-on` or
`motion-off` on `<html>` for the CSS to follow, so turning Motion on brings back the parallax too.
The fly-down stops the moment you use the wheel, touch the screen or press a key.

The CSS and script URLs carry a hash of the file (`site.css?v=...`), so after a deploy no browser
runs yesterday's script against today's page.

## The tone d-pad

Corwin, 2026-11-01 17:07: a two-direction pad, plastic to look at, that moves "the principle
introductory texts globally or section by section along two lines: more personal/intimate/warm to
more professional/formal/dry, and 4th grade/equiv. native language proficiency up to collage+"; a
glow that follows the pointer by quadrant; Ctrl with the arrows doing what clicks do; and a pad at
the top for the whole page that stays put and dodges the section pads as they scroll by, "floating
slightly out of place ... don't go for symmetry: dodge". His answers of 17:53 settled the rest: up
is harder ("break that down for me" is down), with an option to turn that around; grade 4 means
friendly to a child in 4th grade; the formal end may say "Corwin Brust"; lines of his poems may
appear, offered CC-BY-SA-4.0; reading level does not follow the browser's language (English only
for now; he changed this on 2026-11-02, see "The browser's language" below); and the page pad may "be where it wants", pushed by an anti-gravity worked out from a
rectangle set slightly inside each other button, with related but different rules for up-down and
left-right.

**The two lines.** Warmth has three steps (warm, plain, formal) and reading four (about grade 4,
grade 8, grade 12, college). The words already on the page are "plain, grade 8": measured on
2026-11-01, the About read grade 6.4 by Flesch-Kincaid and 6.7 by Coleman-Liau, not the grade 12
the plan guessed, so the pad goes one step simpler and two harder from what is written. His own
writing sits at grade 5 to 9 (the voice palace's REGISTERS.md), so this is his voice's middle.

**Coverage, and why.** The About and the four lead-ins of the sections with a pad (Where I put my
time; inputloop, What you can pick up today, Ideas): five texts, twelve versions each, all written,
so no reader ever meets a fallback. Chosen (Corwin: "leaving this to your artistic take") because
these are the texts that introduce; the cards already have their own short form, and 25 cards times
eleven versions would be hard to keep true. The About's family paragraph stays word for word in
every version (`[[keep]]`) until 2026-11-02: it describes other people, and he had said he would
reword it himself. He did (see "His hand edits" below), so it is now written in every version like
the rest, from his words, held to them by facts and rules. Lines from "Cupcakes" (his
published poem) close the warm versions of the About, credited and under CC-BY-SA-4.0; once in a
version, no more.

**The store.** `content/sections/<id>.txt`, the same one-file-per-thing store as the cards: a
header (`unit:`, `keep:`, `fact:`, `extra:`) and `== UNIT / WARMTH STEP ==` layers beside the base.
The About's base stays in `site.txt`; the lead-ins' bases moved out of `src/index.html` word for
word. `build_tone.py` reads and checks them; `build.py` writes the base as live HTML and every
other version into a `<template>` (allowed by the CSP, out of the accessibility tree, found by no
search until shown). With scripts off there are no pads and the text is the text as written.

**Keeping the versions honest** (`tests/spec/TONE.txt` says each rule in plain words; Python and
JavaScript each follow it, separately):

- Same facts: every version holds every `fact:` exactly, and adds no link, number or name the base
  and its `extra:` lines do not already have.
- Reading rises: Flesch-Kincaid in Python (syllables, copied from the voice palace's fk.py) and
  Coleman-Liau in JavaScript (letters; no method shared). At each warmth the four steps must rise on
  both; the About must also sit in each step's band on both. A lead-in of one or two sentences is
  held to order only.
- Warmth falls: a count of contractions, "you", "I/we", a few feeling words and question marks,
  less nouns made of verbs (-tion, -ment); warm > plain > formal at every step by at least 1. It
  measures direction only; whether a version sounds like him is his read.
- The voice rule: "I" and "we"; only formal versions may say "Corwin Brust"; no he, him or his.
- The page's base is untouched: take away what the tone work adds and the page is the page the
  build writes with tone switched off.

Measured on 2026-11-01 (Flesch-Kincaid / Coleman-Liau), the About: warm 1.3/1.3, 5.5/6.2, 9.9/9.4,
14.5/14.1; plain 1.6/1.9, 6.4/6.7 (as written), 11.7/11.3, 16.0/15.6; formal 2.6/4.4, 6.7/8.4,
10.9/12.7, 18.3/19.6. `python3 build_tone.py` prints every version's numbers.
Measured again on 2026-11-02, after the family paragraph joined every version (his hand edits):
warm 1.7/2.0, 5.9/6.6, 9.7/9.1, 13.9/13.5; plain 2.0/2.5, 6.5/7.0 (as written), 11.1/10.9,
15.0/14.9; formal 3.3/5.4, 7.4/9.2, 10.8/12.7, 17.1/18.7. Warmth, warm to formal: grade 4 24.5,
9.4, 0.4; grade 8 18.9, 7.1, -2.5; grade 12 19.8, 1.7, -9.1; college 11.5, -4.0, -18.1.

**His hand edits, kept as rules.** Corwin, 2026-11-02: "my sense is you understand my hand edits
to your work but we're less likely to repeat the correction without my mentioning it again next
time: that's the opportunity space." So a correction of his never lives only in the words on the
page. It goes into the source the About is built from (`site.txt` and every version in
`content/sections/about.txt`), onto the About's `fact:` list, and into `content/ABOUT-EDITS.md`,
one heading per correction with his words and `rule:` lines (`has`, `match`, `never`) that
`build_tone.py` and `tests/js/tone.test.mjs` each read and hold every version to. Anyone (person or
model) who regenerates the About reads that file first; a version that undoes a correction fails the
checks, and `tests/py/test_about_edits.py` has one test per correction, each with a planted fault.
The first seven: the family list ("educators and writers, fans and scientists who organize"), two
links for his dad (Dream Café and Wikipedia), "their parents" (not "my grandparents"), "Jean and
Bill Brust" with a link on each, the marriage in his words with the year, the five kids as he said
it and no more, and "I co-chaired Minicon 37 in 2002", in a sentence that names no one else.

**The pads.** A cross of four arms and a centre, each a real button with a name in words ("Warmer:
the About"); an arm at the end of its line is `aria-disabled`; one polite status line says what
changed. Left warmer, right more formal, up harder, down simpler. On a section pad the centre means
"same as the whole page"; on the page pad it means "as written". A section set back to the page's
tone stops being different and follows the page again. The look is CSS only, from egad-style tokens
in every theme (`--pad-*`): a domed radial gradient, an inset rim, a gloss band, a soft shadow; a
pressed arm sinks. The glow: on pointer move, the angle from the centre picks the arm (the
quadrants turned 45 degrees to line up with the arms; the middle is the centre button), and a
radial glow sits at the pointer through `--gx` and `--gy`, set with CSSOM, which the CSP allows (a
check runs under the real header). No glow on touch, with Motion off, or with reduced motion.

**Keys.** Ctrl+arrows: the section that holds focus, or the one across the upper third of the
window, or else the page. Ctrl+Shift+arrows: the page (left alone while text is selected, so a
selection can grow). Ctrl+Shift+Home: everything as written. On a focused pad: the arrows, h j k l,
Home, and C-f, C-b, C-p as in Emacs (not C-n: browsers keep Ctrl+N for a new window). Never in a
text field; nothing with Alt; every shortcut has a modifier or needs focus (WCAG 2.1.4). macOS
takes Ctrl+arrows for Spaces, so the page says to Tab to a pad there.

**Customize.** Two rows, Warmth and Reading, share the page pad's state, and a third holds the
inverted option: "Up makes the words simpler", like an inverted mouse. These rows save as you go
under their own key, `aboutcorwin.tone` (`{global, sections, invert}`, cleaned on reading);
Customize's own Apply and key are untouched. Storage refused still works for the visit.

**The browser's language.** Corwin, 2026-11-02: "Browser Language: SOLD. Default ON (Text Density
Follows Browser Language Selection: non-English is less dense, or please correct/revise and also
clue me in)." The page stays English (his earlier answer stands); what follows the language is
where a reader starts. The rule (`tests/spec/TONE.txt`, 8, with its cases): a reader with no saved
choice whose browser's *first* language is not English starts at plain, grade 4, one reading step
simpler than the words as written; every English (en, en-US, en-GB, en-IN ...) counts as English;
an unknown or missing language starts as written. One quiet line under the About heading says so
("Starting with simpler English because your browser prefers German; the pad changes it."), the
language named in English by `Intl.DisplayNames` (or its code where that is missing); nothing is
fetched. Why this mapping and not another:

- *One step, not two.* The base already measures about grade 6.4, and grade 4 is the only step
  below it; there is no second step to take. A step simpler is also the gentlest guess: it is one
  click (or Ctrl+Shift+Up) away from the words as written.
- *Plain, not warm.* Warmth stays where it is written. Warm versions lean on contractions and
  feeling words, which are harder, not easier, in a second language.
- *The first language only.* A browser listing English second (`["de", "en"]`) may well belong to
  a fluent reader, but it says the reader *prefers* German, and many browsers add English to the
  list on their own (Chrome in German often reports `de-DE, de, en-US, en`). A rule of "only when
  English is missing" would almost never fire. Being wrong costs a fluent reader one look at a
  simpler text and a line saying how to change it.
- *A choice always wins.* Moving any pad or a Warmth or Reading row (or Ctrl+Shift+Home) makes the
  tone the reader's and saves it, even if it is the words as written; the line then goes. The
  start itself is never saved: it is worked out again on each visit, so a browser whose language
  changes gets the new start.
- *Off is one row.* Customize has "Follow my browser's language", on unless turned off, kept in
  this browser under the same key (`{global, sections, invert, lang, chosen}`); turning it off with
  no choice saved puts the words as written at once.

**The drift: where the page pad wants to be.** It lives in a fixed dock under Customize and sits
where the pushes on it balance, so it moves around a little and never mirrors. Every frame while
anything moves (scroll, resize, pinch zoom through `visualViewport`, a text-size change through a
`ResizeObserver`), `dpad.js` measures, live, the page pad's box P and each obstacle: the section
pads and the other controls nearby (Motion). Customize is not an obstacle but the dock's ceiling.
For an obstacle, take its button box and set it in on every side by 15% of its smaller side; d is
the gap from P to that inner rectangle (negative when they overlap, by that depth); s is the page
pad's width; an obstacle farther than 2.5 s away does not push.

- Up and down: **Fy = s × e^(−d / (s/2))**, with d no less than −s/2, pointing away from the
  obstacle's centre. It falls off fast: strong close by, gone within a pad or so.
- Left and right: **Fx = 0.9 s × ((0.6 s) / (0.6 s + d))²**, with d no less than −0.3 s, pointing
  left unless the pad's centre is more than a quarter pad right of the obstacle's. It falls off
  slowly, as the square of a distance, so the sideways dodge begins first and lasts longest; and it
  prefers one side, so the pad dodges rather than mirrors.
- A spring pulls it home with K = 0.5. Each frame: v = 0.7 × (v + 0.12 × (F − K·x)); x = x + v.
  Then x is held inside the dock region (up to 3 pads left, 2.5 pads down, never above home) and
  inside the visible frame; an axis held at an edge stops there. It settles, and stops working,
  once what is left of the speed and the push is small, so it does not jitter.

No position is written down anywhere: home comes from the stylesheet's dock rule beside Customize,
and everything else is measured. Hover or focus on the page pad brings it fully home at once and
holds it there, so a focused arm is never covered (WCAG 2.4.11); its caption shows then too. With
reduced motion (or Motion off) it works out where it would settle and jumps there, with no glide
and no tilt; otherwise it tilts with its sideways speed, up to 4 degrees. The open Customize palette
may cover it: the palette's own Warmth and Reading rows do the same job.

**Checks.** `tests/py/test_tone.py`, `tests/js/tone.test.mjs` and `tests/browser/dpad.test.mjs`
(served with the real CSP header): every rule above; the arms, a section apart from the page and
back, the keys, text fields and selections left alone, the inverted option kept across a reload,
one storage key and nothing fetched, the browser's language (German starts simpler with its
line, British and American English do not, a saved choice wins, a pad makes it the reader's, the
row turns it off and stays off; the TONE.txt cases in Python and in JavaScript), the glow under the CSP, reduced motion, and the page pad clear
of every section pad at 17 scroll stops per pad, at 1280, 768, 640, 390 and 320 pixels (the last
three also stand for 1280 at 200%, about 330% and 400% zoom), at 100% and 175% text, inside the
frame each time, and focus bringing it home uncovered. Each promise has a planted fault in
`tests/run.sh --prove-red`.

## The links area: end credits

Corwin, 2026-11-02: a links area "in the right floating cluster", listing where he gives (Libera
Chat, GNU, the FSF, the EFF, SDF, the Software Freedom Conservancy, the ACLU, two animal places he
named in San Diego, the Como Zoo in St. Paul, and Liberapay), and the style: "run/smoosh the
categories and names together into a single stream, force-align, and pick a font that makes it look
like movie credits; the last I used like that was called Steel Tongs."

**Intention.** One small tab, "Links", hangs from the top edge just left of Customize, so the right
cluster reads Links, Customize, then the page's tone pad below. It opens a dark panel like the end
of a film: a small heading ("Where I give"), then every category and name in one justified stream,
force-aligned edge to edge (`text-align-last: justify`), category words small and spaced, names
large in a condensed gothic. Under it, his own figure with its date ("I give $4 a week through
Liberapay, as of 2026-11-02"), a note that these are plain links, and, set apart by a rule, one
quiet line: "Support my work: Liberapay · Patreon".

- **Where the links live.** `content/links.txt`: `role: CATEGORY | NAME | URL` lines in order (the
  same category on adjacent lines makes one group), one `give:` line, and `support:` lines. The
  build refuses anything but a plain `https://` link. Deleting the `support:` lines removes the
  support line and nothing else.
- **Nothing from another host.** Plain links only: no widget, badge, button script or image from
  Liberapay, Patreon or anyone (their own snippets load scripts and images from their hosts, which
  the CSP forbids). The CSP is unchanged.
- **The font.** League Gothic (The League of Moveable Type; SIL Open Font License 1.1), the Latin
  subset, 10 KB, served from this site (`src/fonts/`, its licence beside it and in `LICENSES/`), so
  `font-src 'self'` holds. It is preloaded with the page, so opening the links fetches nothing after
  load (the page's promise). Why this one: Steel Tongs (TracerTong) has no licence we could find, so
  it cannot be served; the Adobe Fonts in Corwin's Creative Cloud may only be served from Adobe's
  own host, which the CSP and the LibreJS promise rule out. Of the free ones, League Gothic is the
  revival of Alternate Gothic No. 1, the face of a century of title cards, with lower case and
  narrow enough that "Software Freedom Conservancy" fits a phone line; Bebas Neue (OFL) has only
  capitals; Oswald (OFL) is wider and rounder, more poster than credits.
- **Works without scripts.** It is a `<details>`: with scripts off it still opens and closes. With
  scripts on, opening it closes Customize and the other way round, and Escape closes it and puts
  focus back on its tab.
- **Accessible.** Underneath the look it is a real list: a list of categories, each holding a list of
  names, so a screen reader hears "Free software, list, 3 items". Colours are fixed for the panel
  in every theme (light text on near black), far past AA; focus rings are visible on the dark.
  Nothing in it moves, so reduced motion has nothing to stop. At 390 pixels it fits with no sideways
  scroll; names wrap between words.
- **Checks.** `tests/py/test_links.py` (the links, plain https only, nothing from another host, the
  vendored font and its licence, the preload, the list structure, the support line apart from the
  giving roll) and `tests/browser/links.test.mjs` (served with the real CSP header at 1280 and 390
  pixels, light and dark, en-US and de-DE: the tab clear of Customize, the panel in the frame,
  nothing fetched when it opens, Escape, one panel at a time, without scripts, the font in use).
  Each has a planted fault in `tests/run.sh --prove-red`.

**Whether to ask for support at all.** Corwin was unsure. Recommendation: keep one quiet line,
apart from the organizations he gives to, because a visitor who wants to help should find out how
without hunting, and keeping it apart and small means the page still reads as his giving, not his
asking. Removing it is deleting two lines of `content/links.txt`.

**Names checked, 2026-11-02.** Corwin first wrote "Nature by Nature", then corrected it to
"Nature by Nurture" (San Diego). No organization by that name turned up: naturebynurture.org is a
parked domain with no organization behind it, and searches found none in San Diego. The closest
real match is Nurtured by Nature, an animal sanctuary and otter rescue that gives its home as San
Diego (mail at Valley Center, CA), so it is listed under its own name until Corwin confirms or
names the right one. "Cabrillo Aquarium" is Cabrillo Marine Aquarium, in San Pedro, Los Angeles
(Corwin accepted this), and its category says so; each animal place carries its city in its
category words.

## What this site remembers

Corwin, 2026-11-04, on whether a rule of "no session or cookies until someone touches a 'more data'
control" covers a page remembering a person's own choices in their own browser: "Keep it, disclose
it: keep on-device remembering, and say so in each page's privacy note with a one-press 'forget my
settings'."

- **Each page has its own note**, a short part of "How this page works" (`#privacy`, exactly one per
  page): these pages collect nothing and set no cookies; with scripts on they keep a few of your own
  choices in this browser only, one key each, named with what it is for. build.py writes the note
  from one table, `PRIVACY_KEYS` (key, the script that writes it, what it is for), listing the keys
  that page's own scripts write: the home page `aboutcorwin.motion`, `aboutcorwin.customize` and,
  when the tone pads are built, `aboutcorwin.tone` (inside the tone markers); the cast page the first
  two.
- **The request log**: one sentence, this site's own, in `privacy-log.txt`. lo1re renders it from the
  logreq register's aboutcorwin.com rows (fork D, 2026-11-04): the site is on shared hosting it does
  not configure, so the sentence names no fields, says the host chooses what is kept and for how long,
  and that forgetting here does not touch it. build.py reads it as `PRIVACY_LOG` and types it nowhere;
  `test_privacy.py` holds each page to it, and it to the sha256 on its first line.
- **Forget my settings** (`site.js`) removes every key that begins `aboutcorwin.` and says so. It
  shows only with scripts on, since nothing is kept without them.
- **Each remembered feature links to its page's note**: the Motion button and the Customize panel.
- **Checks.** `tests/py/test_privacy.py` reads the scripts each page loads and holds that page's note
  to exactly the keys they write (a key it cannot read fails), wants one `#privacy` per page, refuses
  cookies and other stores, holds the request-log sentence to privacy-log.txt and that file to its
  stamp, and checks the links; `tests/browser/privacy.test.mjs` sets all three keys, presses Forget my settings on both pages, and
  follows the links. Each promise has a planted fault in `tests/run.sh --prove-red`.

## Dramatis personae: the second act

**Its own page.** Corwin, 2026-11-01 18:06: "we really want the cast page to be it's own page: what
was on the home page before was absolutely perfect: we want a second act." So the cast lives at
`cast/index.html` (aboutcorwin.com/cast/), built from `src/cast.html`, with its rules in
`css/cast.css`; the home page is what it was before the cast came (the build at 7fdb985^), plus one
quiet line at the very end of the footer: "Second act: the cast". The path is `cast/` because a
playbill's second page is the cast list and the word is short to type; the links name
`cast/index.html` and `../index.html` so the pages still work opened from disk, where a link to a
folder shows a file listing. The cast page has the home page's frame, byte for byte where it can
(Customize, the mode-line, the prompt; a test compares them), and the same CSP and LibreJS table,
which lists every script either page loads (`build.HOME_JS`, `build.CAST_JS`). Its prompt
searches the first page's cards and its answers lead back to them.

**Its top line.** Under its title the cast page carries the line Corwin chose on 2026-11-01 18:03
(T2, from c4 `q/2026-11-01-top-matter/TOP-MATTER.md`): "Copy anything here. When I build something,
I ask who it lets in and who it leaves out. If it left you out, tell me: corwin@bru.st". It is the
`stitch:` line of `content/site.txt`; the build makes the address a mail link and refuses a stitch
that does not end with the contact address. A test holds the exact words and their place.

Corwin, 2026-11-01: split the people and the agents' personas into two columns; as you scroll, one
column comes up while the other goes down, like a strip; at most one pair we know to be related is
level at a time; when two related cards come level they turn into one postcard for both, one
postcard at a time; and the prompt stays at the foot of the page.

**The data.** One header-only text file per person or persona in `content/personae/` (the same
store as the cards, for the same reasons): `title`, `kind` (person or persona), `role`, `credit`,
`source`, one `relation: other | what joins them | https source` line per pairing, and any number
of `with: other person | what joins them` lines. A relation always pairs a person with a persona,
is written once, and names its public source. A `with:` line joins two people: both stand in the
people's column, so they never come level; the line is written out under "Who works with whom"
(marked as Corwin's word when it names no source), makes no postcard, and plays no part in the
order. A card may not carry any other key, so nobody can be given a slot, an order or an offset by
hand: the build stops and says positions are computed.

**Who is in it.** At first only who the page or a public inputloop repository already named. Then
Corwin, 2026-11-01 19:39: "I think we can include some more of our labpartners and people who you
know about on our cast page; I will ask you to take things down you miss a beat." So the people's
column also holds David Dyer-Bennet (DD-B, who said yes to being named, 2026-10-24), Rachel
(Teachable), Pierre ("Peer"), Bob, Logan, Erik Elmshausertigger (tigersbite) and Jon Lincicum, each
in one file, so any one comes down by deleting a file. Each card says only what Corwin gave: what
they do with him, in plain words; nothing about keys or access, no contact details, no private
repositories, nothing personal. Brigidt is credited as she asks: K. Smith as editor,
definitelynotaspren for her repository work.

**The rule that places everyone.** People go in the left column, personas in the right. The left
column rises as you scroll and the right one falls, so the person in left slot *a* comes level with
the persona in right slot *b* when the columns have slid *a* − *b* slots past each other; call that
the pair's meeting step. `build.py` (`order_personae`) keeps the order of both columns where:

1. no two related pairs have the same meeting step, so at most one is ever level;
2. the meetings are as evenly spread as they can be: list the gaps between meeting steps, counting
   one step before the first and one after the last as the ends of the run, from smallest to
   largest, and prefer the order whose smallest gap is largest, then whose next gap is largest,
   and so on;
3. any tie goes to the order whose file names, read down the left column and then the right, come
   first alphabetically.

If no order keeps the pairs apart, the build stops and says so. Trying every order stopped being
possible when the cast grew (eleven people and three personas are 239 million orders), so the
search is cut without changing its answer: the meeting steps depend only on where the paired
people and personas stand, and for any such placement the alphabetically first reading has
everyone else in the free slots in alphabetical order. The build tries every placement of the
paired ones (5,940 here) and fills the rest in order; a check in each language holds that to trying
every order, on 40 small casts. The build writes each card's slot,
each pairing's step, and the first and last step of the run into the page; `src/js/personae.js`
only turns the scroll position into a step and moves the two columns by half a step each, opposite
ways. It has no names and no positions in it, and the stylesheet has no rule for any one card.

**The strip.** Because the columns move opposite ways, the run opens with the top of the people's
column meeting the bottom of the personas', and closes with the bottom of the people's meeting the
top of the personas': each column's end joins the other's start, as the two edges of a Möbius
strip do. The two small bands at the top and bottom of the stage draw those joints, each changing
colour halfway across for the half twist.

**Level, and the postcard.** Two cards are level while their centres are within 0.3 of a slot.
That is under half a slot, and related pairs never share a step, so at most one related pair is
level at any scroll position. While one is, its two cards fold toward the middle and fade, and one
postcard opens over them naming both and the relation; it is said once to screen readers, through
a polite status line, when the reader stops on it. Every card takes the height of the tallest, so
the slots stay even at any text size from Customize.

**Without motion.** With scripts off, Motion off, Customize's Reduce motion, or the system's
reduced-motion setting, the columns are two plain lists and nothing is pinned or moved. The
pairings are always written out under the columns ("Who works with whom"), each with its source,
so nothing a postcard says is only in a postcard. With motion on, each pairing also gets a "Show
this postcard" button, which scrolls to where that pair meets and moves focus to the postcard.

**Checks.** `tests/py/test_personae.py` (the page carries the computed order; no better-spaced
order exists; a changed relation changes the order; the build refuses a position in a card; no
stylesheet rule or script line names anyone), `tests/js/personae.test.mjs` (a second reader in
JavaScript applies the rule above to the content files and must reach the page's order), and
`tests/browser/personae.test.mjs` at 1280 and 390 pixels (opposite motion, at most one pair level
at 98 scroll positions, exactly one postcard while one is and none otherwise, the announcement,
the keyboard buttons, the still lists three ways, 175% text, and the prompt finding every card).
Each has a planted fault in `tests/run.sh --prove-red`.

## Turned down

- **A framework or a bundler.** Nothing here needs one, and either would put minified code between
  a reader and the source.
- **Web fonts from another host.** A request to another host for every visitor, for a small gain.
  (One font is served from this site since 2026-11-02, for the links area only; see "The links area".)
- **A search server or an AI model behind the prompt.** It would need the network, go down, and
  learn what people type. If one is added later, this offline taxonomy stays as the fallback.
- **Hiding non-matching cards behind `aria-hidden`.** Hidden cards are `display: none`, so they are
  gone for everyone alike, and the echo says how many are shown.
