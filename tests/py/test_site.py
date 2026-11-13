# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
"""python3 -m unittest discover -s tests/py   (standard library only)

Builds the site into a temporary folder and reads it back: the content rules, what the page
promises screen readers and keyboards, the LibreJS labels, the security header, colour contrast in
both themes, and a second reader for the taxonomy (Python recomputes the associations that the
browser code computes, and the two must agree).
"""
import html.parser
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import build  # noqa: E402

OUT = None
DATA = None
INDEX = None


def setUpModule():
    global OUT, DATA, INDEX
    OUT = tempfile.mkdtemp(prefix="aboutcorwin-")
    DATA, INDEX = build.build(os.path.join(OUT, "public"))


def tearDownModule():
    shutil.rmtree(OUT, ignore_errors=True)


def read(*parts):
    with open(os.path.join(OUT, "public", *parts), encoding="utf-8") as f:
        return f.read()


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.children, self.text = tag, dict(attrs), parent, [], []

    def all(self):
        yield self
        for c in self.children:
            yield from c.all()

    def text_content(self):
        return "".join(self.text) + "".join(c.text_content() for c in self.children)


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class Tree(html.parser.HTMLParser):
    """A small DOM: enough to ask about landmarks, names and ids. It also notes markup errors."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", [], None)
        self.cur = self.root
        self.errors = []
        self.doctype = None

    def handle_decl(self, decl):
        self.doctype = decl

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is None:
            self.errors.append("stray </%s>" % tag)
            return
        if n is not self.cur:
            self.errors.append("<%s> closed by </%s>" % (self.cur.tag, tag))
        self.cur = n.parent

    def handle_data(self, data):
        self.cur.text.append(data)


def parse(text):
    t = Tree()
    t.feed(text)
    t.close()
    return t


class Content(unittest.TestCase):
    def test_counts(self):
        kinds = [c["kind"] for c in DATA["cards"]]
        self.assertEqual(kinds.count("involvements"), 5)
        self.assertGreaterEqual(kinds.count("projects"), 7)
        self.assertGreaterEqual(kinds.count("concepts"), 6)

    def test_inputloop_comes_last_among_involvements(self):
        inv = [c for c in DATA["cards"] if c["kind"] == "involvements"]
        self.assertEqual(inv[-1]["slug"], "inputloop")

    def test_prose_within_500_words(self):
        for c in DATA["cards"]:
            self.assertLessEqual(c["words"], build.MAX_PROSE_WORDS, c["path"])

    def test_only_public_inputloop_repositories_are_linked(self):
        pat = re.compile(r"https://github\.com/inputloop/([^/\s\"#?)]+)")
        page = read("index.html")
        for name in pat.findall(page):
            self.assertIn(name, build.PUBLIC_REPOS, "links a repository not known to be public: %s" % name)
        for root, _, files in os.walk(os.path.join(ROOT, "content")):
            for f in files:
                with open(os.path.join(root, f), encoding="utf-8") as fh:
                    for name in pat.findall(fh.read()):
                        self.assertIn(name, build.PUBLIC_REPOS, "%s links %s" % (f, name))

    # "ghostwheel" left this list on 2026-11-02 (Corwin: "ghostwheel is OK public. falsifier:
    # GHOSTWHEEL is someone else's registered trademark"; the USPTO trademark search found no mark
    # by that name that day). If that falsifier ever fires, put it back here.
    PRIVATE = ("llama-bridge", "llama bridge", "topoforge", "theseus", "persona-engine",
               "legendoflinks", "mariosworld", "mariospaint", "al2n", "kid-glove", "tavern",
               "inputloop/c4", "showroom", "hzpa", "research-lives-in", "business-research", "thickity")

    def test_private_project_names_stay_off_every_served_file(self):
        for root, _, files in os.walk(os.path.join(OUT, "public")):
            for f in files:
                with open(os.path.join(root, f), encoding="utf-8", errors="replace") as fh:
                    text = fh.read().lower()
                for name in self.PRIVATE:
                    self.assertNotIn(name, text, "%s names %s" % (f, name))

    def test_credit_is_given_as_the_catalog_gives_it(self):
        whose = {c["slug"]: c["facets"]["whose"] for c in DATA["cards"]}
        self.assertEqual(whose["nexttime"], "brigidt")
        self.assertEqual(whose["quantum3d5"], "bryant")
        self.assertEqual(whose["four-swords"], "unstated")
        self.assertEqual(whose["php-backport"], "corwin")

    def test_about_cards_answer_the_common_questions(self):
        cards = {c["slug"]: c for c in DATA["cards"]}
        self.assertEqual(cards["glance"]["kind"], "about")
        self.assertEqual(cards["find-me"]["kind"], "about")
        hrefs = [l["href"] for l in cards["find-me"]["links"]]
        self.assertIn("mailto:corwin@bru.st", hrefs, "how do I reach him: the card must hold the mail link")
        self.assertTrue(any(h.startswith("https://hostux.social/") for h in hrefs))
        page = read("index.html")
        self.assertIn('id="glance"', page)
        self.assertIn('id="find-me"', page)

    def test_the_about_and_footer_words_carry_the_date_they_were_checked(self):
        for name in ("about", "footer"):
            text = " ".join(DATA["site"]["layers"][name])
            self.assertRegex(text, r"\b\d{4}-\d{2}-\d{2}\b", "site.txt %s names no date" % name)
        self.assertIn("2026-11-01", read("index.html"))

    def test_topology_and_gitcha_are_public_cards_that_link_their_public_repositories(self):
        cards = {c["slug"]: c for c in DATA["cards"]}
        want = {"topology": "https://github.com/inputloop/draw/tree/corwin",   # the card keeps its slug (its page address) until the paths move; the repo is draw since 2026-11-11
                "gitcha": "https://github.com/inputloop/gitcha"}
        for slug, href in want.items():
            self.assertIn(href, [l["href"] for l in cards[slug]["links"]], slug)
            self.assertIn(slug, build.PUBLIC_REPOS)
            self.assertIn(href, read("index.html"))

    def test_public_repos_literal_has_no_comment_inside(self):
        """A comment inside the set's braces drops every name after it on that line (2026-11-11)."""
        import inspect
        src = inspect.getsource(build)
        lit = src[src.index("PUBLIC_REPOS = {"):]
        lit = lit[:lit.index("}") + 1]
        self.assertNotIn("#", lit, "a comment inside PUBLIC_REPOS hides the names after it")
        for name in ("ta", "three-phase-transcription", "journal", "obsmage"):
            self.assertIn(name, build.PUBLIC_REPOS)
        self.assertIn("avalon", build.PUBLIC_REPOS, "public, at his word (2026-11-11 23:35)")

    def test_corwin_cloud_is_a_public_card_that_links_its_public_repository(self):
        card = {c["slug"]: c for c in DATA["cards"]}["corwin-cloud"]
        self.assertIn("https://github.com/inputloop/corwin.cloud", [l["href"] for l in card["links"]])
        self.assertIn("corwin.cloud", build.PUBLIC_REPOS)
        self.assertIn("https://github.com/inputloop/corwin.cloud", read("index.html"))

    def test_the_ghostwheel_book_links_the_live_book_and_its_public_pub(self):
        # The picture book (2026-11-04): its card links the page ghostlights.theater serves and the
        # book's folder in inputloop/pubs, which GitHub reported public that day.
        card = {c["slug"]: c for c in DATA["cards"]}["ghostwheel-book"]
        hrefs = [l["href"] for l in card["links"]]
        for href in ("https://ghostlights.theater/build-a-ghostwheel/",
                     "https://github.com/inputloop/pubs/tree/main/books/build-a-ghostwheel"):
            self.assertIn(href, hrefs)
            self.assertIn(href, read("index.html"))
        self.assertIn("pubs", build.PUBLIC_REPOS)
        self.assertEqual(card["facets"]["whose"], "corwin")

    def test_every_scoreboard_number_has_a_date(self):
        for c in DATA["cards"]:
            for s in c["scores"]:
                self.assertRegex(s["asof"], r"^\d{4}-\d{2}(-\d{2})?$", c["path"])

    def test_unknown_tag_stops_the_build(self):
        d = tempfile.mkdtemp()
        try:
            shutil.copytree(os.path.join(ROOT, "content"), os.path.join(d, "content"))
            p = os.path.join(d, "content", "projects", "nexttime.txt")
            with open(p, encoding="utf-8") as f:
                t = f.read()
            with open(p, "w", encoding="utf-8") as f:
                f.write(t.replace("tags: mutual-aid", "tags: no-such-tag, mutual-aid"))
            with self.assertRaises(build.ContentError):
                build.load(os.path.join(d, "content"))
        finally:
            shutil.rmtree(d)

    def test_inline_links_escape_and_link(self):
        self.assertEqual(build.inline("a <b> [Dee](https://example.org/x?a=1&b=2)"),
                         'a &lt;b&gt; <a href="https://example.org/x?a=1&amp;b=2">Dee</a>')
        self.assertEqual(build.inline("[no](javascript:alert(1))"), "[no](javascript:alert(1))")
        about = read("index.html").split('id="about"')[1].split("</section>")[0]
        for href in ("https://dreamcafe.com/", "https://www.twinpropjane.com/", "https://mnstf.org/minicon/"):
            self.assertIn('href="%s"' % href, about)

    def test_tag_extraction(self):
        hits = build.find_tags("Emacs on Windows, with Org mode and two readers.", DATA["vocab"])
        for t in ("emacs", "windows", "org-mode", "two-readers"):
            self.assertIn(t, hits)
        self.assertNotIn("perl", hits)
        self.assertNotIn("game", build.find_tags("endgame", DATA["vocab"]), "whole words only")


