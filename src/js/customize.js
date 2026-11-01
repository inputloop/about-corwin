// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// customize.js: the small "Customize" control at the top of the page, modelled on Emacs' M-x
// customize as the footer is on the mode-line. It opens when hovered or when its button is pressed
// (that pins it); Escape closes it and gives the focus back to the button. It sets attributes on
// <html> (data-size, data-measure, data-leading, data-theme) that site.css turns into the reading
// text's size, line length and spacing and into a colour theme; the bars and buttons keep their own
// sizes. Reduce motion presses the page's existing Motion button.
//
// Settings live in this browser's localStorage and nowhere else: nothing here talks to the network.
// If storage is refused the controls still work for the visit. Apply keeps the settings; Reset puts
// back the standard ones and forgets them.
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var wrap = doc.getElementById('custom'), btn = doc.getElementById('custom-btn');
  var panel = doc.getElementById('custom-panel');
  if (!wrap || !btn || !panel) return;

  var KEY = 'aboutcorwin.customize';
  var DEFAULTS = { size: '0', measure: 'normal', leading: 'normal', theme: 'auto', calm: false };
  var cur = copy(DEFAULTS), saved = null;
  var state = doc.getElementById('c-state');

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v === 'object') return v;
    } catch (e) { /* refused or damaged: use the standard settings */ }
    return null;
  }
  function save(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); return true; } catch (e) { return false; } }

  function valid(v) {
    var out = copy(DEFAULTS);
    if (!v) return out;
    if (['0', '1', '2', '3', '4'].indexOf(String(v.size)) >= 0) out.size = String(v.size);
    if (['narrow', 'normal', 'wide'].indexOf(v.measure) >= 0) out.measure = v.measure;
    if (['tight', 'normal', 'loose', 'looser'].indexOf(v.leading) >= 0) out.leading = v.leading;
    if (['auto', 'light', 'dark', 'hc'].indexOf(v.theme) >= 0) out.theme = v.theme;
    out.calm = v.calm === true;
    return out;
  }

  function attr(name, value, standard) {
    if (value === standard) html.removeAttribute(name); else html.setAttribute(name, value);
  }
  var pressedByUs = false;
  function motionButton() { return doc.getElementById('motion'); }
  function apply(v) {
    attr('data-size', v.size, '0');
    attr('data-measure', v.measure, 'normal');
    attr('data-leading', v.leading, 'normal');
    attr('data-theme', v.theme, 'auto');
    // Reduce motion presses the Motion button only when it would change something.
    var m = motionButton();
    if (m) {
      var on = m.getAttribute('aria-pressed') === 'true';
      if (v.calm && on) { m.click(); pressedByUs = true; }
      else if (!v.calm && pressedByUs && !on) { m.click(); pressedByUs = false; }
    }
  }
  function show(v) {
    ['size', 'measure', 'leading', 'theme'].forEach(function (n) {
      Array.prototype.forEach.call(panel.querySelectorAll('input[name="' + n + '"]'), function (r) { r.checked = r.value === v[n]; });
    });
    panel.querySelector('input[name="calm"]').checked = !!v.calm;
  }
  function read() {
    var v = copy(DEFAULTS);
    ['size', 'measure', 'leading', 'theme'].forEach(function (n) {
      var r = panel.querySelector('input[name="' + n + '"]:checked');
      if (r) v[n] = r.value;
    });
    v.calm = panel.querySelector('input[name="calm"]').checked;
    return v;
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function say(text) { state.textContent = text; }
  function describe() {
    if (same(cur, DEFAULTS)) return 'State: STANDARD SETTINGS.';
    if (saved && same(cur, saved)) return 'State: SAVED in this browser.';
    return 'State: EDITED, not saved. Use [Apply] to keep it.';
  }

  // ---- open and close: hover opens, a press pins ------------------------------------------------
  var pinned = false, hovering = false;
  function sync() {
    var open = pinned || hovering;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { pinned = !pinned; sync(); });
  wrap.addEventListener('mouseenter', function () { hovering = true; sync(); });
  wrap.addEventListener('mouseleave', function () { hovering = false; sync(); });
  doc.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || panel.hidden || !wrap.contains(doc.activeElement) && !hovering && !pinned) return;
    pinned = false; hovering = false; sync();
    btn.focus();
  });
  // Leaving the panel by keyboard (Tab past its last control) lets an unpinned panel close.
  wrap.addEventListener('focusout', function (ev) {
    if (!pinned && ev.relatedTarget && !wrap.contains(ev.relatedTarget)) { hovering = false; sync(); }
  });

  // ---- the controls ---------------------------------------------------------------------------------
  panel.addEventListener('change', function () {
    cur = read(); apply(cur); say(describe());
  });
  doc.getElementById('c-apply').addEventListener('click', function () {
    cur = read(); apply(cur);
    if (same(cur, DEFAULTS)) { saved = null; save(null); say('State: STANDARD SETTINGS.'); return; }
    if (save(cur)) { saved = copy(cur); say('State: SAVED in this browser.'); }
    else say('State: applied for this visit; this browser would not keep it.');
  });
  doc.getElementById('c-reset').addEventListener('click', function () {
    cur = copy(DEFAULTS); saved = null; save(null); show(cur); apply(cur);
    say('State: STANDARD SETTINGS.');
  });
  panel.addEventListener('submit', function (ev) { ev.preventDefault(); });

  saved = load();
  cur = valid(saved);
  if (saved) saved = copy(cur);
  show(cur); apply(cur); say(describe());
  html.setAttribute('data-customize', 'ready');
})();
// @license-end
