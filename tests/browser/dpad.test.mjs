// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/browser   The tone d-pads in a real browser, served with the site's real
// Content-Security-Policy header (read from src/.htaccess): the arms change the texts, a section
// can differ from the page, the keys, the invert option, storage under one key and no network,
// the glow under the CSP, reduced motion, the page pad keeping clear of the section pads at many
// widths, text sizes and scroll stops, and focus bringing it home. SHOTS=dir keeps screenshots.
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference', locale: 'en-US', ...ctxOpts });
  const p = await ctx.newPage();
  p.errors = []; p.late = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error('CSP: ' + e.violatedDirective)));
  await p.goto(BASE);
  if (ctxOpts.javaScriptEnabled !== false) await p.waitForSelector('html[data-tone-ready]');
  p.on('request', (r) => p.late.push(r.url()));
  return p;
}
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } }
const cell = (p, unit) => p.$eval(`[data-unit="${unit}"]:not(template)`, (el) => el.getAttribute('data-cell') || 'plain-8');
const text = (p, unit) => p.$eval(`[data-unit="${unit}"]:not(template)`, (el) => el.textContent);
const tpl = (p, unit, c) => p.$eval(`template[data-unit="${unit}"][data-cell="${c}"]`, (t) => t.content.textContent);
const stored = (p) => p.evaluate(() => localStorage.getItem('aboutcorwin.tone'));
// Wait until the page pad has settled after whatever just moved the page: two frames for the
// scroll event to reach dpad.js (which clears data-settled), then the flag.
async function settled(p) {
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForFunction(() => document.getElementById('tone-dock').getAttribute('data-settled') === 'yes', null, { timeout: 5000 });
}
// Bring a section pad to the middle of the window, clear of the fixed Customize button, and click.
async function press(p, scope, move) {
  await p.$eval(`.dpad[data-scope="${scope}"]`, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await settled(p);
  await p.click(`.dpad[data-scope="${scope}"] [data-move="${move}"]`);
}

test('without scripts: no pads, the words as written', { skip }, async () => {
  const p = await open({ javaScriptEnabled: false });
  const shown = await p.$$eval('.dpad', (ps) => ps.filter((x) => x.offsetParent).length);
  assert.equal(shown, 0);
  assert.match(await text(p, 'about'), /I am a systems engineer and software developer\./);
  await p.context().close();
});

test('the page pad moves every text; a section pad moves only its own; the centre puts it back', { skip }, async () => {
  const p = await open();
  assert.equal(await cell(p, 'about'), 'plain-8');
  await p.click('#tone-dock [data-move="left"]');
  for (const u of ['about', 'involvements', 'portfolio', 'work', 'ideas']) {
    assert.equal(await cell(p, u), 'warm-8', u);
    assert.equal(await text(p, u), await tpl(p, u, 'warm-8'), u);
  }
  await p.click('#tone-dock [data-move="up"]');
  assert.equal(await cell(p, 'about'), 'warm-12', 'up is harder');
  await press(p, 'involvements', 'right');
  assert.equal(await cell(p, 'involvements'), 'plain-12');
  assert.equal(await cell(p, 'about'), 'warm-12', 'the About did not follow the section pad');
  assert.ok(await p.$('.dpad[data-scope="involvements"].is-own'));
  await press(p, 'involvements', 'left');
  assert.equal(await cell(p, 'involvements'), 'warm-12');
  assert.equal(JSON.parse(await stored(p)).sections.involvements, undefined, 'back to the page tone drops the override');
  await p.waitForFunction(() => /Whole page|Where I put my time/.test(document.getElementById('tone-say').textContent));
  await p.click('#tone-dock [data-move="reset"]');
  assert.equal(await cell(p, 'about'), 'plain-8');
  assert.equal(await stored(p), null, 'standard settings leave nothing stored');
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.late, [], 'nothing fetched');
  await p.context().close();
});

