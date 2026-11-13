// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/js   The tone d-pad's second reader, in another language than build_tone.py and
// written from tests/spec/TONE.txt, not from the Python: it reads content/sections/ and site.txt
// itself and checks the same facts, Coleman-Liau rising (a meter that counts letters, not
// syllables), warmth falling, the voice rule, and that the page's fallback table is the one
// tone.model.js works out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const OUT = process.env.SITE_OUT || path.join(ROOT, 'public');
const M = require(path.join(ROOT, 'src', 'js', 'tone.model.js'));
const W = ['warm', 'plain', 'formal'], G = [2, 4, 8, 12, 16, 20];
const BANDS = { 2: [null, 4.5], 4: [null, 5.5], 8: [5, 9.5], 12: [9, 13.5], 16: [12.5, null], 20: [15, null] };

// ---- reading the store (TONE.txt and build_tone.py's docstring describe the format) -------------
function layersOf(text) {
  const head = {}, layers = {};
  let cur = null, inHead = true;
  for (const line of text.split('\n')) {
    const m = line.match(/^==\s*(.+?)\s*==\s*$/);
    if (m) { cur = m[1].replace(/\s+/g, ' '); layers[cur] = []; inHead = false; continue; }
    if (inHead) {
      if (!line.trim()) { inHead = false; continue; }
      const kv = line.match(/^([\w-]+):\s?(.*)$/);
      (head[kv[1]] = head[kv[1]] || []).push(kv[2].trim());
    } else if (cur) layers[cur].push(line);
  }
  const paras = {};
  for (const [k, v] of Object.entries(layers)) paras[k] = v.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { head, layers: paras };
}
function units() {
  const site = layersOf(readFileSync(path.join(ROOT, 'content', 'site.txt'), 'utf8'));
  const out = {};
  const dir = path.join(ROOT, 'content', 'sections');
  for (const fn of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const { head, layers } = layersOf(readFileSync(path.join(dir, fn), 'utf8'));
    for (const u of head.unit || []) {
      const [name, src] = u.split('|').map((x) => x.trim());
      let base = src === 'site.txt' ? site.layers[name].slice() : layers[name].slice();
      const keep = (head.keep || []).map((v) => v.split('|').map((x) => x.trim())).find(([n]) => n === name);
      const rec = { name, file: fn, base: base.slice(), facts: [], extras: [], cells: {} };
      if (keep) base[+keep[1] - 1] = '[[keep]]';
      rec.cells['plain-8'] = base;
      for (const k of ['fact', 'extra']) for (const v of head[k] || []) {
        const i = v.indexOf('|'); if (v.slice(0, i).trim() === name) rec[k + 's'].push(v.slice(i + 1).trim());
      }
      for (const [h, p] of Object.entries(layers)) {
        const m = h.match(/^([\w-]+) \/ (warm|plain|formal) (2|4|8|12|16|20)$/);
        if (m && m[1] === name) rec.cells[m[2] + '-' + m[3]] = p;
      }
      out[name] = rec;
    }
  }
  return out;
}

