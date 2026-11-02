# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""The tone d-pad's texts (tests/spec/TONE.txt): same facts in every version, reading level rising
by Flesch-Kincaid, warmth falling, the voice rule, the fallback table, and the page showing the
words already written until a reader asks for another version.

python3 -m unittest discover -s tests/py   (standard library only)
"""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import build  # noqa: E402
import build_tone as T  # noqa: E402

OUT = DATA = None


def setUpModule():
    global OUT, DATA
    OUT = tempfile.mkdtemp(prefix="aboutcorwin-tone-")
    DATA, _ = build.build(os.path.join(OUT, "public"))


def tearDownModule():
    shutil.rmtree(OUT, ignore_errors=True)


def page(*parts):
    with open(os.path.join(OUT, "public", *(parts or ("index.html",))), encoding="utf-8") as f:
        return f.read()


class Texts(unittest.TestCase):
    def test_every_rule_in_the_spec_holds(self):
        self.assertEqual(T.problems(DATA["sections"]), [])

    def test_coverage_the_about_and_four_lead_ins_each_have_all_twelve(self):
        # Coverage chosen 2026-11-01 (Corwin: "leaving this to your artistic take"): the About and the
        # lead-ins of the three sections with pads; every cell written, so no reader meets a fallback.
        units = {n: u for s in DATA["sections"].values() for n, u in s["units"].items()}
        self.assertEqual(sorted(units), ["about", "ideas", "involvements", "portfolio", "work"])
        for n, u in units.items():
            self.assertEqual(len(u["cells"]), 12, n)

    def test_the_about_family_paragraph_is_written_in_every_version_from_his_own_words(self):
        # Until 2026-11-02 the family paragraph was kept word for word ([[keep]]) because it describes
        # other people and Corwin meant to word it himself. He did (content/ABOUT-EDITS.md), so it is
        # now one more paragraph each version writes in its own voice, held to his words as facts and
        # rules. The [[keep]] mechanism stays in build_tone.py for any text that needs it later.
        u = DATA["sections"]["about"]["units"]["about"]
        self.assertIsNone(u["keep"])
        for c, paras in u["cells"].items():
            self.assertNotIn(T.KEEP, paras, c)
            self.assertEqual(sum(1 for p in paras if "educators and writers, fans and scientists who organize" in p), 1, c)

    def test_the_meters_know_their_answers(self):
        # 18 words, 4 sentences, 18 syllables: 0.39 x 4.5 + 11.8 x 1 - 15.59 = -2.035, printed -2.03.
        self.assertEqual(T.fk(["The cat sat on the mat. It was a good cat. The dog ran. A bird sang well."]), -2.03)
        self.assertEqual(T.resolve({"warm-8", "plain-12"}, "warm", 4), "warm-8")
        self.assertEqual(T.resolve({"warm-8", "plain-12"}, "formal", 16), "plain-12")
        self.assertEqual(T.resolve({"warm-8", "plain-12"}, "formal", 4), "plain-8")
        self.assertEqual(T.syllables("introduction"), 4)   # vowel runs i, o, u, io: the rule's answer, not a dictionary's
        self.assertEqual(T.syllables("table"), 2)
        self.assertGreater(T.warmth(["I'm glad you're here! Isn't it fun?"]), 50)
        self.assertLess(T.warmth(["The implementation of the documentation requires coordination."]), -10)

    def test_the_spec_and_the_python_agree_on_the_steps_and_the_base(self):
        spec = open(os.path.join(ROOT, "tests", "spec", "TONE.txt"), encoding="utf-8").read()
        self.assertIn('The base cell is "plain 8"', spec)
        self.assertEqual(T.BASE, ("plain", 8))
        self.assertEqual(T.STEPS, (4, 8, 12, 16))


class Page(unittest.TestCase):
    def test_the_page_carries_the_fallback_table_the_python_computes(self):
        m = re.search(r'<script type="application/json" id="tone-table">(.*?)</script>', page(), re.S)
        self.assertIsNotNone(m)
        self.assertEqual(json.loads(m.group(1)), T.table(DATA["sections"]))

    def test_every_cell_ships_in_a_template_beside_its_live_text(self):
        text = page()
        for s in DATA["sections"].values():
            for n, u in s["units"].items():
                self.assertEqual(len(re.findall(r'<div class="tone-text" data-unit="%s"|<p class="lede" data-unit="%s"' % (n, n), text)), 1, n)
                cells = re.findall(r'<template data-unit="%s" data-cell="([\w-]+)">' % n, text)
                self.assertEqual(sorted(cells), sorted(c for c in u["cells"] if c != "plain-8"), n)

    def test_the_live_text_is_the_text_already_written(self):
        text = page()
        about = re.search(r'<div class="tone-text" data-unit="about" data-section="about">(.*?)</div><!--/tone-text-->', text, re.S).group(1)
        self.assertEqual(about, "".join("<p>%s</p>" % build.inline(p) for p in DATA["site"]["layers"]["about"]))
        for n in ("involvements", "portfolio", "work", "ideas"):
            u = next(s["units"][n] for s in DATA["sections"].values() if n in s["units"])
            live = re.search(r'<p class="lede" data-unit="%s" data-section="[\w-]+">(.*?)</p>' % n, text).group(1)
            self.assertEqual(live, build.e(" ".join(u["base"])), n)

    def test_byte_equal_apart_from_the_pads_with_no_variants_shown(self):
        # The phase the plan put before any variant: take away everything the tone work adds and the
        # page is the page built with it switched off.
        d = tempfile.mkdtemp()
        try:
            build.build(os.path.join(d, "p"), tone=False)
            with open(os.path.join(d, "p", "index.html"), encoding="utf-8") as f:
                plain = f.read()
        finally:
            shutil.rmtree(d)
        self.assertEqual(strip(page()), plain)

    def test_each_section_pad_and_the_page_pad_are_named_buttons(self):
        text = page()
        for scope in ("page", "about", "involvements", "portfolio"):
            m = re.search(r'<div class="dpad[^"]*" role="group" data-scope="%s" data-name="([^"]+)" aria-label="[^"]+" aria-describedby="([\w-]+)">(.*?)</div>' % scope, text, re.S)
            self.assertIsNotNone(m, scope)
            self.assertEqual(sorted(re.findall(r'data-move="(\w+)"', m.group(3))), ["down", "left", "reset", "right", "up"])
            self.assertIn('id="%s"' % m.group(2), text)
        self.assertIn('id="tone-say" role="status" aria-live="polite"', text)

    def test_the_cast_page_has_no_pad(self):
        cast = page("cast", "index.html")
        self.assertNotIn('class="dpad', cast)
        self.assertNotIn("dpad.js", cast)

    def test_the_palette_rows_and_the_invert_option(self):
        text = page()
        rows = re.search(r'<fieldset class="c-tone">.*?</fieldset>\s*<fieldset class="c-tone">.*?</fieldset>\s*<fieldset class="c-tone">.*?</fieldset>', text, re.S)
        self.assertIsNotNone(rows, "Warmth, Reading and the invert option sit in the Customize palette")
        self.assertEqual(len(re.findall(r'name="tone-w"', rows.group(0))), 3)
        self.assertEqual(len(re.findall(r'name="tone-g"', rows.group(0))), 4)
        self.assertIn('name="tone-invert"', rows.group(0))
        self.assertRegex(rows.group(0), r'<input type="checkbox" name="tone-lang" value="1" checked>',
                         "Follow my browser's language: a row, on unless the reader turns it off")

    def test_the_language_line_is_there_hidden_until_scripts_fill_it(self):
        text = page()
        self.assertRegex(text, r'<h2 id="about-h">About</h2>\s*<!--tone--><p class="tone-lang" id="tone-lang" hidden></p><!--/tone-->')


class Language(unittest.TestCase):
    """TONE.txt, 8: the browser's first language picks where a reader with no saved choice starts.
    The cases are read from the spec itself, so the JavaScript reader checks the very same ones."""

    def test_the_cases_in_the_spec(self):
        spec = open(os.path.join(ROOT, "tests", "spec", "TONE.txt"), encoding="utf-8").read()
        cases = re.findall(r"^\s*case: (.+?) -> (grade 4|as written)\s*$", spec, re.M)
        self.assertGreaterEqual(len(cases), 12)
        for langs, want in cases:
            given = [] if langs == "(none)" else [x.strip() for x in langs.split(",")]
            self.assertEqual(T.lang_start(given), 4 if want == "grade 4" else None, langs)


def strip(text):
    text = re.sub(r"<!--tone-->.*?<!--/tone-->", "", text, flags=re.S)
    text = re.sub(r'<div class="tone-text" data-unit="[\w-]+" data-section="[\w-]+">(.*?)</div><!--/tone-text-->', r"\1", text, flags=re.S)
    return re.sub(r' data-(unit|section|tone-section)="[\w-]+"', "", text)


if __name__ == "__main__":
    unittest.main()
