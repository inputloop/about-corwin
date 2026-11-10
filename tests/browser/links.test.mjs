// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/browser/links.test.mjs   The links area (DESIGN.md, "The links area: end
// credits"), served over http with the real CSP header from src/.htaccess, at 1280 and 390 pixels,
// light and dark, en-US and de-DE. Needs `python3 build.py` first and the playwright package.
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
const SHOTS = process.env.SHOTS;
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

async function open(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US', ...ctxOpts });
  const p = await ctx.newPage();
  p.errors = []; p.late = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error('CSP: ' + e.violatedDirective)));
  await p.goto(BASE, { waitUntil: 'load' });
  if (ctxOpts.javaScriptEnabled !== false) await p.waitForSelector('html[data-customize=ready]');
  await p.evaluate(() => document.fonts.ready);
  p.on('request', (r) => p.late.push(r.url()));
  return p;
}
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } }

// WCAG 2.1 contrast of two computed colours (rgb or rgba over the panel).
function contrastIn(page, sel, bgSel) {
  return page.evaluate(([s, b]) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, bl]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
    const bg = lum(rgb(getComputedStyle(document.querySelector(b)).backgroundColor));
    return [...document.querySelectorAll(s)].map((el) => { const L = lum(rgb(getComputedStyle(el).color)); return (Math.max(L, bg) + 0.05) / (Math.min(L, bg) + 0.05); });
  }, [sel, bgSel]);
}

for (const [w, h] of [[1280, 860], [390, 844]]) for (const scheme of ['light', 'dark']) for (const locale of ['en-US', 'de-DE']) {
  test(`${w}px ${scheme} ${locale}: the tab sits clear of Customize; the credits open in the frame, fetch nothing, and read at AA`, { skip }, async () => {
    const p = await open({ viewport: { width: w, height: h }, colorScheme: scheme, locale });
    const box = (s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    const tab = await box('#credits > summary'), cust = await box('#custom-btn');
    assert.ok(tab.r <= cust.l, `the Links tab (${tab.l}-${tab.r}) ends before Customize begins (${cust.l})`);
    assert.ok(tab.t <= 1 && tab.l >= 0, 'the tab hangs from the top edge, in the frame');
    await p.click('#credits > summary');
    assert.equal(await p.$eval('#credits', (d) => d.open), true);
    const panel = await box('.credits-panel');
    assert.ok(panel.l >= 0 && panel.r <= w && panel.b <= h, `panel in the frame: ${JSON.stringify(panel)}`);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    assert.equal(await p.$eval('.cr-names a', (a) => document.fonts.check('20px "League Gothic"') && getComputedStyle(a).fontFamily.startsWith('"League Gothic"')), true, 'the credits font is in use');
    for (const r of await contrastIn(p, '.cr-names a, .cr-role, .cr-title, .cr-give, .cr-note, .cr-support', '.credits-panel')) assert.ok(r >= 4.5, `contrast ${r.toFixed(2)} below AA`);
    assert.deepEqual(p.late, [], 'opening the links fetches nothing');
    assert.deepEqual(p.errors, []);
    await shot(p, `links-${w}-${scheme}-${locale}`);
    await p.context().close();
  });
}

test('one panel at a time; Escape closes the links and gives focus back to the tab', { skip }, async () => {
  const p = await open();
  await p.click('#credits > summary');
  await p.click('#custom-btn');
  await p.waitForFunction(() => !document.getElementById('credits').open, null, { timeout: 2000 }).catch(() => {});
  assert.equal(await p.$eval('#credits', (d) => d.open), false, 'pinning Customize closes the links');
  assert.equal(await p.getAttribute('#custom-btn', 'aria-expanded'), 'true');
  await p.click('#credits > summary');
  await p.waitForFunction(() => document.getElementById('custom-btn').getAttribute('aria-expanded') === 'false', null, { timeout: 2000 }).catch(() => {});
  assert.equal(await p.getAttribute('#custom-btn', 'aria-expanded'), 'false', 'opening the links closes Customize');
  await p.focus('.cr-names a');
  await p.keyboard.press('Escape');
  assert.equal(await p.$eval('#credits', (d) => d.open), false);
  assert.equal(await p.evaluate(() => document.activeElement.classList.contains('credits-btn')), true);
  await p.context().close();
});

test('keyboard: Tab reaches the Links tab before Customize, and Enter opens it', { skip }, async () => {
  const p = await open();
  const order = [];
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => document.activeElement.id || document.activeElement.className)); }
  assert.ok(order.indexOf('credits-btn') >= 0 && order.indexOf('credits-btn') < order.indexOf('custom-btn'), order.join(' '));
  await p.focus('#credits > summary');
  await p.keyboard.press('Enter');
  assert.equal(await p.$eval('#credits', (d) => d.open), true);
  await p.context().close();
});

test('without scripts the links still open and close', { skip }, async () => {
  const p = await open({ javaScriptEnabled: false });
  assert.ok(await p.isVisible('#credits > summary'));
  await p.click('#credits > summary');
  assert.ok(await p.isVisible('.cr-roll'));
  await p.click('#credits > summary');
  assert.equal(await p.isVisible('.cr-roll'), false);
  await p.context().close();
});

// The site's calm rule leaves transitions at 0.01 ms; anything longer would move.
test('reduced motion: nothing in the links area moves', { skip }, async () => {
  const p = await open({ reducedMotion: 'reduce' });
  await p.click('#credits > summary');
  const moving = await p.$$eval('#credits, #credits *', (els) => els.filter((e) => { const s = getComputedStyle(e); return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.001) || parseFloat(s.transitionDuration) > 0.001; }).length);
  assert.equal(moving, 0);
  await p.context().close();
});
