# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""What this site remembers (Corwin, 2026-11-04: "Keep it, disclose it -- keep on-device remembering,
and say so in each page's privacy note with a one-press 'forget my settings'").

Each page has one note (#privacy, under "How this page works") and it must name exactly the storage
keys the scripts that page loads write: read from those scripts, so a new key with no line turns this
red. No script may set a cookie or use another store. Each note names the web server's request log as
corwin.cloud's note does. Each remembered feature (Motion, Customize) links to its own page's note.
tests/browser/privacy.test.mjs checks that Forget my settings clears the keys and that the links land.

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

OUT = None


def setUpModule():
    global OUT
    OUT = tempfile.mkdtemp(prefix="aboutcorwin-privacy-")
    build.build(os.path.join(OUT, "public"))


def tearDownModule():
    shutil.rmtree(OUT, ignore_errors=True)


def read(*parts):
    with open(os.path.join(OUT, "public", *parts), encoding="utf-8") as f:
        return f.read()


def scripts_of(page_rel):
    """The scripts a built page loads, as paths under public/."""
    page = read(*page_rel.split("/"))
    base = os.path.dirname(page_rel)
    out = []
    for src in re.findall(r'<script src="([^"?#]+)', page):   # the ?v= cache-buster is not a path
        out.append(os.path.normpath(os.path.join(base, src)))
    return out


SET = re.compile(r"\b(localStorage|sessionStorage)\.setItem\(\s*([^,)]+?)\s*,")


def keys_written(script_rel):
    """Every key a script writes: a quoted literal, or a name bound once in it to a quoted literal."""
    text = read(*script_rel.split("/"))
    keys, unreadable = set(), []
    for store, arg in SET.findall(text):
        m = re.fullmatch(r"""(['"])([^'"]+)\1""", arg)
        if m:
            keys.add(m.group(2))
            continue
        bound = re.findall(r"\bvar\s+%s\s*=\s*(['\"])([^'\"]+)\1" % re.escape(arg), text)
        if len(bound) == 1:
            keys.add(bound[0][1])
        else:
            unreadable.append("%s: %s.setItem(%s, ...)" % (script_rel, store, arg))
    return keys, unreadable


def note(page):
    m = re.search(r'<h3 id="privacy"[^>]*>.*?<p class="forget[^"]*">.*?</p>', page, re.S)
    assert m, "no privacy note (h3#privacy through the Forget my settings line) on the page"
    return m.group(0)


PAGES = ("index.html", "cast/index.html")


class Privacy(unittest.TestCase):
    def test_each_note_names_exactly_the_keys_its_page_writes(self):
        for page in PAGES:
            written, unreadable = set(), []
            for s in scripts_of(page):
                k, u = keys_written(s)
                written |= k
                unreadable += u
            self.assertEqual(unreadable, [], "%s: a storage key the check cannot read" % page)
            self.assertTrue(written, "%s: its scripts write no key at all; then the note should say so instead" % page)
            named = set(re.findall(r"<dt><code>([^<]+)</code></dt>", note(read(*page.split("/")))))
            self.assertEqual(sorted(written - named), [], "%s: written and not named in its note" % page)
            self.assertEqual(sorted(named - written), [], "%s: named in its note and not written" % page)

    def test_exactly_one_privacy_target_per_page(self):
        for page in PAGES:
            self.assertEqual(len(re.findall(r'\bid="privacy"', read(*page.split("/")))), 1, page)

    def test_no_cookie_and_no_other_store(self):
        for page in PAGES:
            for s in scripts_of(page):
                text = read(*s.split("/"))
                for word in ("document.cookie", "indexedDB", "caches.open", "sessionStorage"):
                    self.assertNotIn(word, text, "%s uses %s" % (s, word))

    def test_each_note_says_what_is_collected_kept_and_logged_and_offers_to_forget(self):
        for page in PAGES:
            n = note(read(*page.split("/")))
            self.assertIn("These pages collect nothing and set no cookies", n, page)
            self.assertIn("in this browser only; nothing is sent", n, page)
            # The words themselves, as corwin.cloud's note has them (not build.PRIVACY_LOG, which a
            # changed build would change with them).
            self.assertIn("The web server keeps its usual request log: the address that asked, the time, and the page. "
                          "That log is on the server, not in your browser, and forgetting here does not touch it.", n,
                          "%s: the request-log line, as corwin.cloud words it" % page)
            self.assertRegex(n, r'<button type="button" id="forget">Forget my settings</button>', page)
            self.assertIn('id="forgot" role="status"', n, page)

    def test_each_remembered_feature_links_to_its_pages_note(self):
        for page in PAGES:
            text = read(*page.split("/"))
            panel = re.search(r'<form class="custom-panel".*?</form>', text, re.S).group(0)
            self.assertIn('href="#privacy"', panel, "%s: Customize does not link to the note" % page)
            motion = re.search(r'<p class="motion-control">.*?</p>', text, re.S).group(0)
            self.assertIn('href="#privacy"', motion, "%s: the Motion button does not link to the note" % page)

    def test_the_tone_line_goes_with_the_tone_pads(self):
        self.assertIn("aboutcorwin.tone", note(read("index.html")))
        d = tempfile.mkdtemp(prefix="aboutcorwin-privacy-notone-")
        try:
            build.build(os.path.join(d, "p"), tone=False)
            with open(os.path.join(d, "p", "index.html"), encoding="utf-8") as f:
                page = f.read()
            self.assertNotIn("aboutcorwin.tone", note(page))
            self.assertNotIn("dpad.js", page)
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
