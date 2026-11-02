// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// site.js: what the page does when scripts run. Without it the page is complete: every card's
// text opens under "Read about", the mode-line shows the whole way down, and the quick filters work
// with CSS alone. With it:
//
//   - each card's window becomes a button with a moving picture (windows.js);
//   - a click on the card grows it into an index card (a FLIP animation: measure, change, measure,
//     then play the difference backwards), with the introduction, the back, a scoreboard or the
//     window grown large;
//   - the mode-line says where you are (Top, 37%, Bot) and which section, and a click on it flies
//     the page to the bottom, the parallax and the cards leaning with the speed, then opens the
//     prompt;
//   - the prompt asks taxonomy.js which cards fit what you typed.
//
// Nothing here talks to the network. The one thing it remembers is your Motion choice, in your own
// browser's storage, and it copes when that storage is refused.
(function () {
  'use strict';
  var doc = document, html = doc.documentElement, body = doc.body;
  html.classList.add('js');

  var $ = function (s, el) { return (el || doc).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };

  // ---- motion ---------------------------------------------------------------------------------
  var reduce = root().matchMedia ? root().matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function root() { return window; }
  function stored() { try { return localStorage.getItem('aboutcorwin.motion'); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem('aboutcorwin.motion', v); } catch (e) { /* refused: fine */ } }
  var motion = stored() ? stored() === 'on' : !reduce.matches;
  var motionBtn = $('#motion');
  function applyMotion() {
    html.classList.toggle('motion-on', motion);
    html.classList.toggle('motion-off', !motion);
    if (motionBtn) motionBtn.setAttribute('aria-pressed', motion ? 'true' : 'false');
    if (window.Windows) window.Windows.setMotion(motion);
  }
  if (motionBtn) motionBtn.addEventListener('click', function () {
    motion = !motion; store(motion ? 'on' : 'off'); applyMotion(); parallax();
  });
  if (reduce.addEventListener) reduce.addEventListener('change', function (e) {
    if (!stored()) { motion = !e.matches; applyMotion(); }
  });

  // ---- the taxonomy -----------------------------------------------------------------------------
  var model = null, index = null;
  try {
    index = JSON.parse($('#taxonomy-index').textContent);
    model = window.Taxonomy.build(index);
    if (window.Windows) window.Windows.setField(model);
  } catch (e) {
    model = null;
  }

  // ---- windows ----------------------------------------------------------------------------------
  var cards = $$('.card');
  // The cast page (cast/index.html) carries the same index but no cards: there the prompt counts the
  // home page's cards and its answers lead back to them (html data-home names the way back).
  var home = html.getAttribute('data-home');
  var total = cards.length || (index ? index.items.filter(function (it) {
    return ['about', 'involvements', 'projects', 'concepts'].indexOf(it.kind) >= 0; }).length : 0);
  cards.forEach(function (card) {
    var span = $('.face > .window', card);
    if (!span) return;
    var title = $('.title', card).textContent;
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = span.className;
    btn.setAttribute('data-window', span.getAttribute('data-window'));
    btn.title = 'More about ' + title;
    btn.setAttribute('aria-label', 'More about ' + title);
    btn.setAttribute('aria-controls', card.id + '-more');
    btn.setAttribute('aria-expanded', 'false');
    while (span.firstChild) btn.appendChild(span.firstChild);
    span.parentNode.replaceChild(btn, span);
    if (window.Windows) card._win = window.Windows.mount(btn, btn.getAttribute('data-window'), { slug: card.dataset.slug });
  });
  applyMotion();

  // ---- cards ------------------------------------------------------------------------------------
  var open = null, lastQuery = null;
  var VIEW_NAMES = { prose: 'Introduction', baseball: 'Back', scoreboard: 'Scoreboard', featured: 'Window' };

  function viewbar(card) {
    var bar = $('.viewbar', card);
    if (bar) return bar;
    bar = doc.createElement('div');
    bar.className = 'viewbar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Views of ' + $('.title', card).textContent);
    card.dataset.views.split(' ').forEach(function (v) {
      var b = doc.createElement('button');
      b.type = 'button'; b.dataset.view = v; b.textContent = VIEW_NAMES[v] || v;
      b.setAttribute('aria-pressed', 'false');
      bar.appendChild(b);
    });
    var close = doc.createElement('button');
    close.type = 'button'; close.className = 'card-close'; close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close ' + $('.title', card).textContent);
    bar.appendChild(close);
    $('.views', card).insertBefore(bar, $('.views', card).firstChild);
    return bar;
  }

  function animate(el, frames, ms) {
    if (!motion || !el.animate) return null;
    return el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function setView(card, view) {
    if (card.dataset.views.split(' ').indexOf(view) < 0) view = 'prose';
    var bar = viewbar(card);
    $$('.view', card).forEach(function (s) { s.classList.toggle('is-current', s.dataset.view === view); });
    $$('button[data-view]', bar).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
    if (card._feature) { window.Windows.unmount(card._feature); card._feature = null; }
    if (view === 'featured' && window.Windows) {
      card._feature = window.Windows.mount($('.feature-slot', card), card.dataset.window, { slug: card.dataset.slug, big: true });
    }
    var current = $('.view.is-current', card);
    if (current) animate(current, [{ transform: 'perspective(900px) rotateY(-12deg)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], 320);
    card.dataset.current = view;
  }

  function openCard(card, view, focusBar) {
    if (open && open !== card) closeCard(open, false);
    var first = card.getBoundingClientRect();
    var was = card.classList.contains('is-open');
    card.classList.add('is-open');
    $('.more', card).open = true;
    $('.face > .window', card).setAttribute('aria-expanded', 'true');
    setView(card, view);
    open = card;
    if (!was) {
      var last = card.getBoundingClientRect();
      var dx = first.left - last.left, dy = first.top - last.top;
      var sx = first.width / last.width, sy = first.height / last.height;
      animate(card, [
        { transformOrigin: 'top left', transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ') rotate(-2deg)' },
        { transformOrigin: 'top left', transform: 'none' }
      ], 420);
    }
    var r = card.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) card.scrollIntoView({ block: 'start', behavior: motion ? 'smooth' : 'auto' });
    if (focusBar) {
      var b = $('.viewbar button[aria-pressed="true"]', card);
      if (b) b.focus({ preventScroll: true });
    }
  }

  function closeCard(card, returnFocus) {
    card.classList.remove('is-open');
    $('.more', card).open = false;
    $('.face > .window', card).setAttribute('aria-expanded', 'false');
    if (card._feature) { window.Windows.unmount(card._feature); card._feature = null; }
    if (open === card) open = null;
    if (returnFocus) { var w = $('.face > .window', card); if (w) w.focus(); }
  }

  function preferred(card) {
    var v = lastQuery && lastQuery.view;
    return v && card.dataset.views.split(' ').indexOf(v) >= 0 ? v : 'featured';
  }

  body.addEventListener('click', function (ev) {
    var card = ev.target.closest('.card');
    if (!card) return;
    var t = ev.target;
    var win = t.closest('.face > .window');
    if (win) { ev.preventDefault(); openCard(card, preferred(card), ev.detail === 0); return; }
    var vb = t.closest('.viewbar button[data-view]');
    if (vb) { setView(card, vb.dataset.view); return; }
    if (t.closest('.card-close')) { closeCard(card, true); return; }
    if (t.closest('summary')) {
      ev.preventDefault();
      if (card.classList.contains('is-open')) closeCard(card, false);
      else openCard(card, 'prose', true);
      return;
    }
    if (t.closest('a, button, input, label, select, textarea, table, dl')) return;
    if (window.getSelection && String(window.getSelection()).length) return;
    if (!card.classList.contains('is-open') || t.closest('.face')) openCard(card, 'prose', false);
  });

  doc.addEventListener('keydown', function (ev) {
    var inField = ev.target.closest && ev.target.closest('input, textarea, select');
    if (ev.key === 'Escape' && open && !inField) { closeCard(open, true); return; }
    if (inField || ev.ctrlKey || ev.metaKey) return;
    // Alt+x, as M-x. No single-key shortcuts (WCAG 2.1.4): a stray key never moves the page.
    if (ev.altKey && (ev.key === 'x' || ev.key === '\u2248' || ev.code === 'KeyX')) { ev.preventDefault(); toPrompt(); }
  });

  // ---- the mode-line ------------------------------------------------------------------------------
  var ml = $('#modeline'), pos = $('.ml-pos', ml), sec = $('.ml-sec', ml);
  var sections = $$('main > section[id], .portfolio-inner > h3[id]');
  var SECTION_NAMES = { about: 'about', involvements: 'involvements', portfolio: 'inputloop', work: 'work',
                        ideas: 'ideas', how: 'how', stage: 'display' };
  var ticking = false;
  function where() {
    ticking = false;
    var max = doc.documentElement.scrollHeight - window.innerHeight, y = window.scrollY;
    var p = max <= 0 ? 'All' : y <= 2 ? 'Top' : y >= max - 2 ? 'Bot' : Math.round(100 * y / max) + '%';
    pos.textContent = p;
    var name = 'top';
    sections.forEach(function (s) { if (s.getBoundingClientRect().top < window.innerHeight * 0.4) name = SECTION_NAMES[s.id] || s.id; });
    var atBottom = max <= 0 || y >= max - 4;
    if (atBottom) name = 'display';
    sec.textContent = '*' + name + '*';
    html.classList.toggle('at-bottom', atBottom);
    parallax();
  }
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(where); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { onScroll(); if (window.Windows) window.Windows.redrawAll(); });
  where();

  // The parallax: CSS does it where scroll-driven animation exists; here is the rest.
  var cssParallax = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');
  var portfolio = $('#portfolio'), layers = $$('.px-layer');
  var DEPTH = [[0.12, -0.02], [0.34, 0.03], [0.7, -0.06]];
  function parallax() {
    if (cssParallax || !portfolio) return;
    if (!motion) { layers.forEach(function (l) { l.style.removeProperty('--px-y'); l.style.removeProperty('--px-x'); }); return; }
    var r = portfolio.getBoundingClientRect(), vh = window.innerHeight;
    var p = Math.max(-1, Math.min(1, ((vh - r.top) / (vh + r.height)) * 2 - 1));
    layers.forEach(function (l, i) {
      l.style.setProperty('--px-y', (p * DEPTH[i][0] * vh).toFixed(1) + 'px');
      l.style.setProperty('--px-x', (p * DEPTH[i][1] * window.innerWidth).toFixed(1) + 'px');
    });
  }

  // A click on the mode-line flies to the bottom. With motion on, the scroll is ours, not the
  // browser's, so it can ease in and out and tell the cards how fast it is going.
  var flying = false;
  function fly(done) {
    var start = window.scrollY, end = doc.documentElement.scrollHeight - window.innerHeight;
    if (!motion || Math.abs(end - start) < 4) { window.scrollTo({ top: end, behavior: 'instant' }); done(); return; }
    if (flying) return;
    flying = true;
    var dist = end - start, ms = Math.min(2400, 700 + Math.abs(dist) * 0.25), t0 = performance.now(), prev = start;
    var cancelled = false;
    // A wheel, a touch or a key takes the page back from the animation at once.
    function cancel() { cancelled = true; }
    var stops = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    // Armed a tick later, so the key that started the flight does not also stop it.
    window.setTimeout(function () {
      if (flying) stops.forEach(function (t) { window.addEventListener(t, cancel, { passive: true, once: true }); });
    }, 0);
    html.style.scrollBehavior = 'auto';
    body.classList.add('flying');
    function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function step(now) {
      var f = cancelled ? 1 : Math.min(1, (now - t0) / ms), y = cancelled ? window.scrollY : start + dist * ease(f);
      window.scrollTo(0, y);
      var vel = Math.max(-6, Math.min(6, (y - prev) / 12));
      prev = y;
      body.style.setProperty('--vel', vel.toFixed(2));
      body.style.setProperty('--vel-abs', Math.abs(vel).toFixed(2));
      if (f < 1) { window.requestAnimationFrame(step); return; }
      stops.forEach(function (t) { window.removeEventListener(t, cancel); });
      body.classList.remove('flying');
      body.style.removeProperty('--vel'); body.style.removeProperty('--vel-abs');
      html.style.scrollBehavior = '';
      flying = false;
      if (!cancelled) done();
    }
    window.requestAnimationFrame(step);
  }
  var prompt = $('#prompt');
  function toPrompt() { fly(function () { if (prompt) prompt.focus({ preventScroll: true }); }); }
  $('.ml-link', ml).addEventListener('click', function (ev) { ev.preventDefault(); toPrompt(); });

  // ---- the prompt ---------------------------------------------------------------------------------
  var echo = $('#echo'), results = $('#results'), history = [], hpos = 0, timer = null;
  var HELP = 'Type what you are looking for: a subject (emacs, games, mutual aid), what you would do ' +
    '(play, build, learn), whose work (Bryant’s), or how to see it (numbers, facts, something that moves). ' +
    'Misspellings are fine. Escape clears.';

  function say(text) {
    // Clear, then set, so a repeated message is read again.
    echo.textContent = '';
    window.setTimeout(function () { echo.textContent = text; }, 50);
  }

  function reset() {
    lastQuery = null;
    cards.forEach(function (c) { c.classList.remove('is-hidden', 'is-match'); c.style.removeProperty('order'); });
    results.textContent = '';
  }

  function run(text, announce) {
    var wasBottom = html.classList.contains('at-bottom');
    runQuery(text, announce);
    if (wasBottom) window.scrollTo({ top: doc.documentElement.scrollHeight, behavior: 'instant' });
    onScroll();
  }

  // The quick filters and the prompt are two ways to narrow the same deck; using one clears the
  // other, so what the echo counts is what you see.
  var allFilter = $('#f-all');
  function clearFilters() { if (allFilter && !allFilter.checked) allFilter.checked = true; }

  function runQuery(text, announce) {
    text = text.trim();
    if (!text) { reset(); if (announce) say('Showing all ' + total + ' cards.'); return; }
    if (text !== '?' && !/^help$/i.test(text)) clearFilters();
    if (text === '?' || /^help$/i.test(text)) { say(HELP); return; }
    if (!model) { say('The search could not start, so every card stays shown.'); return; }
    var res = window.Taxonomy.query(model, text);
    if (!res.items.length) {
      reset();
      lastQuery = res.view ? { view: res.view } : null;
      say(window.Taxonomy.describe(res, total));
      return;
    }
    lastQuery = res;
    var rank = {};
    res.items.forEach(function (it, i) { rank[it.slug] = i; });
    cards.forEach(function (c) {
      var r = rank[c.dataset.slug];
      c.classList.toggle('is-hidden', r === undefined);
      c.classList.toggle('is-match', r !== undefined);
      if (r === undefined) c.style.removeProperty('order'); else c.style.order = String(r);
    });
    var ol = doc.createElement('ol');
    res.items.forEach(function (it) {
      var li = doc.createElement('li'), b = doc.createElement('button'), why = doc.createElement('span');
      b.type = 'button'; b.textContent = it.title; b.dataset.slug = it.slug;
      why.className = 'why'; why.textContent = ' — ' + it.why.join(', ');
      li.appendChild(b); li.appendChild(why); ol.appendChild(li);
    });
    results.textContent = '';
    results.appendChild(ol);
    say(window.Taxonomy.describe(res, total));
  }

  results.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-slug]');
    if (!b) return;
    var card = doc.getElementById(b.dataset.slug);
    if (card) openCard(card, preferred(card), true);
    else if (home) window.location.href = home + '#' + encodeURIComponent(b.dataset.slug);
  });

  if (prompt) {
    $('#mb-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = prompt.value.trim();
      if (v && history[history.length - 1] !== v) history.push(v);
      hpos = history.length;
      run(v, true);
    });
    prompt.addEventListener('input', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { run(prompt.value, true); }, 180);
    });
    prompt.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || (ev.ctrlKey && ev.key === 'g')) {
        ev.preventDefault();
        if (prompt.value) { prompt.value = ''; run('', true); } else { say('Quit'); }
      } else if (ev.key === 'ArrowUp' && history.length) {
        ev.preventDefault(); hpos = Math.max(0, hpos - 1); prompt.value = history[hpos];
      } else if (ev.key === 'ArrowDown' && history.length) {
        ev.preventDefault(); hpos = Math.min(history.length, hpos + 1); prompt.value = history[hpos] || '';
      }
    });
  }

  $$('.filters input').forEach(function (r) {
    r.addEventListener('change', function () {
      if (prompt && prompt.value) prompt.value = '';
      reset();
      var n = cards.filter(function (c) { return c.offsetParent !== null; }).length;
      say(r.value ? n + ' cards you would ' + r.value.split(':')[1] + '.' : 'Showing all ' + n + ' cards.');
    });
  });

  html.setAttribute('data-ready', model ? 'yes' : 'no-search');
})();
// @license-end
