// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// dpad.js: the tone d-pads. Corwin, 2026-11-01: a two-direction pad that moves the introductions
// along two lines, warm to formal (left, right) and ELI5 to know-it-all (down, up: up is harder;
// grade 4 to college until 2026-11-13, when the two ends were added),
// for the whole page or one section at a time.
//
//   - Every introduction ships all its written versions in <template> elements beside the live text
//     (build_tone.py); this file only swaps which one shows. tone.model.js holds the rules.
//   - The page pad sits in a dock at the top and drifts out of the way of the section pads and the
//     other controls as they scroll by (DESIGN.md, "The tone d-pad", gives both formulas). Focus or
//     hover brings it fully home. With reduced motion it jumps to where it would settle.
//   - Keys: Ctrl+arrows for the section you are in (or the page), Ctrl+Shift+arrows for the page,
//     Ctrl+Shift+Home to put everything back; on a focused pad, arrows, h j k l, Home, and C-f C-b
//     C-p. Nothing fires inside a text field, and nothing uses Alt.
//   - The choice is kept under one key, aboutcorwin.tone, in this browser; nothing is sent.
//   - A reader with no saved choice whose browser's first language is not English starts one
//     reading step simpler (plain, grade 4), and one quiet line above the About says so. A saved
//     choice always wins; moving a pad or a row makes the choice the reader's; a Customize row,
//     "Follow my browser's language", turns it off (Corwin, 2026-11-02: "Default ON").
(function () {
  'use strict';
  var doc = document, html = doc.documentElement, M = window.ToneModel;
  if (!M || html.getAttribute('data-tone') === 'none') return;
  var $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };
  var KEY = 'aboutcorwin.tone';

  // ---- the texts -------------------------------------------------------------------------------
  var units = {};
  $$('[data-unit]:not(template)').forEach(function (el) {
    var u = { el: el, section: el.getAttribute('data-section'), cells: {}, shown: M.name(M.BASE[0], M.BASE[1]) };
    var base = doc.createDocumentFragment();
    Array.prototype.forEach.call(el.childNodes, function (n) { base.appendChild(n.cloneNode(true)); });
    u.cells[u.shown] = base;
    units[el.getAttribute('data-unit')] = u;
  });
  $$('template[data-unit][data-cell]').forEach(function (t) {
    var u = units[t.getAttribute('data-unit')];
    if (u) u.cells[t.getAttribute('data-cell')] = t.content;
  });
  var have = {};
  Object.keys(units).forEach(function (k) { have[k] = {}; Object.keys(units[k].cells).forEach(function (c) { have[k][c] = true; }); });

  var pads = $$('.dpad');
  var sectionIds = pads.map(function (p) { return p.getAttribute('data-scope'); }).filter(function (s) { return s !== 'page'; });
  var say = doc.getElementById('tone-say');

  // ---- state and storage -------------------------------------------------------------------------
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save() {
    try {
      // Nothing to keep: no choice made (the start is worked out again each visit), or a choice
      // that is the words as written where the language would not change the start anyway.
      var empty = !state.invert && state.lang && (!state.chosen ||
        (M.same(state.global, M.BASE) && !Object.keys(state.sections).length && !start));
      if (empty) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* refused: the choice still holds for this visit */ }
  }
  var state = M.valid(load(), sectionIds);

  // ---- the browser's language: where a reader with no saved choice starts ----------------------
  var nav = window.navigator || {};
  var start = M.langStart(nav.languages && nav.languages.length ? nav.languages : (nav.language ? [nav.language] : []));
  var started = false;
  function startFromLanguage() {
    started = !state.chosen && state.lang && !!start;
    if (!state.chosen) state.global = started ? start.cell.slice() : M.BASE.slice();
  }
  function choose() { state.chosen = true; started = false; }
  function langName(code) {
    try {
      var n = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
      if (n && n.toLowerCase() !== code.toLowerCase()) return n;
    } catch (e) { /* no Intl.DisplayNames here: the code itself will do */ }
    return code;
  }
  var line = doc.getElementById('tone-lang');
  function showLine() {
    if (!line) return;
    if (started) line.textContent = 'Starting with simpler English because your browser prefers ' + langName(start.lang) + '; the pad changes it.';
    line.hidden = !started;
  }
  startFromLanguage();

  function cellFor(scope) { return scope !== 'page' && state.sections[scope] ? state.sections[scope] : state.global; }
  function setScope(scope, cell) {
    if (scope === 'page') {
      state.global = cell;
      Object.keys(state.sections).forEach(function (k) { if (M.same(state.sections[k], cell)) delete state.sections[k]; });
    } else if (M.same(cell, state.global)) {
      delete state.sections[scope];
    } else {
      state.sections[scope] = cell;
    }
  }
  function scopeName(scope) {
    var p = padFor(scope);
    return p ? p.getAttribute('data-name') : 'the page';
  }
  function padFor(scope) { for (var i = 0; i < pads.length; i++) if (pads[i].getAttribute('data-scope') === scope) return pads[i]; return null; }

  // ---- showing ------------------------------------------------------------------------------------
  function render() {
    Object.keys(units).forEach(function (k) {
      var u = units[k], want = cellFor(u.section);
      var cell = M.resolve(have[k], want[0], want[1]);
      if (cell !== u.shown) {
        while (u.el.firstChild) u.el.removeChild(u.el.firstChild);
        u.el.appendChild(u.cells[cell].cloneNode(true));
        u.shown = cell;
        u.el.setAttribute('data-cell', cell);
      }
    });
    pads.forEach(drawPad);
    syncRows();
    showLine();
  }
  var ARM_WORDS = { left: 'Warmer', right: 'More formal', up: 'Harder words', down: 'Simpler words' };
  function armWords(dir) {
    if (state.invert && (dir === 'up' || dir === 'down')) return ARM_WORDS[dir === 'up' ? 'down' : 'up'];
    return ARM_WORDS[dir];
  }
  function drawPad(p) {
    var scope = p.getAttribute('data-scope'), cell = cellFor(scope), what = p.getAttribute('data-name');
    $$('button[data-move]', p).forEach(function (b) {
      var dir = b.getAttribute('data-move');
      if (dir === 'reset') {
        b.setAttribute('aria-label', scope === 'page' ? 'As written: plain, about grade 8, for the whole page' : 'Same as the whole page: ' + what);
      } else {
        b.setAttribute('aria-label', armWords(dir) + ': ' + what);
        b.setAttribute('aria-disabled', M.move(cell, dir, state.invert) ? 'false' : 'true');
      }
      b.title = b.getAttribute('aria-label');
    });
    p.classList.toggle('is-own', scope !== 'page' && !!state.sections[scope]);
    var cap = doc.getElementById(p.getAttribute('aria-describedby'));
    if (cap) {
      var text = M.describe(cell);
      var near = Object.keys(units).filter(function (k) { return (scope === 'page' || units[k].section === scope) && units[k].shown !== M.name(cell[0], cell[1]); });
      if (near.length) {
        var s = units[near[0]].shown.split('-');
        text += ' (nearest written: ' + M.describe([s[0], +s[1]]) + ')';
      }
      if (scope !== 'page') text += state.sections[scope] ? '; this section only' : '';
      cap.textContent = text;
    }
  }
  function announce(scope) {
    if (!say) return;
    var msg = (scope === 'page' ? 'Whole page' : scopeName(scope)) + ': ' + M.describe(cellFor(scope)) + '.';
    say.textContent = '';
    window.setTimeout(function () { say.textContent = msg; }, 40);
  }

  function act(scope, dir) {
    choose();
    if (dir === 'reset') {
      if (scope === 'page') setScope('page', M.BASE.slice()); else delete state.sections[scope];
    } else {
      var next = M.move(cellFor(scope), dir, state.invert);
      if (!next) { announce(scope); return false; }
      setScope(scope, next);
    }
    save(); render(); announce(scope); drift.kick();
    return true;
  }
  function resetAll() { choose(); state.global = M.BASE.slice(); state.sections = {}; save(); render(); announce('page'); }

  // ---- the pads: clicks and the glow that follows the pointer -------------------------------------
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function calm() { return reduce.matches || html.classList.contains('motion-off'); }
  pads.forEach(function (p) {
    var scope = p.getAttribute('data-scope');
    p.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-move]');
      if (b && p.contains(b)) act(scope, b.getAttribute('data-move'));
    });
    p.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'touch' || calm()) return;
      var r = p.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      var dx = x - r.width / 2, dy = y - r.height / 2;
      // The quadrants are turned 45 degrees so that each lines up with an arm.
      var hot = Math.abs(dx) < r.width * 0.14 && Math.abs(dy) < r.height * 0.14 ? 'reset'
        : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      p.setAttribute('data-hot', hot);
      p.style.setProperty('--gx', x.toFixed(1) + 'px');
      p.style.setProperty('--gy', y.toFixed(1) + 'px');
    });
    p.addEventListener('pointerleave', function () { p.removeAttribute('data-hot'); });
  });

  // ---- keys -----------------------------------------------------------------------------------------
  var ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  var VI = { h: 'left', l: 'right', k: 'up', j: 'down' };
  var EMACS = { f: 'right', b: 'left', p: 'up' };   // C-n is the browser's: down stays on the arrow and j
  function inField(t) { return t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'); }
  function selecting() { var s = window.getSelection && window.getSelection(); return !!(s && !s.isCollapsed); }
  function sectionScope() {
    var a = doc.activeElement, owner = a && a.closest && a.closest('[data-tone-section]');
    if (owner && sectionIds.indexOf(owner.getAttribute('data-tone-section')) >= 0) return owner.getAttribute('data-tone-section');
    var line = window.innerHeight * 0.35, found = 'page';
    $$('[data-tone-section]').forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top <= line && r.bottom > line && sectionIds.indexOf(s.getAttribute('data-tone-section')) >= 0) found = s.getAttribute('data-tone-section');
    });
    return found;
  }
  doc.addEventListener('keydown', function (ev) {
    if (ev.altKey || ev.metaKey || inField(ev.target)) return;
    var pad = ev.target.closest && ev.target.closest('.dpad');
    var dir = ARROWS[ev.key];
    if (ev.ctrlKey && ev.shiftKey) {
      if (ev.key === 'Home') { ev.preventDefault(); resetAll(); return; }
      if (dir && !selecting()) { ev.preventDefault(); act('page', dir); }
      return;
    }
    if (ev.ctrlKey && dir) { ev.preventDefault(); act(pad ? pad.getAttribute('data-scope') : sectionScope(), dir); return; }
    if (!pad) return;
    var scope = pad.getAttribute('data-scope');
    if (ev.ctrlKey && EMACS[ev.key]) { ev.preventDefault(); act(scope, EMACS[ev.key]); return; }
    if (ev.ctrlKey || ev.shiftKey) return;
    if (dir || VI[ev.key]) { ev.preventDefault(); act(scope, dir || VI[ev.key]); return; }
    if (ev.key === 'Home') { ev.preventDefault(); act(scope, 'reset'); }
  });

  // ---- the Customize rows: the same state as the page pad -------------------------------------------
  var panel = doc.getElementById('custom-panel');
  function syncRows() {
    if (!panel) return;
    $$('input[name="tone-w"]', panel).forEach(function (r) { r.checked = r.value === state.global[0]; });
    $$('input[name="tone-g"]', panel).forEach(function (r) { r.checked = +r.value === state.global[1]; });
    var inv = panel.querySelector('input[name="tone-invert"]');
    if (inv) inv.checked = state.invert;
    var follow = panel.querySelector('input[name="tone-lang"]');
    if (follow) follow.checked = state.lang;
  }
  if (panel) panel.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.name === 'tone-w' || t.name === 'tone-g') {
      var w = panel.querySelector('input[name="tone-w"]:checked'), g = panel.querySelector('input[name="tone-g"]:checked');
      choose();
      setScope('page', [w ? w.value : state.global[0], g ? +g.value : state.global[1]]);
      save(); render(); announce('page'); drift.kick();
    } else if (t.name === 'tone-invert') {
      state.invert = t.checked; save(); render();
    } else if (t.name === 'tone-lang') {
      state.lang = t.checked; startFromLanguage(); save(); render(); drift.kick();
    }
  });

  // ---- the drift: the page pad keeps out of the way ---------------------------------------------------
  // Each obstacle (a section pad, or another control such as Motion) pushes the page pad away.
  // Customize is not an obstacle: it is the dock's ceiling, so the pad never rises into it. The push
  // is worked out from the gap d between the page pad's box and a rectangle set in by 15% of the
  // obstacle's smaller side (negative d means they overlap by that much); s is the page pad's width,
  // and an obstacle more than 2.5 s away does not push at all.
  //   up/down:    Fy = s * exp(-d / (s/2)), with d no less than -s/2         (falls off fast)
  //   left/right: Fx = 0.9 s * ((0.6 s) / (0.6 s + d))^2, d no less than -0.3 s (falls off slowly)
  // Fy points away from the obstacle's centre; Fx points left unless the pad's centre is more than
  // a quarter pad right of the obstacle's (it dodges, it does not mirror). A spring, K = 0.5, pulls
  // back toward home. Each frame: v = 0.7 (v + 0.12 (F - K x)); x += v; then x is held inside the
  // dock region and the frame, and an axis held at its edge stops there. It settles when what is
  // left of the speed and the push is small.
  var drift = (function () {
    var dock = doc.getElementById('tone-dock');
    var off = { x: 0, y: 0 }, vel = { x: 0, y: 0 }, running = false, held = false;
    var K = 0.5, DT = 0.12, DAMP = 0.7, INSET = 0.15, REACH = 2.5;
    if (!dock) return { kick: function () {}, settle: function () {} };
    var gpad = dock.querySelector('.dpad');
    function rect(el) { var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }
    function obstacles() {
      return $$('.dpad').filter(function (p) { return p !== gpad && p.offsetParent; })
        .concat([doc.getElementById('motion')].filter(function (x) { return x && x.offsetParent; }))
        .map(rect).filter(function (r) { return r.w > 0 && r.h > 0; });
    }
    function frame() {
      var v = window.visualViewport, m = 4;
      var l = 0, t = 0, r = doc.documentElement.clientWidth, b = window.innerHeight;
      if (v) { l = Math.max(l, v.offsetLeft); t = Math.max(t, v.offsetTop); r = Math.min(r, v.offsetLeft + v.width); b = Math.min(b, v.offsetTop + v.height); }
      return { l: l + m, t: t + m, r: r - m, b: b - m };
    }
    function push(P, obs) {
      var s = P.w, F = { x: 0, y: 0 };
      obs.forEach(function (O) {
        var k = INSET * Math.min(O.w, O.h);
        var I = { l: O.l + k, t: O.t + k, r: O.r - k, b: O.b - k };
        var sx = Math.max(I.l - P.r, P.l - I.r), sy = Math.max(I.t - P.b, P.t - I.b);
        var d = sx > 0 || sy > 0 ? Math.sqrt(Math.pow(Math.max(sx, 0), 2) + Math.pow(Math.max(sy, 0), 2)) : Math.max(sx, sy);
        if (d > REACH * s) return;
        var pcx = (P.l + P.r) / 2, pcy = (P.t + P.b) / 2, ocx = (I.l + I.r) / 2, ocy = (I.t + I.b) / 2;
        var ly = s / 2, lx = 0.6 * s;
        F.y += (pcy < ocy ? -1 : 1) * s * Math.exp(-Math.max(d, -ly) / ly);
        var dx = Math.max(d, -lx / 2);
        F.x += (pcx > ocx + s / 4 ? 1 : -1) * 0.9 * s * Math.pow(lx / (lx + dx), 2);
      });
      return F;
    }
    function step(H, obs, fr) {
      var P = { l: H.l + off.x, t: H.t + off.y, r: H.r + off.x, b: H.b + off.y, w: H.w, h: H.h };
      var F = held ? { x: 0, y: 0 } : push(P, obs);
      var ax = F.x - K * off.x, ay = F.y - K * off.y;
      if (held) { vel.x = 0; vel.y = 0; off.x = 0; off.y = 0; return 0; }
      vel.x = DAMP * (vel.x + DT * ax); vel.y = DAMP * (vel.y + DT * ay);
      off.x += vel.x; off.y += vel.y;
      // The dock region: up to three pads left of home and two and a half down, never above home
      // (Customize is the ceiling), and never out of frame.
      var x0 = off.x, y0 = off.y;
      off.x = Math.max(-3 * H.w, Math.min(0, off.x));
      off.y = Math.max(0, Math.min(2.5 * H.h, off.y));
      off.x = Math.max(fr.l - H.l, Math.min(fr.r - H.r, off.x));
      off.y = Math.max(fr.t - H.t, Math.min(fr.b - H.b, off.y));
      if (off.x !== x0) { vel.x = 0; ax = 0; }
      if (off.y !== y0) { vel.y = 0; ay = 0; }
      return Math.abs(vel.x) + Math.abs(vel.y) + 0.02 * (Math.abs(ax) + Math.abs(ay));
    }
    function home() {
      var r = rect(dock);
      return { l: r.l - off.x, t: r.t - off.y, r: r.r - off.x, b: r.b - off.y, w: r.w, h: r.h };
    }
    function paint(tilt) {
      dock.style.setProperty('--dx', off.x.toFixed(1) + 'px');
      dock.style.setProperty('--dy', off.y.toFixed(1) + 'px');
      dock.style.setProperty('--tilt', (calm() ? 0 : Math.max(-4, Math.min(4, tilt))).toFixed(2) + 'deg');
    }
    function tick() {
      var H = home(), obs = obstacles(), fr = frame();
      var moving = step(H, obs, fr);
      paint(vel.x * 0.8);
      if (moving > 0.08) { window.requestAnimationFrame(tick); return; }
      running = false; vel.x = vel.y = 0; paint(0);
      dock.setAttribute('data-settled', 'yes');
    }
    function settleNow() {
      // Reduced motion: work out where it would come to rest, then jump there in one go.
      var H = home(), obs = obstacles(), fr = frame();
      for (var i = 0; i < 400; i++) { if (step(H, obs, fr) < 0.02) break; }
      vel.x = vel.y = 0; paint(0);
      dock.setAttribute('data-settled', 'yes');
    }
    function kick() {
      dock.removeAttribute('data-settled');
      if (calm() || held) { settleNow(); return; }
      if (!running) { running = true; window.requestAnimationFrame(tick); }
    }
    function hold(on) { held = on; dock.classList.toggle('is-home', on); kick(); }
    dock.addEventListener('focusin', function () { hold(true); });
    dock.addEventListener('focusout', function (ev) { if (!dock.contains(ev.relatedTarget)) hold(false); });
    dock.addEventListener('pointerenter', function (ev) { if (ev.pointerType !== 'touch') hold(true); });
    dock.addEventListener('pointerleave', function () { if (!dock.contains(doc.activeElement)) hold(false); });
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', kick); window.visualViewport.addEventListener('scroll', kick); }
    if (window.ResizeObserver) new ResizeObserver(kick).observe(doc.body);
    if (reduce.addEventListener) reduce.addEventListener('change', kick);
    return { kick: kick, settle: settleNow, offset: function () { return { x: off.x, y: off.y }; } };
  })();

  render();
  drift.kick();
  window.ToneDpad = { state: function () { return JSON.parse(JSON.stringify(state)); }, drift: drift,
                     start: function () { return started ? start.lang : null; } };
  html.setAttribute('data-tone-ready', 'yes');
})();
// @license-end
