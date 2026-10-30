// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// chamber.model.js: a tension-field model. Points held in balanced tension; "the middle" is the
// state where every tension resolves at once, and residual force is a health reading.
// No DOM here: one model, and any surface can render it. This site uses it to lay out its tags.
// The code is Corwin Brust's, unchanged; only this header comment was shortened for publication.
//
// Free software: GPLv3-or-later. Copyright 2026 Corwin Brust.
(function (root) {
  'use strict';

  // Normalize chosen numeric keys to [0,1] and stash a feature vector on each node.
  function normalize(nodes, keys) {
    var stats = {};
    keys.forEach(function (k) {
      var vals = nodes.map(function (n) { return +n[k] || 0; });
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      stats[k] = { min: min, span: (max - min) || 1 };
    });
    nodes.forEach(function (n) {
      n._f = keys.map(function (k) { return ((+n[k] || 0) - stats[k].min) / stats[k].span; });
    });
    return nodes;
  }

  function featDist(a, b) {
    var s = 0, f = a._f, g = b._f;
    for (var i = 0; i < f.length; i++) { var d = f[i] - g[i]; s += d * d; }
    return Math.sqrt(s);
  }

  // Tension graph = k nearest neighbours in feature space. "Tension" links terms whose
  // structural role in the canon is similar; rest length grows with dissimilarity.
  function buildEdges(nodes, k) {
    k = k || 3;
    var edges = [], seen = {};
    for (var i = 0; i < nodes.length; i++) {
      var ds = [];
      for (var j = 0; j < nodes.length; j++) if (j !== i) ds.push({ j: j, d: featDist(nodes[i], nodes[j]) });
      ds.sort(function (a, b) { return a.d - b.d; });
      for (var m = 0; m < Math.min(k, ds.length); m++) {
        var j2 = ds[m].j, key = i < j2 ? i + '-' + j2 : j2 + '-' + i;
        if (seen[key]) continue; seen[key] = 1;
        edges.push({ a: i, b: j2, sim: 1 - ds[m].d, rest: 55 + 150 * ds[m].d });
      }
    }
    return edges;
  }

  // Random point in a ball, zero velocity, unpinned.
  function initPositions(nodes, radius, rnd) {
    radius = radius || 260; rnd = rnd || Math.random;
    nodes.forEach(function (n) {
      var r = radius * Math.cbrt(rnd());
      var theta = Math.acos(2 * rnd() - 1), phi = 2 * Math.PI * rnd();
      n.x = r * Math.sin(theta) * Math.cos(phi);
      n.y = r * Math.sin(theta) * Math.sin(phi);
      n.z = r * Math.cos(theta);
      n.vx = n.vy = n.vz = 0; n.pinned = false;
    });
    return nodes;
  }

  // One integration step. Returns a health object.
  //   balance  -> 1 as the whole field reaches equilibrium ("the middle")
  //   imbalance-> coefficient of variation of per-node force (some settled, some not)
  //   minDist  -> nearest pair ("a point touching" before the middle is reached)
  function step(nodes, edges, opts) {
    opts = opts || {};
    var kRep = opts.repulse == null ? 1600 : opts.repulse;
    var kSpring = opts.spring == null ? 0.02 : opts.spring;
    var kCenter = opts.center == null ? 0.0022 : opts.center;
    var damp = opts.damp == null ? 0.85 : opts.damp;
    var i, j, a, b, dx, dy, dz, d2, d, f, ux, uy, uz, n;

    for (i = 0; i < nodes.length; i++) { nodes[i].fx = 0; nodes[i].fy = 0; nodes[i].fz = 0; }

    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        a = nodes[i]; b = nodes[j];
        dx = a.x - b.x; dy = a.y - b.y; dz = a.z - b.z;
        d2 = dx * dx + dy * dy + dz * dz + 0.01; d = Math.sqrt(d2);
        f = kRep / d2; ux = dx / d; uy = dy / d; uz = dz / d;
        a.fx += f * ux; a.fy += f * uy; a.fz += f * uz;
        b.fx -= f * ux; b.fy -= f * uy; b.fz -= f * uz;
      }
    }
    for (i = 0; i < edges.length; i++) {
      a = nodes[edges[i].a]; b = nodes[edges[i].b];
      dx = b.x - a.x; dy = b.y - a.y; dz = b.z - a.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      f = kSpring * (d - edges[i].rest); ux = dx / d; uy = dy / d; uz = dz / d;
      a.fx += f * ux; a.fy += f * uy; a.fz += f * uz;
      b.fx -= f * ux; b.fy -= f * uy; b.fz -= f * uz;
    }

    var mags = [], residual = 0;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      n.fx -= kCenter * n.x; n.fy -= kCenter * n.y; n.fz -= kCenter * n.z;
      var mag = Math.sqrt(n.fx * n.fx + n.fy * n.fy + n.fz * n.fz);
      mags.push(mag); residual += mag;
      if (n.pinned) { n.vx = n.vy = n.vz = 0; continue; }
      n.vx = (n.vx + n.fx) * damp; n.vy = (n.vy + n.fy) * damp; n.vz = (n.vz + n.fz) * damp;
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
    }

    var mean = residual / Math.max(1, nodes.length), varr = 0;
    // opts.health === false: the caller wants the motion only (Spell Ball steps every frame and never
    // reads the health); skip the second all-pairs pass, about half the cost of a step.
    if (opts.health === false) return { residual: residual, perNode: mean, balance: 1 / (1 + mean) };
    for (i = 0; i < mags.length; i++) { var e = mags[i] - mean; varr += e * e; }
    varr /= Math.max(1, mags.length);
    var minD = Infinity;
    for (i = 0; i < nodes.length; i++) for (j = i + 1; j < nodes.length; j++) {
      a = nodes[i]; b = nodes[j];
      dx = a.x - b.x; dy = a.y - b.y; dz = a.z - b.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < minD) minD = d;
    }
    return {
      residual: residual, perNode: mean, balance: 1 / (1 + mean),
      imbalance: Math.sqrt(varr) / (mean + 1e-9), minDist: minD
    };
  }

  // Build edges from precomputed corpus associations (chamber.edges.js): w = npmi in (0,1].
  // High association -> short rest length -> the terms sit closer.
  function edgesFromCo(raw, maxW) {
    maxW = maxW || 1;
    return raw.map(function (e) {
      var t = Math.max(0, Math.min(1, e.w / maxW));
      return { a: e.a, b: e.b, sim: t, rest: 60 + 150 * (1 - t) };
    });
  }

  var M = { normalize: normalize, featDist: featDist, buildEdges: buildEdges,
            initPositions: initPositions, step: step, edgesFromCo: edgesFromCo };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  root.ChamberModel = M;
})(typeof self !== 'undefined' ? self : this);
// @license-end
