// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/js   (Node 18 or later; no packages). Reads public/taxonomy.json, so run
// `python3 build.py` first; `make check` does both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const T = require(path.join(ROOT, 'src/js/taxonomy.js'));
const Chamber = require(path.join(ROOT, 'src/js/chamber.model.js'));
const index = JSON.parse(readFileSync(path.join(process.env.SITE_OUT || path.join(ROOT, 'public'), 'taxonomy.json'), 'utf8'));
const model = T.build(index);
const top = (q, n = 1) => T.query(model, q).items.slice(0, n).map((i) => i.slug);

test('tokenize keeps inner hyphens and apostrophes, drops punctuation', () => {
  assert.deepEqual(T.tokenize("Bryant's end-of-life PHP!"), ["bryant's", 'end-of-life', 'php']);
  assert.deepEqual(T.tokenize('  '), []);
  assert.deepEqual(T.tokenize('Ünïcode café'), ['unicode', 'cafe']);
});

test('similarity: exact, plural, prefix, one typo; not two letters off a short word', () => {
  assert.equal(T.similarity('emacs', 'emacs'), 1);
  assert.equal(T.similarity('game', 'games'), 0.95);
  assert.equal(T.similarity('chem', 'chemistry'), 0.8);
  assert.equal(T.similarity('emcas', 'emacs'), 0.75);
  assert.equal(T.similarity('talks', 'walks'), 0, 'loose matches must share the first letter');
  assert.equal(T.similarity('cat', 'car'), 0, 'three-letter words are never fuzzy');
  assert.equal(T.editDistance('ab', 'ba'), 1, 'an adjacent swap is one edit');
});

test('associations are symmetric, unique and within (0, 1]', () => {
  const seen = new Set();
  for (const e of model.edges) {
    assert.ok(e.w > 0 && e.w <= 1, `${e.a}-${e.b} = ${e.w}`);
    assert.ok(e.a < e.b, 'each pair once, in order');
    const k = e.a + '|' + e.b;
    assert.ok(!seen.has(k)); seen.add(k);
  }
  assert.ok(model.edges.length > 50, 'a real graph, not a handful of edges');
});

test('associations on a toy corpus match the formula', () => {
  const tags = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const items = [{ w: { a: 1, b: 1 } }, { w: { a: 1, b: 1 } }, { w: { a: 1 } }, { w: { c: 1 } }];
  const { edges } = T.associations(tags, items);
  // p(a)=3/4, p(b)=2/4, p(ab)=2/4: npmi = ln(0.5/0.375)/-ln(0.5)
  const want = Math.log(0.5 / 0.375) / -Math.log(0.5);
  assert.equal(edges.length, 1);
  assert.ok(Math.abs(edges[0].w - want) < 1e-6);
});

test('the field settles toward balance and never collapses', () => {
  assert.ok(model.health.balance > 0.9, `balance ${model.health.balance}`);
  assert.ok(model.health.minDist > 1, `nearest pair ${model.health.minDist}`);
  assert.equal(model.nodes.length, Object.keys(model.df).length);
});

test('the layout is the same on every run (seeded)', () => {
  const again = T.build(JSON.parse(JSON.stringify(index)));
  for (const n of model.nodes) {
    const m = again.pos[n.id];
    assert.ok(Math.abs(m.x - n.x) < 1e-9 && Math.abs(m.z - n.z) < 1e-9, n.id);
  }
});

test('chamber model is the C4 original: converges on its own', () => {
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: i }));
  Chamber.initPositions(nodes, 200, T.mulberry32(1));
  const edges = Chamber.edgesFromCo(nodes.slice(1).map((_, i) => ({ a: i, b: i + 1, w: 0.5 })));
  let h; for (let s = 0; s < 400; s++) h = Chamber.step(nodes, edges);
  assert.ok(h.balance > 0.9 && h.minDist > 1);
});

const cases = [
  ['games', 'four-swords'],
  ['emacs on windows', 'emacs-windows'],
  ['emcas windows', 'emacs-windows'],
  ['mutual aid', 'nexttime'],
  ['time bank', 'nexttime'],
  ['chemistry', 'quantum3d5'],
  ["bryant's", 'quantum3d5'],
  ['php security', 'php-backport'],
  ['secruity patch', 'php-backport'],
  ['perl', 'ob-perl'],
  ['conference', 'emacsconf'],
  ['fog map', 'dungeon'],
  ['consent', 'vibrobeast'],
  ['plain text files', 'plain-files'],
  ['prove-red', 'prove-red'],
  ['the lens', 'lens'],
  ['taxonomy tags', 'taxonomy'],
  ['vibrobest', 'vibrobeast'],
  ['qantum', 'quantum3d5'],
  ['nexttime', 'nexttime'],
];
for (const [q, want] of cases) {
  test(`"${q}" puts ${want} first`, () => assert.equal(top(q)[0], want, JSON.stringify(T.query(model, q).items.slice(0, 3))));
}

