#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# sh tests/run.sh               build, then every check this machine can run
# sh tests/run.sh --prove-red   plant one fault per promise in a copy; each must turn its check red
#
# POSIX sh only. Needs python3; node 18+ for the JavaScript and browser checks (skipped, and said
# so, when node is missing); the browser checks also need the playwright package.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
cd "$here" || exit 2

py=${PYTHON:-python3}
command -v "$py" >/dev/null 2>&1 || py=python
node=${NODE:-node}
fail=0

step() { printf '\n== %s\n' "$1"; }

run_checks() {
  out=$1
  step "build"
  "$py" build.py --out "$out" || return 1
  step "content, page, accessibility, LibreJS, contrast, second reader (python)"
  SITE_OUT=$out "$py" -m unittest discover -s tests/py || fail=1
  if command -v "$node" >/dev/null 2>&1; then
    step "taxonomy (node)"
    SITE_OUT=$out "$node" --test tests/js/*.test.mjs || fail=1
    if [ "${SKIP_BROWSER:-}" = 1 ]; then
      step "browser: skipped (SKIP_BROWSER=1)"
    else
      step "browser (node + playwright)"
      SITE_OUT=$out "$node" --test --test-concurrency=1 tests/browser/*.test.mjs || fail=1
    fi
  else
    step "node not found: the taxonomy and browser checks did not run"
    fail=1
  fi
  return $fail
}

prove_red() {
  # Each fault: a file to break, a sed expression, and the check that must notice.
  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t aboutcorwin)
  trap 'rm -rf "$tmp"' EXIT INT TERM
  bad=0
  plant() {
    name=$1 file=$2 expr=$3 check=$4
    rm -rf "$tmp/w"; mkdir "$tmp/w"
    (cd "$here" && tar cf - --exclude=./public --exclude=./node_modules --exclude=./.git .) | (cd "$tmp/w" && tar xf -)
    sed "$expr" "$tmp/w/$file" > "$tmp/x" && cp "$tmp/x" "$tmp/w/$file"
    if cmp -s "$here/$file" "$tmp/w/$file"; then
      printf 'PLANT FAILED  %s (the fault did not change %s)\n' "$name" "$file"; bad=1; return
    fi
    if (cd "$tmp/w" && sh -c "$check") >"$tmp/log" 2>&1; then
      printf 'STAYED GREEN  %s\n' "$name"; bad=1
    else
      printf 'went red      %s\n' "$name"
    fi
  }
  pyc="\"$py\" build.py --out pub >/dev/null 2>&1; SITE_OUT=pub \"$py\" -m unittest discover -s tests/py"
  nodec="\"$py\" build.py --out pub >/dev/null && SITE_OUT=pub \"$node\" --test tests/js/*.test.mjs"
  brc="\"$py\" build.py --out pub >/dev/null && SITE_OUT=pub \"$node\" --test --test-concurrency=1 tests/browser/*.test.mjs"
  plant "a script loses its LibreJS label"   src/js/windows.js  '1s/^.*$/\/\/ no label/'                 "$pyc"
  plant "an inline style attribute"          build.py           's/<article class="card/<article style="x" class="card/' "$pyc"
  plant "a logo without words"               build.py           's/alt="" width="64"/width="64"/'       "$pyc"
  plant "the footer loses its date"          content/site.txt   's/^Last checked 2026-11-01/Last checked lately/' "$pyc"
  plant "the contact card loses its mail link" content/about/find-me.txt 's#^link: Mail me | mailto:corwin@bru.st#link: Mail me | corwin at bru.st#' "$pyc"
  plant "topology is not known public"      build.py           's/"topology", "about-corwin"/"about-corwin"/'                "$pyc"
  plant "corwin.cloud is not known public"   build.py           's/"vibrobeast-skills", "corwin.cloud",/"vibrobeast-skills",/'                "$pyc"
  plant "a private repository linked"        content/projects/nexttime.txt 's#^link: Repository | .*#link: Repository | https://github.com/inputloop/c4#' "$pyc"
  plant "a card's prose hidden from no-JS"   build.py           's/for layer in ("summary", "function", "practice")$/for layer in ("summary",)/' "$pyc"
  plant "low-contrast muted text"            src/css/site.css   's/--muted: #59544b;/--muted: #a8a397;/'   "$pyc"
  plant "the CSP allows inline script"       src/.htaccess      "s/script-src 'self'/script-src 'self' 'unsafe-inline'/" "$pyc"
  plant "a private name in a served script"  src/js/windows.js  's#^  .use strict.;#  "use strict"; // from inputloop/c4#' "$pyc"
  plant "heading levels skip"                build.py           's/render_card(c, windows, 4) for c in projects/render_card(c, windows, 5) for c in projects/' "$pyc"
  if command -v "$node" >/dev/null 2>&1; then
    plant "associations computed wrongly"    src/js/taxonomy.js 's/-Math.log(pab);/-Math.log(pab) * 0.9;/' "$nodec"
    plant "fuzzy matching too loose"         src/js/taxonomy.js 's/ && q\[0\] === term\[0\]//'          "$nodec"
    plant "the browser code phones home"     src/js/site.js     's#^  html.classList.add(.js.);#  html.classList.add("js"); fetch("/x");#' "$nodec"
    plant "'how do I reach him' finds nothing" content/vocabulary.txt 's/^domain contact: contact, reach, /domain contact: contact, /' "$nodec"
    plant "'what does Corwin work on' loses the overview" content/about/glance.txt 's/^title: Corwin at a glance/title: At a glance/' "$nodec"
    plant "'what do you know about me' finds nothing" content/vocabulary.txt 's/about me, about you, about corwin, who is corwin, who are you, who is he, know about me, /who is he, /' "$nodec"
    plant "'who is Corwin' goes to the shop site" content/about/glance.txt 's/^title: Corwin at a glance/title: At a glance/;s/^tags: .*/tags: gnu/' "$nodec"
    plant "'is he on Emacs' finds nothing"   src/js/taxonomy.js "s/var STOP = ' a an /var STOP = ' emacs a an /" "$nodec"
    plant "'what is inputloop' loses the shop card" content/involvements/inputloop.txt 's/inputloop/ourshop/g' "$nodec"
    plant "'what is corwin.cloud' no longer names its card" src/js/taxonomy.js 's/if (s >= 0.7 \&\& s > best)/if (s >= 2 \&\& s > best)/' "$nodec"
    plant "the about cards drop out of the prompt" src/js/taxonomy.js 's/var CARD_KINDS = { about: 1, /var CARD_KINDS = { /' "$nodec"
    plant "the hub card teaches associations" src/js/taxonomy.js 's/var HUB = 1.5;/var HUB = 99;/' "$nodec"
    plant "spreading admits cards"           src/js/taxonomy.js 's/      if (!direct) score = 0;//' "$nodec"
    plant "presentation words pick subjects" src/js/taxonomy.js 's/var PRESENTATION_ON_CARDS = 0.3;/var PRESENTATION_ON_CARDS = 1;/' "$nodec"
    if [ "${SKIP_BROWSER:-}" != 1 ]; then
      plant "the minibuffer is not after the mode-line" src/css/site.css 's/^  position: sticky; bottom: 0; z-index: 20;$/  position: static; z-index: 20;/' "$brc"
      plant "the mode-line never says Bot"   src/js/site.js     "s/: y >= max - 2 ? 'Bot' :/: false ? 'Bot' :/" "$brc"
      plant "a single-key shortcut"          src/js/site.js     "s/if (ev.altKey \&\& (ev.key === 'x'/if ((ev.key === '\/' || ev.altKey) \&\& (ev.key === '\/' || ev.key === 'x'/" "$brc"
      plant "reduced motion ignored"         src/js/site.js     "s/: !reduce.matches;/: true;/" "$brc"
    fi
  fi
  if [ $bad = 0 ]; then echo "PROVE-RED OK"; return 0; fi
  echo "PROVE-RED FAILED"; return 1
}

case "${1:-}" in
  --prove-red) prove_red ;;
  "") run_checks "${SITE_OUT:-$here/public}" && echo && echo "ALL CHECKS PASSED" ;;
  *) echo "usage: sh tests/run.sh [--prove-red]" >&2; exit 2 ;;
esac
