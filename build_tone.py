# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
"""The tone d-pad's texts: their store, their meters and their checks (tests/spec/TONE.txt).

Each introductory text ("unit") has a base, the words already on the page, which is the cell
"plain 8", and up to eleven variants along two lines: warmth (warm, plain, formal) and reading
(grade 4, grade 8, grade 12, college, written 16). The variants live in content/sections/<id>.txt
as `== UNIT / WARMTH STEP ==` layers beside the base. build.py renders the base as live HTML and
every other cell into a <template>; src/js/dpad.js swaps them.

The Flesch-Kincaid counting below is copied from the voice palace's readability/fk.py (c4
d/voice-palace, Corwin's, GPL-3.0-or-later); see PROVENANCE.md. Its second reader, Coleman-Liau,
is in JavaScript (tests/js/tone.test.mjs) and shares no method with it.
"""
import os
import re

WARMTH = ("warm", "plain", "formal")
STEPS = (4, 8, 12, 16)
BASE = ("plain", 8)
STEP_NAMES = {4: "grade 4", 8: "grade 8", 12: "grade 12", 16: "college"}
KEEP = "[[keep]]"
# The About only: the band each step sits in on both meters (TONE.txt, 3).
BANDS = {4: (None, 5.5), 8: (5.0, 9.5), 12: (9.0, 13.5), 16: (12.5, None)}
CELL_HEAD = re.compile(r"^([\w-]+)(?:\s*/\s*(warm|plain|formal)\s+(4|8|12|16))?$")


class ToneError(Exception):
    pass


def cell_name(w, g):
    return "%s-%d" % (w, g)


# ---- the store ---------------------------------------------------------------------------------

def load_sections(content_dir, site_about):
    """Read content/sections/*.txt. Returns {section id: {"units": {unit: {...}}}} in file order.

    A file's header: `section: ID`, then for each unit `unit: NAME` (its base is the file's own
    `== NAME ==` layer) or `unit: NAME | site.txt` (its base is site.txt's layer of that name),
    `keep: NAME | N` (paragraph N of the base, from 1, is the same in every cell), and any number of
    `fact: NAME | words` and `extra: NAME | words`."""
    d = os.path.join(content_dir, "sections")
    out = {}
    if not os.path.isdir(d):
        return out
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".txt"):
            continue
        path = os.path.join(d, fn)
        header, layers = parse(path)
        sid = only(header, "section", path)
        if sid != fn[:-4]:
            raise ToneError("%s: section %r must match the file name" % (path, sid))
        units = {}
        for v in header.get("unit", []):
            name, _, src = [x.strip() for x in v.partition("|")]
            if src not in ("", "site.txt"):
                raise ToneError("%s: unit %s: a base comes from this file or from site.txt" % (path, name))
            if src == "site.txt":
                if name not in site_about:
                    raise ToneError("%s: site.txt has no == %s ==" % (path, name))
                base = list(site_about[name])
            else:
                if name not in layers:
                    raise ToneError("%s: unit %s has no == %s == base" % (path, name, name))
                base = layers.pop(name)
            units[name] = {"name": name, "base": base, "facts": [], "extras": [], "keep": None,
                           "cells": {}, "path": path, "from_site": src == "site.txt"}
        for key in ("fact", "extra", "keep"):
            for v in header.get(key, []):
                name, _, words = [x.strip() for x in v.partition("|")]
                if name not in units:
                    raise ToneError("%s: %s names unit %r, which this file does not declare" % (path, key, name))
                if key == "keep":
                    n = int(words)
                    if not 1 <= n <= len(units[name]["base"]):
                        raise ToneError("%s: keep %d is not a paragraph of %s" % (path, n, name))
                    units[name]["keep"] = n
                else:
                    units[name][key + "s"].append(words)
        for head, paras in layers.items():
            m = CELL_HEAD.match(head)
            if not m or not m.group(2):
                raise ToneError("%s: unknown layer == %s ==; a variant is == UNIT / WARMTH STEP ==" % (path, head))
            name, w, g = m.group(1), m.group(2), int(m.group(3))
            if name not in units:
                raise ToneError("%s: == %s == names unit %r, which this file does not declare" % (path, head, name))
            if (w, g) == BASE:
                raise ToneError("%s: == %s == is the base cell; the base is the text already written" % (path, head))
            units[name]["cells"][cell_name(w, g)] = paras
        for u in units.values():
            u["cells"][cell_name(*BASE)] = base_with_keep(u)
            for c, paras in u["cells"].items():
                if u["keep"] and sum(1 for p in paras if p == KEEP) != 1:
                    raise ToneError("%s: %s %s must hold [[keep]] exactly once" % (path, u["name"], c))
        out[sid] = {"id": sid, "units": units, "path": path}
    return out


