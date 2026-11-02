<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
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

Only what is public. Of inputloop's repositories, GitHub reported seven public on 2026-10-29, corwin.cloud was public by 2026-11-01, and on 2026-11-01 so were topology (branch corwin), about-corwin, gitcha, ta, three-phase-transcription and journal; those
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
- **Web fonts.** A request to another host for every visitor, for a small gain.
- **A search server or an AI model behind the prompt.** It would need the network, go down, and
  learn what people type. If one is added later, this offline taxonomy stays as the fallback.
- **Hiding non-matching cards behind `aria-hidden`.** Hidden cards are `display: none`, so they are
  gone for everyone alike, and the echo says how many are shown.
