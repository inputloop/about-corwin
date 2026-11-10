// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// tone.model.js: the tone d-pad's rules with no page in them, so the browser (dpad.js) and the
// checks (tests/js/tone.test.mjs) run the same code. tests/spec/TONE.txt says the rules in words;
// build_tone.py is the Python reader written from the same words, and the two must agree.
//
//   - a cell is a warmth (warm, plain, formal) and a reading step (4, 8, 12, 16 = college);
//   - the base, the words already on the page, is plain 8;
//   - a missing cell falls back: one warmth step toward plain, then one reading step toward 8,
//     then the base (resolve);
//   - left is warmer, right more formal; up is harder words and down simpler, unless the reader
//     asked in Customize for up to mean simpler (move, with invert);
//   - a reader with no saved choice whose browser's first language is not English starts one
//     reading step simpler, plain grade 4 (langStart; TONE.txt, 8).
(function (root) {
  'use strict';
  var WARMTH = ['warm', 'plain', 'formal'];
  var STEPS = [4, 8, 12, 16];
  var BASE = ['plain', 8];
  var STEP_NAMES = { 4: 'grade 4', 8: 'grade 8', 12: 'grade 12', 16: 'college' };

  function name(w, g) { return w + '-' + g; }
  function toward(seq, x, target) {
    var i = seq.indexOf(x), j = seq.indexOf(target);
    return i === j ? x : seq[i + (j > i ? 1 : -1)];
  }
  // have: { 'warm-4': true, ... } for the cells written. Returns the cell shown for (w, g).
  function resolve(have, w, g) {
    for (;;) {
      if (have[name(w, g)]) return name(w, g);
      var w2 = toward(WARMTH, w, BASE[0]);
      if (have[name(w2, g)]) return name(w2, g);
      if (g === BASE[1]) return name(BASE[0], BASE[1]);
      g = toward(STEPS, g, BASE[1]);
    }
  }
  // units: { unit: ['warm-4', ...] } -> { unit: { asked: shown } } for every cell.
  function table(units) {
    var out = {};
    Object.keys(units).forEach(function (u) {
      var have = {};
      units[u].forEach(function (c) { have[c] = true; });
      have[name(BASE[0], BASE[1])] = true;
      out[u] = {};
      WARMTH.forEach(function (w) { STEPS.forEach(function (g) { out[u][name(w, g)] = resolve(have, w, g); }); });
    });
    return out;
  }
  // dir: 'left' | 'right' | 'up' | 'down'. Returns the new [w, g], or null at the end of the axis.
  function move(cur, dir, invert) {
    var wi = WARMTH.indexOf(cur[0]), gi = STEPS.indexOf(cur[1]);
    if (dir === 'up' || dir === 'down') {
      var harder = (dir === 'up') !== !!invert;
      gi += harder ? 1 : -1;
    } else {
      wi += dir === 'left' ? -1 : 1;
    }
    if (wi < 0 || wi >= WARMTH.length || gi < 0 || gi >= STEPS.length) return null;
    return [WARMTH[wi], STEPS[gi]];
  }
  function same(a, b) { return !!a && !!b && a[0] === b[0] && a[1] === b[1]; }
  function okCell(v) { return Array.isArray(v) && WARMTH.indexOf(v[0]) >= 0 && STEPS.indexOf(v[1]) >= 0; }
  // What was stored, cleaned: anything unknown is dropped, never trusted.
  function valid(v, sectionIds) {
    var out = { global: BASE.slice(), sections: {}, invert: false, lang: true, chosen: false };
    if (!v || typeof v !== 'object') return out;
    if (okCell(v.global)) out.global = [v.global[0], v.global[1]];
    if (v.sections && typeof v.sections === 'object') {
      Object.keys(v.sections).forEach(function (k) {
        if ((sectionIds || []).indexOf(k) >= 0 && okCell(v.sections[k]) && !same(v.sections[k], out.global)) {
          out.sections[k] = [v.sections[k][0], v.sections[k][1]];
        }
      });
    }
    out.invert = v.invert === true;
    out.lang = v.lang !== false;
    // A saved choice: written by a pad or a row. Older saves had no flag; a saved global was a choice.
    out.chosen = v.chosen === true || (v.chosen === undefined && okCell(v.global));
    return out;
  }
  // The browser's language (TONE.txt, 8). langs: navigator.languages, or [navigator.language].
  // Only the first language counts, and every English (en, en-GB, en-IN ...) is English. Returns
  // null to start as written, or { lang, tag, cell } to start one reading step simpler.
  function langStart(langs) {
    var tag = String((langs && langs.length && langs[0]) || '').trim();
    var sub = tag.split(/[-_]/)[0].toLowerCase();
    if (!/^[a-z]{2,3}$/.test(sub) || sub === 'und') return null;   // unknown: as written
    if (sub === 'en') return null;
    return { lang: sub, tag: tag, cell: [BASE[0], STEPS[STEPS.indexOf(BASE[1]) - 1]] };
  }
  function describe(cell) { return cell[0] + ', ' + (STEP_NAMES[cell[1]] === 'college' ? 'college level' : 'about ' + STEP_NAMES[cell[1]]); }

  var M = { WARMTH: WARMTH, STEPS: STEPS, BASE: BASE, STEP_NAMES: STEP_NAMES, name: name, toward: toward,
            resolve: resolve, table: table, move: move, same: same, valid: valid, describe: describe,
            langStart: langStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  root.ToneModel = M;
})(typeof self !== 'undefined' ? self : this);
// @license-end
