#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build aboutcorwin.com from content/ and src/ into public/.

Standard library only, so it runs wherever Python 3.8+ does: a laptop, a Dreamhost shell, a
GitHub, Gitea, Forgejo or gitcha runner.

    python3 build.py              build into public/
    python3 build.py --out DIR    build somewhere else
    python3 build.py --check      parse and validate the content, write nothing

The content is one plain text file per card (DESIGN.md says why). A file is a header of
`key: value` lines, then `== layer ==` sections of prose. The build reads the prose for the words in
content/vocabulary.txt and turns them into weighted tags; the page carries those tags as an index
that src/js/taxonomy.js searches in the browser.
"""
import argparse
import html
import json
import math
import os
import re
import shutil
import sys

import build_tone

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, "content")
SRC = os.path.join(ROOT, "src")

HEADER_FACETS = ("do", "bring", "whose", "state")
LAYERS = ("summary", "function", "practice", "presentation")
# How much a word found in each part of a card counts toward that card's tag weight.
LAYER_WEIGHT = {"title": 1.0, "role": 0.8, "summary": 0.8, "function": 0.6,
                "practice": 0.5, "presentation": 0.4}
CARD_KINDS = ("about", "involvements", "projects", "concepts")
MAX_PROSE_WORDS = 500
# Repositories known public: seven that GitHub reported on 2026-10-29 (inputloop/.github-private
# catalog.tsv), corwin.cloud (public as of 2026-11-01), and six more public as of 2026-11-01:
# topology (branch corwin), about-corwin, gitcha, ta, three-phase-transcription and journal.
# A card may link to github.com/inputloop/<name> only for these; tests/py enforces it.
PUBLIC_REPOS = {".github", "fourSwordsFromThePast", "NextTime-Dev", "quantum3d5",
                "suit-crm-6-5-php-sec-backport", "vibrobeast", "vibrobeast-skills", "corwin.cloud",
                "topology", "about-corwin", "gitcha", "ta", "three-phase-transcription", "journal",
                "pubs"}
# The scripts each page loads; jslicense.html lists every script either page loads (JS_FILES).
HOME_JS = ("chamber.model.js", "taxonomy.js", "windows.js", "site.js", "customize.js", "tone.model.js", "dpad.js")
CAST_JS = ("chamber.model.js", "taxonomy.js", "site.js", "customize.js", "personae.js")
JS_FILES = HOME_JS + tuple(n for n in CAST_JS if n not in HOME_JS)
# The second act: the cast (Corwin, 2026-11-01 18:06: "we want the cast page to be its own page").
CAST_DIR = "cast"
GPL_MAGNET = "magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt"
VIEW_ORDER = ("prose", "baseball", "scoreboard", "featured")
VIEW_HEADINGS = {"prose": "Introduction", "baseball": "On the back",
                 "scoreboard": "Scoreboard", "featured": "In the window"}


class ContentError(Exception):
    pass


BLOG_HOST = "corwin.bru.st"
BLOG_URL = "https://corwin.bru.st/"
OWN_URL = re.compile(r"^https://corwin\.bru\.st(/[A-Za-z0-9._~%/?=&#+-]*)?$")
CI_BRANCH = re.compile(r"^[a-z][a-z0-9-]{1,30}$")
CI_LATEST = re.compile(r"^[A-Za-z0-9._,+-]{0,80}$")
CI_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.(\d{2})$")


def load_snapshots(content_dir=CONTENT):
    """The two build-time snapshots (docs/BLOG-INGEST.md). Missing or malformed files are an error
    the person can fix by running scripts/fetch-feeds or scripts/fetch-ci; nothing is fetched here."""
    def read_json(*parts):
        path = os.path.join(content_dir, *parts)
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f), path
        except (OSError, ValueError) as err:
            raise ContentError("%s: cannot read snapshot (%s)" % (path, err))
    blog, bp = read_json("feeds", "emacs-blog.json")
    posts = []
    for p in blog.get("posts", [])[:8]:
        title, url, date = p.get("title"), p.get("url"), p.get("date")
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise ContentError("%s: a post has no usable title" % bp)
        if not isinstance(url, str) or not OWN_URL.match(url):
            raise ContentError("%s: post link %r is not https on %s" % (bp, url, BLOG_HOST))
        if date is not None and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(date)):
            raise ContentError("%s: post date %r is not YYYY-MM-DD" % (bp, date))
        posts.append({"title": title.strip(), "url": url, "date": date})
    if not isinstance(blog.get("fetched"), str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", blog["fetched"]):
        raise ContentError("%s: 'fetched' must be a date" % bp)
    ci, cp = read_json("ci", "builds.json")
    rows = []
    for r in ci.get("data", []):
        m = CI_DATE.match(str(r.get("date")))
        if not (m and CI_BRANCH.match(str(r.get("branch"))) and CI_LATEST.match(str(r.get("latest", "")))):
            raise ContentError("%s: row %r does not match the published shape" % (cp, r))
        rows.append({"branch": r["branch"], "latest": r["latest"], "day": m.group(1), "hour": m.group(2)})
    if not isinstance(ci.get("fetched"), str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", ci["fetched"]):
        raise ContentError("%s: 'fetched' must be a date" % cp)
    rows.sort(key=lambda r: (r["day"], r["hour"]), reverse=True)
    return {"blog": {"posts": posts, "fetched": blog["fetched"], "status": str(blog.get("status", ""))},
            "ci": {"rows": rows[:8], "fetched": ci["fetched"]}}


def render_blog(snap):
    b = snap["blog"]
    if not b["posts"]:
        items = "<li>No posts saved yet. Run scripts/fetch-feeds.</li>"
    else:
        items = "".join('<li><a href="%s">%s</a>%s</li>' % (
            e(p["url"]), e(p["title"]),
            ' <time class="when" datetime="%s">%s</time>' % (e(p["date"]), e(p["date"])) if p["date"] else "")
            for p in b["posts"][:5])
    dated = any(p["date"] for p in b["posts"])
    note = ("Saved from the blog on %s." % e(b["fetched"])) + ("" if dated else " Dates are not saved yet.")
    return ('<section class="side-card" aria-labelledby="blog-h"><h3 id="blog-h">From my Emacs blog</h3>'
            '<ul class="posts">%s</ul><p class="src">%s <a href="%s">Read the blog</a>.</p></section>'
            % (items, note, BLOG_URL))


def render_ci(snap):
    c = snap["ci"]
    if not c["rows"]:
        items = "<li>No builds saved yet. Run scripts/fetch-ci.</li>"
    else:
        out = []
        for r in c["rows"][:6]:
            what = ("grammars: " + r["latest"].replace(",", ", ")) if r["branch"] == "emacs-tree-sitter" \
                else (r["latest"] or "installer links")
            out.append('<li><a href="%s%s/">%s</a> <span class="what">%s</span> '
                       '<time class="when" datetime="%sT%s">%s %sh</time></li>'
                       % (BLOG_URL, e(r["branch"]), e(r["branch"]), e(what), e(r["day"]), e(r["hour"]),
                          e(r["day"]), e(r["hour"])))
        items = "".join(out)
    return ('<section class="side-card" aria-labelledby="ci-h"><h3 id="ci-h">Recent Emacs builds</h3>'
            '<ul class="builds">%s</ul><p class="src">Newest uploads from my Windows build machine, as '
            'published by corwin.bru.st on %s. Hours are the server\'s clock.</p></section>'
            % (items, e(c["fetched"])))


# ---- reading ---------------------------------------------------------------------------------

def parse_file(path):
    """Return {'header': {key: [values]}, 'layers': {name: text}, 'path': path}."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    header, layers, layer = {}, {}, None
    in_header = True
    for n, line in enumerate(text.splitlines(), 1):
        m = re.match(r"^==\s*([\w-]+)\s*==\s*$", line)
        if m:
            in_header, layer = False, m.group(1)
            if layer in layers:
                raise ContentError("%s:%d: layer %s appears twice" % (path, n, layer))
            layers[layer] = []
            continue
        if in_header:
            if not line.strip():
                in_header = False
                continue
            m = re.match(r"^([\w-]+):\s?(.*)$", line)
            if not m:
                raise ContentError("%s:%d: header line is not 'key: value'" % (path, n))
            header.setdefault(m.group(1), []).append(m.group(2).strip())
        elif layer:
            layers[layer].append(line)
        elif line.strip():
            raise ContentError("%s:%d: prose before the first == layer ==" % (path, n))
    paras = {k: [p.strip() for p in re.split(r"\n\s*\n", "\n".join(v)) if p.strip()]
             for k, v in layers.items()}
    return {"header": header, "layers": paras, "path": path}