class Page(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = read("index.html")
        cls.tree = parse(cls.src)
        cls.nodes = list(cls.tree.root.all())

    def by_tag(self, tag):
        return [n for n in self.nodes if n.tag == tag]

    def test_well_formed(self):
        self.assertEqual(self.tree.errors, [])
        self.assertEqual(self.tree.doctype.lower(), "doctype html")
        self.assertNotRegex(self.src, r"\{\{[A-Z0-9_]+\}\}", "an unfilled template slot")

    def test_language_title_viewport(self):
        self.assertEqual(self.by_tag("html")[0].attrs.get("lang"), "en")
        self.assertTrue(self.by_tag("title")[0].text_content().strip())
        self.assertTrue(any(m.attrs.get("name") == "viewport" for m in self.by_tag("meta")))

    def test_landmarks(self):
        self.assertEqual(len(self.by_tag("main")), 1)
        self.assertEqual(len([h for h in self.by_tag("header") if h.parent.tag == "body"]), 1)
        self.assertEqual(len([f for f in self.by_tag("footer") if f.parent.tag == "body"]), 1)
        for n in self.by_tag("nav"):
            self.assertTrue(n.attrs.get("aria-label"))

    def test_skip_link_first_and_its_target_exists(self):
        body = self.by_tag("body")[0]
        first = next(c for c in body.children if c.tag not in ("script",))
        self.assertEqual(first.tag, "a")
        self.assertEqual(first.attrs["href"], "#main")
        self.assertTrue(any(n.attrs.get("id") == "main" for n in self.nodes))

    def test_one_h1_and_no_skipped_heading_levels(self):
        levels = [int(n.tag[1]) for n in self.nodes if re.fullmatch(r"h[1-6]", n.tag)]
        self.assertEqual(levels.count(1), 1)
        self.assertEqual(levels[0], 1)
        for a, b in zip(levels, levels[1:]):
            self.assertLessEqual(b, a + 1, "heading jumps from h%d to h%d" % (a, b))

    def test_ids_unique_and_references_resolve(self):
        ids = [n.attrs["id"] for n in self.nodes if "id" in n.attrs]
        self.assertEqual(len(ids), len(set(ids)), [i for i in ids if ids.count(i) > 1])
        ids = set(ids)
        for n in self.nodes:
            for attr in ("aria-labelledby", "aria-describedby", "aria-controls", "for"):
                for ref in n.attrs.get(attr, "").split():
                    self.assertIn(ref, ids, "%s=%s" % (attr, ref))
            href = n.attrs.get("href", "")
            if n.tag == "a" and href.startswith("#") and len(href) > 1:
                self.assertIn(href[1:], ids, href)

    def test_images_have_alt(self):
        for img in self.by_tag("img"):
            self.assertIn("alt", img.attrs, img.attrs.get("src"))

    def test_form_controls_have_labels(self):
        labelled = {n.attrs["for"] for n in self.by_tag("label") if "for" in n.attrs}
        for i in self.by_tag("input"):
            self.assertTrue(i.attrs.get("id") in labelled or i.attrs.get("aria-label") or i.parent.tag == "label", i.attrs)

    def test_links_and_buttons_have_names(self):
        for n in self.by_tag("a") + self.by_tag("button") + self.by_tag("summary"):
            self.assertTrue(n.text_content().strip() or n.attrs.get("aria-label"), n.attrs)

    def test_no_inline_script_or_style(self):
        for s in self.by_tag("script"):
            if "src" in s.attrs:
                self.assertFalse(s.text_content().strip())
            else:
                self.assertEqual(s.attrs.get("type"), "application/json", "inline executable script")
        self.assertEqual(self.by_tag("style"), [])
        self.assertFalse([n for n in self.nodes if "style" in n.attrs], "style attributes break the CSP")
        self.assertFalse([n for n in self.nodes if any(k.startswith("on") for k in n.attrs)], "inline handlers")

    def test_nothing_loads_from_another_host(self):
        for n in self.nodes:
            for attr in ("src", "srcset"):
                v = n.attrs.get(attr, "")
                self.assertFalse(re.match(r"^(https?:)?//", v), v)
            if n.tag == "link":
                self.assertFalse(re.match(r"^(https?:)?//", n.attrs.get("href", "")), n.attrs)

    def test_every_card_is_complete_without_scripts(self):
        for c in DATA["cards"]:
            art = next(n for n in self.nodes if n.tag == "article" and n.attrs.get("id") == c["slug"])
            text = re.sub(r"\s+", " ", art.text_content())
            for layer in ("summary", "function", "practice"):
                for p in c["layers"][layer]:
                    self.assertIn(re.sub(r"\s+", " ", p), text, "%s %s" % (c["slug"], layer))
            for s in c["stats"]:
                self.assertIn(s["value"], text)
            details = [n for n in art.all() if n.tag == "details"]
            self.assertEqual(len(details), 1, "the introduction opens with no script, under <details>")

    def test_navigation_help_is_split_for_scripts_on_and_off(self):
        for c in DATA["cards"]:
            js, nojs = build.how_to(c)
            self.assertIn("Activate the window", js)
            self.assertTrue(nojs.startswith("Without scripts"))
            self.assertIn('<span class="nojs-only">%s</span>' % build.e(nojs), self.src)

    def test_no_todo_ships(self):
        self.assertNotIn("TODO", self.src)

    def test_window_tooltips_say_more_about(self):
        for c in DATA["cards"]:
            self.assertIn('title="More about %s"' % build.e(c["title"]), self.src)

    def test_minibuffer_follows_the_modeline(self):
        body = self.by_tag("body")[0]
        order = [(c.tag, c.attrs.get("id")) for c in body.children]
        self.assertLess(order.index(("div", "modeline")), order.index(("footer", "minibuffer")))
        self.assertEqual(order.index(("footer", "minibuffer")), order.index(("div", "modeline")) + 1)

    def test_the_index_is_valid_json_and_matches(self):
        node = next(n for n in self.by_tag("script") if n.attrs.get("id") == "taxonomy-index")
        self.assertEqual(json.loads(node.text_content()), json.loads(json.dumps(INDEX, sort_keys=True)))


class LibreJS(unittest.TestCase):
    def test_every_script_is_labelled_and_listed(self):
        page = read("index.html")
        labels = read("jslicense.html")
        self.assertIn('rel="jslicense"', page)
        self.assertIn('id="jslicense-labels1"', labels)
        srcs = re.findall(r'<script src="([^"]+)"', page)
        self.assertEqual(sorted(s.split("?")[0] for s in srcs), sorted("js/" + n for n in build.HOME_JS))
        cast = re.findall(r'<script src="\.\./([^"]+)"', read("cast", "index.html"))
        self.assertEqual(sorted(s.split("?")[0] for s in cast), sorted("js/" + n for n in build.CAST_JS))
        listed = re.findall(r'<td><a href="(js/[\w.-]+)\?', labels)
        self.assertEqual(sorted(set(listed)), sorted("js/" + n for n in build.JS_FILES),
                         "jslicense.html lists exactly the scripts the two pages load")
        srcs = srcs + cast
        for s in srcs:
            self.assertIn('href="%s"' % s, labels)
            js = read(s.split("?")[0])
            self.assertTrue(js.startswith("// @license " + build.GPL_MAGNET), s)
            self.assertTrue(js.rstrip().endswith("// @license-end"), s)

    def test_chamber_model_keeps_its_licence_and_author(self):
        js = read("js", "chamber.model.js")
        self.assertIn("Copyright 2026 Corwin Brust", js)
        self.assertIn("GPLv3-or-later", js)

    def test_asset_urls_carry_a_content_version(self):
        page = read("index.html")
        urls = re.findall(r'(?:src|href)="((?:css|js)/[^"]+)"', page)
        self.assertTrue(urls)
        import hashlib
        for u in urls:
            path, _, v = u.partition("?v=")
            with open(os.path.join(OUT, "public", path), "rb") as f:
                self.assertEqual(v, hashlib.sha256(f.read()).hexdigest()[:10], u)


class Server(unittest.TestCase):
    def test_htaccess_sends_a_strict_policy(self):
        h = read(".htaccess")
        csp = re.search(r'Content-Security-Policy "([^"]+)"', h).group(1)
        self.assertIn("script-src 'self'", csp)
        self.assertNotIn("unsafe-inline", csp)
        self.assertNotIn("unsafe-eval", csp)
        self.assertIn("connect-src 'none'", csp)
        self.assertIn("ErrorDocument 404 /404.html", h)

    def test_404_and_robots_exist(self):
        self.assertIn("Not found", read("404.html"))
        self.assertIn("User-agent", read("robots.txt"))

    def test_logos_have_names(self):
        for f in os.listdir(os.path.join(OUT, "public", "logos")):
            self.assertRegex(read("logos", f), r'aria-label="[^"]+"', f)

    def test_page_weight(self):
        # src/static/ pages are outside the site's frame and carry their own budget (tests/py/test_static.py,
        # 2026-11-13): the 400 KB is the site proper, as before.
        static = os.path.join(ROOT, "src", "static")
        apart = set(os.listdir(static)) if os.path.isdir(static) else set()
        total = 0
        pub = os.path.join(OUT, "public")
        for root, _, files in os.walk(pub):
            if os.path.relpath(root, pub).split(os.sep)[0] in apart:
                continue
            for f in files:
                if f != "taxonomy.json":
                    total += os.path.getsize(os.path.join(root, f))
        self.assertLess(total, 400 * 1024, "the whole site stays under 400 KB")


def luminance(hexcolor):
    h = hexcolor.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


class Colour(unittest.TestCase):
    PAIRS = [("ink", "bg", 7), ("ink", "surface", 7), ("muted", "bg", 4.5), ("muted", "surface", 4.5),
             ("accent", "bg", 4.5), ("accent", "surface", 4.5), ("accent-ink", "accent", 4.5),
             ("ml-ink", "ml-bg", 7), ("ml-ink", "ml-active", 4.5), ("muted", "mb-bg", 4.5),
             ("focus", "bg", 3), ("focus", "surface", 3)]

    @classmethod
    def setUpClass(cls):
        css = read("css", "site.css")
        light = re.search(r":root \{(.*?)\n\}", css, re.S).group(1)
        dark = re.search(r':root\[data-theme="dark"\] \{(.*?)\n\}', css, re.S).group(1)
        dark_media = re.search(r':root:not\(\[data-theme="light"\]\) \{(.*?)\n  \}', css, re.S).group(1)
        grab = lambda block: dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", block))
        hc = re.search(r':root\[data-theme="hc"\] \{(.*?)\n\}', css, re.S).group(1)
        cls.themes = {"light": grab(light), "dark": grab(dark), "dark (system)": grab(dark_media),
                      "high contrast": grab(hc)}

    def test_themes_agree(self):
        self.assertEqual(self.themes["dark"], self.themes["dark (system)"],
                         "the two dark blocks must carry the same colours")

    def test_contrast_meets_wcag(self):
        for name, t in self.themes.items():
            for fg, bg, need in self.PAIRS:
                r = contrast(t[fg], t[bg])
                self.assertGreaterEqual(r, need, "%s: %s on %s is %.2f, needs %s" % (name, fg, bg, r, need))

    def test_scoreboard_colours(self):
        self.assertGreaterEqual(contrast("#f2e9c9", "#10131a"), 7)
        self.assertGreaterEqual(contrast("#ffd166", "#10131a"), 7)
        self.assertGreaterEqual(contrast("#9aa3b5", "#10131a"), 4.5)


def run_script(name, *args):
    return subprocess.run([sys.executable, os.path.join(ROOT, "scripts", name)] + list(args),
                          capture_output=True, text=True, cwd=ROOT)


class Wording(unittest.TestCase):
    SKIP = {".git", "public", "dist", "node_modules", "__pycache__"}

    def files(self):
        for base, dirs, names in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in self.SKIP]
            for n in names:
                yield os.path.join(base, n)

    def test_no_best_friend(self):
        for path in self.files():
            if path.endswith((".png", ".svg", ".gz", ".pyc")) or path.endswith("test_site.py") or path.endswith("run.sh"):
                continue
            with open(path, encoding="utf-8", errors="replace") as f:
                self.assertNotIn("best friend", f.read().lower(), path)
        self.assertNotIn("best friend", read("index.html").lower())

    def test_the_blog_host_is_spelled_right(self):
        wrong = "brust" + ".st"
        for path in self.files():
            if path.endswith((".png", ".gz", ".pyc")) or path.endswith("test_site.py") or path.endswith("run.sh"):
                continue
            with open(path, encoding="utf-8", errors="replace") as f:
                self.assertNotIn(wrong, f.read(), path)
        self.assertIn('href="https://corwin.bru.st/"', read("index.html"))

    def test_prose_keeps_one_voice(self):
        # docs/VOICE-READ-2026-11-01.md: card and About prose speak as "I" (Corwin) or "we" (the shop).
        # Third person is for titles, labels, credits and meta, which sit above the first "== " line,
        # and for a visitor's question in curly quotes.
        third = re.compile(r"\b(Corwin|[Hh]e|[Hh]im|[Hh]is)\b")
        skip = {"windows", "views"}
        for base, dirs, names in os.walk(os.path.join(ROOT, "content")):
            dirs[:] = [d for d in dirs if d not in skip]
            for n in names:
                if not n.endswith(".txt") or n == "vocabulary.txt":
                    continue
                path, prose = os.path.join(base, n), False
                with open(path, encoding="utf-8") as f:
                    for i, line in enumerate(f, 1):
                        if line.startswith("== "):
                            # A formal tone version may speak of "Corwin Brust" (Corwin, 2026-11-01:
                            # "no holds barred"); tests/py/test_tone.py holds it to no he, him or his.
                            prose = "/ formal" not in line
                            continue
                        if not prose:
                            continue
                        t = re.sub("“[^”]*”", "", line)
                        t = t.replace("I am Corwin Brust", "").replace("Corwin Brust and Bryant Frankford", "")
                        self.assertIsNone(third.search(t), "%s:%d speaks of Corwin in the third person" % (path, i))

    def test_dotfiles_point_at_sourcehut_not_the_old_gitlab_copy(self):
        # Corwin, 2026-11-01: his init files live on sourcehut; the GitLab repository is an old copy.
        old = "gitlab.com/" + "mplscorwin/dotfiles"
        for base, _, names in os.walk(os.path.join(OUT, "public")):
            for n in names:
                with open(os.path.join(base, n), encoding="utf-8", errors="replace") as f:
                    self.assertNotIn(old, f.read(), os.path.join(base, n))
        self.assertIn('href="https://git.sr.ht/~mplscorwin/dotfiles"', read("index.html"))