def base_with_keep(u):
    if not u["keep"]:
        return list(u["base"])
    b = list(u["base"])
    b[u["keep"] - 1] = KEEP
    return b


def parse(path):
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    header, layers, layer, in_header = {}, {}, None, True
    for n, line in enumerate(lines, 1):
        m = re.match(r"^==\s*(.+?)\s*==\s*$", line)
        if m:
            in_header, layer = False, re.sub(r"\s+", " ", m.group(1))
            if layer in layers:
                raise ToneError("%s:%d: layer %s appears twice" % (path, n, layer))
            layers[layer] = []
            continue
        if in_header:
            if not line.strip():
                in_header = False
                continue
            m = re.match(r"^([\w-]+):\s?(.*)$", line)
            if not m:
                raise ToneError("%s:%d: header line is not 'key: value'" % (path, n))
            header.setdefault(m.group(1), []).append(m.group(2).strip())
        elif layer:
            layers[layer].append(line)
        elif line.strip():
            raise ToneError("%s:%d: prose before the first == layer ==" % (path, n))
    return header, {k: [p.strip() for p in re.split(r"\n\s*\n", "\n".join(v)) if p.strip()]
                    for k, v in layers.items()}


def only(header, key, path):
    v = header.get(key, [])
    if len(v) != 1:
        raise ToneError("%s: needs exactly one '%s:'" % (path, key))
    return v[0]


# ---- which cell shows (TONE.txt, 7) ----------------------------------------------------------------

def toward(seq, x, target):
    i, j = seq.index(x), seq.index(target)
    return x if i == j else seq[i + (1 if j > i else -1)]


def resolve(have, w, g):
    """The cell shown for (w, g) when only the cells in `have` are written."""
    while True:
        if cell_name(w, g) in have:
            return cell_name(w, g)
        w2 = toward(WARMTH, w, BASE[0])
        if cell_name(w2, g) in have:
            return cell_name(w2, g)
        if g == BASE[1]:
            return cell_name(*BASE)
        g = toward(STEPS, g, BASE[1])


def table(sections):
    """{unit: {cell asked: cell shown}} for every unit and every cell."""
    out = {}
    for s in sections.values():
        for name, u in s["units"].items():
            have = set(u["cells"])
            out[name] = {cell_name(w, g): resolve(have, w, g) for w in WARMTH for g in STEPS}
    return out


# ---- the browser's language (TONE.txt, 8) ----------------------------------------------------------

def lang_start(langs):
    """The step a reader with no saved choice starts at, given the browser's languages in order:
    None to start as written, or the reading step one simpler than the base (4)."""
    first = (langs[0] if langs else "") or ""
    head = first.strip().replace("_", "-").split("-", 1)[0].lower()
    if not (2 <= len(head) <= 3 and all("a" <= ch <= "z" for ch in head)) or head in ("und", "en"):
        return None
    return STEPS[STEPS.index(BASE[1]) - 1]


# ---- the meters (TONE.txt, 2 to 4) --------------------------------------------------------------

LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+|mailto:[^)\s]+)\)")
TOKEN = re.compile(r"[a-z]+(?:'[a-z]+)*|[.!?]+")


def plain_text(paras):
    return "\n".join(LINK.sub(r"\1", p.replace("’", "'")) for p in paras if p != KEEP)


