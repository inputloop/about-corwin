# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""The dramatis personae: who stands where is computed from content/personae/, never placed.

python3 -m unittest discover -s tests/py   (standard library only)
"""
import copy
import os
import re
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import build  # noqa: E402

OUT = DATA = None


def setUpModule():
    global OUT, DATA
    OUT = tempfile.mkdtemp(prefix="aboutcorwin-pp-")
    DATA, _ = build.build(os.path.join(OUT, "public"))


def tearDownModule():
    shutil.rmtree(OUT, ignore_errors=True)


def page():
    with open(os.path.join(OUT, "public", "index.html"), encoding="utf-8") as f:
        return f.read()


def cast(pp):
    people = [dict(p) for p in pp["left"] + pp["right"]]
    pairs = [{"person": r["person"], "persona": r["persona"], "words": r["words"], "href": r["href"]}
             for r in pp["pairs"]]
    return people, pairs


def order(pp):
    return [p["slug"] for p in pp["left"]], [p["slug"] for p in pp["right"]]


class Order(unittest.TestCase):
    def test_the_page_carries_the_computed_order(self):
        pp = DATA["personae"]
        text = page()
        for side, cls in (("left", "pp-left"), ("right", "pp-right")):
            block = re.search(r'<section class="pp-col %s".*?</ol>' % cls, text, re.S).group(0)
            got = re.findall(r'<li class="pp-card [^"]*" id="pp-([\w-]+)" data-slug="[\w-]+" data-slot="(\d+)"', block)
            self.assertEqual([s for s, _ in got], [p["slug"] for p in pp[side]])
            self.assertEqual([int(n) for _, n in got], list(range(len(got))))

    def test_people_left_personas_right(self):
        pp = DATA["personae"]
        self.assertTrue(pp["left"] and pp["right"])
        self.assertEqual({p["kind"] for p in pp["left"]}, {"person"})
        self.assertEqual({p["kind"] for p in pp["right"]}, {"persona"})

    def test_no_two_related_pairs_meet_at_once_and_the_spacing_is_best(self):
        from itertools import permutations
        pp = DATA["personae"]
        steps = [r["step"] for r in pp["pairs"]]
        self.assertEqual(len(steps), len(set(steps)))
        slot = {p["slug"]: p["slot"] for p in pp["left"] + pp["right"]}
        for r in pp["pairs"]:
            self.assertEqual(r["step"], slot[r["person"]] - slot[r["persona"]])

        def gaps(st):
            marks = [pp["lo"]] + sorted(st) + [pp["hi"]]
            return sorted(b - a for a, b in zip(marks, marks[1:]))
        mine = gaps(steps)
        L, R = order(pp)
        for l in permutations(L):
            for r in permutations(R):
                st = [l.index(x["person"]) - r.index(x["persona"]) for x in pp["pairs"]]
                if len(set(st)) == len(st):
                    self.assertLessEqual(gaps(st), mine, "a better spaced order exists: %s %s" % (l, r))

    def test_a_changed_relation_changes_the_order(self):
        pp = DATA["personae"]
        people, pairs = cast(pp)
        before = order(build.order_personae(copy.deepcopy(people), copy.deepcopy(pairs)))
        changed = 0
        persons = [p["slug"] for p in people if p["kind"] == "person"]
        personas = [p["slug"] for p in people if p["kind"] == "persona"]
        trials = [pairs[:i] + pairs[i + 1:] for i in range(len(pairs))]
        trials += [pairs + [{"person": a, "persona": b, "words": "x", "href": "https://x"}]
                   for a in persons for b in personas
                   if not any(r["person"] == a and r["persona"] == b for r in pairs)]
        for t in trials:
            try:
                after = order(build.order_personae(copy.deepcopy(people), copy.deepcopy(t)))
            except build.ContentError:
                continue
            changed += after != before
        self.assertGreater(changed, 0, "no change to the relations moved anyone: the order ignores them")
        # And one named case, so a reader can follow it: without Bryant and Alfred's pairing, the
        # order is different.
        t = [r for r in pairs if (r["person"], r["persona"]) != ("bryant", "alfred")]
        self.assertNotEqual(order(build.order_personae(copy.deepcopy(people), t)), before)

    def test_the_order_is_the_same_whatever_order_the_files_are_read(self):
        pp = DATA["personae"]
        people, pairs = cast(pp)
        a = order(build.order_personae(copy.deepcopy(people), copy.deepcopy(pairs)))
        b = order(build.order_personae(copy.deepcopy(people[::-1]), copy.deepcopy(pairs[::-1])))
        self.assertEqual(a, b)


class NoHandPlacedPositions(unittest.TestCase):
    def slugs(self):
        return [p["slug"] for p in DATA["personae"]["left"] + DATA["personae"]["right"]]

    def test_the_cards_carry_no_position(self):
        d = os.path.join(ROOT, "content", "personae")
        for n in os.listdir(d):
            with open(os.path.join(d, n), encoding="utf-8") as f:
                keys = {m.group(1) for m in re.finditer(r"^([\w-]+):", f.read(), re.M)}
            self.assertLessEqual(keys, build.PERSONA_KEYS, n)

    def test_the_build_refuses_a_position_in_a_card(self):
        tmp = tempfile.mkdtemp()
        try:
            shutil.copytree(os.path.join(ROOT, "content"), os.path.join(tmp, "content"))
            with open(os.path.join(tmp, "content", "personae", "mentat.txt"), "a", encoding="utf-8") as f:
                f.write("offset: 2\n")
            with self.assertRaises(build.ContentError) as cm:
                build.load(os.path.join(tmp, "content"))
            self.assertIn("computed", str(cm.exception))
        finally:
            shutil.rmtree(tmp)

    def test_no_stylesheet_or_script_names_anyone(self):
        css = open(os.path.join(ROOT, "src", "css", "site.css"), encoding="utf-8").read()
        js = open(os.path.join(ROOT, "src", "js", "personae.js"), encoding="utf-8").read()
        for s in self.slugs():
            self.assertNotRegex(css, r"#pp-%s\b|data-slug=\"?%s" % (s, s), "site.css places %s by hand" % s)
            self.assertNotRegex(js, r"['\"]%s['\"]|pp-%s\b" % (s, s), "personae.js names %s" % s)
        self.assertNotRegex(css, r"\.pp-[\w-]+:nth-(child|of-type)", "a personae rule picks a card by its position")
        self.assertNotRegex(css, r"\[data-slot", "a personae rule picks a card by its slot")

    def test_the_build_refuses_relations_that_cannot_be_kept_apart(self):
        people = [{"slug": "a", "kind": "person"}, {"slug": "b", "kind": "persona"},
                  {"slug": "c", "kind": "person"}]
        pairs = [{"person": "a", "persona": "b"}, {"person": "c", "persona": "b"}]
        build.order_personae(copy.deepcopy(people), copy.deepcopy(pairs))  # two steps: fine
        people.append({"slug": "d", "kind": "persona"})
        pairs += [{"person": "a", "persona": "d"}, {"person": "c", "persona": "d"}]
        with self.assertRaises(build.ContentError):  # four pairs, three steps
            build.order_personae(people, pairs)


class Words(unittest.TestCase):
    def test_every_pairing_is_written_out_with_both_names(self):
        text = page()
        pp = DATA["personae"]
        by = {p["slug"]: p["title"] for p in pp["left"] + pp["right"]}
        items = re.findall(r'<li class="pp-pair"[^>]*>(.*?)</li>', text, re.S)
        self.assertEqual(len(items), len(pp["pairs"]))
        for r, li in zip(pp["pairs"], items):
            self.assertIn("%s and %s" % (by[r["person"]], by[r["persona"]]), li)
            self.assertIn(r["href"], li)

    def test_the_cast_is_only_who_the_site_or_public_repositories_name(self):
        # Corwin, 2026-11-01: add nobody new and no private names. Credit as the site and the
        # public inputloop repositories give it: Brigidt by her GitHub handle for repository work.
        self.assertEqual(sorted(p["title"] for p in DATA["personae"]["left"]),
                         ["Brigidt", "Bryant Frankford", "Corwin Brust", "Dee Brust"])
        self.assertEqual(sorted(p["title"] for p in DATA["personae"]["right"]),
                         ["Alfred", "Mentat", "Vibrobeast"])
        self.assertIn("definitelynotaspren", page())

    def test_relation_sources_are_public(self):
        for r in DATA["personae"]["pairs"]:
            m = re.match(r"https://github\.com/inputloop/([^/]+)", r["href"])
            self.assertTrue(m, r["href"])
            self.assertIn(m.group(1), build.PUBLIC_REPOS)


if __name__ == "__main__":
    unittest.main()
