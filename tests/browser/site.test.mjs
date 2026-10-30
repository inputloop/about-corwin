// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/browser   The page in a real browser (Playwright's Chromium), with scripts off
// and on, with reduced motion, at phone width and in the dark. Needs `python3 build.py` first and
// the playwright package (`npm install` from package.json, or a global install). Set SHOTS=dir to
// keep screenshots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const OUT = process.env.SITE_OUT || path.join(ROOT, 'public');
const URL = pathToFileURL(path.join(OUT, 'index.html')).href;
const SHOTS = process.env.SHOTS;

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }))); } catch (e2) { chromium = null; }
}
const skip = chromium ? false : 'playwright is not installed (npm install, then npx playwright install chromium)';
const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
let browser;
before(async () => { if (chromium) browser = await chromium.launch(opts); });
after(async () => { if (browser) await browser.close(); });

async function page(context = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...context });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto(URL);
  if (context.javaScriptEnabled !== false) await p.waitForSelector('html[data-ready]');
  return p;
}
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } }
const visible = (p) => p.$$eval('.card', (cs) => cs.filter((c) => c.offsetParent !== null).map((c) => c.id));

test('without scripts: every card, its introduction, and the CSS-only filters', { skip }, async () => {
  const p = await page({ javaScriptEnabled: false });
  assert.equal(await p.$eval('html', (h) => h.classList.contains('js')), false);
  const all = await visible(p);
  assert.ok(all.length >= 18);
  await p.click('#dungeon summary');
  assert.ok(await p.isVisible('#dungeon .v-prose'));
  assert.ok(await p.isVisible('#dungeon .v-baseball'));
  assert.equal(await p.$('.viewbar'), null);
  assert.equal(await p.isVisible('#prompt'), false, 'the prompt is hidden when it cannot work');
  await p.click('label[for="f-play"]');
  assert.deepEqual((await visible(p)).sort(), ['dungeon', 'four-swords']);
  await p.click('label[for="f-all"]');
  assert.equal((await visible(p)).length, all.length);
  await shot(p, 'nojs');
  await p.context().close();
});

test('without scripts: the mode-line rides the bottom, and the minibuffer appears only at the end', { skip }, async () => {
  const p = await page({ javaScriptEnabled: false });
  const vh = 860;
  let ml = await p.$eval('#modeline', (e) => e.getBoundingClientRect().toJSON());
  assert.ok(Math.abs(ml.bottom - vh) < 2, `mode-line bottom ${ml.bottom}`);
  let mb = await p.$eval('#minibuffer', (e) => e.getBoundingClientRect().top);
  assert.ok(mb >= vh, 'minibuffer below the fold at the top');
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(100);
  ml = await p.$eval('#modeline', (e) => e.getBoundingClientRect().toJSON());
  mb = await p.$eval('#minibuffer', (e) => e.getBoundingClientRect().toJSON());
  assert.ok(mb.top >= ml.bottom - 1 && mb.bottom <= vh + 1, 'the second line has appeared under the mode-line');
  await p.context().close();
});

test('with scripts: windows become labelled buttons with moving pictures; no errors', { skip }, async () => {
  const p = await page();
  assert.equal(await p.getAttribute('html', 'data-ready'), 'yes');
  const btns = await p.$$eval('.card .face > button.window', (bs) => bs.map((b) => [b.getAttribute('aria-label'), b.title]));
  const cards = await p.$$eval('.card', (cs) => cs.length);
  assert.equal(btns.length, cards);
  for (const [label, title] of btns) { assert.match(label, /^More about /); assert.match(title, /^More about /); }
  assert.equal(await p.$$eval('.card .window canvas', (c) => c.length), cards);
  await p.waitForTimeout(300);
  const states = await p.$$eval('.card .window', (ws) => ws.slice(0, 3).map((w) => w.dataset.state));
  assert.ok(states.every((s) => s === 'moving' || s === 'still'));
  assert.deepEqual(p.errors, []);
  await shot(p, 'js-top');
  await p.context().close();
});

test('the mode-line says Top, a percentage, then Bot, and names the section', { skip }, async () => {
  const p = await page();
  assert.equal(await p.textContent('.ml-pos'), 'Top');
  await p.evaluate(() => document.querySelector('#work').scrollIntoView({ behavior: 'instant' }));
  await p.waitForTimeout(150);
  assert.match(await p.textContent('.ml-pos'), /^\d+%$/);
  assert.equal(await p.textContent('.ml-sec'), '*work*');
  await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await p.waitForTimeout(150);
  assert.equal(await p.textContent('.ml-pos'), 'Bot');
  assert.ok(await p.$eval('html', (h) => h.classList.contains('at-bottom')));
  await p.context().close();
});