// ---- the meters -------------------------------------------------------------------------------------
function plain(paras) {
  return paras.filter((p) => p !== '[[keep]]').map((p) => p.replace(/’/g, "'").replace(/\[([^\]]+)\]\((?:https?|mailto):[^)\s]+\)/g, '$1')).join('\n');
}
function tally(paras) {
  let words = 0, sents = 0, letters = 0; const toks = [];
  for (const line of plain(paras).toLowerCase().split('\n')) {
    let pending = 0;
    for (const m of line.matchAll(/[a-z]+(?:'[a-z]+)*|[.!?]+/g)) {
      const t = m[0];
      if ('.!?'.includes(t[0])) { if (pending) { sents++; pending = 0; } }
      else { words++; letters += t.replace(/'/g, '').length; pending++; toks.push(t); }
    }
    if (pending) sents++;
  }
  return { words, sents, letters, toks };
}
export function colemanLiau(paras) {
  const { words, sents, letters } = tally(paras);
  return Math.round((0.0588 * (100 * letters / words) - 0.296 * (100 * sents / words) - 15.8) * 100) / 100;
}
const YOU = new Set(['you', 'your', 'yours', "you're", "you've", "you'll"]);
const SELF = new Set(['i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours']);
const FEEL = new Set(['love', 'like', 'likes', 'fun', 'glad', 'happy', 'enjoy', 'hope', 'joy', 'friend', 'friends', 'friendly', 'lucky', 'really', 'honestly', 'okay', 'hey', 'yes']);
const CONTRACT = new Set(["it's", "that's", "there's", "here's", "what's", "let's", "who's"]);
export function warmth(paras) {
  const text = plain(paras), { toks } = tally(paras);
  let pts = 0;
  for (const t of toks) {
    if (/(n't|'re|'ve|'ll|'m|'d)$/.test(t) || CONTRACT.has(t)) pts += 3;
    if (YOU.has(t)) pts += 2;
    if (SELF.has(t)) pts += 1;
    if (FEEL.has(t)) pts += 2;
    if (t.length >= 7 && /(tion|tions|ment|ments|ness|ity|ities|ance|ence)$/.test(t)) pts -= 2;
  }
  pts += 3 * (text.split('?').length - 1) + 2 * (text.split('!').length - 1);
  return Math.round(pts * 1000 / toks.length) / 10;
}

const U = units();

test('the Coleman-Liau meter knows its answer', () => {
  // 0.0588 x (14 letters / 4 words x 100) - 0.296 x (1 / 4 x 100) - 15.8 = -2.62
  assert.equal(colemanLiau(['Dogs bark at cats.']), -2.62);
});

test('the coverage: five texts, eighteen versions each (ELI5 and know-it-all since 2026-11-13)', () => {
  assert.deepEqual(Object.keys(U).sort(), ['about', 'ideas', 'involvements', 'portfolio', 'work']);
  for (const u of Object.values(U)) assert.equal(Object.keys(u.cells).length, 18, u.name);
});

test('reading rises on Coleman-Liau across the six steps, at every warmth; the About sits in its bands', () => {
  for (const u of Object.values(U)) {
    for (const w of W) {
      const g = G.map((s) => colemanLiau(u.cells[w + '-' + s]));
      for (let i = 1; i < g.length; i++) assert.ok(g[i] > g[i - 1], `${u.name} ${w}: Coleman-Liau ${g} does not rise`);
      if (u.name === 'about') G.forEach((s, i) => {
        const [lo, hi] = BANDS[s];
        assert.ok((lo === null || g[i] >= lo) && (hi === null || g[i] < hi), `${u.name} ${w}-${s}: Coleman-Liau ${g[i]} is outside its band`);
      });
    }
  }
});

test('warmth falls warm > plain > formal at every step (the JavaScript count)', () => {
  for (const u of Object.values(U)) for (const s of G) {
    const [a, b, c] = W.map((w) => warmth(u.cells[w + '-' + s]));
    assert.ok(a >= b + 1 && b >= c + 1, `${u.name} step ${s}: ${a} ${b} ${c}`);
  }
});

test('same facts: every version holds every fact, and adds no link, number or name', () => {
  for (const u of Object.values(U)) {
    const base = u.base.join('\n') + '\n' + u.extras.join('\n');
    const baseBare = base.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    for (const [c, paras] of Object.entries(u.cells)) {
      const text = paras.filter((p) => p !== '[[keep]]').join('\n');
      for (const f of u.facts) assert.ok(text.includes(f), `${u.name} ${c} drops ${f}`);
      for (const m of text.matchAll(/\]\(((?:https?|mailto):[^)\s]+)\)/g)) assert.ok(base.includes(m[1]), `${u.name} ${c} adds the link ${m[1]}`);
      const bare = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '');
      for (const d of bare.match(/\d+/g) || []) assert.ok(new RegExp(`(?<!\\d)${d}(?!\\d)`).test(baseBare), `${u.name} ${c} adds the number ${d}`);
      for (const para of bare.split('\n')) {
        for (const m of para.matchAll(/(?<![\w-])[A-Z][\w.'’-]*/g)) {
          const word = m[0].replace(/[.'’]+$/, '');
          const before = para.slice(0, m.index).trimEnd();
          if (!before || '.!?:“"('.includes(before.slice(-1)) || before.endsWith('/')) continue;
          if (word === 'I' || /^I['’]/.test(word)) continue;
          assert.ok(new RegExp(`(?<![\\w])${word.replace(/[.]/g, '\\.')}(?![\\w])`).test(base), `${u.name} ${c} adds the name ${word}`);
        }
      }
    }
  }
});

test('the voice rule: I and we; Corwin Brust only in formal versions; never he, him or his', () => {
  for (const u of Object.values(U)) for (const [c, paras] of Object.entries(u.cells)) {
    const bare = paras.join('\n').replace(/“[^”]*”/g, '');
    assert.ok(!/\b(he|him|his)\b/i.test(bare), `${u.name} ${c} says he, him or his`);
    if (!c.startsWith('formal')) assert.ok(!bare.includes('Corwin Brust'), `${u.name} ${c} names Corwin Brust`);
  }
});

test('the fallback table on the page is the one tone.model.js works out', () => {
  const page = readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const got = JSON.parse(page.match(/<script type="application\/json" id="tone-table">(.*?)<\/script>/s)[1]);
  const written = {};
  for (const u of Object.values(U)) written[u.name] = Object.keys(u.cells);
  assert.deepEqual(got, M.table(written));
  // And with cells missing, the rule in TONE.txt, 7: warmth toward plain first, then reading toward 8.
  const t = M.table({ x: ['warm-8', 'plain-12'] });
  assert.equal(t.x['warm-4'], 'warm-8');
  assert.equal(t.x['formal-16'], 'plain-12');
  assert.equal(t.x['warm-12'], 'plain-12');
  assert.equal(t.x['formal-4'], 'plain-8');
});

test('moves: left warmer, right formal, up harder unless inverted, and the ends hold', () => {
  assert.deepEqual(M.move(['plain', 8], 'up', false), ['plain', 12]);
  assert.deepEqual(M.move(['plain', 8], 'up', true), ['plain', 4]);
  assert.deepEqual(M.move(['plain', 8], 'left', false), ['warm', 8]);
  assert.equal(M.move(['formal', 16], 'right', false), null);
  assert.deepEqual(M.move(['plain', 4], 'down', false), ['plain', 2]);
  assert.deepEqual(M.move(['plain', 16], 'up', false), ['plain', 20]);
  assert.equal(M.move(['warm', 2], 'down', false), null);
  assert.equal(M.move(['plain', 20], 'up', false), null);
  assert.deepEqual(M.valid({ global: ['warm', 4], sections: { about: ['warm', 4], nope: ['plain', 4], involvements: ['x', 9] }, invert: 'yes' }, ['about', 'involvements']),
    { global: ['warm', 4], sections: {}, invert: false, lang: true, chosen: true });
  // A saved choice is flagged; an older save with a global and no flag was a choice too.
  assert.equal(M.valid(null).chosen, false);
  assert.equal(M.valid({ global: ['plain', 4], chosen: false }).chosen, false);
  assert.equal(M.valid({ global: ['plain', 4] }).chosen, true);
  assert.equal(M.valid({ lang: false }).lang, false);
  assert.equal(M.valid({ lang: 'no' }).lang, true);
});

test('the browser\'s language: the cases in TONE.txt, 8 (the Python reader checks the same ones)', () => {
  const spec = readFileSync(path.join(ROOT, 'tests', 'spec', 'TONE.txt'), 'utf8');
  const cases = [...spec.matchAll(/^\s*case: (.+?) -> (grade 4|as written)\s*$/gm)];
  assert.ok(cases.length >= 12);
  for (const [, langs, want] of cases) {
    const given = langs === '(none)' ? [] : langs.split(',').map((s) => s.trim());
    const got = M.langStart(given);
    if (want === 'as written') assert.equal(got, null, langs);
    else { assert.ok(got, langs); assert.deepEqual(got.cell, ['plain', 4], langs); }
  }
  assert.equal(M.langStart(['de-DE']).lang, 'de');
});

test('dpad.js never talks to the network and stores under its own key only', () => {
  const js = readFileSync(path.join(ROOT, 'src', 'js', 'dpad.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|new Image|WebSocket|EventSource/.test(js));
  const keys = [...js.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(keys.length >= 2 && keys.every((k) => k === 'KEY'));
  assert.match(js, /var KEY = 'aboutcorwin\.tone';/);
});

// ---- Corwin's hand edits to the About (content/ABOUT-EDITS.md), read here a second time -----------
// The file's own words are the spec: `rule: has | TEXT` (every version holds TEXT exactly),
// `rule: match | RE` (every version matches, ignoring case), `rule: never | RE` (none does).
function editRules() {
  const out = []; let heading = '';
  for (const line of readFileSync(path.join(ROOT, 'content', 'ABOUT-EDITS.md'), 'utf8').split('\n')) {
    if (line.startsWith('## ')) heading = line.slice(3).trim();
    const m = line.match(/^rule:\s*(\w+)\s*\|\s(.+)$/);
    if (line.startsWith('rule:')) assert.ok(m && ['has', 'match', 'never'].includes(m[1]), `bad rule line: ${line}`);
    if (m) out.push({ heading, kind: m[1], text: m[2].trimEnd() });
  }
  return out;
}

test('Corwin\'s hand edits hold in the About and in all eleven tone versions (the JavaScript reader)', () => {
  const rules = editRules();
  const heads = new Set(rules.map((r) => r.heading));
  assert.ok(heads.size >= 7, 'one heading per edit, each with a rule');
  const u = U.about;
  for (const [c, paras] of Object.entries(u.cells)) {
    const text = paras.join('\n');
    for (const r of rules) {
      if (r.kind === 'has') assert.ok(text.includes(r.text), `${c} undoes "${r.heading}": lacks ${r.text}`);
      else if (r.kind === 'match') assert.ok(new RegExp(r.text, 'i').test(text), `${c} undoes "${r.heading}": nothing matches ${r.text}`);
      else assert.ok(!new RegExp(r.text, 'i').test(text), `${c} undoes "${r.heading}": matches ${r.text}`);
    }
    // Edit 7: the sentence that says he co-chaired Minicon 37 names no one else.
    const bare = plain(paras);
    const sent = bare.split(/(?<=[.!?;])\s+/).find((s) => s.includes('Minicon 37'));
    assert.ok(sent, `${c} has no Minicon 37 sentence`);
    const names = (sent.match(/\b[A-Z][a-z]+\b/g) || []).filter((w) => !['I', 'A', 'In', 'Minicon', 'Minneapolis', 'Corwin', 'Brust'].includes(w));
    assert.deepEqual(names, [], `${c}: the Minicon sentence names ${names}`);
  }
});
