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
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, "content")
SRC = os.path.join(ROOT, "src")

HEADER_FACETS = ("do", "bring", "whose", "state")
LAYERS = ("summary", "function", "practice", "presentation")
# How much a word found in each part of a card counts toward that card's tag weight.
LAYER_WEIGHT = {"title": 1.0, "role": 0.8, "summary": 0.8, "function": 0.6,
                "practice": 0.5, "presentation": 0.4}
CARD_KINDS = ("involvements", "projects", "concepts")
MAX_PROSE_WORDS = 500
# Repositories that GitHub reported public on 2026-10-29 (inputloop/.github-private catalog.tsv).
# A card may link to github.com/inputloop/<name> only for these; tests/py enforces it.
PUBLIC_REPOS = {".github", "fourSwordsFromThePast", "NextTime-Dev", "quantum3d5",
                "suit-crm-6-5-php-sec-backport", "vibrobeast", "vibrobeast-skills"}
JS_FILES = ("chamber.model.js", "taxonomy.js", "windows.js", "site.js")
GPL_MAGNET = "magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt"
VIEW_ORDER = ("prose", "baseball", "scoreboard", "featured")
VIEW_HEADINGS = {"prose": "Introduction", "baseball": "On the back",
                 "scoreboard": "Scoreboard", "featured": "In the window"}


class ContentError(Exception):
    pass


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
    return {"vocab": vocab, "site": site, "cards": cards, "views": views, "windows": windows}


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


def render(data, template):
    site = data["site"]
    windows = {w["id"]: w for w in data["windows"]}
    inv = [c for c in data["cards"] if c["kind"] == "involvements" and c["slug"] != "inputloop"]
    shop = [c for c in data["cards"] if c["slug"] == "inputloop"]
    projects = [c for c in data["cards"] if c["kind"] == "projects"]
    concepts = [c for c in data["cards"] if c["kind"] == "concepts"]
    views_dl, windows_dl = render_legend(data)
    filters, used = render_filters(data)
    about = "".join("<p>%s</p>" % inline(p) for p in site["layers"]["about"])
    index = build_index(data)
    subs = {
        "TITLE": e(one(site, "title")),
        "DESCRIPTION": e(one(site, "description")),
        "TAGLINE": e(one(site, "tagline")),
        "PRONOUNCE": e(one(site, "pronounce")),
        "PRONOUNS": e(one(site, "pronouns")),
        "ABOUT": about,
        "FINDME": render_site_links(site),
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
    }

    def sub(m):
        key = m.group(1)
        if key not in subs:
            raise ContentError("template asks for {{%s}}, which the build does not know" % key)
        return subs[key]

    out = re.sub(r"\{\{([A-Z0-9_]+)\}\}", sub, template)
    return out, index, used


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
    return re.sub(r'(src|href)="((?:css|js)/[\w.-]+)"', tag, text)


def check_js_labels(src_js):
    for n in JS_FILES:
        with open(os.path.join(src_js, n), encoding="utf-8") as f:
            text = f.read()
        first = text.lstrip().splitlines()[0]
        if not first.startswith("// @license " + GPL_MAGNET):
            raise ContentError("src/js/%s: first line must be the LibreJS @license label" % n)
        if not text.rstrip().endswith("// @license-end"):
            raise ContentError("src/js/%s: must end with // @license-end" % n)


def build(out_dir, content_dir=CONTENT, src_dir=SRC):
    data = load(content_dir)
    check_js_labels(os.path.join(src_dir, "js"))
    with open(os.path.join(src_dir, "index.html"), encoding="utf-8") as f:
        page, index, used = render(data, f.read())
    with open(os.path.join(src_dir, "jslicense.html"), encoding="utf-8") as f:
        labels = render_jslicense(f.read())
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    for sub in ("css", "js", "logos"):
        shutil.copytree(os.path.join(src_dir, sub), os.path.join(out_dir, sub))
    for name in (".htaccess", "robots.txt", "404.html", "favicon.svg"):
        shutil.copy2(os.path.join(src_dir, name), os.path.join(out_dir, name))
    with open(os.path.join(out_dir, "css", "filters.css"), "w", encoding="utf-8") as f:
        f.write("/* Written by build.py: one rule per quick filter. CC-BY-SA-4.0 / GPL-3.0-or-later */\n")
        f.write(render_filter_css(used) + "\n")
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(versioned(page, out_dir))
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