test('clicking the mode-line flies to the bottom and opens the prompt', { skip }, async () => {
  const p = await page();
  await p.click('.ml-link');
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'prompt', null, { timeout: 5000 });
  assert.equal(await p.textContent('.ml-pos'), 'Bot');
  assert.ok(await p.isVisible('#prompt'));
  assert.equal(await p.$eval('body', (b) => b.classList.contains('flying')), false, 'flying ends');
  await shot(p, 'js-bottom');
  await p.context().close();
});

test('the prompt filters cards, says why, and Escape brings them all back', { skip }, async () => {
  const p = await page();
  const all = (await visible(p)).length;
  await p.click('.ml-link');
  await p.waitForFunction(() => document.activeElement.id === 'prompt');
  await p.keyboard.type('games');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => /cards for/.test(document.querySelector('#echo').textContent));
  const shown = await visible(p);
  assert.equal(shown[0] === 'four-swords' || shown.includes('four-swords'), true);
  assert.ok(shown.length < all && shown.includes('dungeon'));
  assert.equal(await p.$eval('#four-swords', (c) => getComputedStyle(c).order), '0');
  assert.ok((await p.$$eval('#results li', (l) => l.length)) === shown.length);
  assert.equal(await p.textContent('.ml-pos'), 'Bot', 'the page stays at the bottom while results change');
  await p.keyboard.press('Escape');
  await p.waitForFunction((n) => [...document.querySelectorAll('.card')].filter((c) => c.offsetParent).length === n, all);
  await p.keyboard.type('help');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => /Misspellings are fine/.test(document.querySelector('#echo').textContent));
  await p.context().close();
});

test('a click on the card opens the introduction; the window opens the featured view', { skip }, async () => {
  const p = await page();
  await p.click('#nexttime .face .role');
  assert.ok(await p.$eval('#nexttime', (c) => c.classList.contains('is-open')));
  assert.equal(await p.getAttribute('#nexttime', 'data-current'), 'prose');
  assert.ok(await p.isVisible('#nexttime .v-prose'));
  assert.equal(await p.isVisible('#nexttime .v-baseball'), false);
  await p.click('#nexttime .viewbar button[data-view="baseball"]');
  assert.ok(await p.isVisible('#nexttime .v-baseball'));
  await p.click('#nexttime .face > .window');
  assert.equal(await p.getAttribute('#nexttime', 'data-current'), 'featured');
  assert.equal(await p.getAttribute('#nexttime .face > .window', 'aria-expanded'), 'true');
  assert.equal(await p.$$eval('#nexttime .feature-slot canvas', (c) => c.length), 1);
  await shot(p, 'js-open');
  await p.click('#quantum3d5 .face .title');
  assert.equal(await p.$eval('#nexttime', (c) => c.classList.contains('is-open')), false, 'one open at a time');
  assert.equal(await p.$$eval('#nexttime .feature-slot canvas', (c) => c.length), 0, 'its big window is gone');
  await p.keyboard.press('Escape');
  assert.equal(await p.$eval('#quantum3d5', (c) => c.classList.contains('is-open')), false);
  assert.equal(await p.evaluate(() => document.activeElement.closest('.card').id), 'quantum3d5', 'focus returns to the card');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('the prompt steers what the window opens: numbers open the scoreboard', { skip }, async () => {
  const p = await page();
  await p.fill('#prompt', 'numbers for php');
  await p.press('#prompt', 'Enter');
  await p.waitForFunction(() => /the scoreboard/.test(document.querySelector('#echo').textContent));
  await p.click('#php-backport .face > .window');
  assert.equal(await p.getAttribute('#php-backport', 'data-current'), 'scoreboard');
  assert.ok(await p.isVisible('#php-backport .scoreboard'));
  await p.context().close();
});

test('keyboard: summary opens a card, / goes to the prompt', { skip }, async () => {
  const p = await page();
  await p.focus('#emacsconf summary');
  await p.keyboard.press('Enter');
  assert.ok(await p.$eval('#emacsconf', (c) => c.classList.contains('is-open')));
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true');
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('/');
  await p.waitForTimeout(200);
  assert.notEqual(await p.evaluate(() => document.activeElement.id), 'prompt', 'no single-key shortcuts');
  await p.keyboard.press('Alt+x');
  await p.waitForFunction(() => document.activeElement.id === 'prompt', null, { timeout: 5000 });
  await p.keyboard.type('games');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#results li button');
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement.closest('#results') !== null), true, 'Tab goes from the prompt to the results');
  await p.context().close();
});