def syllables(word):
    w = word.replace("'", "")
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith("le") and n > 1:
        n -= 1
    return max(n, 1)


def count(paras):
    words = sents = syl = 0
    toks = []
    for line in plain_text(paras).lower().split("\n"):
        pending = 0
        for t in TOKEN.finditer(line):
            t = t.group(0)
            if t[0] in ".!?":
                if pending:
                    sents += 1
                    pending = 0
            else:
                words += 1
                syl += syllables(t)
                pending += 1
                toks.append(t)
        if pending:
            sents += 1
    return words, sents, syl, toks


def fk(paras):
    w, s, y, _ = count(paras)
    if not w or not s:
        return 0.0
    return round(0.39 * w / s + 11.8 * y / w - 15.59, 2)


CONTRACTED = ("n't", "'re", "'ve", "'ll", "'m", "'d")
CONTRACT_WORDS = {"it's", "that's", "there's", "here's", "what's", "let's", "who's"}
YOU = {"you", "your", "yours", "you're", "you've", "you'll"}
SELF = {"i", "me", "my", "mine", "we", "us", "our", "ours"}
FEEL = {"love", "like", "likes", "fun", "glad", "happy", "enjoy", "hope", "joy", "friend", "friends",
        "friendly", "lucky", "really", "honestly", "okay", "hey", "yes"}
NOMINAL = re.compile(r"^[a-z']{3,}(tion|tions|ment|ments|ness|ity|ities|ance|ence)$")


def warmth(paras):
    text = plain_text(paras)
    _, _, _, toks = count(paras)
    if not toks:
        return 0.0
    pts = 0
    for t in toks:
        if t.endswith(CONTRACTED) or t in CONTRACT_WORDS:
            pts += 3
        if t in YOU:
            pts += 2
        if t in SELF:
            pts += 1
        if t in FEEL:
            pts += 2
        if len(t) >= 7 and NOMINAL.match(t):
            pts -= 2
    pts += 3 * text.count("?") + 2 * text.count("!")
    return round(pts * 100.0 / len(toks), 1)


# ---- Corwin's hand edits to the About, kept as rules (content/ABOUT-EDITS.md) ---------------------

EDITS_FILE = "ABOUT-EDITS.md"
EDIT_KINDS = ("has", "match", "never")


def edit_rules(content_dir):
    """[(heading, kind, text)] from content/ABOUT-EDITS.md; [] when there is no such file."""
    path = os.path.join(content_dir, EDITS_FILE)
    if not os.path.isfile(path):
        return []
    out, heading = [], ""
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.rstrip("\n")
            if line.startswith("## "):
                heading = line[3:].strip()
            m = re.match(r"^rule:\s*(\w+)\s*\|\s(.+)$", line)
            if line.startswith("rule:") and (not m or m.group(1) not in EDIT_KINDS):
                raise ToneError("%s:%d: a rule is 'rule: has|match|never | TEXT'" % (path, n))
            if m:
                out.append((heading, m.group(1), m.group(2).rstrip()))
    return out


def edit_problems(rules, cells, where):
    out = []
    for c, paras in sorted(cells.items()):
        text = "\n".join(paras)
        for heading, kind, words in rules:
            if kind == "has" and words not in text:
                out.append("%s %s undoes Corwin's edit %r: it lacks %r" % (where, c, heading, words))
            elif kind == "match" and not re.search(words, text, re.I):
                out.append("%s %s undoes Corwin's edit %r: nothing matches %r" % (where, c, heading, words))
            elif kind == "never" and re.search(words, text, re.I):
                out.append("%s %s undoes Corwin's edit %r: it matches %r" % (where, c, heading, words))
    return out


# ---- the checks (TONE.txt, 3 to 6) ---------------------------------------------------------------

CAP = re.compile(r"(?<![\w-])[A-Z][\w.'’-]*")
THIRD = re.compile(r"\b(he|him|his)\b", re.I)


