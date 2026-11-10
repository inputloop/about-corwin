# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
"""Corwin's hand edits to the About (content/ABOUT-EDITS.md), one test per edit, so a rewrite of
the About or of any tone version cannot quietly undo one. tests/js/tone.test.mjs reads the same
file separately.

python3 -m unittest discover -s tests/py   (standard library only)
"""
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

OUT = DATA = PAGE = None


def setUpModule():
    global OUT, DATA, PAGE
    OUT = tempfile.mkdtemp(prefix="aboutcorwin-edits-")
    DATA, _ = build.build(os.path.join(OUT, "public"))
    with open(os.path.join(OUT, "public", "index.html"), encoding="utf-8") as f:
        PAGE = f.read()


def tearDownModule():
    shutil.rmtree(OUT, ignore_errors=True)


def about():
    return DATA["sections"]["about"]["units"]["about"]


def rules(prefix):
    out = [r for r in T.edit_rules(build.CONTENT) if r[0].startswith(prefix)]
    assert out, "ABOUT-EDITS.md has no edit headed %r" % prefix
    return out


def live_about():
    m = re.search(r'<div class="tone-text" data-unit="about" data-section="about">(.*?)</div>', PAGE, re.S)
    return m.group(1)


class Edits(unittest.TestCase):
    def held(self, prefix):
        u = about()
        self.assertEqual(T.edit_problems(rules(prefix), u["cells"], "about"), [])
        for f in (r[2] for r in rules(prefix) if r[1] == "has"):
            self.assertIn(f, u["facts"], "an edit's exact words are also on the facts list: %r" % f)

    def test_1_the_family_list(self):
        self.held("1.")
        self.assertIn("educators and writers, fans and scientists who organize", live_about())

    def test_2_two_links_for_his_dad(self):
        self.held("2.")
        self.assertIn('<a href="https://dreamcafe.com/">Steven</a> <a href="https://en.wikipedia.org/wiki/Steven_Brust">Brust</a>', live_about())

    def test_3_their_parents(self):
        self.held("3.")
        self.assertIn("Their parents", live_about())
        self.assertNotIn("grandparent", PAGE.lower())

    def test_4_jean_and_bill(self):
        self.held("4.")
        self.assertRegex(live_about(), r'<a href="[^"]+">Jean</a> and <a href="[^"]+">Bill</a> Brust')

    def test_5_the_marriage(self):
        self.held("5.")
        self.assertIn('In 2006 I married <a href="https://www.twinpropjane.com/">Dee Brust</a>', live_about())
        warm = [c for c in about()["cells"] if c.startswith("warm")]
        for c in warm:
            self.assertIn("I'm married to [Dee Brust]", "\n".join(about()["cells"][c]), c)

    def test_6_the_kids(self):
        self.held("6.")
        self.assertIn("We have five kids", live_about())

    def test_7_minicon_says_only_that(self):
        self.held("7.")
        allowed = {"I", "A", "In", "Minicon", "Minneapolis", "Corwin", "Brust"}
        for c, paras in about()["cells"].items():
            sent = [s for s in re.split(r"(?<=[.!?;])\s+", T.plain_text(paras)) if "Minicon 37" in s]
            self.assertEqual(len(sent), 1, c)
            self.assertEqual([w for w in re.findall(r"\b[A-Z][a-z]+\b", sent[0]) if w not in allowed], [], c)

    def test_every_edit_has_rules_and_the_file_says_how_to_read_it(self):
        heads = {r[0] for r in T.edit_rules(build.CONTENT)}
        self.assertGreaterEqual(len(heads), 7)
        with open(os.path.join(build.CONTENT, T.EDITS_FILE), encoding="utf-8") as f:
            text = f.read()
        self.assertIn("Read this before rewriting the About", text)

    def test_a_bad_rule_line_stops_the_check(self):
        d = tempfile.mkdtemp()
        try:
            with open(os.path.join(d, T.EDITS_FILE), "w", encoding="utf-8") as f:
                f.write("## x\nrule: maybe | words\n")
            with self.assertRaises(T.ToneError):
                T.edit_rules(d)
        finally:
            shutil.rmtree(d)


if __name__ == "__main__":
    unittest.main()
