<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# Accessibility

What the page can do, what it partly does, and what it cannot, against WCAG 2.2 AA. The form follows
Spell Ball's accessibility note in C4's showroom. Where a test holds a promise, it is named.

## Can

- **Read with no scripts, and with any reader.** Every card's full text is in the HTML under a
  native `<details>`; nothing is drawn only in canvas. (`test_every_card_is_complete_without_scripts`,
  browser: "without scripts")
- **Structure.** Banner, navigation, main and contentinfo landmarks; a skip link first; one `h1` and
  no skipped heading levels; unique ids and references that resolve. (1.3.1, 2.4.1, 2.4.6;
  `test_landmarks`, `test_one_h1_and_no_skipped_heading_levels`, `test_ids_unique_and_references_resolve`)
- **Names.** Every window is a button named "More about X", the same words as its tooltip, and says
  whether its card is open (`aria-expanded`); the mode-line's name begins with the words it shows;
  every link, button and summary has a name; every form control has a label; logos are decorative
  inside a named button. (4.1.2; `test_links_and_buttons_have_names`, browser: "windows become
  labelled buttons")
- **Keyboard.** Everything that opens with a click opens from the keyboard: the summary opens the
  introduction and puts focus on the view buttons; the window button opens the featured view;
  Escape closes the card and returns focus to its window; Alt+x goes to the prompt; Escape or
  Ctrl+g clears it; ↑ and ↓ walk its history; Tab goes on from the prompt to its results. There are
  no single-key shortcuts. (2.1.1, 2.1.4, 2.4.3, 2.5.3; browser: "keyboard")
- **Focus.** A 3px focus ring in both themes, at least 3:1 against the page. (2.4.7, 2.4.11; `Colour`)
- **Contrast.** Text 7:1 for body copy and 4.5:1 for the rest, measured in the light theme and both
  dark blocks; the scoreboard's colours too. (1.4.3, 1.4.11; `test_contrast_meets_wcag`)
- **Colour is never alone.** Window pictures use the Okabe-Ito palette and give each colour a shape.
  (1.4.1)
- **Motion.** With reduced motion on, the page starts still: every window shows one still frame, the
  parallax and the fly-down do not run, and transitions are cut. The Motion button in the masthead
  turns motion on or off either way (on brings back the parallax too) and is remembered only in
  your browser. The fly-down stops at once if you scroll, touch or press a key. (2.2.2, 2.3.3;
  browser: "reduced motion", "Motion on wins")
- **Status.** The prompt's answer is a polite status line that names the matched tags and the count
  of cards you can see, cleared and re-set so a repeat is read again. Without scripts, the filters'
  count is printed under them. (4.1.3)
- **Reflow.** Nothing scrolls sideways at 360px wide, scripts on or off. (1.4.10; browser: "phone width")
- **Forced colours.** In Windows high contrast the decorative parallax is removed and selected
  controls get a system outline.

- **Questions about me, answered without the prompt.** How to reach me is in the Find me list in the
  About section and again on the Find me card, as plain links (mail first, because it works for
  everyone), and "Corwin at a glance" says who I am and what I work on; both are native `<details>`
  cards like the rest, so they read with scripts off. The prompt's example questions, in the About
  section and the footer, are plain text, not controls. The prompt's placeholder is only a hint;
  its label, "Ask the page:", is what a screen reader announces. (`test_about_cards_answer_the_common_questions`;
  the node check "visitor asks ..." holds each example question to a card that answers it)
- **Dates on what can go stale.** The About text, the footer and every scoreboard number say the
  day they were checked, so a reader of any tool can tell how old a claim is. (`test_the_about_and_footer_words_carry_the_date_they_were_checked`)

## Partly

- **The windows' pictures** are decorative: each card's introduction describes in words what its
  window shows, and "How this page works" lists every picture. A screen reader user gets the
  description, not the motion.
- **The tension field** on "How the prompt finds things" shows the taxonomy's shape; its content (the
  tags and why a card matched) is in the echo line and the results list, but the geometry is not
  conveyed.
- **The parallax** text is `aria-hidden` decoration made of the vocabulary's tags; the same tags are
  findable through the prompt.

## Cannot (yet)

- **The prompt without scripts.** The quick filters work without scripts; the free-text prompt
  needs them, and the page says so in the echo area when they are off. The answers to its most
  common questions (who I am, how to reach me, what inputloop is) are on the page as ordinary text.
- **A spoken tour** of a card's views. The view buttons are a labelled group with `aria-pressed`, but
  there is no summary of all views at once.

Found something that does not work for you? Write to corwin@bru.st, or open an issue.

## Customize (2026-11-01)

A "Customize" button floats at the top right when scripts run (hidden without them). Hover opens
its panel, a press pins it, Escape closes it and returns focus to the button. Its fields: text size
of the reading text only, line length, line spacing, colour theme (follow system, light, dark, high
contrast) and reduce motion. Settings stay in the browser's localStorage and are never sent.
tests/browser checks the keyboard path, that only reading text scales, and that nothing is fetched.

## The links area (2026-11-02)

- A native `<details>` ("Links") left of Customize: it opens and closes with scripts off, by mouse,
  and by keyboard (Tab to it, Enter); with scripts on, Escape closes it and returns focus to its tab,
  and only one of Links and Customize is open at a time.
- The credits look is CSS over a real list: a list of categories, each with a list of names, so a
  screen reader hears the structure, not a run of words.
- Light text on a near-black panel in every theme, measured at well over 4.5:1 in the browser check;
  focus rings stay visible on the dark. Nothing moves. At 390 pixels it fits without sideways scroll.
- tests/browser/links.test.mjs checks these at 1280 and 390 pixels, light and dark, en-US and de-DE,
  under the real CSP header.

## Tone pads (2026-11-01)

- Every arm and centre is a `<button>` named in words ("Simpler words: the About"), in a
  `role="group"` named for what it moves; an arm at the end of its line is `aria-disabled`. One
  polite status line says what changed; focus never moves by itself.
- Keys need a modifier (Ctrl+arrows, Ctrl+Shift+arrows) or a focused pad, never act inside a text
  field, and leave a selection alone (WCAG 2.1.4). On macOS, Tab to a pad.
- Up means harder words; Customize can turn that around ("Up makes the words simpler").
- The page pad comes fully home and stays while it is hovered or focused, so a focused arm is
  never covered (WCAG 2.4.11). With reduced motion it jumps instead of gliding, and there is no glow.
- The other versions sit in `<template>` elements, out of the accessibility tree until shown.
- Partly: on a narrow screen the page pad, while it dodges a section pad, can cover a few words of
  the text under it until that section pad has scrolled past.

## Dramatis personae (2026-11-01; on its own page, cast/index.html, since 18:06)

The people and the agents' personas are two ordinary lists (`ol`, under their own headings), and
every pairing between them is written out beneath in a list with its source, scripts or not. The
moving version (two columns sliding opposite ways, a postcard when a related pair comes level) runs
only with Motion on; with reduced motion, Customize's Reduce motion, or scripts off, the lists stay
still. The postcard is announced once through a polite status line when the reader stops on it.
Nothing inside the moving columns takes focus; instead each pairing has a "Show this postcard"
button that scrolls to where the pair meets and moves focus to the postcard. Cards take the
reading text size from Customize, and all cards share the height of the tallest, so no text is cut
off. tests/browser checks all of this at 1280 and 390 pixels.