def added(u, paras):
    """What a cell says that its base and extras do not: link targets, digits, capitalised words
    that do not start a sentence."""
    base = "\n".join(u["base"]) + "\n" + "\n".join(u["extras"])
    out = []
    text = "\n".join(p for p in paras if p != KEEP)
    for m in LINK.finditer(text):
        if m.group(2) not in base:
            out.append(m.group(2))
    bare = LINK.sub(r"\1", text)
    bare = re.sub(r"https?://\S+", "", bare)
    for d in re.findall(r"\d+", bare):
        if not re.search(r"(?<!\d)%s(?!\d)" % d, LINK.sub(r"\1", base)):
            out.append(d)
    for para in bare.split("\n"):
        for m in CAP.finditer(para):
            word = m.group(0).rstrip(".'’")
            before = para[:m.start()].rstrip()
            start = not before or before[-1] in ".!?:“\"(" or before.endswith("/")
            if start or word == "I" or word.startswith("I'") or word.startswith("I’"):
                continue
            if not re.search(r"(?<![\w])%s(?![\w])" % re.escape(word), base):
                out.append(word)
    return out


def problems(sections):
    """Every rule TONE.txt states, as a list of plain-words faults (empty when all hold)."""
    out = []
    for s in sections.values():
        for name, u in s["units"].items():
            where = "%s %s" % (os.path.basename(u["path"]), name)
            for c, paras in sorted(u["cells"].items()):
                text = "\n".join(paras)
                for f in u["facts"]:
                    if f not in text:
                        out.append("%s %s drops the fact %r" % (where, c, f))
                for a in added(u, paras):
                    out.append("%s %s adds %r (not in the base or an extra)" % (where, c, a))
                bare = re.sub(r"“[^”]*”", "", text)
                if THIRD.search(bare):
                    out.append("%s %s says he, him or his outside quotation marks" % (where, c))
                if not c.startswith("formal") and "Corwin Brust" in bare:
                    out.append("%s %s names Corwin Brust in the third person; only formal cells may" % (where, c))
            cells = u["cells"]
            if name == "about":
                rules = edit_rules(os.path.dirname(os.path.dirname(u["path"])))
                out.extend(edit_problems(rules, cells, where))
            for w in WARMTH:
                row = [cell_name(w, g) for g in STEPS]
                if all(r in cells for r in row):
                    grades = [fk(cells[r]) for r in row]
                    if any(b <= a for a, b in zip(grades, grades[1:])):
                        out.append("%s %s: Flesch-Kincaid does not rise across the steps %s" % (where, w, grades))
                    if name == "about":
                        for g, v in zip(STEPS, grades):
                            lo, hi = BANDS[g]
                            if (lo is not None and v < lo) or (hi is not None and v >= hi):
                                out.append("%s %s %d: Flesch-Kincaid %.2f is outside its band" % (where, w, g, v))
            for g in STEPS:
                col = [cell_name(w, g) for w in WARMTH]
                if all(c in cells for c in col):
                    ws = [warmth(cells[c]) for c in col]
                    if not (ws[0] >= ws[1] + 1.0 and ws[1] >= ws[2] + 1.0):
                        out.append("%s step %d: warmth does not fall warm > plain > formal %s" % (where, g, ws))
    return out


def measurements(sections):
    rows = []
    for s in sections.values():
        for name, u in s["units"].items():
            for w in WARMTH:
                for g in STEPS:
                    c = cell_name(w, g)
                    if c in u["cells"]:
                        n = count(u["cells"][c])[0]
                        rows.append((name, c, n, fk(u["cells"][c]), warmth(u["cells"][c])))
    return rows


if __name__ == "__main__":
    import sys
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    import build
    site = build.parse_file(os.path.join(build.CONTENT, "site.txt"))
    secs = load_sections(build.CONTENT, site["layers"])
    for r in measurements(secs):
        print("%-12s %-10s %4d words  FK %6.2f  warmth %6.1f" % r)
    p = problems(secs)
    print("\n".join(p) or "all tone rules hold")
    sys.exit(1 if p else 0)