def one(rec, key, default=None, required=True):
    vals = rec["header"].get(key)
    if not vals:
        if required and default is None:
            raise ContentError("%s: missing '%s:'" % (rec["path"], key))
        return default
    if len(vals) > 1:
        raise ContentError("%s: '%s:' given %d times" % (rec["path"], key, len(vals)))
    return vals[0]


def pipes(value, n, path):
    parts = [p.strip() for p in value.split("|")]
    if len(parts) < n:
        raise ContentError("%s: '%s' needs %d parts separated by |" % (path, value, n))
    return parts


def read_vocabulary(path):
    tags, seen_terms = [], {}
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^([\w-]+)\s+([\w'.-]+):\s*(.*)$", line)
            if not m:
                raise ContentError("%s:%d: expected 'FACET TAG: synonyms'" % (path, n))
            facet, tag, syn = m.groups()
            tid = "%s:%s" % (facet, tag) if facet in HEADER_FACETS else tag
            if any(t["id"] == tid for t in tags):
                raise ContentError("%s:%d: tag %s defined twice" % (path, n, tid))
            terms = [s.strip().lower() for s in syn.split(",") if s.strip()]
            tags.append({"id": tid, "facet": facet, "label": tag, "syn": terms})
            for t in terms:
                seen_terms.setdefault(t, []).append(tid)
    return tags


def slug_of(path):
    return os.path.splitext(os.path.basename(path))[0]


def load(content_dir=CONTENT):
    vocab = read_vocabulary(os.path.join(content_dir, "vocabulary.txt"))
    by_id = {t["id"]: t for t in vocab}
    site = parse_file(os.path.join(content_dir, "site.txt"))
    cards, views, windows = [], [], []
    for kind in CARD_KINDS:
        d = os.path.join(content_dir, kind)
        for name in sorted(os.listdir(d)):
            if name.endswith(".txt"):
                cards.append(card_from(parse_file(os.path.join(d, name)), kind, by_id))
    for name in sorted(os.listdir(os.path.join(content_dir, "views"))):
        if name.endswith(".txt"):
            r = parse_file(os.path.join(content_dir, "views", name))
            views.append(descriptor_from(r, "view", by_id))
    for name in sorted(os.listdir(os.path.join(content_dir, "windows"))):
        if name.endswith(".txt"):
            r = parse_file(os.path.join(content_dir, "windows", name))
            windows.append(descriptor_from(r, "window", by_id))
    cards.sort(key=lambda c: (c["order"], c["slug"]))
    window_ids = {w["id"] for w in windows}
    for c in cards:
        if c["window"] not in window_ids:
            raise ContentError("%s: window '%s' has no content/windows/%s.txt"
                               % (c["path"], c["window"], c["window"]))
    slugs = [c["slug"] for c in cards]
    if len(slugs) != len(set(slugs)):
        raise ContentError("two cards share a slug")
    try:
        sections = build_tone.load_sections(content_dir, site["layers"])
    except build_tone.ToneError as err:
        raise ContentError(str(err))
    return {"vocab": vocab, "site": site, "cards": cards, "views": views, "windows": windows,
            "snap": load_snapshots(content_dir), "personae": load_personae(content_dir),
            "sections": sections, "links": load_links(content_dir)}


# ---- the links area: end credits in the right floating cluster (DESIGN.md, "The links area") -----
# Corwin, 2026-11-02: a links area "in the right floating cluster"; "run/smoosh the categories and
# names together into a single stream, force-align, and pick a font that makes it look like movie
# credits". content/links.txt holds the links; the support line is its own `support:` lines, so
# deleting them takes it off the page. Only plain https links: nothing is loaded from their sites.

def load_links(content_dir=CONTENT):
    path = os.path.join(content_dir, "links.txt")
    if not os.path.isfile(path):
        return None
    rec = parse_file(path)
    out = {"title": one(rec, "title"), "note": one(rec, "note"), "give": one(rec, "give", required=False),
           "roles": [], "support": []}
    for v in rec["header"].get("role", []):
        role, name, href = pipes(v, 3, path)
        out["roles"].append((role, name, href))
    for v in rec["header"].get("support", []):
        name, href = pipes(v, 2, path)
        out["support"].append((name, href))
    hrefs = ([r[2] for r in out["roles"]] + [s[1] for s in out["support"]]
             + [m[1] for m in INLINE_LINK.findall(out["give"] or "")])
    for href in hrefs:
        if not href.startswith("https://"):
            raise ContentError("%s: %s is not a plain https link" % (path, href))
    if not out["roles"]:
        raise ContentError("%s: no role: lines" % path)
    return out


def render_credits(links):
    """One stream of roles and names, justified edge to edge like end credits, written as a real
    list (a list of roles, each with its list of names) so a screen reader hears it as one."""
    if not links:
        return ""
    groups = []
    for role, name, href in links["roles"]:
        if not groups or groups[-1][0] != role:
            groups.append((role, []))
        groups[-1][1].append((name, href))
    roll = "".join('<li class="cr-group"><span class="cr-role">%s</span> <ul class="cr-names">%s</ul></li> '
                   % (e(role), "".join('<li><a href="%s">%s</a></li> ' % (e(h), e(n)) for n, h in names))
                   for role, names in groups)
    give = '<p class="cr-give">%s</p>' % inline(links["give"]) if links["give"] else ""
    support = ('<p class="cr-support">Support my work: %s</p>'
               % " · ".join('<a href="%s">%s</a>' % (e(h), e(n)) for n, h in links["support"])
               if links["support"] else "")
    return ('<details class="credits" id="credits"><summary class="credits-btn">Links</summary>'
            '<div class="credits-panel"><p class="cr-title" id="credits-h">%s</p>'
            '<ul class="cr-roll" aria-labelledby="credits-h">%s</ul>%s<p class="cr-note">%s</p>%s</div></details>'
            % (e(links["title"]), roll.rstrip(), give, e(links["note"]), support))


# ---- dramatis personae -------------------------------------------------------------------------
# People and the agent personas, in two columns that slide past each other as the page scrolls.
# Who is which kind and who relates to whom is data (content/personae/); where each one stands is
# computed from that data by order_personae(), never written by hand. DESIGN.md, "Dramatis
# personae", says the rule in words.

PERSONA_KINDS = ("person", "persona")
PERSONA_KEYS = {"title", "kind", "role", "credit", "source", "relation", "with"}
# The most placements the search will try before it says the cast has outgrown it. Only the people
# and personas in a pairing are placed by search (see order_personae), so this bounds the paired
# ones, not the whole cast.
MAX_ARRANGEMENTS = 2000000


def load_personae(content_dir=CONTENT):
    d = os.path.join(content_dir, "personae")
    people, relations, withs = [], [], []
    for name in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if not name.endswith(".txt"):
            continue
        rec = parse_file(os.path.join(d, name))
        path = rec["path"]
        extra = set(rec["header"]) - PERSONA_KEYS
        if extra:
            raise ContentError("%s: unknown key(s) %s; positions are computed from the relations, "
                               "never written in a card" % (path, ", ".join(sorted(extra))))
        if rec["layers"]:
            raise ContentError("%s: a personae card is a header only" % path)
        kind = one(rec, "kind")
        if kind not in PERSONA_KINDS:
            raise ContentError("%s: kind must be person or persona, not %r" % (path, kind))
        src = rec["header"].get("source", [])
        source = dict(zip(("label", "href"), pipes(src[0], 2, path))) if src else None
        if source and not source["href"].startswith("https://"):
            raise ContentError("%s: a source is an https link" % path)
        slug = slug_of(path)
        people.append({"slug": slug, "kind": kind, "title": one(rec, "title"), "role": one(rec, "role"),
                       "credit": one(rec, "credit", required=False), "source": source, "path": path})
        for v in rec["header"].get("relation", []):
            other, words, href = pipes(v, 3, path)
            if not href.startswith("https://"):
                raise ContentError("%s: a relation names its source as an https link" % path)
            relations.append({"a": slug, "b": other, "words": words, "href": href, "path": path})
        for v in rec["header"].get("with", []):
            parts = pipes(v, 2, path)
            href = parts[2] if len(parts) > 2 else None
            if href and not href.startswith("https://"):
                raise ContentError("%s: a with: line's source is an https link" % path)
            withs.append({"a": slug, "b": parts[0], "words": parts[1], "href": href, "path": path})
    by = {p["slug"]: p for p in people}
    together = []
    for w in withs:
        # Two people who work together stand in the same column, so they never come level: their
        # line is written out under the columns, makes no postcard, and plays no part in the order.
        if w["b"] not in by:
            raise ContentError("%s: with: names %r, who has no content/personae card" % (w["path"], w["b"]))
        if by[w["a"]]["kind"] != "person" or by[w["b"]]["kind"] != "person":
            raise ContentError("%s: a with: line joins two people; a person and a persona are a relation:"
                               % w["path"])
        together.append({"a": w["a"], "b": w["b"], "words": w["words"], "href": w["href"]})
    pairs, seen = [], set()
    for r in relations:
        if r["b"] not in by:
            raise ContentError("%s: relation names %r, who has no content/personae card" % (r["path"], r["b"]))
        a, b = by[r["a"]], by[r["b"]]
        if a["kind"] == b["kind"]:
            raise ContentError("%s: a relation pairs a person with a persona; %s and %s are both %ss"
                               % (r["path"], a["slug"], b["slug"], a["kind"]))
        person, persona = (a, b) if a["kind"] == "person" else (b, a)
        key = (person["slug"], persona["slug"])
        if key in seen:
            raise ContentError("%s: the relation %s and %s is written twice" % (r["path"], key[0], key[1]))
        seen.add(key)
        pairs.append({"person": key[0], "persona": key[1], "words": r["words"], "href": r["href"]})
    out = order_personae(people, pairs)
    out["with"] = sorted(together, key=lambda w: (w["b"], w["a"]))
    return out


def order_personae(people, pairs):
    """Place the people (left column, top down) and the personas (right column, top down).

    The left column rises as the page scrolls and the right one falls, so the person in left slot a
    comes level with the persona in right slot b when the columns have slid a - b slots past each
    other: a - b is that pair's meeting step. The rule:

      1. no two related pairs share a meeting step (at most one related pair is ever level);
      2. the gaps between meetings, counting one step before the first and one after the last as
         the run's ends, are as even as they can be: compare the gaps from smallest up and take
         the arrangement whose smallest gap is largest, then whose next is largest, and so on;
      3. ties go to the arrangement whose names, read down the left column and then down the
         right, come first in alphabetical order of their file names.

    The answer is the best one and the same on every machine, and it is exactly what trying every
    arrangement would give, found faster: the meeting steps depend only on the slots of those in a
    pairing, and for any placement of them the alphabetically first reading puts everyone else in
    the free slots in alphabetical order. So the search tries every placement of the paired people
    and personas, fills the rest in order, and compares as above (a test checks it against trying
    every arrangement on smaller casts)."""
    from itertools import permutations
    left = sorted(p["slug"] for p in people if p["kind"] == "person")
    right = sorted(p["slug"] for p in people if p["kind"] == "persona")
    lp = sorted({p["person"] for p in pairs})
    rp = sorted({p["persona"] for p in pairs})
    n_arr = (math.perm(len(left), len(lp)) * math.perm(len(right), len(rp)))
    if n_arr > MAX_ARRANGEMENTS:
        raise ContentError("%d paired people and %d paired personas make %d placements; the search "
                           "stops at %d" % (len(lp), len(rp), n_arr, MAX_ARRANGEMENTS))
    lo, hi = -(len(right) - 1) - 1, (len(left) - 1) + 1   # the run's ends, one step outside

    def fill(column, placed):
        rest = iter(s for s in column if s not in placed.values())
        return tuple(placed.get(i) or next(rest) for i in range(len(column)))

    def placements(column, paired):
        for slots in permutations(range(len(column)), len(paired)):
            yield fill(column, dict(zip(slots, paired)))

    best, best_score = None, None
    for L in placements(left, lp):
        pl = {s: i for i, s in enumerate(L)}
        for R in placements(right, rp):
            pr = {s: i for i, s in enumerate(R)}
            steps = sorted(pl[p["person"]] - pr[p["persona"]] for p in pairs)
            if len(set(steps)) != len(steps):
                continue
            marks = [lo] + steps + [hi]
            gaps = sorted(b - a for a, b in zip(marks, marks[1:]))
            score = (gaps, tuple(-ord(c) for c in "\0".join(L + R)))
            if best_score is None or score > best_score:
                best, best_score = (L, R), score
    if best is None:
        raise ContentError("the relations cannot be laid out so that only one related pair is "
                           "level at a time; add a person or a persona, or drop a relation")
    L, R = best
    by = {p["slug"]: p for p in people}
    for i, s in enumerate(L):
        by[s]["slot"] = i
    for i, s in enumerate(R):
        by[s]["slot"] = i
    for p in pairs:
        p["step"] = by[p["person"]]["slot"] - by[p["persona"]]["slot"]
    pairs.sort(key=lambda p: p["step"])
    return {"left": [by[s] for s in L], "right": [by[s] for s in R], "pairs": pairs,
            "lo": lo, "hi": hi}


def check_tags(names, by_id, path):
    for t in names:
        if t not in by_id:
            raise ContentError("%s: tag '%s' is not in content/vocabulary.txt" % (path, t))


def card_from(rec, kind, by_id):
    path = rec["path"]
    for layer in LAYERS:
        if layer not in rec["layers"]:
            raise ContentError("%s: missing == %s ==" % (path, layer))
    extra = set(rec["layers"]) - set(LAYERS)
    if extra:
        raise ContentError("%s: unknown layer(s) %s" % (path, ", ".join(sorted(extra))))
    words = sum(len(p.split()) for layer in LAYERS for p in rec["layers"][layer])
    if words > MAX_PROSE_WORDS:
        raise ContentError("%s: %d words of prose; the limit is %d" % (path, words, MAX_PROSE_WORDS))
    facets = {}
    for f in HEADER_FACETS:
        tid = "%s:%s" % (f, one(rec, f))
        check_tags([tid], by_id, path)
        facets[f] = one(rec, f)
    tags = [t.strip() for t in one(rec, "tags").split(",") if t.strip()]
    check_tags(tags, by_id, path)
    links = [dict(zip(("label", "href"), pipes(v, 2, path)))
             for v in rec["header"].get("link", [])]
    stats = [dict(zip(("label", "value"), pipes(v, 2, path)))
             for v in rec["header"].get("stat", [])]
    scores = [dict(zip(("label", "value", "asof"), pipes(v, 3, path)))
              for v in rec["header"].get("score", [])]
    return {
        "slug": slug_of(path), "kind": kind, "path": os.path.relpath(path, ROOT),
        "title": one(rec, "title"), "role": one(rec, "role"),
        "order": int(one(rec, "order", default="99")), "window": one(rec, "window"),
        "logo": one(rec, "logo", required=False), "facets": facets, "tags": tags,
        "links": links, "stats": stats, "scores": scores, "layers": rec["layers"],
        "words": words,
    }


def descriptor_from(rec, what, by_id):
    tags = [t.strip() for t in one(rec, "tags").split(",") if t.strip()]
    check_tags(tags, by_id, rec["path"])
    return {"id": one(rec, what), "kind": what, "title": one(rec, "title"), "tags": tags,
            "layers": rec["layers"], "path": os.path.relpath(rec["path"], ROOT)}


# ---- tags ------------------------------------------------------------------------------------

def term_pattern(term):
    """A whole-word, case-insensitive pattern for a vocabulary term; a plural s is allowed."""
    words = [re.escape(w) for w in re.split(r"[\s]+", term)]
    body = r"[\s-]+".join(words)
    return re.compile(r"(?<![\w-])" + body + r"s?(?![\w-])", re.I)


_PATTERNS = {}


def find_tags(text, vocab):
    """Return {tag id: hit count} for the plain tags whose terms occur in text."""
    hits = {}
    for t in vocab:
        if t["facet"] in HEADER_FACETS:
            continue
        for term in t["syn"] + [t["label"].replace("-", " ")]:
            pat = _PATTERNS.get(term) or _PATTERNS.setdefault(term, term_pattern(term))
            n = len(pat.findall(text))
            if n:
                hits[t["id"]] = hits.get(t["id"], 0) + n
    return hits


def weigh(parts, explicit, facet_tags, vocab):
    """parts: [(layer name, text)]. Explicit and header-facet tags weigh 1; a prose hit weighs its
    layer's weight, plus 0.1 for each further hit anywhere, capped at 1."""
    best, count = {}, {}
    for layer, text in parts:
        for tid, n in find_tags(text, vocab).items():
            best[tid] = max(best.get(tid, 0), LAYER_WEIGHT.get(layer, 0.4))
            count[tid] = count.get(tid, 0) + n
    w = {tid: min(1.0, best[tid] + 0.1 * (count[tid] - 1)) for tid in best}
    for tid in list(explicit) + list(facet_tags):
        w[tid] = 1.0
    return {k: round(v, 3) for k, v in sorted(w.items())}


def card_parts(c):
    parts = [("title", c["title"]), ("role", c["role"])]
    for layer in LAYERS:
        parts += [(layer, p) for p in c["layers"][layer]]
    return parts


def build_index(data):
    vocab = data["vocab"]
    items = []
    for c in data["cards"]:
        facet_tags = ["%s:%s" % (f, v) for f, v in c["facets"].items()]
        items.append({"slug": c["slug"], "kind": c["kind"], "title": c["title"],
                      "window": c["window"], "views": card_views(c),
                      "w": weigh(card_parts(c), c["tags"], facet_tags, vocab)})
    for d in data["views"] + data["windows"]:
        parts = [("title", d["title"])]
        for layer, paras in d["layers"].items():
            parts += [(layer if layer in LAYER_WEIGHT else "presentation", p) for p in paras]
        items.append({"slug": "%s:%s" % (d["kind"], d["id"]), "kind": d["kind"],
                      "title": d["title"], "w": weigh(parts, d["tags"], [], vocab)})
    return {"version": 1,
            "tags": [{"id": t["id"], "facet": t["facet"], "label": t["label"], "syn": t["syn"]}
                     for t in vocab],
            "items": items}


def card_views(c):
    views = ["prose", "baseball"]
    if c["scores"]:
        views.append("scoreboard")
    views.append("featured")
    return views


# ---- writing ---------------------------------------------------------------------------------

def e(s):
    return html.escape(s, quote=True)


INLINE_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")


def inline(text):
    """Escape prose, then turn [words](https://...) into links. Only site.txt's about uses it."""
    return INLINE_LINK.sub(lambda m: '<a href="%s">%s</a>' % (m.group(2), m.group(1)), e(text))


def render_links(links):
    out = []
    for l in links:
        if l["href"].startswith(("http://", "https://", "mailto:")):
            out.append('<li><a href="%s">%s</a></li>' % (e(l["href"]), e(l["label"])))
        else:
            out.append("<li>%s: %s</li>" % (e(l["label"]), e(l["href"])))
    return "<ul class=\"links\">%s</ul>" % "".join(out) if out else ""


def how_to(c):
    """How this card's navigation works, said once. Returns (with scripts, without scripts)."""
    views = card_views(c)
    names = {"baseball": "the back of the card", "scoreboard": "a scoreboard"}
    extra = [names[v] for v in views if v in names]
    js = "Activate the window for it grown large; click anywhere else on the card for this introduction."
    if extra:
        js += " The buttons above turn to %s." % " and ".join(extra)
    nojs = "Without scripts, everything this card holds is below: %s." % ", ".join(
        ["this introduction"] + extra)
    return js, nojs


def render_card(c, windows, level):
    h, hv = "h%d" % level, "h%d" % (level + 1)
    slug = c["slug"]
    f = c["facets"]
    w = windows[c["window"]]
    meta = " · ".join(e(x) for x in (f["do"], "bring " + f["bring"].replace("-", " "),
                                    f["whose"], f["state"]))
    logo = ('<img class="logo" src="logos/%s.svg" alt="" width="64" height="64">' % e(c["logo"])
            if c["logo"] else "")
    data_tags = " ".join(sorted(["%s:%s" % (k, v) for k, v in f.items()] + c["tags"]))
    views = []
    prose = "".join("<p>%s</p>" % e(p) for layer in ("summary", "function", "practice")
                    for p in c["layers"][layer])
    views.append(
        '<section class="view v-prose" data-view="prose" aria-labelledby="%s-prose-h">'
        '<%s id="%s-prose-h">%s</%s>%s<p class="how">%s <span class="js-only-inline">%s</span>'
        '<span class="nojs-only">%s</span></p>%s</section>'
        % (slug, hv, slug, VIEW_HEADINGS["prose"], hv, prose,
           e(" ".join(c["layers"]["presentation"])), e(how_to(c)[0]), e(how_to(c)[1]),
           render_links(c["links"])))
    stats = "".join("<div><dt>%s</dt><dd>%s</dd></div>" % (e(s["label"]), e(s["value"]))
                    for s in c["stats"])
    views.append(
        '<section class="view v-baseball" data-view="baseball" aria-labelledby="%s-baseball-h">'
        '<%s id="%s-baseball-h">%s</%s><dl class="stats">%s</dl></section>'
        % (slug, hv, slug, VIEW_HEADINGS["baseball"], hv, stats))
    if c["scores"]:
        rows = "".join('<tr><th scope="row">%s</th><td class="num">%s</td><td>%s</td></tr>'
                       % (e(s["label"]), e(s["value"]), e(s["asof"])) for s in c["scores"])
        views.append(
            '<section class="view v-scoreboard" data-view="scoreboard" aria-labelledby="%s-score-h">'
            '<%s id="%s-score-h">%s</%s><table class="scoreboard"><thead><tr><th scope="col">What'
            '</th><th scope="col">Count</th><th scope="col">As of</th></tr></thead><tbody>%s'
            '</tbody></table></section>' % (slug, hv, slug, VIEW_HEADINGS["scoreboard"], hv, rows))
    views.append(
        '<section class="view v-featured" data-view="featured" aria-labelledby="%s-feat-h">'
        '<%s id="%s-feat-h">%s</%s><div class="feature-slot"></div><p>%s</p></section>'
        % (slug, hv, slug, VIEW_HEADINGS["featured"], hv,
           e(" ".join(w["layers"].get("presentation", [""])))))
    return (
        '<article class="card k-%s" id="%s" data-slug="%s" data-window="%s" data-tags="%s" '
        'data-views="%s" aria-labelledby="%s-h">'
        '<div class="face">'
        '<%s id="%s-h" class="title">%s</%s>'
        '<p class="role">%s</p>'
        '<span class="window w-%s" data-window="%s" title="More about %s">'
        '<span class="still" aria-hidden="true"></span>%s</span>'
        '<p class="meta">%s</p>'
        '</div>'
        '<details class="more" id="%s-more"><summary>Read about %s</summary>'
        '<div class="views">%s</div></details>'
        '</article>'
        % (c["kind"], slug, slug, e(c["window"]), e(data_tags), " ".join(card_views(c)), slug,
           h, slug, e(c["title"]), h, e(c["role"]),
           e(c["window"]), e(c["window"]), e(c["title"]), logo, meta,
           slug, e(c["title"]), "".join(views)))


def render_legend(data):
    views = "".join("<div><dt>%s</dt><dd>%s</dd></div>"
                    % (e(v["title"]), e(" ".join(v["layers"].get("summary", []))))
                    for v in sorted(data["views"], key=lambda v: list(VIEW_ORDER + ("card",)).index(v["id"])
                                    if v["id"] in VIEW_ORDER + ("card",) else 99))
    wins = "".join("<div><dt>%s</dt><dd>%s</dd></div>"
                   % (e(w["title"]), e(" ".join(w["layers"].get("presentation", []))))
                   for w in data["windows"])
    return views, wins


def render_filters(data):
    """The quick filters in the display area: radio buttons that CSS alone can act on."""
    order = [t["label"] for t in data["vocab"] if t["facet"] == "do"]
    used = sorted({c["facets"]["do"] for c in data["cards"]}, key=order.index)
    out = ['<input type="radio" name="f" id="f-all" value="" checked>'
           '<label for="f-all">everything</label>']
    for d in used:
        out.append('<input type="radio" name="f" id="f-%s" value="do:%s">'
                   '<label for="f-%s">%s</label>' % (d, d, d, d))
    return "".join(out), used


def render_filter_css(used):
    rules = []
    for d in used:
        rules.append('body:has(#f-%s:checked) .card:not([data-tags~="do:%s"]) { display: none; }'
                     % (d, d))
    return "\n".join(rules)


def render_site_links(site):
    out = []
    for v in site["header"].get("link", []):
        parts = pipes(v, 2, site["path"])
        label, target = parts[0], parts[1]
        rel = ""
        if len(parts) > 2 and parts[2].startswith("rel="):
            rel = ' rel="%s"' % e(parts[2][4:])
        if target.startswith(("http://", "https://", "mailto:")):
            out.append('<li><a href="%s"%s>%s</a></li>' % (e(target), rel, e(label)))
        else:
            out.append("<li>%s: %s</li>" % (e(label), e(target)))
    mail = one(site, "contact")
    out.append('<li>Mail: <a href="mailto:%s">%s</a></li>' % (e(mail), e(mail)))
    return "".join(out)


def parallax_text(vocab, n, offset):
    labels = [t["label"] for t in vocab]
    seq = [labels[(i * 7 + offset) % len(labels)] for i in range(n)]
    return " ".join(e(s) for s in seq)


def json_for_html(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return s.replace("</", "<\\/").replace("<!--", "<\\!--")


def render(data, template, tone=True):
    site = data["site"]
    windows = {w["id"]: w for w in data["windows"]}
    about_cards = [c for c in data["cards"] if c["kind"] == "about"]
    inv = [c for c in data["cards"] if c["kind"] == "involvements" and c["slug"] != "inputloop"]
    shop = [c for c in data["cards"] if c["slug"] == "inputloop"]
    projects = [c for c in data["cards"] if c["kind"] == "projects"]
    concepts = [c for c in data["cards"] if c["kind"] == "concepts"]
    views_dl, windows_dl = render_legend(data)
    filters, used = render_filters(data)
    about = "".join("<p>%s</p>" % inline(p) for p in site["layers"]["about"])
    units = {n: u for s in data["sections"].values() for n, u in s["units"].items()}
    index = build_index(data)
    subs = {
        "TITLE": e(one(site, "title")),
        "DESCRIPTION": e(one(site, "description")),
        "TAGLINE": e(one(site, "tagline")),
        "PRONOUNCE": e(one(site, "pronounce")),
        "PRONOUNS": e(one(site, "pronouns")),
        "ABOUT": tone_about(units["about"], site, about) if tone else about,
        "FINDME": render_site_links(site),
        "BLOG": render_blog(data["snap"]),
        "CI": render_ci(data["snap"]),
        "ABOUTCARDS": "".join(render_card(c, windows, 4) for c in about_cards),
        "FOOTER": "".join('<p class="colophon">%s</p>' % inline(p) for p in site["layers"]["footer"]),
        "INVOLVEMENTS": "".join(render_card(c, windows, 3) for c in inv),
        "INPUTLOOP": "".join(render_card(c, windows, 3) for c in shop),
        "PROJECTS": "".join(render_card(c, windows, 4) for c in projects),
        "CONCEPTS": "".join(render_card(c, windows, 4) for c in concepts),
        "LEGEND_VIEWS": views_dl,
        "LEGEND_WINDOWS": windows_dl,
        "FILTERS": filters,
        "PX1": parallax_text(data["vocab"], 60, 0),
        "PX2": parallax_text(data["vocab"], 40, 3),
        "PX3": parallax_text(data["vocab"], 24, 5),
        "COUNT_CARDS": str(len(data["cards"])),
        "COUNT_TAGS": str(len(data["vocab"])),
        "INDEX_JSON": json_for_html(index),
        "CREDITS": render_credits(data.get("links")),
        "PRIVACY": render_privacy(HOME_JS, tone),
    }
    subs.update(render_tone(data, units, tone))
    return fill(template, subs), index, used


# ---- what this site remembers ----------------------------------------------------------------------
# Corwin, 2026-11-04: "Keep it, disclose it -- keep on-device remembering, and say so in each page's
# privacy note with a one-press 'forget my settings'." One row per key the scripts write: the key, the
# script that writes it, and what it is for. Each page's note lists the keys its own scripts write;
# tests/py/test_privacy.py reads the scripts and holds every note to exactly those. The tone pads' key
# sits inside the tone markers, since dpad.js is loaded only when the tone pads are built.
PRIVACY_KEYS = (
    ("aboutcorwin.motion", "site.js", 'whether you turned the <a href="#motion">Motion</a> button off or on.'),
    ("aboutcorwin.customize", "customize.js", 'your <a href="#custom-btn">Customize</a> settings: text size, line '
                                              'length and spacing, colours, and reduced motion.'),
    ("aboutcorwin.tone", "dpad.js", "where you left the tone pads (warmth, reading level, and the two tone choices "
                                    "in Customize)."),
)
# As corwin.cloud's note says it (privacy.html, fd53f0d).
PRIVACY_LOG = ("The web server keeps its usual request log: the address that asked, the time, and the page. "
               "That log is on the server, not in your browser, and forgetting here does not touch it.")


def render_privacy(scripts, tone):
    rows = []
    for key, script, what in PRIVACY_KEYS:
        row = "<dt><code>%s</code></dt><dd>%s</dd>" % (key, what)
        if script == "dpad.js":
            if tone:
                rows.append("<!--tone-->" + row + "<!--/tone-->")
        elif script in scripts:
            rows.append(row)
    return ('<h3 id="privacy" tabindex="-1">What this site remembers</h3>\n'
            '    <p>These pages collect nothing and set no cookies. With scripts on, they remember a few of your own '
            'choices, in this browser only; nothing is sent. Each is one key in your browser\'s local storage:</p>\n'
            '    <dl class="legend privacy-keys">%s</dl>\n'
            '    <p>%s</p>\n'
            '    <p class="forget js-only-block"><button type="button" id="forget">Forget my settings</button> '
            '<span id="forgot" role="status"></span></p>') % ("".join(rows), PRIVACY_LOG)


def fill(template, subs):
    def sub(m):
        key = m.group(1)
        if key not in subs:
            raise ContentError("template asks for {{%s}}, which the build does not know" % key)
        return subs[key]
    return re.sub(r"\{\{([A-Z0-9_]+)\}\}", sub, template)


def stitch_html(site):
    """The top matter (T2, chosen by Corwin 2026-11-01 18:03), with its address as a mail link."""
    text, mail = one(site, "stitch"), one(site, "contact")
    if not text.endswith(mail):
        raise ContentError("%s: the stitch line ends with the contact address" % site["path"])
    return e(text[:-len(mail)]) + '<a href="mailto:%s">%s</a>' % (e(mail), e(mail))


# ---- the tone d-pad ---------------------------------------------------------------------------------
# build_tone.py reads the texts and checks them; here they are written into the page. The base (the
# words already written) is live HTML; every other version is a <template>. Everything the tone work
# adds sits between <!--tone--> and <!--/tone-->, or is a data-unit, data-section or
# data-tone-section attribute, or the <div class="tone-text"> around the About, so a check can take
# it all away and find the page the build writes with tone=False (tests/py/test_tone.py).

TONE_SCOPES = (("about", "the About"), ("involvements", "Where I put my time"),
               ("portfolio", "the inputloop introductions"))
ARMS = (("up", "▲", "Harder words"), ("left", "◀", "Warmer"), ("reset", "", "As written"),
        ("right", "▶", "More formal"), ("down", "▼", "Simpler words"))


def tone_paras(u, cell, site):
    out = []
    for p in u["cells"][cell]:
        if p == build_tone.KEEP:
            p = u["base"][u["keep"] - 1]
        out.append("<p>%s</p>" % inline(p))
    return "".join(out)


def tone_templates(u, render_one):
    return "".join('<template data-unit="%s" data-cell="%s">%s</template>' % (u["name"], c, render_one(c))
                   for c in sorted(u["cells"]) if c != build_tone.cell_name(*build_tone.BASE))


def tone_about(u, site, live):
    return ('<div class="tone-text" data-unit="%s" data-section="about">%s</div><!--/tone-text-->'
            '<!--tone-->%s<!--/tone-->' % (u["name"], live, tone_templates(u, lambda c: tone_paras(u, c, site))))


def tone_lede(u, section, tone):
    live = e(" ".join(u["base"]))
    if not tone:
        return '<p class="lede">%s</p>' % live
    return ('<p class="lede" data-unit="%s" data-section="%s">%s</p><!--tone-->%s<!--/tone-->'
            % (u["name"], section, live, tone_templates(u, lambda c: e(" ".join(u["cells"][c])))))


def tone_pad(scope, name, cls):
    arms = "".join('<button type="button" class="%s dp-%s" data-move="%s" aria-label="%s: %s">%s</button>'
                   % ("dp-centre" if d == "reset" else "dp-arm", d, d, e(w), e(name),
                      '<span aria-hidden="true">%s</span>' % g if g else "")
                   for d, g, w in ARMS)
    return ('<div class="dpad %s" role="group" data-scope="%s" data-name="%s" aria-label="Tone of %s" '
            'aria-describedby="dp-%s-say">%s<span class="dp-glow" aria-hidden="true"></span></div>'
            '<p class="dp-say" id="dp-%s-say">plain, about grade 8</p>' % (cls, scope, e(name), e(name), scope, arms, scope))


TONE_ROWS = ('<fieldset class="c-tone"><legend>Warmth of the introductions:</legend>'
             '<label><input type="radio" name="tone-w" value="warm"><span class="box"></span>Warm</label>'
             '<label><input type="radio" name="tone-w" value="plain"><span class="box"></span>Plain (as written)</label>'
             '<label><input type="radio" name="tone-w" value="formal"><span class="box"></span>Formal</label></fieldset>\n'
             '    <fieldset class="c-tone"><legend>Reading level:</legend>'
             '<label><input type="radio" name="tone-g" value="4"><span class="box"></span>About grade 4</label>'
             '<label><input type="radio" name="tone-g" value="8"><span class="box"></span>About grade 8 (as written)</label>'
             '<label><input type="radio" name="tone-g" value="12"><span class="box"></span>About grade 12</label>'
             '<label><input type="radio" name="tone-g" value="16"><span class="box"></span>College</label></fieldset>\n'
             '    <fieldset class="c-tone"><legend>Tone pads (these rows save as you go):</legend>'
             '<label><input type="checkbox" name="tone-invert" value="1"><span class="box"></span>Up makes the words simpler (inverted)</label>'
             '<label><input type="checkbox" name="tone-lang" value="1" checked><span class="box"></span>Follow my browser\'s language '
             '(when its first language is not English and nothing is saved, start with simpler English, about grade 4)</label></fieldset>\n')

TONE_KEYS = ('<li><kbd>Ctrl</kbd>+arrows: the tone of the introduction in the section you are in (left warmer, '
             'right more formal, up harder words, down simpler); <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+arrows: the whole page; '
             '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Home</kbd>: everything as written. On a focused pad: the arrows, '
             '<kbd>h</kbd> <kbd>j</kbd> <kbd>k</kbd> <kbd>l</kbd>, <kbd>Home</kbd>, and <kbd>Ctrl</kbd>+<kbd>f</kbd>, '
             '<kbd>b</kbd>, <kbd>p</kbd> as in Emacs. On a Mac, where <kbd>Ctrl</kbd>+arrows switch Spaces, press '
             '<kbd>Tab</kbd> to reach a pad and use the keys there. Customize can turn up and down around.</li>')


def render_tone(data, units, tone):
    keys = ["PAD_" + s.upper() for s, _ in TONE_SCOPES] + ["TS_" + s.upper() for s, _ in TONE_SCOPES]
    if not tone:
        out = {k: "" for k in keys + ["TONE_DOCK", "TONE_ROWS", "TONE_KEYS", "TONE_TABLE", "TONE_SCRIPTS", "TONE_LANG"]}
    else:
        out = {}
        for s, name in TONE_SCOPES:
            out["PAD_" + s.upper()] = '<!--tone--><div class="dpad-wrap">%s</div><!--/tone-->' % tone_pad(s, name, "dp-sec")
            out["TS_" + s.upper()] = ' data-tone-section="%s"' % s
        out["TONE_DOCK"] = ('<!--tone--><div class="tone-dock" id="tone-dock" tabindex="-1">%s</div>'
                            '<p class="visually-hidden" id="tone-say" role="status" aria-live="polite"></p><!--/tone-->'
                            % tone_pad("page", "the whole page", "dp-global"))
        out["TONE_ROWS"] = "<!--tone-->" + TONE_ROWS + "    <!--/tone-->"
        # The line that says when the browser's language started the reader simpler (dpad.js fills it).
        out["TONE_LANG"] = '<!--tone--><p class="tone-lang" id="tone-lang" hidden></p><!--/tone-->'
        out["TONE_KEYS"] = "<!--tone-->" + TONE_KEYS + "<!--/tone-->"
        out["TONE_TABLE"] = ('<!--tone--><script type="application/json" id="tone-table">%s</script><!--/tone-->'
                             % json_for_html(build_tone.table(data["sections"])))
        out["TONE_SCRIPTS"] = '<!--tone--><script src="js/tone.model.js" defer></script><script src="js/dpad.js" defer></script><!--/tone-->'
    for name, sec in (("involvements", "involvements"), ("portfolio", "portfolio"), ("work", "portfolio"), ("ideas", "portfolio")):
        out["LEDE_" + name.upper()] = tone_lede(units[name], sec, tone)
    return out


def render_cast(data, template, index):
    """The second act (cast/index.html): the dramatis personae, in the home page's frame."""
    site = data["site"]
    subs = {"TITLE": e(one(site, "title")), "STITCH": stitch_html(site),
            "FOOTER": "".join('<p class="colophon">%s</p>' % inline(p) for p in site["layers"]["footer"]),
            "INDEX_JSON": json_for_html(index), "PRIVACY": render_privacy(CAST_JS, False)}
    subs.update(render_personae(data["personae"]))
    return fill(template, subs)


def render_personae(pp):
    """The two columns, in the computed order, and the pairings written out. The build writes
    each card's slot and each pairing's meeting step; personae.js only moves them by scroll."""
    def card(p):
        credit = '<p class="pp-credit">%s</p>' % e(p["credit"]) if p["credit"] else ""
        kind = "Person" if p["kind"] == "person" else "Persona"
        return ('<li class="pp-card pp-%s" id="pp-%s" data-slug="%s" data-slot="%d">'
                '<p class="pp-kind">%s</p><h4 class="pp-name">%s</h4><p class="pp-role">%s</p>%s</li>'
                % (p["kind"], e(p["slug"]), e(p["slug"]), p["slot"], kind, e(p["title"]), e(p["role"]), credit))
    by = {p["slug"]: p for p in pp["left"] + pp["right"]}
    pairs = "".join(
        '<li class="pp-pair" data-person="%s" data-persona="%s" data-step="%d">'
        '<strong class="pp-names">%s and %s</strong>: <span class="pp-words">%s</span> '
        '<a class="pp-src" href="%s">Source<span class="visually-hidden"> for %s and %s</span></a></li>'
        % (e(r["person"]), e(r["persona"]), r["step"], e(by[r["person"]]["title"]),
           e(by[r["persona"]]["title"]), e(r["words"]), e(r["href"]),
           e(by[r["person"]]["title"]), e(by[r["persona"]]["title"])) for r in pp["pairs"])
    pairs += "".join(
        '<li class="pp-with" data-people="%s %s"><strong class="pp-names">%s and %s</strong>: '
        '<span class="pp-words">%s</span>%s</li>'
        % (e(w["a"]), e(w["b"]), e(by[w["a"]]["title"]), e(by[w["b"]]["title"]), e(w["words"]),
           ' <a class="pp-src" href="%s">Source<span class="visually-hidden"> for %s and %s</span></a>'
           % (e(w["href"]), e(by[w["a"]]["title"]), e(by[w["b"]]["title"])) if w["href"] else
           ' <span class="pp-src">(Corwin\'s word)</span>')
        for w in pp.get("with", []))
    alone = [p["title"] for p in pp["left"] + pp["right"]
             if not any(p["slug"] in (r["person"], r["persona"]) for r in pp["pairs"])
             and not any(p["slug"] in (w["a"], w["b"]) for w in pp.get("with", []))]
    note = ('<p class="pp-alone">No persona is paired with %s yet, so %s no postcard.</p>'
            % (" or ".join(e(t) for t in alone), "these get" if len(alone) > 1 else "that card gets")
            if alone else "")
    return {
        "PP_LEFT": "".join(card(p) for p in pp["left"]),
        "PP_RIGHT": "".join(card(p) for p in pp["right"]),
        "PP_PAIRS": pairs,
        "PP_ALONE": note,
        "PP_LO": str(pp["lo"]),
        "PP_HI": str(pp["hi"]),
    }


def render_jslicense(template):
    rows = "".join(
        '<tr><td><a href="js/%s">%s</a></td>'
        '<td><a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU-GPL-3.0-or-later</a></td>'
        '<td><a href="js/%s">%s</a></td></tr>' % (n, n, n, n) for n in JS_FILES)
    return template.replace("{{ROWS}}", rows)


def versioned(text, out_dir):
    """Add ?v=<hash of the file> to every css/ and js/ URL, so a browser holding yesterday's script
    never runs it against today's page. The page is no-cache; these files are cached for a day."""
    import hashlib

    def tag(m):
        path = os.path.join(out_dir, m.group(2))
        with open(path, "rb") as f:
            v = hashlib.sha256(f.read()).hexdigest()[:10]
        return '%s="%s?v=%s"' % (m.group(1), m.group(2), v)
    def tag2(m):
        path = os.path.join(out_dir, m.group(3))
        with open(path, "rb") as f:
            v = hashlib.sha256(f.read()).hexdigest()[:10]
        return '%s="%s%s?v=%s"' % (m.group(1), m.group(2), m.group(3), v)
    text = re.sub(r'(src|href)="((?:css|js)/[\w.-]+)"', tag, text)
    return re.sub(r'(src|href)="(\.\./)((?:css|js)/[\w.-]+)"', tag2, text)


def check_js_labels(src_js):
    for n in JS_FILES:
        with open(os.path.join(src_js, n), encoding="utf-8") as f:
            text = f.read()
        first = text.lstrip().splitlines()[0]
        if not first.startswith("// @license " + GPL_MAGNET):
            raise ContentError("src/js/%s: first line must be the LibreJS @license label" % n)
        if not text.rstrip().endswith("// @license-end"):
            raise ContentError("src/js/%s: must end with // @license-end" % n)


def build(out_dir, content_dir=CONTENT, src_dir=SRC, tone=True):
    data = load(content_dir)
    check_js_labels(os.path.join(src_dir, "js"))
    with open(os.path.join(src_dir, "index.html"), encoding="utf-8") as f:
        page, index, used = render(data, f.read(), tone)
    with open(os.path.join(src_dir, "cast.html"), encoding="utf-8") as f:
        cast = render_cast(data, f.read(), index)
    with open(os.path.join(src_dir, "jslicense.html"), encoding="utf-8") as f:
        labels = render_jslicense(f.read())
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    for sub in ("css", "js", "logos", "fonts"):
        shutil.copytree(os.path.join(src_dir, sub), os.path.join(out_dir, sub))
    for name in (".htaccess", "robots.txt", "404.html", "favicon.svg"):
        shutil.copy2(os.path.join(src_dir, name), os.path.join(out_dir, name))
    with open(os.path.join(out_dir, "css", "filters.css"), "w", encoding="utf-8") as f:
        f.write("/* Written by build.py: one rule per quick filter. CC-BY-SA-4.0 / GPL-3.0-or-later */\n")
        f.write(render_filter_css(used) + "\n")
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(versioned(page, out_dir))
    os.makedirs(os.path.join(out_dir, CAST_DIR))
    with open(os.path.join(out_dir, CAST_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(versioned(cast, out_dir))
    with open(os.path.join(out_dir, "jslicense.html"), "w", encoding="utf-8") as f:
        f.write(versioned(labels, out_dir))
    with open(os.path.join(out_dir, "taxonomy.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=True)
    return data, index


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=os.path.join(ROOT, "public"))
    ap.add_argument("--check", action="store_true", help="validate content only")
    args = ap.parse_args(argv)
    try:
        if args.check:
            data = load()
            check_js_labels(os.path.join(SRC, "js"))
            print("content ok: %d cards, %d views, %d windows, %d tags"
                  % (len(data["cards"]), len(data["views"]), len(data["windows"]), len(data["vocab"])))
            return 0
        data, index = build(args.out)
    except ContentError as err:
        print("build.py: %s" % err, file=sys.stderr)
        return 1
    print("built %s: %d cards, %d tags" % (os.path.relpath(args.out, os.getcwd()),
                                            len(data["cards"]), len(index["tags"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