test('reduced motion: still windows, no flight, and Motion can turn it back on', { skip }, async () => {
  const p = await page({ reducedMotion: 'reduce' });
  assert.ok(await p.$eval('html', (h) => h.classList.contains('motion-off')));
  assert.equal(await p.getAttribute('#motion', 'aria-pressed'), 'false');
  const states = await p.$$eval('.card .window', (ws) => [...new Set(ws.map((w) => w.dataset.state))]);
  assert.deepEqual(states, ['still']);
  await p.click('.ml-link');
  assert.equal(await p.$eval('body', (b) => b.classList.contains('flying')), false);
  await p.waitForFunction(() => document.activeElement.id === 'prompt');
  await p.click('#motion');
  assert.equal(await p.getAttribute('#motion', 'aria-pressed'), 'true');
  await p.waitForTimeout(100);
  assert.ok((await p.$$eval('.card .window', (ws) => ws.map((w) => w.dataset.state))).includes('moving'));
  await p.context().close();
});

test('the quick filters and the prompt clear each other, and the echo counts what is shown', { skip }, async () => {
  const p = await page();
  await p.click('label[for="f-play"]');
  assert.deepEqual((await visible(p)).sort(), ['dungeon', 'four-swords']);
  await p.waitForFunction(() => /^2 cards you would play/.test(document.querySelector('#echo').textContent));
  await p.fill('#prompt', 'php');
  await p.press('#prompt', 'Enter');
  await p.waitForFunction(() => /cards for php/.test(document.querySelector('#echo').textContent));
  assert.ok(await p.isChecked('#f-all'), 'the prompt clears the filter');
  const shown = await visible(p);
  const echo = await p.textContent('#echo');
  assert.ok(echo.startsWith(shown.length + ' of '), `${echo} vs ${shown.length} shown`);
  await p.click('label[for="f-learn"]');
  assert.equal(await p.inputValue('#prompt'), '', 'the filter clears the prompt');
  await p.context().close();
});

test('without scripts: the filters say how many cards are left', { skip }, async () => {
  const p = await page({ javaScriptEnabled: false });
  await p.click('label[for="f-play"]');
  // A counter's value is not readable from the DOM, so check the mechanism: every card counts
  // itself, a hidden card makes no box (so it cannot count), and the stage prints the counter.
  const m = await p.evaluate(() => ({
    inc: [...document.querySelectorAll('.card')].map((c) => getComputedStyle(c).counterIncrement),
    shown: [...document.querySelectorAll('.card')].filter((c) => getComputedStyle(c).display !== 'none').length,
    content: getComputedStyle(document.querySelector('.stage .shown'), '::before').content,
  }));
  assert.ok(m.inc.every((v) => v === 'shown 1'));
  assert.equal(m.shown, 2);
  assert.match(m.content, /counter\(shown\)/);
  await p.context().close();
});

test('Motion on wins over the system setting, parallax included', { skip }, async () => {
  const p = await page({ reducedMotion: 'reduce' });
  await p.click('#motion');
  assert.ok(await p.$eval('html', (h) => h.classList.contains('motion-on')));
  const anim = await p.$eval('.px-near', (e) => getComputedStyle(e).animationName);
  const css = await p.evaluate(() => CSS.supports('animation-timeline: view()'));
  if (css) assert.equal(anim, 'px'); else assert.equal(anim, 'none');
  await p.context().close();
});

test('phone width: nothing scrolls sideways', { skip }, async () => {
  for (const js of [true, false]) {
    const p = await page({ viewport: { width: 360, height: 740 }, javaScriptEnabled: js });
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `scripts ${js ? 'on' : 'off'}: ${sw} > ${cw}`);
    if (js) await shot(p, 'phone');
    await p.context().close();
  }
});

test('dark scheme: the page is dark and the text light', { skip }, async () => {
  const p = await page({ colorScheme: 'dark' });
  const [bg, fg] = await p.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color]);
  assert.equal(bg, 'rgb(18, 19, 22)');
  assert.equal(fg, 'rgb(235, 232, 225)');
  await shot(p, 'dark');
  await p.context().close();
});

test('the licence page lists every script the page loads', { skip }, async () => {
  const p = await page();
  const scripts = await p.$$eval('script[src]', (s) => s.map((x) => x.getAttribute('src')));
  await p.goto(pathToFileURL(path.join(OUT, 'jslicense.html')).href);
  const rows = await p.$$eval('#jslicense-labels1 tbody tr td:first-child a', (a) => a.map((x) => x.getAttribute('href')));
  assert.deepEqual(rows.sort(), scripts.sort());
  await p.context().close();
});

test('every window kind draws without throwing, big and small', { skip }, async () => {
  const p = await page();
  const result = await p.evaluate(() => {
    const out = {};
    for (const k of window.Windows.kinds) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:200px';
      document.body.appendChild(host);
      try {
        const h = window.Windows.mount(host, k, { slug: 'x', big: true });
        out[k] = h && h.kind === k ? 'ok' : 'fell back';
        window.Windows.unmount(h);
      } catch (e) { out[k] = String(e); }
      host.remove();
    }
    return out;
  });
  for (const [k, v] of Object.entries(result)) assert.equal(v, 'ok', k);
  assert.ok(Object.keys(result).length >= 12);
  await p.context().close();
});
