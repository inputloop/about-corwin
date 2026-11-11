// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// builds.js: the "Recent Emacs builds" card, checked against the live build list.  The card is built from a
// saved copy of corwin.bru.st's emacs-latest.json, so it ages between builds of the page.  When the card names a
// feed (data-feed on ul.builds: an address on this same site), this asks it once, marks each row as being
// checked, and then marks it checked, puts in what changed, or says the check failed and the saved list stands.
// With no feed, or no scripts, the card is exactly as built.  Each value read must match the same patterns the
// build accepts (a branch, a build name, a date); anything else is dropped, so nothing but text reaches the page.
// Nothing is stored and nothing is sent: one GET to this same site, with no cookies.
// Mentat (for Corwin; claude-opus-5-5)
(function () {
  'use strict';
  var BRANCH = /^[a-z][a-z0-9-]{1,30}$/, LATEST = /^[A-Za-z0-9._,+-]{0,80}$/,
      DATE = /^(\d{4}-\d{2}-\d{2})\.(\d{2})$/, REV = /^emacs-\d+(?:\.\d+)*-([0-9a-f]{6,40})$/;
  var WAIT_MS = 8000, SHOW = 6;

  function mark(li, state, text, title) {
    var s = li.querySelector('.chk');
    if (!s) { s = document.createElement('span'); s.className = 'chk'; li.appendChild(document.createTextNode(' ')); li.appendChild(s); }
    s.setAttribute('data-state', state);
    s.textContent = text;
    s.title = title;
  }

  function rowsOf(data) {
    var out = [];
    if (!Array.isArray(data)) { return out; }
    data.forEach(function (r) {
      if (!r || typeof r !== 'object') { return; }
      var m = DATE.exec(String(r.date));
      if (m && BRANCH.test(String(r.branch)) && LATEST.test(String(r.latest || ''))) {
        out.push({ branch: r.branch, latest: r.latest || '', day: m[1], hour: m[2] });
      }
    });
    out.sort(function (a, b) { var x = a.day + a.hour, y = b.day + b.hour; return x < y ? 1 : x > y ? -1 : 0; });
    return out.slice(0, SHOW);
  }

  function upstream(ul, latest) {
    var m = REV.exec(latest), t = ul.getAttribute('data-upstream') || '';
    return m && t.indexOf('https://') === 0 ? t.replace('{rev}', m[1]) : '';
  }

  function build(ul, r) {   // one row, as the build writes it
    var li = document.createElement('li'), when = r.day + 'T' + r.hour;
    li.setAttribute('data-branch', r.branch); li.setAttribute('data-latest', r.latest); li.setAttribute('data-when', when);
    var a = document.createElement('a'); a.href = (ul.getAttribute('data-blog') || '') + r.branch + '/'; a.textContent = r.branch;
    var what = document.createElement('span'); what.className = 'what';
    what.textContent = r.branch === 'emacs-tree-sitter' ? 'grammars: ' + r.latest.split(',').join(', ') : (r.latest || 'installer links');
    var t = document.createElement('time'); t.className = 'when'; t.setAttribute('datetime', when); t.textContent = r.day + ' ' + r.hour + 'h';
    li.appendChild(a); li.appendChild(document.createTextNode(' ')); li.appendChild(what);
    li.appendChild(document.createTextNode(' ')); li.appendChild(t);
    var up = upstream(ul, r.latest);
    if (up) {
      var u = document.createElement('a'); u.className = 'up'; u.href = up; u.title = "this build's source, upstream"; u.textContent = 'source';
      li.appendChild(document.createTextNode(' ')); li.appendChild(u);
    }
    return li;
  }

  function clock() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function apply(ul, live, data) {
    var rows = rowsOf(data);
    if (!rows.length) { return fail(ul, live, 'the list came back empty or unreadable'); }
    var had = {}, changed = 0;
    Array.prototype.forEach.call(ul.querySelectorAll('li[data-branch]'), function (li) { had[li.getAttribute('data-branch')] = li; });
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var old = had[r.branch], same = old && old.getAttribute('data-latest') === r.latest &&
          old.getAttribute('data-when') === r.day + 'T' + r.hour;
      var li = same ? old : build(ul, r);
      if (same) { mark(li, 'ok', '✓ checked', 'the live list says the same'); }
      else { changed++; mark(li, 'new', '✓ updated', old ? 'newer than the saved list' : 'not in the saved list'); }
      frag.appendChild(li);
    });
    while (ul.firstChild) { ul.removeChild(ul.firstChild); }
    ul.appendChild(frag);
    live.textContent = '✓ Checked against the live list at ' + clock() + ' (your clock): ' +
        (changed ? changed + (changed === 1 ? ' row is' : ' rows are') + ' newer than the saved copy.' : 'the saved copy is current.');
  }

  function fail(ul, live, why) {
    Array.prototype.forEach.call(ul.querySelectorAll('li[data-branch]'), function (li) {
      mark(li, 'fail', '⚠ not checked', 'the live list could not be read');
    });
    live.textContent = '⚠ Could not check for newer builds (' + why + '); this is the saved list.';
  }

  function start() {
    var ul = document.querySelector('ul.builds[data-feed]');
    if (!ul) { return; }
    var feed = ul.getAttribute('data-feed') || '';
    if (!feed || feed.charAt(0) !== '/' || feed.charAt(1) === '/' || !window.fetch) { return; }   // same site only
    var live = ul.parentNode.querySelector('.ci-live');
    if (!live) { return; }
    Array.prototype.forEach.call(ul.querySelectorAll('li[data-branch]'), function (li) {
      mark(li, 'wait', '⋯ checking', 'asking the live list');
    });
    live.hidden = false;
    live.textContent = '⋯ Checking the live build list…';
    var ctl = window.AbortController ? new AbortController() : null, done = false;
    var timer = setTimeout(function () { if (!done) { done = true; if (ctl) { ctl.abort(); } fail(ul, live, 'no answer in ' + WAIT_MS / 1000 + ' seconds'); } }, WAIT_MS);
    fetch(feed, { cache: 'no-store', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) { throw new Error('the server said ' + r.status); } return r.json(); })
      .then(function (data) { if (!done) { done = true; clearTimeout(timer); apply(ul, live, data); } })
      .catch(function (e) { if (!done) { done = true; clearTimeout(timer); fail(ul, live, (e && e.message) || 'the request failed'); } });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
}());
// @license-end