class Snapshots(unittest.TestCase):
    PATHLIKE = re.compile(r"[A-Za-z]:[\\/]|\\|/(?:home|g|h|c|usr|etc|var|tmp|mnt|users|sessions)/|\.log\b|@|\bpassphrase|\bkey\b", re.I)

    def snap(self, *parts):
        with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
            return json.load(f)

    def test_ci_snapshot_has_no_path_like_strings(self):
        ci = self.snap("content", "ci", "builds.json")
        for r in ci["data"]:
            self.assertEqual(sorted(r), ["branch", "date", "latest"])
            for v in r.values():
                self.assertIsNone(self.PATHLIKE.search(v), r)
                self.assertNotIn("/", v)
        self.assertTrue(ci["data"])

    def test_page_shows_the_builds_and_the_blog(self):
        # What the page must show is read from the same snapshots it is built from, not written in here: the minter
        # fetches the builds and the blog afresh on every run, and a build named here went red the day it scrolled
        # off the feed (2026-11-11: emacs-32-3b92ea held df4f22f back from aboutcorwin.com for a day).
        page = read("index.html")
        self.assertIn("Recent Emacs builds", page)
        self.assertIn("From my Emacs blog", page)
        rows = []
        for r in self.snap("content", "ci", "builds.json")["data"]:
            m = build.CI_DATE.match(r["date"])
            rows.append((m.group(1), m.group(2), r["branch"], r["latest"]))
        rows.sort(key=lambda x: (x[0], x[1]), reverse=True)
        self.assertTrue(rows, "the builds snapshot is empty")
        for day, hour, branch, latest in rows[:6]:
            self.assertIn('href="%s%s/"' % (build.BLOG_URL, branch), page)
            self.assertIn('datetime="%sT%s"' % (day, hour), page)
            if latest and branch != "emacs-tree-sitter":
                self.assertIn(latest, page)
        posts = self.snap("content", "feeds", "emacs-blog.json")["posts"]
        self.assertTrue(posts, "the blog snapshot is empty")
        for p in posts[:5]:
            self.assertIn(build.e(p["title"]), page)

    def test_blog_links_stay_on_the_blog_over_https(self):
        for p in self.snap("content", "feeds", "emacs-blog.json")["posts"]:
            self.assertRegex(p["url"], r"^https://corwin\.bru\.st(/|$)")

    def test_build_refuses_a_post_off_the_blog_and_a_path_in_a_build(self):
        with tempfile.TemporaryDirectory() as t:
            shutil.copytree(os.path.join(ROOT, "content"), os.path.join(t, "content"))
            fp = os.path.join(t, "content", "feeds", "emacs-blog.json")
            d = json.load(open(fp))
            d["posts"][0]["url"] = "https://evil.example/x"
            json.dump(d, open(fp, "w"))
            with self.assertRaises(build.ContentError):
                build.load(os.path.join(t, "content"))
            shutil.copy(os.path.join(ROOT, "content", "feeds", "emacs-blog.json"), fp)
            cp = os.path.join(t, "content", "ci", "builds.json")
            d = json.load(open(cp))
            d["data"][0]["latest"] = "G:/dev-git/emacs-32"
            json.dump(d, open(cp, "w"))
            with self.assertRaises(build.ContentError):
                build.load(os.path.join(t, "content"))

    def test_fetch_feeds_reads_rss_and_atom_and_keeps_only_our_host(self):
        with tempfile.TemporaryDirectory() as t:
            out = os.path.join(t, "o.json")
            r = run_script("fetch-feeds", "--from", "tests/fixtures/feeds/rss.xml", "--out", out)
            self.assertEqual(r.returncode, 0, r.stderr)
            posts = json.load(open(out))["posts"]
            self.assertEqual([p["title"] for p in posts], ["Fixture post one", "Fixture & two"])
            self.assertEqual(posts[0]["date"], "2024-10-12")
            r = run_script("fetch-feeds", "--from", "tests/fixtures/feeds/atom.xml", "--out", out)
            self.assertEqual(json.load(open(out))["posts"][0]["date"], "2024-05-02")

    def test_fetch_feeds_refuses_entities(self):
        with tempfile.TemporaryDirectory() as t:
            out = os.path.join(t, "o.json")
            r = run_script("fetch-feeds", "--from", "tests/fixtures/feeds/evil.xml", "--out", out)
            self.assertNotEqual(r.returncode, 0)
            self.assertFalse(os.path.exists(out))

    def test_fetch_ci_keeps_the_published_shape_and_drops_odd_rows(self):
        with tempfile.TemporaryDirectory() as t:
            out, src = os.path.join(t, "o.json"), os.path.join(t, "in.js")
            with open(os.path.join(ROOT, "tests", "fixtures", "ci", "emacs-latest.js")) as f:
                text = f.read()
            text = text.replace("]\n// @license-end", ', {"branch":"emacs-31","latest":"C:\\\\g\\\\x","date":"2026-10-30.16"}]\n// @license-end')
            open(src, "w").write(text)
            r = run_script("fetch-ci", "--from", src, "--out", out, "--fetched", "2026-11-01")
            self.assertEqual(r.returncode, 0, r.stderr)
            rows = json.load(open(out))["data"]
            self.assertEqual(len(rows), 6)
            for row in rows:
                self.assertIsNone(Snapshots.PATHLIKE.search(row["latest"]), row)