test('words about seeing choose a view; subjects still choose cards', () => {
  const r = T.query(model, 'numbers for php');
  assert.equal(r.view, 'scoreboard');
  assert.equal(r.items[0].slug, 'php-backport');
  assert.equal(T.query(model, 'facts about dungeon').view, 'baseball');
  assert.equal(T.query(model, 'show me something moving').view, 'featured');
  assert.equal(T.query(model, 'tell me the story').view, 'prose');
});

test('a view-only query keeps exactly the cards that offer that view', () => {
  const r = T.query(model, 'numbers');
  const offer = index.items.filter((i) => i.views && i.views.includes('scoreboard')).map((i) => i.slug).sort();
  assert.deepEqual(r.items.map((i) => i.slug).sort(), offer);
});

test('"numbers" is not a misspelling of "members" (exact matches win)', () => {
  const r = T.query(model, 'numbers');
  assert.ok(!r.matched.some((m) => m.tag === 'community'), JSON.stringify(r.matched));
});

test('precision: a subject shows only the cards that say it', () => {
  assert.deepEqual(top('php', 9).sort(), ['inputloop', 'php-backport'].sort());
  assert.ok(!top('chemistry', 9).includes('dot-github'));
  assert.ok(T.query(model, 'emacs').items.length <= 6);
});

test('a prefix names a card only when it is most of the name', () => {
  assert.equal(T.query(model, 'back of the card').view, 'baseball');
  assert.ok(!T.query(model, 'back of the card').named.length, 'back is not backport');
  assert.notEqual(top('read')[0], 'two-readers');
  assert.equal(top('quantum')[0], 'quantum3d5');
});

test('spreading ranks but never admits: every card shown says a word of the prompt itself', () => {
  assert.deepEqual(top('conference', 9), ['emacsconf', 'emacs-windows']);
  assert.deepEqual(top('show me games', 9).sort(), ['dungeon', 'four-swords', 'inputloop']);
  assert.ok(!top('memory', 9).includes('doors'));
});

test('words about how to see do not reorder what to see', () => {
  const plain = top('emacs', 9);
  assert.deepEqual(top('typing emacs', 9), plain);
  assert.deepEqual(top('something moving emacs', 9), plain);
  assert.equal(top('emacs numbers')[0], plain[0]);
});

test('the hub card does not teach associations', () => {
  const t = T.teachers(index.items).map((i) => i.slug);
  assert.ok(!t.includes('inputloop'));
  assert.ok(t.includes('dungeon'));
  assert.ok(!t.some((s) => s.startsWith('view:') || s.startsWith('window:')));
});

test('describe never repeats a label', () => {
  const s = T.describe(T.query(model, 'read'), 20);
  assert.ok(!/read, read/.test(s), s);
});

test('a window word leans toward cards with that window', () => {
  const r = T.query(model, 'show me the fog');
  assert.equal(r.items[0].slug, 'dungeon');
});

test('nonsense and empty prompts change nothing and say so', () => {
  const none = T.query(model, 'xyzzy plugh');
  assert.equal(none.items.length, 0);
  assert.match(T.describe(none, 20), /No tag matches/);
  const empty = T.query(model, '   ');
  assert.ok(empty.empty);
  assert.equal(T.describe(empty, 20), 'Showing all 20 cards.');
});

test('results always say why', () => {
  for (const [q] of cases) for (const it of T.query(model, q).items) assert.ok(it.why.length, `${q}: ${it.slug}`);
});

test('describe names the matched tags and the view', () => {
  const s = T.describe(T.query(model, 'emcas numbers'), 20);
  assert.match(s, /emcas→emacs/);
  assert.match(s, /the scoreboard/);
});

test('the browser code never reaches the network or stores more than Motion', () => {
  const dir = path.join(ROOT, 'src/js');
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'document.cookie', 'eval(', 'new Function']) {
      assert.ok(!src.includes(bad), `${f} uses ${bad}`);
    }
    const sets = src.match(/localStorage\.setItem\(([^,]+),/g) || [];
    for (const s of sets) assert.match(s, /aboutcorwin\.motion/, `${f}: ${s}`);
  }
});
