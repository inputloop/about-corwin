// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tests/js   Second reader for links the Python checks also hold (a different language,
// a different route): walks the built site and refuses links Corwin has retired.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const OUT = process.env.SITE_OUT || path.join(ROOT, 'public');

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

test('the dotfiles link is sourcehut; the old GitLab copy appears nowhere in the built site', () => {
  const old = 'gitlab.com/' + 'mplscorwin/dotfiles';
  for (const p of walk(OUT)) {
    assert.ok(!readFileSync(p, 'latin1').includes(old), `${p} still names the old GitLab dotfiles`);
  }
  assert.ok(readFileSync(path.join(OUT, 'index.html'), 'utf8').includes('href="https://git.sr.ht/~mplscorwin/dotfiles"'));
});

test('card and About prose speak as I or we; third person only in quoted visitor questions', () => {
  const third = /\b(Corwin|[Hh]e|[Hh]im|[Hh]is)\b/;
  function* cards(dir) {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== 'windows' && n !== 'views') yield* cards(p); }
      else if (n.endsWith('.txt') && n !== 'vocabulary.txt') yield p;
    }
  }
  for (const p of cards(path.join(ROOT, 'content'))) {
    let prose = false;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (line.startsWith('== ')) { prose = true; return; }
      if (!prose) return;
      const t = line.replace(/“[^”]*”/g, '').replace('I am Corwin Brust', '').replace('Corwin Brust and Contributors', '');
      assert.ok(!third.test(t), `${p}:${i + 1} speaks of Corwin in the third person`);
    });
  }
});
