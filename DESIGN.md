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

Only what is public. Of inputloop's repositories, GitHub reported seven public on 2026-10-29, and corwin.cloud was public by 2026-11-01; those
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

## Turned down

- **A framework or a bundler.** Nothing here needs one, and either would put minified code between
  a reader and the source.
- **Web fonts.** A request to another host for every visitor, for a small gain.
- **A search server or an AI model behind the prompt.** It would need the network, go down, and
  learn what people type. If one is added later, this offline taxonomy stays as the fallback.
- **Hiding non-matching cards behind `aria-hidden`.** Hidden cards are `display: none`, so they are
  gone for everyone alike, and the echo says how many are shown.
