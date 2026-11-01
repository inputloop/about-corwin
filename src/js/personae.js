// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// personae.js: the dramatis personae, two columns that slide past each other as you scroll.
//
// Everything about who stands where was decided when the page was built (build.py,
// order_personae): each card carries its slot in its column, each pairing its meeting step, and
// the section carries the first and last step of the run. This file only turns the scroll
// position into a step and moves the columns by it: the people's column up, the personas' column
// down, so the person in slot a comes level with the persona in slot b at step a - b. When the
// step is near a pairing's step, that pair's two cards fold into one postcard. There are no
// positions for anyone in here, and no names.
//
// With Motion off (the button, Customize, or the system's reduced-motion setting) it does nothing
// but tidy up: the columns are plain lists and the pairings are written out beneath them.
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var sec = doc.getElementById('personae');
  if (!sec) return;
  var $ = function (s, el) { return (el || sec).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || sec).querySelectorAll(s)); };

  var track = $('.pp-track'), stage = $('.pp-stage'), postcard = $('.pp-postcard');
  var lists = [$('.pp-left .pp-list'), $('.pp-right .pp-list')];
  var cards = $$('.pp-card'), say = doc.getElementById('pp-say');
  var lo = Number(sec.getAttribute('data-lo')), hi = Number(sec.getAttribute('data-hi'));
  var slotOf = function (el) { return Number(el.getAttribute('data-slot')); };
  var bySlug = {};
  cards.forEach(function (c) { bySlug[c.getAttribute('data-slug')] = c; });
  var pairs = $$('.pp-pair').map(function (li) {
    return { li: li, step: Number(li.getAttribute('data-step')),
             person: bySlug[li.getAttribute('data-person')], persona: bySlug[li.getAttribute('data-persona')],
             names: $('.pp-names', li).textContent, words: $('.pp-words', li).textContent };
  });
  var byStep = {};
  pairs.forEach(function (p) { byStep[p.step] = p; });

  // Two cards count as level while their centres are within this share of one slot. It is under
  // half a slot, and no two pairings share a step, so at most one pairing is ever level.
  var LEVEL = 0.3;
  var pitch = 0, height = 0, current = null, sayTimer = null, ticking = false;

  function moving() { return html.classList.contains('motion-on'); }

  function measure() {
    sec.style.removeProperty('--pp-h');
    if (!moving()) return;
    // Every card takes the height of the tallest, so the slots are even whatever the text size.
    height = 0;
    cards.forEach(function (c) { height = Math.max(height, c.offsetHeight); });
    sec.style.setProperty('--pp-h', height + 'px');
    var gap = parseFloat(window.getComputedStyle(lists[0]).rowGap) || 0;
    pitch = height + gap;
    sec.style.setProperty('--pp-steps', String(hi - lo));
  }

  // Where the run is: 0 when the stage first pins, 1 when it lets go.
  function progress() {
    var travel = track.offsetHeight - stage.offsetHeight;
    if (travel <= 0) return 0;
    return Math.max(0, Math.min(1, -track.getBoundingClientRect().top / travel));
  }

  function clear() {
    lists.forEach(function (l) { l.style.removeProperty('transform'); });
    cards.forEach(function (c) { c.classList.remove('is-meeting'); c.style.removeProperty('--pp-near'); });
    postcard.hidden = true;
    current = null;
  }

  function update() {
    ticking = false;
    if (!moving()) { clear(); return; }
    var k = lo + progress() * (hi - lo);
    // Centre the action: halfway between the two columns' middles sits at the middle of the stage.
    var top = lists[0].offsetTop, m = lists[0].children.length, n = lists[1].children.length;
    var base = stage.clientHeight / 2 - top - height / 2 - (m + n - 2) / 4 * pitch;
    var shift = k * pitch / 2;
    lists[0].style.transform = 'translateY(' + (base - shift).toFixed(1) + 'px)';
    lists[1].style.transform = 'translateY(' + (base + shift).toFixed(1) + 'px)';

    var near = Math.round(k), pair = byStep[near], off = Math.abs(k - near);
    if (!pair || off >= LEVEL) pair = null;
    cards.forEach(function (c) {
      if (!pair || (c !== pair.person && c !== pair.persona)) {
        c.classList.remove('is-meeting'); c.style.removeProperty('--pp-near');
      }
    });
    if (!pair) { postcard.hidden = true; current = null; return; }
    var f = (1 - off / LEVEL).toFixed(3);
    [pair.person, pair.persona].forEach(function (c) { c.classList.add('is-meeting'); c.style.setProperty('--pp-near', f); });
    var y = top + slotOf(pair.person) * pitch + height / 2 + base - shift;
    postcard.style.setProperty('--pp-y', y.toFixed(1) + 'px');
    postcard.style.setProperty('--pp-near', f);
    if (current !== pair) {
      current = pair;
      $('.pp-pc-names', postcard).textContent = pair.names;
      $('.pp-pc-words', postcard).textContent = pair.words;
      postcard.hidden = false;
      // Said once the reader settles on it, so a fast scroll past three pairs is not three speeches.
      window.clearTimeout(sayTimer);
      sayTimer = window.setTimeout(function () {
        if (current === pair) say.textContent = 'Postcard: ' + pair.names + '. ' + pair.words;
      }, 400);
    }
  }

  function schedule() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
  function relayout() { measure(); update(); }

  // A button beside each pairing scrolls to where that pair meets, for keyboards and for anyone
  // who would rather not hunt for it. They show only while the columns move.
  pairs.forEach(function (p) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'pp-show';
    b.textContent = 'Show this postcard';
    b.setAttribute('aria-label', 'Show the postcard for ' + p.names);
    b.addEventListener('click', function () {
      if (!moving()) return;
      measure();
      var travel = track.offsetHeight - stage.offsetHeight;
      var y = track.getBoundingClientRect().top + window.scrollY + travel * (p.step - lo) / (hi - lo);
      window.scrollTo({ top: Math.round(y), behavior: 'instant' });
      update();
      postcard.focus({ preventScroll: true });
    });
    p.li.appendChild(doc.createTextNode(' '));
    p.li.appendChild(b);
  });

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', relayout);
  // Motion, text size, line spacing and theme are attributes on <html>; any change re-measures.
  if (window.MutationObserver) new MutationObserver(relayout).observe(html, {
    attributes: true, attributeFilter: ['class', 'data-size', 'data-measure', 'data-leading', 'data-theme'] });
  relayout();
})();
// @license-end
