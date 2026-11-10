// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/browser/privacy.test.mjs   What this site remembers (Corwin, 2026-11-04: "keep
// on-device remembering, and say so ... with a one-press 'forget my settings'"): Forget my settings
// clears every key the site keeps and says so, and the Motion and Customize links land on each page's
// own note. Served over http with the real CSP header from src/.htaccess. Needs
// `python3 build.py` first and the playwright package. tests/py/test_privacy.py holds the note to
// exactly the keys the scripts write.
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
const OUT = process.env.SITE_OUT || path.join(ROOT, 'public');
const CSP = fs.readFileSync(path.join(ROOT, 'src', '.htaccess'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }))); } catch (e2) { chromium = null; }
}
const skip = chromium ? false : 'playwright is not installed (npm install, then npx playwright install chromium)';
const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
let browser, server, BASE;
before(async () => {
  if (!chromium) return;
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(OUT, path.normalize(p));
    if (!f.startsWith(OUT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(opts);
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(ctx, where = '') {
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(BASE + where, { waitUntil: 'load' });
  await p.waitForSelector('html[data-customize=ready]');
  return p;
}
const kept = (p) => p.evaluate(() => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k.filter((x) => x.indexOf('aboutcorwin.') === 0).sort(); });
// In view once any smooth scroll has settled (motion on scrolls smoothly); false after 4 s.
const inView = (p) => p.waitForFunction(() => { const r = document.getElementById('privacy').getBoundingClientRect(); return location.hash === '#privacy' && r.top >= 0 && r.top < window.innerHeight; }, null, { timeout: 4000 }).then(() => true, () => false);

test('Forget my settings clears every key the site keeps, and says so', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US' });
  const p = await open(ctx);
  assert.deepEqual(await kept(p), [], 'a fresh visit keeps nothing');
  await p.click('#motion');
  await p.click('#custom-btn');
  await p.check('input[name=size][value="2"]');
  await p.click('#c-apply');
  await p.check('input[name=tone-invert]');
  assert.deepEqual(await kept(p), ['aboutcorwin.customize', 'aboutcorwin.motion', 'aboutcorwin.tone'], 'Motion, Customize and the tone rows each keep their key');
  await p.click('#custom-btn');
  await p.click('#forget');
  assert.deepEqual(await kept(p), [], 'Forget my settings left keys behind');
  assert.match(await p.textContent('#forgot'), /^Forgotten\./, 'it says so');
  await p.click('#forget');
  assert.match(await p.textContent('#forgot'), /^Nothing from this site was stored/, 'a second press says there was nothing');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('the Motion and Customize links land on the note, from both pages', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US' });
  let p = await open(ctx);
  await p.click('.motion-control a[href="#privacy"]');
  await p.waitForFunction(() => location.hash === '#privacy');
  assert.ok(await inView(p), 'the Motion link reaches the note');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#custom-btn');
  await p.click('#custom-panel .c-note a[href="#privacy"]');
  await p.waitForFunction(() => location.hash === '#privacy');
  assert.ok(await inView(p), 'the Customize link reaches the note');
  await p.close();
  for (const sel of ['.motion-control a', '#custom-panel .c-note a']) {
    p = await open(ctx, 'cast/index.html');
    if (sel.startsWith('#custom')) await p.click('#custom-btn');
    await p.click(sel);
    assert.ok(await inView(p), `the cast page's ${sel} reaches the cast page's own note`);
    await p.close();
  }
  await ctx.close();
});

test('the cast page has its own note, and its Forget my settings works there', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US' });
  const p = await open(ctx, 'cast/index.html');
  await p.click('#motion');
  assert.deepEqual(await kept(p), ['aboutcorwin.motion']);
  await p.click('#forget');
  assert.deepEqual(await kept(p), [], 'Forget my settings on the cast page left keys behind');
  assert.match(await p.textContent('#forgot'), /^Forgotten\./);
  await ctx.close();
});

test('with scripts off the note still reads, and the Forget line is not offered', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'load' });
  assert.ok(await p.isVisible('#privacy'));
  assert.ok(await p.isVisible('.privacy-keys'));
  assert.ok(!(await p.isVisible('#forget')), 'nothing is kept without scripts, so there is nothing to forget');
  await ctx.close();
});