class Customize(unittest.TestCase):
    def test_the_control_and_its_fields_are_in_the_page(self):
        page = read("index.html")
        for want in ('id="custom-btn"', 'aria-controls="custom-panel"', "Text size:", "Line length:",
                     "Line spacing:", "Colour theme:", "Reduce motion", "[Apply]", "[Reset]"):
            self.assertIn(want, page)
        self.assertLess(page.index('id="custom-btn"'), page.index('class="masthead"'))

    def test_the_control_needs_scripts_and_hides_without_them(self):
        css = read("css", "site.css")
        self.assertRegex(css, r"\.custom \{ display: none; \}")
        self.assertIn(".js .custom { display: block;", css)

    def test_reading_text_is_what_scales(self):
        css = read("css", "site.css")
        self.assertIn(".reading { font-size: calc(1.0625rem * var(--read-scale, 1))", css)
        self.assertNotRegex(css, r"html\[data-size[^{]*\{[^}]*font-size")


class SecondReader(unittest.TestCase):
    """Python recomputes the associations the browser computes. Two readers, two languages."""

    def python_npmi(self):
        items = INDEX["items"]
        n, df, co = len(items), {}, {}
        for it in items:
            ts = sorted(t for t, w in it["w"].items() if w >= 0.4)
            for t in ts:
                df[t] = df.get(t, 0) + 1
            for i in range(len(ts)):
                for j in range(i + 1, len(ts)):
                    co[(ts[i], ts[j])] = co.get((ts[i], ts[j]), 0) + 1
        out = {}
        for (a, b), c in co.items():
            pab, pa, pb = c / n, df[a] / n, df[b] / n
            v = round(1.0 if pab >= 1 else math.log(pab / (pa * pb)) / -math.log(pab), 6)
            if v > 0:
                out[(a, b)] = v
        return out

    def test_javascript_and_python_agree(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed; the JavaScript side cannot be read")
        script = ("const T=require(process.argv[1]);const i=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
                  "process.stdout.write(JSON.stringify(T.associations(i.tags,i.items).edges))")
        js = json.loads(subprocess.check_output(
            [node, "-e", script, os.path.join(ROOT, "src", "js", "taxonomy.js"),
             os.path.join(OUT, "public", "taxonomy.json")]))
        js = {(e["a"], e["b"]): e["w"] for e in js}
        py = self.python_npmi()
        self.assertEqual(set(js), set(py))
        for k in py:
            self.assertAlmostEqual(js[k], py[k], places=5, msg=str(k))


if __name__ == "__main__":
    unittest.main()


class SecondAct(unittest.TestCase):
    """Corwin, 2026-11-01 18:06: the cast is a page of its own, the second act; the home page stays
    as it was before the cast came (7fdb985^), with one quiet link to it."""

    T2 = ("Copy anything here. When I build something, I ask who it lets in and who it leaves out. "
          "If it left you out, tell me: corwin@bru.st")

    def test_the_home_page_has_no_cast_section(self):
        page = read("index.html")
        for mark in ('id="personae"', 'class="pp-', "personae.js", "cast.css", "Dramatis personae"):
            self.assertNotIn(mark, page, "the home page carries the cast (%s)" % mark)
        self.assertNotIn(".pp-", read("css", "site.css"), "the cast's rules belong in cast.css")

    def test_one_quiet_link_leads_from_the_home_page_to_the_cast(self):
        page = read("index.html")
        self.assertEqual(len(re.findall(r'href="cast/index.html"', page)), 1)
        foot = page.split('<footer class="minibuffer-wrap"')[1]
        self.assertIn('href="cast/index.html"', foot, "the link sits in the footer, out of the way")

    def test_the_cast_page_has_the_section_and_the_home_pages_frame(self):
        home, cast = read("index.html"), read("cast", "index.html")
        self.assertIn('id="personae"', cast)
        self.assertIn('href="../index.html"', cast)
        grab = lambda t, a, b: re.sub(r"\s+", " ", re.sub(r"<!--tone-->.*?<!--/tone-->", "", t[t.index(a):t.index(b)], flags=re.S))
        self.assertEqual(grab(cast, '<div class="custom" id="custom">', '<header'),
                         grab(home, '<div class="custom" id="custom">', '<header'), "Customize differs")
        self.assertEqual(grab(cast, '<div class="modeline"', '<footer'), grab(home, '<div class="modeline"', '<footer'))
        self.assertIn('id="prompt"', cast)
        self.assertIn('rel="jslicense"', cast)
        self.assertIn('id="taxonomy-index"', cast)
        self.assertNotIn("style=", cast)
        self.assertNotRegex(cast, r"<script(?![^>]*\bsrc=)(?![^>]*application/json)[^>]*>", "inline script")
        self.assertNotRegex(cast, r'(src|href)="https?://(?!www\.gnu|github|hostux|corwin\.bru)', "")
        self.assertIn('data-tone="none"', cast, "the cast page has no tone pad for now")

    def test_t2_the_top_matter_is_at_the_top_of_the_cast_page_word_for_word(self):
        cast = read("cast", "index.html")
        head = cast.split("<main")[0]
        m = re.search(r'<p class="stitch" id="stitch">(.*?)</p>', head)
        self.assertIsNotNone(m, "T2 is not in the cast page's masthead")
        text = re.sub(r"<[^>]+>", "", m.group(1))
        self.assertEqual(html.unescape(text), self.T2)
        self.assertIn('href="mailto:corwin@bru.st"', m.group(1))
        self.assertLess(cast.index('id="stitch"'), cast.index('<h1>') + 400, "T2 sits right under the title")
        self.assertNotIn(self.T2[:30], read("index.html"), "T2 belongs to the cast page, not the home page")
