# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
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
    # The cast is the second act, a page of its own (Corwin, 2026-11-01 18:06).
    with open(os.path.join(OUT, "public", "cast", "index.html"), encoding="utf-8") as f:
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
        # The steps depend only on where the paired people and personas stand, so trying every slot
        # for each of them covers every arrangement's spacing.
        lp = sorted({x["person"] for x in pp["pairs"]}); rp = sorted({x["persona"] for x in pp["pairs"]})
        for ls in permutations(range(len(L)), len(lp)):
            for rs in permutations(range(len(R)), len(rp)):
                sl, sr = dict(zip(lp, ls)), dict(zip(rp, rs))
                st = [sl[x["person"]] - sr[x["persona"]] for x in pp["pairs"]]
                if len(set(st)) == len(st):
                    self.assertLessEqual(gaps(st), mine, "a better spaced placement exists: %s %s" % (sl, sr))

    def test_the_search_gives_what_trying_every_arrangement_gives(self):
        # order_personae tries placements of the paired ones only; on casts small enough to try
        # every arrangement, the two must agree exactly.
        import random
        from itertools import permutations

        def brute(people, pairs):
            left = sorted(p["slug"] for p in people if p["kind"] == "person")
            right = sorted(p["slug"] for p in people if p["kind"] == "persona")
            lo, hi = -len(right), len(left)
            best = None
            for L in permutations(left):
                for R in permutations(right):
                    st = sorted(L.index(x["person"]) - R.index(x["persona"]) for x in pairs)
                    if len(set(st)) != len(st):
                        continue
                    marks = [lo] + st + [hi]
                    score = (sorted(b - a for a, b in zip(marks, marks[1:])), tuple(-ord(c) for c in "\0".join(L + R)))
                    if best is None or score > best[0]:
                        best = (score, [list(L), list(R)])
            return best and best[1]
        rng = random.Random(4)   # the house seed
        casts = []
        names = ["ann", "bo", "cy", "di", "ed", "flo", "gus"]
        for n in range(40):
            k, m = rng.randint(2, 6), rng.randint(1, 3)
            ppl = [{"slug": names[i], "kind": "person"} for i in range(k)] + [{"slug": "p%d" % j, "kind": "persona"} for j in range(m)]
            prs, seen = [], set()
            for _ in range(rng.randint(1, 3)):
                a, b = names[rng.randrange(k)], "p%d" % rng.randrange(m)
                if (a, b) not in seen:
                    seen.add((a, b)); prs.append({"person": a, "persona": b, "words": "x", "href": "https://x"})
            casts.append((ppl, prs))
        agreed = 0
        for ppl, prs in casts:
            want = brute(ppl, prs)
            try:
                got = order(build.order_personae(copy.deepcopy(ppl), copy.deepcopy(prs)))
            except build.ContentError:
                got = None
            self.assertEqual(got and [list(got[0]), list(got[1])], want, (ppl, prs))
            agreed += 1
        self.assertEqual(agreed, 40)

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
        css = "".join(open(os.path.join(ROOT, "src", "css", n), encoding="utf-8").read() for n in ("site.css", "cast.css"))
        js = open(os.path.join(ROOT, "src", "js", "personae.js"), encoding="utf-8").read()
        for s in self.slugs():
            self.assertNotRegex(css, r"#pp-%s\b|data-slug=\"?%s" % (s, s), "a stylesheet places %s by hand" % s)
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

    def test_the_cast_is_who_corwin_has_named(self):
        # Corwin, 2026-11-01: first, nobody new; at 19:39, "include some more of our labpartners and
        # people who you know about on our cast page; I will ask you to take things down". One file
        # each, so any one can come down by deleting a file. Brigidt is credited as she asks.
        self.assertEqual(sorted(p["title"] for p in DATA["personae"]["left"]),
                         ["Bob", "Brigidt", "Bryant Frankford", "Corwin Brust", "David Dyer-Bennet (DD-B)",
                          "Dee Brust", "Erik Elmshausertigger (tigersbite)", "Jon Lincicum", "Logan",
                          'Pierre ("Peer")', "Rachel (Teachable)"])
        self.assertIn("K. Smith as editor; definitelynotaspren for her repository work", page())
        self.assertEqual(sorted(p["title"] for p in DATA["personae"]["right"]),
                         ["Alfred", "Mentat", "Vibrobeast"])
        self.assertIn("definitelynotaspren", page())

    def test_who_works_with_whom_writes_every_with_line_and_makes_no_postcard_of_it(self):
        text = page()
        pp = DATA["personae"]
        items = re.findall(r'<li class="pp-with" data-people="([\w-]+) ([\w-]+)">(.*?)</li>', text, re.S)
        self.assertEqual(len(items), len(pp["with"]))
        self.assertEqual(len(items), 7)
        for a, b, li in items:
            self.assertIn(" and ", li)
        self.assertNotIn("pp-with", open(os.path.join(ROOT, "src", "js", "personae.js"), encoding="utf-8").read())

    def test_the_cast_says_nothing_private(self):
        # 19:39: nothing about keys, secrets, sealing, emergency contacts or who can open what; no
        # contact details, private repositories, health, family or personal details.
        d = os.path.join(ROOT, "content", "personae")
        for n in sorted(os.listdir(d)):
            t = open(os.path.join(d, n), encoding="utf-8").read().lower()
            for w in ("key", "secret", "seal", "emergency", "password", "phone", "@", "mailto", "health"):
                self.assertNotIn(w, t.replace("keeps", "").replace("keep ", ""), "%s says %r" % (n, w))

    def test_a_with_line_joins_two_people_only(self):
        tmp = tempfile.mkdtemp()
        try:
            shutil.copytree(os.path.join(ROOT, "content"), os.path.join(tmp, "content"))
            with open(os.path.join(tmp, "content", "personae", "logan.txt"), "a", encoding="utf-8") as f:
                f.write("with: mentat | not a person\n")
            with self.assertRaises(build.ContentError):
                build.load(os.path.join(tmp, "content"))
        finally:
            shutil.rmtree(tmp)

    def test_relation_sources_are_public(self):
        for r in DATA["personae"]["pairs"]:
            m = re.match(r"https://github\.com/inputloop/([^/]+)", r["href"])
            self.assertTrue(m, r["href"])
            self.assertIn(m.group(1), build.PUBLIC_REPOS)


if __name__ == "__main__":
    unittest.main()
