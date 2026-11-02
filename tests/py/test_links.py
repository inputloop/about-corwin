# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""The links area in the right floating cluster (DESIGN.md, "The links area: end credits"): plain
https links from content/links.txt, nothing from another host, a vendored font under a free licence
and preloaded with the page, a real list underneath the look, and the support line apart.

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

OUT = PAGE = CSS = None
FONT = "league-gothic-latin-400-normal.woff2"


def setUpModule():
    global OUT, PAGE, CSS
    OUT = tempfile.mkdtemp(prefix="aboutcorwin-links-")
    build.build(os.path.join(OUT, "public"))
    with open(os.path.join(OUT, "public", "index.html"), encoding="utf-8") as f:
        PAGE = f.read()
    with open(os.path.join(ROOT, "src", "css", "site.css"), encoding="utf-8") as f:
        CSS = f.read()


def tearDownModule():
    shutil.rmtree(OUT, ignore_errors=True)


def credits():
    m = re.search(r'<details class="credits" id="credits">.*?</details>', PAGE, re.S)
    assert m, "no links area on the page"
    return m.group(0)


class Links(unittest.TestCase):
    def test_every_link_he_named_is_there(self):
        c = credits()
        for href in ("https://libera.chat/", "https://www.gnu.org/", "https://www.fsf.org/", "https://www.eff.org/",
                     "https://sdf.org/", "https://sfconservancy.org/", "https://www.aclu.org/",
                     "https://nurturedbynature.org/", "https://cma.recreation.parks.lacity.gov/",
                     "https://comozooconservatory.org/", "https://liberapay.com/corwin/",
                     "https://www.patreon.com/c/mplscorwin"):
            self.assertIn('href="%s"' % href, c)
        self.assertIn("I give $4 a week through", c)
        self.assertIn("2026-11-02", c, "his figure carries the date it was read")

    def test_only_plain_https_links_and_nothing_from_another_host(self):
        c = credits()
        self.assertEqual(re.findall(r'href="(?!https://)[^"]*"', c), [])
        self.assertNotRegex(c, r"<(script|img|iframe|object|embed|link|svg|picture|video|audio)\b")
        self.assertNotRegex(c, r'\s(src|srcset|style|on\w+)=')
        # Nothing the page loads (script, image, stylesheet, frame, preload) comes from another host.
        self.assertEqual(re.findall(r'<(?:script|img|link|iframe|source)\b[^>]*\s(?:src|href)="(?:https?:)?//[^"]*"', PAGE), [])

    def test_the_build_refuses_a_link_that_is_not_https(self):
        d = tempfile.mkdtemp()
        try:
            shutil.copytree(os.path.join(ROOT, "content"), os.path.join(d, "content"))
            p = os.path.join(d, "content", "links.txt")
            with open(p, encoding="utf-8") as f:
                t = f.read()
            with open(p, "w", encoding="utf-8") as f:
                f.write(t.replace("https://sdf.org/", "http://sdf.org/"))
            with self.assertRaises(build.ContentError):
                build.load_links(os.path.join(d, "content"))
        finally:
            shutil.rmtree(d)

    def test_a_real_list_underneath_the_credits(self):
        c = credits()
        self.assertRegex(c, r'<summary class="credits-btn">Links</summary>')
        self.assertRegex(c, r'<ul class="cr-roll" aria-labelledby="credits-h">(<li class="cr-group"><span class="cr-role">[^<]+</span> <ul class="cr-names">(<li><a href="[^"]+">[^<]+</a></li> )+</ul></li> ?)+</ul>')

    def test_the_support_line_stands_apart_from_the_giving_roll(self):
        c = credits()
        roll = re.search(r'<ul class="cr-roll".*?</ul></li></ul>', c, re.S).group(0)
        self.assertNotIn("patreon", roll)
        self.assertNotIn("liberapay.com/corwin/donate", roll)
        self.assertRegex(c, r'<p class="cr-support">Support my work: <a href="https://liberapay.com/corwin/donate">Liberapay</a> · <a href="https://www.patreon.com/c/mplscorwin">Patreon</a></p>')

    def test_the_links_come_before_customize_in_the_cluster(self):
        self.assertLess(PAGE.index('id="credits"'), PAGE.index('id="custom-btn"'))
        self.assertLess(PAGE.index('id="credits"'), PAGE.index('class="masthead"'))

    def test_the_font_is_ours_free_and_preloaded(self):
        self.assertTrue(os.path.isfile(os.path.join(OUT, "public", "fonts", FONT)))
        for lic in (os.path.join(ROOT, "src", "fonts", "OFL-1.1.txt"), os.path.join(ROOT, "LICENSES", "OFL-1.1.txt")):
            with open(lic, encoding="utf-8") as f:
                self.assertIn("SIL OPEN FONT LICENSE Version 1.1", f.read())
        faces = re.findall(r"@font-face\s*\{[^}]*\}", CSS)
        self.assertEqual(len(faces), 1)
        self.assertIn('url("../fonts/%s")' % FONT, faces[0])
        self.assertNotRegex(faces[0], r"https?:|//")
        self.assertIn('<link rel="preload" href="fonts/%s" as="font" type="font/woff2" crossorigin>' % FONT, PAGE)
        with open(os.path.join(ROOT, "src", ".htaccess"), encoding="utf-8") as f:
            ht = f.read()
        self.assertIn("font-src 'self'", ht)
        self.assertIn("AddType font/woff2 .woff2", ht)

    def test_the_intention_is_written_down(self):
        with open(os.path.join(ROOT, "DESIGN.md"), encoding="utf-8") as f:
            d = f.read()
        self.assertIn("## The links area: end credits", d)
        self.assertIn("**Intention.**", d.split("## The links area: end credits")[1].split("\n## ")[0])


if __name__ == "__main__":
    unittest.main()
