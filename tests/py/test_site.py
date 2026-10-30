# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
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
        pat = re.compile(r"https://github\.com/inputloop/([^/\s\"#?]+)")
        page = read("index.html")
        for name in pat.findall(page):
            self.assertIn(name, build.PUBLIC_REPOS, "links a repository not known to be public: %s" % name)
        for root, _, files in os.walk(os.path.join(ROOT, "content")):
            for f in files:
                with open(os.path.join(root, f), encoding="utf-8") as fh:
                    for name in pat.findall(fh.read()):
                        self.assertIn(name, build.PUBLIC_REPOS, "%s links %s" % (f, name))

    PRIVATE = ("gitcha", "llama-bridge", "llama bridge", "topoforge", "theseus", "persona-engine",
               "ghostwheel", "legendoflinks", "mariosworld", "mariospaint", "al2n", "kid-glove", "tavern",
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
            self.assertTrue(i.attrs.get("id") in labelled or i.attrs.get("aria-label"), i.attrs)

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
        self.assertEqual(sorted(s.split("?")[0] for s in srcs), sorted("js/" + n for n in build.JS_FILES))
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
        total = 0
        for root, _, files in os.walk(os.path.join(OUT, "public")):
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
        cls.themes = {"light": grab(light), "dark": grab(dark), "dark (system)": grab(dark_media)}

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
            v = 1.0 if pab >= 1 else math.log(pab / (pa * pb)) / -math.log(pab)
            if v > 0:
                out[(a, b)] = round(v, 6)
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
