// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/browser/builds.test.mjs   js/builds.js in a real browser, against a page carrying the builds
// card as build.py's render_ci writes it and a fake feed on the same site, under a policy that allows connecting
// to this site only.  B1 the feed agrees: every row "checked".  B2 the feed has a newer build: that row replaced
// and "updated", its upstream source link made from data-upstream.  B3 the feed answers 404, and B4 never answers:
// every row "not checked", the saved list stands, the reason said.  B5 a row that breaks the patterns (markup in a
// branch name) is dropped and never reaches the page.  B6 a card with no feed, or a feed on another site, asks
// nothing at all.  Mentat (for Corwin; claude-opus-5-5)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const JS = fs.readFileSync(path.join(ROOT, 'src', 'js', 'builds.js'), 'utf8');
const UP = 'https://github.com/emacs-mirror/emacs/commit/{rev}';

const SAVED = [
  { branch: 'emacs-31', latest: 'emacs-31-205ae0', date: '2026-11-11.05' },
  { branch: 'emacs-32', latest: 'emacs-32-367f7c7', date: '2026-11-10.23' },
];
function li(r) {
  const [d, h] = r.date.split('.');
  const m = /^emacs-\d+-([0-9a-f]{6,40})$/.exec(r.latest);
  const up = m ? ` <a class="up" href="${UP.replace('{rev}', m[1])}">source</a>` : '';
  return `<li data-branch="${r.branch}" data-latest="${r.latest}" data-when="${d}T${h}"><a href="https://corwin.bru.st/${r.branch}/">${r.branch}</a> <span class="what">${r.latest}</span> <time class="when" datetime="${d}T${h}">${d} ${h}h</time>${up}</li>`;
}
function page(feed) {
  return `<!doctype html><meta charset="utf-8"><title>t</title><section class="side-card"><h3>Recent Emacs builds</h3>` +
    `<ul class="builds" data-feed="${feed}" data-upstream="${UP}" data-blog="https://corwin.bru.st/">${SAVED.map(li).join('')}</ul>` +
    `<p class="src">saved</p><p class="ci-live" role="status" hidden></p></section><script src="/builds.js"></script>`;
}
const NEWER = [SAVED[0], { branch: 'emacs-32', latest: 'emacs-32-abcdef1', date: '2026-11-11.09' }];
const HOSTILE = [...SAVED, { branch: '<img src=x onerror=alert(1)>', latest: 'x', date: '2026-11-11.10' }];

let server, base, browser, asked = [];
before(async () => {
  server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u.startsWith('/feed')) asked.push(u);
    const csp = { 'content-security-policy': "default-src 'self'; script-src 'self'; connect-src 'self'" };
    if (u === '/builds.js') { res.writeHead(200, { 'content-type': 'text/javascript', ...csp }); return res.end(JS); }
    if (u.startsWith('/page/')) { res.writeHead(200, { 'content-type': 'text/html', ...csp }); return res.end(page(decodeURIComponent(u.slice(6)))); }
    if (u === '/feed-same') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(SAVED)); }
    if (u === '/feed-newer') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(NEWER)); }
    if (u === '/feed-hostile') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(HOSTILE)); }
    if (u === '/feed-slow') { return; }   // never answers
    res.writeHead(404); res.end('no');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = require('playwright');
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); server.closeAllConnections?.(); server.close(); });

async function open(feed, waitFor) {
  const p = await browser.newPage();
  await p.goto(base + '/page/' + encodeURIComponent(feed));
  if (waitFor) await p.waitForFunction((t) => (document.querySelector('.ci-live') || {}).textContent.includes(t), waitFor, { timeout: 12000 });
  return p;
}
const states = (p) => p.$$eval('ul.builds li', (ls) => ls.map((l) => (l.querySelector('.chk') || {}).textContent || ''));

test('B1 the feed agrees: every row checked', async () => {
  const p = await open('/feed-same', 'Checked');
  assert.deepEqual(await states(p), ['✓ checked', '✓ checked']);
  assert.match(await p.textContent('.ci-live'), /saved copy is current/);
  await p.close();
});

test('B2 a newer build: that row replaced, marked updated, its source linked upstream', async () => {
  const p = await open('/feed-newer', 'Checked');
  assert.deepEqual(await states(p), ['✓ updated', '✓ checked']);
  const first = await p.$eval('ul.builds li', (l) => [l.dataset.latest, l.querySelector('.up').href, l.querySelector('time').textContent]);
  assert.deepEqual(first, ['emacs-32-abcdef1', 'https://github.com/emacs-mirror/emacs/commit/abcdef1', '2026-11-11 09h']);
  assert.match(await p.textContent('.ci-live'), /1 row is newer/);
  await p.close();
});

test('B3 a feed that answers 404: not checked, the saved list stands, the reason said', async () => {
  const p = await open('/feed-missing', 'Could not');
  assert.deepEqual(await states(p), ['⚠ not checked', '⚠ not checked']);
  assert.match(await p.textContent('.ci-live'), /404/);
  assert.equal(await p.$$eval('ul.builds li', (ls) => ls.length), 2);
  await p.close();
});

test('B4 a feed that never answers: given up after 8 seconds, said so', async () => {
  const p = await open('/feed-slow', 'Could not');
  assert.match(await p.textContent('.ci-live'), /no answer in 8 seconds/);
  await p.close();
});

test('B5 a row that breaks the patterns is dropped and never reaches the page', async () => {
  const p = await open('/feed-hostile', 'Checked');
  assert.equal(await p.$$eval('ul.builds li', (ls) => ls.length), 2);
  assert.equal(await p.$('ul.builds img'), null);
  await p.close();
});

test('B6 no feed, or a feed on another site: nothing is asked', async () => {
  asked = [];
  for (const feed of ['', 'https://example.org/feed-same', '//example.org/feed-same']) {
    const p = await open(feed);
    await p.waitForTimeout(400);
    assert.equal(await p.$eval('.ci-live', (e) => e.hidden), true);
    await p.close();
  }
  assert.deepEqual(asked, []);
});
