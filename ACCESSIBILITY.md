<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
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
- **Names.** Every window is a button named "More about X: open the window", matching its tooltip;
  every link, button and summary has a name; every form control has a label; logos are decorative
  inside a named button. (4.1.2; `test_links_and_buttons_have_names`, browser: "windows become
  labelled buttons")
- **Keyboard.** Everything that opens with a click opens from the keyboard: the summary opens the
  introduction and puts focus on the view buttons; the window button opens the featured view;
  Escape closes the card and returns focus to its window; `/` or Alt+x goes to the prompt; Escape
  or Ctrl+g clears it; ↑ and ↓ walk its history. Single-key shortcuts are ignored while typing.
  (2.1.1, 2.1.4, 2.4.3; browser: "keyboard")
- **Focus.** A 3px focus ring in both themes, at least 3:1 against the page. (2.4.7, 2.4.11; `Colour`)
- **Contrast.** Text 7:1 for body copy and 4.5:1 for the rest, measured in the light theme and both
  dark blocks; the scoreboard's colours too. (1.4.3, 1.4.11; `test_contrast_meets_wcag`)
- **Colour is never alone.** Window pictures use the Okabe-Ito palette and give each colour a shape.
  (1.4.1)
- **Motion.** With reduced motion on, the page starts still: every window shows one still frame, the
  parallax and the fly-down do not run, and transitions are cut. The Motion button in the masthead
  turns motion on or off either way and is remembered only in your browser. (2.2.2, 2.3.3; browser:
  "reduced motion")
- **Status.** The prompt's answer is a polite status line that names the matched tags and the count,
  cleared and re-set so a repeat is read again. (4.1.3)
- **Reflow.** Nothing scrolls sideways at 360px wide, scripts on or off. (1.4.10; browser: "phone width")
- **Forced colours.** In Windows high contrast the decorative parallax is removed and selected
  controls get a system outline.

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
  needs them, and the page says so in the echo area when they are off.
- **A spoken tour** of a card's views. The view buttons are a labelled group with `aria-pressed`, but
  there is no summary of all views at once.

Found something that does not work for you? Write to corwin@bru.st, or open an issue.