test('the ends of an axis are marked, and the keys from the plan work', { skip }, async () => {
  const p = await open();
  await p.keyboard.press('Control+Shift+ArrowDown');
  assert.equal(await cell(p, 'about'), 'plain-4');
  assert.equal(await p.getAttribute('#tone-dock [data-move="down"]', 'aria-disabled'), 'true');
  await p.keyboard.press('Control+Shift+Home');
  assert.equal(await cell(p, 'about'), 'plain-8');
  // Focus inside a section: Ctrl+arrows move that section only.
  await p.focus('.dpad[data-scope="portfolio"] [data-move="reset"]');
  await p.keyboard.press('Control+ArrowLeft');
  assert.equal(await cell(p, 'work'), 'warm-8');
  assert.equal(await cell(p, 'about'), 'plain-8');
  // On a focused pad: arrows, vi keys, Emacs keys, Home.
  await p.focus('#tone-dock [data-move="reset"]');
  await p.keyboard.press('ArrowRight'); assert.equal(await cell(p, 'about'), 'formal-8');
  await p.keyboard.press('k'); assert.equal(await cell(p, 'about'), 'formal-12');
  await p.keyboard.press('j'); assert.equal(await cell(p, 'about'), 'formal-8');
  await p.keyboard.press('h'); assert.equal(await cell(p, 'about'), 'plain-8');
  await p.keyboard.press('Control+b'); assert.equal(await cell(p, 'about'), 'warm-8');
  await p.keyboard.press('Control+p'); assert.equal(await cell(p, 'about'), 'warm-12');
  await p.keyboard.press('Control+f'); assert.equal(await cell(p, 'about'), 'plain-12');
  await p.keyboard.press('Home'); assert.equal(await cell(p, 'about'), 'plain-8');
  // Text fields are left alone, and Ctrl+Shift+arrows leave a selection to grow.
  // Each key is checked on its own, so two moves that would cancel out cannot hide a slip.
  await p.click('#prompt');
  await p.keyboard.type('emacs');
  await p.keyboard.press('Control+ArrowLeft');
  assert.equal(await cell(p, 'about'), 'plain-8', 'Ctrl+arrow in the prompt moved the tone');
  await p.keyboard.press('Control+Shift+ArrowLeft');
  assert.equal(await cell(p, 'about'), 'plain-8', 'Ctrl+Shift+arrow in the prompt moved the tone');
  await p.keyboard.press('Control+Shift+ArrowUp');
  assert.equal(await cell(p, 'about'), 'plain-8', 'Ctrl+Shift+up in the prompt moved the tone');
  await p.evaluate(() => { document.activeElement.blur(); const r = document.createRange(); r.selectNodeContents(document.querySelector('h1')); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await p.keyboard.press('Control+Shift+ArrowLeft');
  assert.equal(await cell(p, 'about'), 'plain-8', 'Ctrl+Shift+arrow took over a selection');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('Customize: the rows follow the pad, and the invert option swaps up and down, kept per browser', { skip }, async () => {
  const p = await open();
  await p.click('#custom-btn');
  await p.check('input[name="tone-w"][value="warm"]');
  await p.check('input[name="tone-g"][value="4"]');
  assert.equal(await cell(p, 'about'), 'warm-4');
  await p.check('input[name="tone-invert"]');
  await p.keyboard.press('Escape');
  await p.mouse.move(10, 500);
  assert.match(await p.getAttribute('#tone-dock [data-move="up"]', 'aria-label'), /^Simpler words/);
  assert.equal(await p.getAttribute('#tone-dock [data-move="down"]', 'aria-disabled'), 'false');
  await p.click('#tone-dock [data-move="down"]');
  assert.equal(await cell(p, 'about'), 'warm-8', 'inverted: down is harder');
  await p.reload();
  await p.waitForSelector('html[data-tone-ready]');
  assert.equal(await cell(p, 'about'), 'warm-8');
  assert.equal(await p.isChecked('input[name="tone-invert"]'), true);
  const keys = await p.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys.filter((k) => k !== 'aboutcorwin.motion' && k !== 'aboutcorwin.customize'), ['aboutcorwin.tone']);
  await p.context().close();
});

test('the browser\'s language: German starts simpler and says so; British English does not', { skip }, async () => {
  const de = await open({ locale: 'de-DE' });
  for (const u of ['about', 'involvements', 'portfolio', 'work', 'ideas']) assert.equal(await cell(de, u), 'plain-4', u);
  assert.equal(await de.isVisible('#tone-lang'), true, 'the line is shown');
  assert.equal(await de.textContent('#tone-lang'), 'Starting with simpler English because your browser prefers German; the pad changes it.');
  assert.equal(await stored(de), null, 'starting simpler is not a saved choice');
  await de.click('#custom-btn');
  assert.equal(await de.isChecked('input[name="tone-g"][value="4"]'), true, 'the Reading row shows where it started');
  assert.equal(await de.isChecked('input[name="tone-lang"]'), true, 'the row is on by default');
  assert.deepEqual(de.errors, []);
  assert.deepEqual(de.late, [], 'nothing fetched');
  await de.context().close();
  for (const locale of ['en-GB', 'en-US']) {
    const en = await open({ locale });
    assert.equal(await cell(en, 'about'), 'plain-8', locale);
    assert.equal(await en.isVisible('#tone-lang'), false, locale + ': no line');
    await en.context().close();
  }
});

test('the browser\'s language: a saved choice wins, a pad makes it the reader\'s, and the row turns it off', { skip }, async () => {
  const p = await open({ locale: 'de-DE' });
  // Moving a pad: the choice is the reader's, kept, and the line goes.
  await p.click('#tone-dock [data-move="up"]');
  assert.equal(await cell(p, 'about'), 'plain-8');
  assert.equal(await p.isVisible('#tone-lang'), false, 'the line goes once the reader chooses');
  await p.reload(); await p.waitForSelector('html[data-tone-ready]');
  assert.equal(await cell(p, 'about'), 'plain-8', 'a saved choice wins over the language, even the words as written');
  assert.equal(await p.isVisible('#tone-lang'), false);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForSelector('html[data-tone-ready]');
  assert.equal(await cell(p, 'about'), 'plain-4', 'with nothing saved it starts simpler again');
  // The row: off puts the words as written and stays off across a reload; on brings it back.
  await p.click('#custom-btn');
  await p.uncheck('input[name="tone-lang"]');
  assert.equal(await cell(p, 'about'), 'plain-8');
  assert.equal(await p.isVisible('#tone-lang'), false);
  await p.reload(); await p.waitForSelector('html[data-tone-ready]');
  assert.equal(await cell(p, 'about'), 'plain-8', 'the row stays off in this browser');
  await p.click('#custom-btn');
  assert.equal(await p.isChecked('input[name="tone-lang"]'), false);
  await p.check('input[name="tone-lang"]');
  assert.equal(await cell(p, 'about'), 'plain-4');
  assert.equal(await stored(p), null, 'back on and nothing chosen: nothing kept');
  const keys = await p.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys.filter((k) => k !== 'aboutcorwin.motion' && k !== 'aboutcorwin.customize'), []);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('the glow follows the pointer by quadrant, under the real CSP header', { skip }, async () => {
  const p = await open();
  // Hovering brings the pad home first, so measure it once the pointer is over it.
  const r0 = await p.$eval('#tone-dock .dpad', (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(r0.x, r0.y);
  await settled(p);
  const r = await p.$eval('#tone-dock .dpad', (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  for (const [dx, dy, want] of [[0.5, 0.12, 'up'], [0.12, 0.5, 'left'], [0.88, 0.5, 'right'], [0.5, 0.88, 'down']]) {
    await p.mouse.move(r.x + r.w * dx, r.y + r.h * dy);
    assert.equal(await p.getAttribute('#tone-dock .dpad', 'data-hot'), want);
  }
  const gx = await p.$eval('#tone-dock .dpad', (el) => getComputedStyle(el).getPropertyValue('--gx').trim());
  assert.match(gx, /px$/, 'the glow position did not reach the style (blocked by the CSP?)');
  await shot(p, 'dpad-glow-1280');
  assert.deepEqual(p.errors.filter((e) => e.startsWith('CSP')), []);
  await p.context().close();
});

test('reduced motion: no glow, and the page pad jumps to where it settles', { skip }, async () => {
  const p = await open({ reducedMotion: 'reduce' });
  const r = await p.$eval('#tone-dock .dpad', (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 4 }; });
  await p.mouse.move(r.x, r.y);
  assert.equal(await p.getAttribute('#tone-dock .dpad', 'data-hot'), null);
  // Hovering holds the pad home, which would hide the reduced-motion path: move away first.
  await p.mouse.move(10, 500);
  await settled(p);
  const now = await p.evaluate(() => {
    const pad = document.querySelector('.dpad[data-scope="involvements"]');
    window.scrollTo({ top: pad.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    return [document.getElementById('tone-dock').getAttribute('data-settled'), getComputedStyle(document.getElementById('tone-dock')).getPropertyValue('--tilt').trim()];
  });
  assert.deepEqual(now, ['yes', '0.00deg']);
  await p.context().close();
});

// The sweep: every section pad is scrolled through the top of the window in 17 stops; at each,
// once the page pad has settled, it overlaps no section pad (measured against the inset box the
// formula uses) and sits wholly inside the window.
async function sweep(p, label) {
  const scopes = await p.$$eval('.dpad-wrap .dpad', (ps) => ps.map((x) => x.dataset.scope));
  const bad = [];
  for (const s of scopes) {
    for (let i = 0; i <= 16; i++) {
      await p.evaluate(([s, i]) => {
        const el = document.querySelector(`.dpad[data-scope="${s}"]`), y = el.getBoundingClientRect().top + scrollY;
        window.scrollTo({ top: Math.max(0, y - innerHeight * (i / 16) * 0.5), behavior: 'instant' });
      }, [s, i]);
      await settled(p);
      const m = await p.evaluate(() => {
        const g = document.querySelector('#tone-dock .dpad').getBoundingClientRect();
        const hits = [...document.querySelectorAll('.dpad-wrap .dpad')].map((el) => {
          const r = el.getBoundingClientRect(), k = 0.15 * Math.min(r.width, r.height);
          return g.left < r.right - k && g.right > r.left + k && g.top < r.bottom - k && g.bottom > r.top + k ? el.dataset.scope : null;
        }).filter(Boolean);
        const out = g.left < 0 || g.top < 0 || g.right > document.documentElement.clientWidth || g.bottom > innerHeight;
        return { hits, out };
      });
      if (m.hits.length || m.out) bad.push(`${label} ${s} stop ${i}: ${m.hits.join(',')}${m.out ? ' out of frame' : ''}`);
    }
  }
  return bad;
}

for (const [w, h] of [[1280, 860], [768, 900], [640, 800], [390, 780], [320, 640]]) {
  test(`${w}px (${w <= 640 ? 'or 1280 at ' + Math.round(1280 / w * 100) + '% zoom' : 'no zoom'}): the page pad keeps clear of every section pad`, { skip }, async () => {
    const p = await open({ viewport: { width: w, height: h } });
    const bad = await sweep(p, `${w}px`);
    await p.click('#custom-btn'); await p.check('input[name=size][value="4"]'); await p.click('#c-apply'); await p.keyboard.press('Escape');
    bad.push(...await sweep(p, `${w}px 175%`));
    assert.deepEqual(bad, []);
    if (SHOTS) {
      await p.evaluate(() => { const el = document.querySelector('.dpad[data-scope="involvements"]'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 30, behavior: 'instant' }); });
      await settled(p);
      await shot(p, `dpad-dodge-${w}`);
    }
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `sideways scroll ${sw} > ${cw}`);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
}

test('focus brings the page pad fully home, and nothing covers the focused arm', { skip }, async () => {
  const p = await open({ viewport: { width: 390, height: 780 } });
  await p.evaluate(() => { const el = document.querySelector('.dpad[data-scope="involvements"]'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' }); });
  await settled(p);
  const moved = await p.evaluate(() => window.ToneDpad.drift.offset());
  assert.ok(Math.abs(moved.x) + Math.abs(moved.y) > 4, 'the page pad did not move out of the way at all');
  await p.focus('#tone-dock [data-move="up"]');
  await settled(p);
  assert.deepEqual(await p.evaluate(() => window.ToneDpad.drift.offset()), { x: 0, y: 0 });
  const top = await p.$eval('#tone-dock [data-move="up"]', (b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b === e || b.contains(e); });
  assert.ok(top, 'the focused arm is covered');
  await shot(p, 'dpad-focus-390');
  await p.context().close();
});
