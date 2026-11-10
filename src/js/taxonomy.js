// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// taxonomy.js: the prompt at the bottom of aboutcorwin.com, with no server behind it.
//
// No DOM here, so node can test it (tests/js). build.py gives us an index: every tag in the
// vocabulary (with its facet and synonyms) and every item (cards, views, windows) with a weight per
// tag, read from the item's layered prose. From that we make:
//
//   1. association: normalized pointwise mutual information between tags that share items;
//   2. a layout: the tags as a tension field (ChamberModel, Corwin's tension-field model), stepped until it
//      settles, so related tags sit near each other and the field's balance can be read;
//   3. a query: words matched to tags (exact, prefix, or near misspellings), spread one step along
//      the associations, balanced across facets so one facet cannot drown the rest, then nudged by
//      how close each item sits to the query in the field.
//
// Views and windows are items too, so "numbers for php" also asks for the scoreboard view, and
// "something that moves" leans toward cards whose windows move.
(function (root, factory) {
  'use strict';
  var Chamber = (typeof module !== 'undefined' && module.exports)
    ? require('./chamber.model.js') : root.ChamberModel;
  var T = factory(Chamber);
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.Taxonomy = T;
})(typeof self !== 'undefined' ? self : this, function (Chamber) {
  'use strict';

  var STOP = ' a an and are about any as at be by can do does for from give how i in is it its me ' +
    'my of on or please show some something that the this to what which with you your ';
  var CARD_KINDS = { about: 1, involvements: 1, projects: 1, concepts: 1 };
  var PRESENT = 0.4;       // a tag counts as present on an item at this weight or more
  var SPREAD = 0.5;        // how far activation travels along one association
  var NEAR = 0.25;         // how much closeness in the field adds to a score
  var KEEP = 0.3;          // show items scoring at least this share of the best
  var STEPS = 400;
  var SPREAD_SCORE = 0.3;   // what a tag reached only by spreading counts for, against 1 for a direct hit
  var HUB = 1.5;            // a card naming more than this times the median number of tags is a hub
  var PRESENTATION_ON_CARDS = 0.3;   // words about how to see a thing choose views, not subjects

  // A small seeded generator, so the field settles the same way every time and on every machine.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[‘’]/g, "'");
  }

  // Words, keeping inner hyphens and apostrophes ("end-of-life", "corwin's").
  function tokenize(text) {
    return norm(text).split(/[^a-z0-9'+.-]+/).map(function (w) {
      return w.replace(/^[-'.]+|[-'.]+$/g, '');
    }).filter(Boolean);
  }

  function isStop(w) { return STOP.indexOf(' ' + w + ' ') >= 0; }

  function trigrams(s) {
    var g = {}, p = '  ' + s + ' ';
    for (var i = 0; i < p.length - 2; i++) g[p.substr(i, 3)] = 1;
    return g;
  }

  // Dice coefficient over character trigrams: 1 for the same word, falling with each change.
  function dice(a, b) {
    var ga = trigrams(a), gb = trigrams(b), n = 0, na = 0, nb = 0, k;
    for (k in ga) { na++; if (gb[k]) n++; }
    for (k in gb) nb++;
    return na + nb ? 2 * n / (na + nb) : 0;
  }

  // Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps).
  function editDistance(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[m][n];
  }

  // How well one word or phrase of the prompt matches one vocabulary term, 0..1.
  function similarity(q, term) {
    if (q === term) return 1;
    if (q + 's' === term || term + 's' === q) return 0.95;
    if (q.length >= 3 && term.indexOf(' ') < 0 && term.indexOf(q) === 0) return 0.8;
    // Misspellings rarely get the first letter wrong, so loose matches must share it.
    if (q.length >= 4 && term.length >= 4 && q[0] === term[0]) {
      var ed = editDistance(q, term);
      if (ed === 1) return 0.75;
      if (ed === 2 && q.length >= 7) return 0.55;
      var dc = dice(q, term);
      if (dc >= 0.6) return 0.7 * dc;
    }
    return 0;
  }

  function present(w) { return w >= PRESENT; }

  // Which items teach association. Views and windows describe how to see a thing, not what it is,
  // so they stay out. So does a hub: a card that names far more tags than the rest (the shop's own
  // card mentions every field it works in) would tie unrelated tags together.
  function teachers(items) {
    var cards = items.filter(function (it) { return CARD_KINDS[it.kind] || !it.kind; });
    var counts = cards.map(function (it) { return Object.keys(it.w).filter(function (t) { return present(it.w[t]); }).length; })
      .sort(function (a, b) { return a - b; });
    var median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
    return cards.filter(function (it) {
      return Object.keys(it.w).filter(function (t) { return present(it.w[t]); }).length <= HUB * median;
    });
  }

  // Normalized PMI over items, for every pair of tags that share at least one item. In (0, 1].
  function associations(tags, items) {
    var n = items.length, df = {}, co = {}, i, j, a, b, key;
    items.forEach(function (it) {
      var ts = Object.keys(it.w).filter(function (t) { return present(it.w[t]); }).sort();
      ts.forEach(function (t) { df[t] = (df[t] || 0) + 1; });
      for (i = 0; i < ts.length; i++) for (j = i + 1; j < ts.length; j++) {
        key = ts[i] + '\u0000' + ts[j];
        co[key] = (co[key] || 0) + 1;
      }
    });
    var edges = [];
    Object.keys(co).sort().forEach(function (k) {
      var pair = k.split('\u0000'); a = pair[0]; b = pair[1];
      var pab = co[k] / n, pa = df[a] / n, pb = df[b] / n;
      var npmi = pab >= 1 ? 1 : Math.log(pab / (pa * pb)) / -Math.log(pab);
      // Round first, then keep: a pair at chance (npmi a hair above 0 from float error) is no edge.
      var w = Math.round(npmi * 1e6) / 1e6;
      if (w > 0) edges.push({ a: a, b: b, w: w });
    });
    return { df: df, edges: edges };
  }

  function build(index, opts) {
    opts = opts || {};
    var tags = index.tags, items = index.items;
    var byId = {};
    tags.forEach(function (t, i) { byId[t.id] = { tag: t, i: i }; });
    var assoc = associations(tags, teachers(items));
    // Tags only views, windows or hubs carry still get a place in the field.
    items.forEach(function (it) { Object.keys(it.w).forEach(function (t) { if (present(it.w[t]) && !assoc.df[t]) assoc.df[t] = 0; }); });
    var nb = {};
    assoc.edges.forEach(function (e) {
      (nb[e.a] = nb[e.a] || []).push({ t: e.b, w: e.w });
      (nb[e.b] = nb[e.b] || []).push({ t: e.a, w: e.w });
    });

    // The field: only tags that some item carries take part.
    var live = tags.filter(function (t) { return t.id in assoc.df; });
    var nodes = live.map(function (t) { return { id: t.id, label: t.label, facet: t.facet, df: assoc.df[t.id] }; });
    var at = {};
    nodes.forEach(function (n, i) { at[n.id] = i; });
    var health = { balance: 0, minDist: 0, steps: 0 };
    if (Chamber && opts.layout !== false) {
      Chamber.initPositions(nodes, 260, mulberry32(opts.seed || 4242));
      var raw = assoc.edges.filter(function (e) { return e.a in at && e.b in at; })
        .map(function (e) { return { a: at[e.a], b: at[e.b], w: e.w }; });
      var edges = Chamber.edgesFromCo(raw, 1);
      var steps = opts.steps || STEPS, h;
      for (var s = 0; s < steps; s++) h = Chamber.step(nodes, edges, { health: s === steps - 1 });
      health = { balance: h.balance, imbalance: h.imbalance, minDist: h.minDist, steps: steps };
      health.edges = edges;
    }
    var radius = 1;
    if (nodes.length) {
      radius = nodes.reduce(function (s, n) { return s + Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z); }, 0) / nodes.length || 1;
    }
    var pos = {};
    nodes.forEach(function (n) { pos[n.id] = n; });
    items.forEach(function (it) { it.c = centroid(it.w, pos); });
    return { tags: tags, byId: byId, items: items, edges: assoc.edges, df: assoc.df, nb: nb,
             nodes: nodes, pos: pos, health: health, radius: radius };
  }

  function centroid(weights, pos) {
    var x = 0, y = 0, z = 0, s = 0;
    Object.keys(weights).forEach(function (t) {
      var p = pos[t], w = weights[t];
      if (!p || p.x === undefined) return;
      x += p.x * w; y += p.y * w; z += p.z * w; s += w;
    });
    return s ? { x: x / s, y: y / s, z: z / s } : null;
  }

  // Which tags the prompt names, and how surely. Phrases of up to four words are tried first, so
  // "emacs on windows" and "how many" match the synonyms they spell.
  function match(model, text) {
    var words = tokenize(text), grams = [], hits = {}, i, n;
    for (n = 4; n >= 1; n--) for (i = 0; i + n <= words.length; i++) {
      var g = words.slice(i, i + n);
      if (n === 1 && isStop(g[0])) continue;
      grams.push(g.join(' '));
    }
    // A word that spells some term exactly means that term; it is not also a misspelling of
    // another ("numbers" is not "members"). Only words with no exact match are matched loosely.
    grams.forEach(function (g) {
      var scored = model.tags.map(function (t) {
        var terms = [t.label.replace(/-/g, ' '), t.label].concat(t.syn), best = 0;
        for (var k = 0; k < terms.length; k++) {
          var sc = similarity(g, terms[k]);
          if (g.indexOf(' ') >= 0 && sc < 1) sc = 0;   // phrases must match exactly
          if (sc > best) best = sc;
        }
        return { t: t, s: best };
      });
      var exact = scored.some(function (x) { return x.s >= 0.95; });
      scored.forEach(function (x) {
        if (!x.s || (exact && x.s < 0.95)) return;
        if (x.s > (hits[x.t.id] ? hits[x.t.id].s : 0)) hits[x.t.id] = { s: x.s, by: g };
      });
    });
    return { words: words, hits: hits };
  }

  function activate(model, hits) {
    var a0 = {}, a = {};
    Object.keys(hits).forEach(function (t) { a0[t] = hits[t].s; });
    Object.keys(a0).forEach(function (t) {
      a[t] = Math.max(a[t] || 0, a0[t]);
      (model.nb[t] || []).forEach(function (e) {
        a[e.t] = Math.min(1, (a[e.t] || 0) + SPREAD * e.w * a0[t]);
      });
    });
    return { direct: a0, spread: a };
  }

  function facetOf(model, t) { return model.byId[t] ? model.byId[t].tag.facet : '?'; }

  // Score one item: per facet, the item's weight times the activation, summed, then damped by the
  // number of tags active in that facet, so a query that lights up many tags in one facet cannot
  // drown the others. Direct hits count in full; spread activation counts for SPREAD_SCORE.
  function scoreItem(model, it, act, perFacet) {
    var byFacet = {}, why = [];
    Object.keys(act.spread).forEach(function (t) {
      var w = it.w[t];
      if (!w) return;
      var d = act.direct[t] || 0, s = act.spread[t];
      var f = facetOf(model, t);
      var v = w * Math.max(d, SPREAD_SCORE * s) * (f === 'presentation' && CARD_KINDS[it.kind] ? PRESENTATION_ON_CARDS : 1);
      byFacet[f] = (byFacet[f] || 0) + v;
      if (v > 0.05) why.push({ t: t, v: v, direct: d > 0 });
    });
    var score = 0;
    Object.keys(byFacet).forEach(function (f) { score += byFacet[f] / Math.sqrt(perFacet[f] || 1); });
    why.sort(function (x, y) { return y.v - x.v || (x.t < y.t ? -1 : 1); });
    return { score: score, why: why };
  }

  function distance(p, q) {
    var dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function label(model, t) { return model.byId[t] ? model.byId[t].tag.label : t; }

  // Names are not tags, but people type them: "vibrobeast", "quantum", "nexttime". A word that
  // matches a card's title or slug (allowing a typo) names that card outright.
  function nameWords(it) {
    var words = tokenize(it.title.replace(/([a-z])([A-Z])/g, '$1 $2') + ' ' + it.slug.replace(/-/g, ' '));
    words.push(norm(it.title).replace(/[^a-z0-9]/g, ''), norm(it.slug).replace(/[^a-z0-9]/g, ''));
    return words.filter(function (w) { return w.length >= 4 && !isStop(w); });
  }
  // A prefix names a card only when it is most of the name: "quantum" names quantum3d5, but "back"
  // does not name backport and "read" does not name two readers.
  function nameSimilarity(w, n) {
    var s = similarity(w, n);
    if (s === 0.8 && w.length < 0.6 * n.length) return 0;
    return s;
  }
  function nameHits(model, words) {
    var hits = {};
    model.items.forEach(function (it) {
      if (!CARD_KINDS[it.kind]) return;
      var names = it._names || (it._names = nameWords(it)), best = 0;
      words.forEach(function (w) {
        if (w.length < 4 || isStop(w)) return;
        names.forEach(function (n) { var s = nameSimilarity(w, n); if (s >= 0.7 && s > best) best = s; });
      });
      if (best) hits[it.slug] = best;
    });
    return hits;
  }

  function query(model, text) {
    var m = match(model, text);
    var named = nameHits(model, m.words);
    var out = { text: text, words: m.words, matched: [], named: [], items: [], view: null, window: null, empty: false };
    if (!Object.keys(m.hits).length && !Object.keys(named).length) { out.empty = !m.words.length; return out; }
    out.matched = Object.keys(m.hits).sort(function (a, b) { return m.hits[b].s - m.hits[a].s || (a < b ? -1 : 1); })
      .map(function (t) { return { tag: t, label: label(model, t), by: m.hits[t].by, s: m.hits[t].s }; });
    var act = activate(model, m.hits);
    var perFacet = {};
    Object.keys(act.spread).forEach(function (t) {
      var f = facetOf(model, t); perFacet[f] = (perFacet[f] || 0) + 1;
    });

    // The query's place in the field: the activation-weighted centroid of its tags.
    var qc = centroid(act.spread, model.pos);

    var views = [], windows = [], cards = [];
    model.items.forEach(function (it) {
      var r = scoreItem(model, it, act, perFacet);
      if (it.kind === 'view' || it.kind === 'window') {
        var direct = r.why.some(function (x) { return x.direct; });
        if (direct && r.score > 0) (it.kind === 'view' ? views : windows).push({ id: it.slug.split(':')[1], score: r.score });
        return;
      }
      if (!CARD_KINDS[it.kind]) return;
      var near = 0;
      if (qc && it.c && r.score > 0) near = NEAR / (1 + distance(qc, it.c) / model.radius);
      var why = r.why.slice(0, 3).map(function (x) { return label(model, x.t); });
      var score = r.score > 0 ? r.score + near : 0;
      if (named[it.slug]) { score += 2 * named[it.slug]; why.unshift('name'); out.named.push(it.title); }
      // A card is shown only for something it says itself, or its name; spreading only ranks.
      var direct = named[it.slug] || r.why.some(function (x) { return x.direct && facetOf(model, x.t) !== 'presentation'; });
      if (!direct) score = 0;
      cards.push({ slug: it.slug, title: it.title, window: it.window, views: it.views,
                   score: score, base: r.score, near: near, why: why.slice(0, 3) });
    });
    views.sort(function (a, b) { return b.score - a.score || (a.id < b.id ? -1 : 1); });
    windows.sort(function (a, b) { return b.score - a.score || (a.id < b.id ? -1 : 1); });
    if (views.length && views[0].score >= 0.35 && views[0].id !== 'card') out.view = views[0].id;
    if (windows.length && windows[0].score >= 0.35) {
      out.window = windows[0].id;
      cards.forEach(function (c) { if (c.window === out.window && c.score > 0) c.score += 0.3 * windows[0].score; });
    }
    cards.sort(function (a, b) { return b.score - a.score || (a.slug < b.slug ? -1 : 1); });
    var top = cards.length ? cards[0].score : 0;
    // A query that only asks for a view ("numbers") keeps every card that offers that view.
    var onlyPresentation = out.matched.length && !out.named.length && out.matched.every(function (x) { return facetOf(model, x.tag) === 'presentation'; });
    if (onlyPresentation && out.view) {
      out.items = cards.filter(function (c) { return c.views.indexOf(out.view) >= 0; });
      out.items.forEach(function (c) { c.why = ['has ' + VIEW_WORDS[out.view]]; });
      out.items.sort(function (a, b) { return b.score - a.score || (a.slug < b.slug ? -1 : 1); });
    } else {
      out.items = cards.filter(function (c) { return c.score > 0.05 && c.score >= KEEP * top; });
    }
    return out;
  }

  var VIEW_WORDS = { prose: 'the introduction', baseball: 'the back of the card', scoreboard: 'the scoreboard',
                     featured: 'the window, grown large' };

  // One line for the echo area: what matched and why. Plain words.
  function describe(res, total) {
    if (res.empty) return 'Showing all ' + total + ' cards.';
    if (!res.matched.length && !(res.named && res.named.length)) return 'No tag matches “' + res.text + '”. Showing all ' + total + ' cards.';
    var seen = {};
    var tags = (res.named || []).concat(res.matched.slice(0, 4).map(function (x) {
      return x.by === x.label || x.by === x.label.replace(/-/g, ' ') ? x.label : x.by + '→' + x.label;
    })).filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }).join(', ');
    var s = res.items.length + ' of ' + total + ' cards for ' + tags + '.';
    if (res.view) s += ' Windows open to ' + VIEW_WORDS[res.view] + '.';
    return s;
  }

  return { tokenize: tokenize, dice: dice, editDistance: editDistance, similarity: similarity,
           associations: associations, build: build, match: match, query: query, describe: describe,
           mulberry32: mulberry32, centroid: centroid, teachers: teachers, VIEW_WORDS: VIEW_WORDS };
});
// @license-end
