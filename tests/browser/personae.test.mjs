// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/browser   The dramatis personae in a real browser, at 1280 and 390 pixels:
// the two columns move opposite ways, at most one related pair is ever level, exactly one
// postcard shows while one is, reduced motion gives plain lists with every pairing written out,
// and the prompt at the foot still finds every card. Set SHOTS=dir to keep screenshots.
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
// The cast is the second act, a page of its own (Corwin, 2026-11-01 18:06).
const URL = pathToFileURL(path.join(OUT, 'cast', 'index.html')).href;
const HOME = pathToFileURL(path.join(OUT, 'index.html')).href;
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

const WIDTHS = [{ width: 1280, height: 860 }, { width: 390, height: 780 }];

async function page(context = {}, url = URL) {
  const ctx = await browser.newContext({ viewport: WIDTHS[0], reducedMotion: 'no-preference', ...context });
  const p = await ctx.newPage();
  p.errors = []; p.late = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  // A file:// page cannot load a web font (Chrome blocks fonts across file: origins); the served
  // page can, and tests/browser/links.test.mjs proves it over http with the real CSP header.
  p.on('console', (m) => { if (m.type() === 'error' && !(String(m.location().url).startsWith('file:') && /\/fonts\//.test(m.location().url + ' ' + m.text()))) p.errors.push(m.text()); });
  await p.goto(url);
  if (context.javaScriptEnabled !== false) await p.waitForSelector('html[data-ready]');
  p.on('request', (r) => p.late.push(r.url()));
  return p;
}
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } }

// Scroll to a share (0..1) of the personae run and wait two frames for the columns to follow.
async function to(p, f) {
  await p.evaluate((f) => {
    const t = document.querySelector('.pp-track'), s = document.querySelector('.pp-stage');
    const top = t.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.round(top + f * (t.offsetHeight - s.offsetHeight)), behavior: 'instant' });
  }, f);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// What the reader sees, measured from the boxes: the card centres, the slot pitch, which related
// pairs are level (centres within 0.3 of a slot), and the postcards showing.
function look() {
  const mid = (el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
  const left = [...document.querySelectorAll('.pp-left .pp-card')], right = [...document.querySelectorAll('.pp-right .pp-card')];
  const pitch = left[1].getBoundingClientRect().top - left[0].getBoundingClientRect().top;
  const pairs = [...document.querySelectorAll('.pp-pair')].map((li) => {
    const a = document.getElementById('pp-' + li.dataset.person), b = document.getElementById('pp-' + li.dataset.persona);
    return { names: li.querySelector('.pp-names').textContent, off: Math.abs(mid(a) - mid(b)) / pitch };
  });
  const cards = [...document.querySelectorAll('.pp-postcard')].filter((c) => !c.hidden && c.getBoundingClientRect().height > 0);
  return { pitch, l0: mid(left[0]), r0: mid(right[0]), pairs,
           level: pairs.filter((x) => x.off < 0.3).map((x) => x.names),
           border: pairs.some((x) => x.off > 0.27 && x.off < 0.33),
           postcards: cards.map((c) => c.querySelector('.pp-pc-names').textContent) };
}

for (const vp of WIDTHS) {
  test(`${vp.width}px: the columns move opposite ways; at most one pair level; one postcard exactly then`, { skip }, async () => {
    const p = await page({ viewport: vp });
    const met = new Set();
    let prev = null;
    const N = 97;
    for (let i = 0; i <= N; i++) {
      await to(p, i / N);
      const s = await p.evaluate(look);
      assert.ok(s.level.length <= 1, `at ${i}/${N} more than one related pair is level: ${s.level}`);
      if (!s.border) {
        assert.deepEqual(s.postcards, s.level, `at ${i}/${N}: postcards ${JSON.stringify(s.postcards)} for level ${JSON.stringify(s.level)}`);
      }
      assert.ok(s.postcards.length <= 1, 'two postcards at once');
      s.level.forEach((n) => met.add(n));
      if (prev) {
        assert.ok(s.l0 <= prev.l0 + 0.5, `the people's column went down at ${i}/${N}`);
        assert.ok(s.r0 >= prev.r0 - 0.5, `the personas' column went up at ${i}/${N}`);
      }
      prev = s;
      if ([0, 30, 48, 70, N].includes(i)) await shot(p, `personae-${vp.width}-${i}`);
    }
    const first = await (async () => { await to(p, 0); return p.evaluate(look); })();
    const last = await (async () => { await to(p, 1); return p.evaluate(look); })();
    assert.ok(last.l0 < first.l0 - first.pitch, 'the people rise over the run');
    assert.ok(last.r0 > first.r0 + first.pitch, 'the personas fall over the run');
    const all = await p.$$eval('.pp-pair .pp-names', (n) => n.map((x) => x.textContent));
    assert.deepEqual([...met].sort(), all.sort(), 'every pairing comes level once on the way down');
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `sideways scroll: ${sw} > ${cw}`);
    assert.deepEqual(p.errors, []);
    assert.deepEqual(p.late, [], 'nothing is fetched while scrolling');
    await p.context().close();
  });
}

test('the postcard is announced politely, once the reader settles on it', { skip }, async () => {
  const p = await page();
  const step = await p.$eval('.pp-pair', (li) => Number(li.dataset.step));
  const [lo, hi] = await p.$eval('#personae', (s) => [Number(s.dataset.lo), Number(s.dataset.hi)]);
  await to(p, (step - lo) / (hi - lo));
  const names = await p.$eval('.pp-pair .pp-names', (n) => n.textContent);
  await p.waitForFunction((n) => document.getElementById('pp-say').textContent.includes(n), names, { timeout: 2000 });
  assert.equal(await p.getAttribute('#pp-say', 'role'), 'status');
  assert.equal(await p.getAttribute('#pp-say', 'aria-live'), 'polite');
  await p.context().close();
});

test('keyboard: each pairing has a button that brings its postcard up and moves focus to it', { skip }, async () => {
  const p = await page({ viewport: WIDTHS[1] });
  const n = await p.$$eval('.pp-show', (b) => b.length);
  assert.equal(n, await p.$$eval('.pp-pair', (l) => l.length));
  for (let i = 0; i < n; i++) {
    await p.focus(`.pp-pair:nth-child(${i + 1}) .pp-show`);
    await p.keyboard.press('Enter');
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const want = await p.$eval(`.pp-pair:nth-child(${i + 1}) .pp-names`, (x) => x.textContent);
    const s = await p.evaluate(look);
    assert.deepEqual(s.postcards, [want]);
    assert.ok(await p.evaluate(() => document.activeElement.classList.contains('pp-postcard')));
  }
  await p.context().close();
});

for (const how of ['reduced motion', 'Customize: Reduce motion', 'scripts off']) {
  test(`${how}: two plain lists, every pairing written out, nothing moves`, { skip }, async () => {
    const ctx = how === 'reduced motion' ? { reducedMotion: 'reduce' } : how === 'scripts off' ? { javaScriptEnabled: false } : {};
    const p = await page(ctx);
    if (how.startsWith('Customize')) {
      await p.click('#custom-btn');
      await p.check('input[name=calm]');
      await p.click('#c-apply');
    }
    await p.evaluate(() => document.getElementById('personae').scrollIntoView());
    await p.evaluate(() => window.scrollBy(0, 300));
    const s = await p.evaluate(() => ({
      transforms: [...document.querySelectorAll('.pp-list')].map((l) => getComputedStyle(l).transform),
      stage: getComputedStyle(document.querySelector('.pp-stage')).position,
      postcard: !document.querySelector('.pp-postcard').hidden,
      pairs: [...document.querySelectorAll('.pp-pair')].filter((li) => li.offsetParent).map((li) => li.textContent),
      buttons: [...document.querySelectorAll('.pp-show')].filter((b) => b.offsetParent).length,
      cards: [...document.querySelectorAll('.pp-card')].filter((c) => c.offsetParent).length,
      all: document.querySelectorAll('.pp-card').length,
    }));
    assert.deepEqual(s.transforms, ['none', 'none']);
    assert.notEqual(s.stage, 'sticky');
    assert.equal(s.postcard, false);
    assert.equal(s.buttons, 0);
    assert.equal(s.cards, s.all);
    const want = await p.$$eval('.pp-pair', (l) => l.length);
    assert.ok(want >= 1 && s.pairs.length === want, 'every pairing is written out');
    for (const t of s.pairs) assert.match(t, / and .+: .+/);
    await shot(p, 'personae-still-' + how.replace(/\W+/g, '-'));
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
}

test('text size 175% from the palette: the slots stay even, and still one pair at a time', { skip }, async () => {
  const p = await page({ viewport: WIDTHS[1] });
  await p.click('#custom-btn');
  await p.check('input[name=size][value="4"]');
  await p.click('#c-apply');
  await p.keyboard.press('Escape');
  const size = await p.$eval('.pp-card .pp-role', (r) => parseFloat(getComputedStyle(r).fontSize));
  assert.ok(size > 18, `the card text did not grow (${size}px)`);
  for (let i = 0; i <= 40; i++) {
    await to(p, i / 40);
    const s = await p.evaluate(look);
    assert.ok(s.level.length <= 1);
    const fits = await p.$$eval('.pp-card', (cs) => cs.every((c) => c.scrollHeight <= c.clientHeight + 1));
    assert.ok(fits, 'a card hides some of its text');
  }
  await p.context().close();
});

test('the prompt at the foot of the home page still finds every card by its name', { skip }, async () => {
  const p = await page({}, HOME);
  const titles = await p.$$eval('.card', (cs) => cs.map((c) => [c.id, c.querySelector('.title').textContent]));
  assert.ok(titles.length > 20);
  const missed = [];
  for (const [id, title] of titles) {
    await p.fill('#prompt', title);
    await p.press('#prompt', 'Enter');
    await p.waitForTimeout(80);
    const ok = await p.$eval('#' + CSS_escape(id), (c) => c.offsetParent !== null && c.classList.contains('is-match'));
    if (!ok) missed.push(title);
  }
  assert.deepEqual(missed, []);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
function CSS_escape(s) { return s.replace(/([^\w-])/g, '\\$1'); }

test('the cast page: its prompt finds a card on the first page and leads back to it', { skip }, async () => {
  const p = await page();
  await p.fill('#prompt', 'dungeon');
  await p.press('#prompt', 'Enter');
  await p.waitForSelector('#results button[data-slug="dungeon"]');
  await p.waitForFunction(() => /of \d{2} cards/.test(document.getElementById('echo').textContent));
  await Promise.all([p.waitForURL(/index\.html#dungeon$/), p.click('#results button[data-slug="dungeon"]')]);
  assert.ok(await p.$('#dungeon.card'), 'the link lands on the card on the first page');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('the home page has no cast and one quiet link to it; the link opens the cast', { skip }, async () => {
  const p = await page({}, HOME);
  assert.equal(await p.$('#personae'), null);
  assert.equal(await p.$$eval('a[href="cast/index.html"]', (a) => a.length), 1);
  await Promise.all([p.waitForURL(/cast\/index\.html$/), p.click('a[href="cast/index.html"]')]);
  await p.waitForSelector('html[data-ready]');
  assert.ok(await p.$('#personae'));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
