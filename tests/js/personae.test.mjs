// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/js   A second reader for the dramatis personae, in another language than
// build.py: it reads content/personae/ itself, applies the rule DESIGN.md writes down, and must
// arrive at the order the built page carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const OUT = process.env.SITE_OUT || path.join(ROOT, 'public');
const dir = path.join(ROOT, 'content', 'personae');

function readCast() {
  const cast = [], pairs = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.txt')).sort()) {
    const slug = f.replace(/\.txt$/, '');
    const head = {};
    const rel = [];
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const m = line.match(/^([\w-]+):\s?(.*)$/);
      if (!m) continue;
      if (m[1] === 'relation') rel.push(m[2].split('|').map((s) => s.trim())[0]);
      else head[m[1]] = m[2].trim();
    }
    cast.push({ slug, kind: head.kind });
    for (const other of rel) pairs.push([slug, other]);
  }
  const kind = Object.fromEntries(cast.map((c) => [c.slug, c.kind]));
  return { cast, pairs: pairs.map(([a, b]) => (kind[a] === 'person' ? [a, b] : [b, a])) };
}

function* perms(xs) {
  if (xs.length <= 1) { yield xs.slice(); return; }
  for (let i = 0; i < xs.length; i++) {
    for (const rest of perms(xs.slice(0, i).concat(xs.slice(i + 1)))) yield [xs[i], ...rest];
  }
}

// The rule, as DESIGN.md says it: distinct meeting steps; gaps (with one step of margin at each
// end) compared smallest first, larger wins; then the alphabetically first reading. Trying every
// arrangement (brute) is exact but grows as factorials; arrange() tries every slot for the paired
// people and personas only and fills the rest alphabetically, which DESIGN.md says gives the same
// answer, and the test below holds the two to it on small casts.
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
function score(L, R, pairs, lo, hi) {
  const steps = pairs.map(([p, q]) => L.indexOf(p) - R.indexOf(q)).sort((a, b) => a - b);
  if (new Set(steps).size !== steps.length) return null;
  const marks = [lo, ...steps, hi];
  return { L, R, gaps: marks.slice(1).map((m, i) => m - marks[i]).sort((a, b) => a - b), name: L.concat(R).join('\0') };
}
function better(x, best) { return x && (!best || cmp(x.gaps, best.gaps) > 0 || (cmp(x.gaps, best.gaps) === 0 && x.name < best.name)); }
function columns(cast) {
  return [cast.filter((c) => c.kind === 'person').map((c) => c.slug).sort(), cast.filter((c) => c.kind === 'persona').map((c) => c.slug).sort()];
}
function brute({ cast, pairs }) {
  const [left, right] = columns(cast), lo = -right.length, hi = left.length;
  let best = null;
  for (const L of perms(left)) for (const R of perms(right)) { const x = score(L, R, pairs, lo, hi); if (better(x, best)) best = x; }
  return best;
}
function* slotsFor(n, k, used = []) {
  if (used.length === k) { yield used.slice(); return; }
  for (let i = 0; i < n; i++) if (!used.includes(i)) yield* slotsFor(n, k, used.concat([i]));
}
function* placed(column, paired) {
  for (const slots of slotsFor(column.length, paired.length)) {
    const out = new Array(column.length).fill(null);
    slots.forEach((s, i) => { out[s] = paired[i]; });
    const rest = column.filter((c) => !paired.includes(c));
    yield out.map((x) => x === null ? rest.shift() : x);
  }
}
function arrange({ cast, pairs }) {
  const [left, right] = columns(cast), lo = -right.length, hi = left.length;
  const lp = [...new Set(pairs.map((x) => x[0]))].sort(), rp = [...new Set(pairs.map((x) => x[1]))].sort();
  let best = null;
  for (const L of placed(left, lp)) for (const R of placed(right, rp)) { const x = score(L, R, pairs, lo, hi); if (better(x, best)) best = x; }
  return best;
}

function pageOrder() {
  const html = readFileSync(path.join(OUT, 'cast', 'index.html'), 'utf8');
  const col = (cls) => {
    const block = html.match(new RegExp(`<section class="pp-col ${cls}"[\\s\\S]*?</ol>`))[0];
    return [...block.matchAll(/data-slug="([\w-]+)" data-slot="(\d+)"/g)].map((m) => m[1]);
  };
  const steps = [...html.matchAll(/data-person="([\w-]+)" data-persona="([\w-]+)" data-step="(-?\d+)"/g)]
    .map((m) => [m[1], m[2], Number(m[3])]);
  return { L: col('pp-left'), R: col('pp-right'), steps };
}

test('a second reader, from the content files alone, reaches the order the page carries', () => {
  const mine = arrange(readCast()), got = pageOrder();
  assert.deepEqual(got.L, mine.L);
  assert.deepEqual(got.R, mine.R);
});

test('each pairing on the page meets at its slots\' difference, and no two at once', () => {
  const got = pageOrder();
  const seen = new Set();
  for (const [p, q, step] of got.steps) {
    assert.equal(step, got.L.indexOf(p) - got.R.indexOf(q), `${p} and ${q}`);
    assert.ok(!seen.has(step), `two pairings meet at step ${step}`);
    seen.add(step);
  }
  assert.equal(got.steps.length, readCast().pairs.length);
});

test('a changed relation changes the order (the second reader agrees)', () => {
  const c = readCast();
  const base = arrange(c);
  let moved = 0;
  for (let i = 0; i < c.pairs.length; i++) {
    const t = arrange({ cast: c.cast, pairs: c.pairs.filter((_, j) => j !== i) });
    if (t.L.join() !== base.L.join() || t.R.join() !== base.R.join()) moved++;
  }
  assert.ok(moved > 0, 'dropping any one relation left everyone where they were');
});

test('the placement search gives what trying every arrangement gives, on small casts', () => {
  let seed = 9;   // a house number, so the casts are the same each run
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let t = 0; t < 40; t++) {
    const k = 2 + rnd(5), m = 1 + rnd(3);
    const cast = [...Array(k).keys()].map((i) => ({ slug: 'n' + i, kind: 'person' })).concat([...Array(m).keys()].map((j) => ({ slug: 'p' + j, kind: 'persona' })));
    const pairs = [], seen = new Set();
    for (let r = 1 + rnd(3); r > 0; r--) { const a = 'n' + rnd(k), b = 'p' + rnd(m); if (!seen.has(a + b)) { seen.add(a + b); pairs.push([a, b]); } }
    const x = arrange({ cast, pairs }), y = brute({ cast, pairs });
    assert.deepEqual(x && [x.L, x.R], y && [y.L, y.R], JSON.stringify({ cast, pairs }));
  }
});
