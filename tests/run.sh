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
  step "access card and deploy scripts (sh)"
  sh tests/deploy/run.sh || fail=1
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
    (cd "$here" && tar cf - --exclude=./public --exclude=./node_modules --exclude=./dist --exclude=./.git .) | (cd "$tmp/w" && tar xf -)
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
  plant "a post links off the blog's host"   content/feeds/emacs-blog.json 's#"url": "https://corwin.bru.st/", "tags": \[\]},$#"url": "https://evil.example/x", "tags": []},#' "$pyc"
  plant "best friend comes back"             content/involvements/inputloop.txt 's/with Bryant Frankford\./with my best friend Bryant Frankford./' "$pyc"
  plant "the old GitLab dotfiles come back"  content/about/find-me.txt 's#https://git.sr.ht/~mplscorwin/dotfiles#https://gitlab.com/mplscorwin/dotfiles#' "$pyc"
  plant "a card slips into the third person" content/concepts/whose.txt "s/its commits are mine,/its commits are Corwin's,/" "$pyc"
  plant "the blog host is misspelled"        content/site.txt   's#https://corwin.bru.st/#https://corwin.brust.st/#' "$pyc"
  plant "a path in the build snapshot"       content/ci/builds.json 's#"emacs-32-3b92ea"#"G:/dev-git/emacs-32"#' "$pyc"
  plant "high contrast loses its contrast"   src/css/site.css   's/--muted: #d0d0d0;/--muted: #303030;/' "$pyc"
  plant "text size reaches the page chrome"  src/css/site.css   's/^html\[data-size="1"\] { --read-scale: 1.15; }/html[data-size="1"] { --read-scale: 1.15; font-size: 130%; }/' "$pyc"
  plant "fetch-feeds accepts entities"       scripts/fetch-feeds 's/if re.search(rb"<!DOCTYPE|<!ENTITY", data, re.I):/if False:/' "$pyc"
  plant "fetch-ci accepts any text"          scripts/fetch-ci   's/^LATEST = re.compile(.*/LATEST = re.compile(r".*")/' "$pyc"
  plant "the control shows without scripts"  src/css/site.css   's/^\.custom { display: none; }/.custom { display: block; }/' "$pyc"
  depc="sh tests/deploy/run.sh"
  plant "stage stops checking the sums"       deploy/stage.sh    's/|| bad=1$/|| bad=0/'                    "$depc"
  plant "stage ignores unlisted files"        deploy/stage.sh    's/\[ -z "\$extra" \] ||/true ||/'          "$depc"
  plant "stage accepts a tarball that climbs" deploy/stage.sh    "s#grep -Eq '.*'; then#grep -Eq NOPE; then#" "$depc"
  plant "go-live skips the backup refusal"    deploy/go-live.sh  's#^if ! \$CP -a .*; fi$#true#'              "$depc"
  plant "go-live trusts an unverified release" deploy/go-live.sh '/^(cd "\$rel" \&\& sumc/d'                  "$depc"
  plant "go-live overwrites .dh-diag"         deploy/go-live.sh  's/\.dh-diag|\.dh-diag\/\*) echo/NOPE|NOPE\/*) echo/' "$depc"
  plant "rollback skips its backup refusal"   deploy/rollback.sh 's#^if ! \$CP -a .*; fi$#true#'              "$depc"
  plant "rollback forgets .dh-diag"           deploy/rollback.sh 's# ! -path ./.dh-diag##g'                  "$depc"
  plant "the card reader accepts a key path"  scripts/access-card 's/if (val ~ \/BEGIN/if (0 \&\& val ~ \/BEGIN/' "$depc"
  plant "the card reader forgets required lines" scripts/access-card 's/for (m in must) if/for (m in mustX) if/' "$depc"
  plant "heading levels skip"                build.py           's/render_card(c, windows, 4) for c in projects/render_card(c, windows, 5) for c in projects/' "$pyc"
  if command -v "$node" >/dev/null 2>&1; then
    plant "Customize phones home"            src/js/customize.js 's#^  var doc = document, html = doc.documentElement;#  var doc = document, html = doc.documentElement; fetch("/x");#' "$nodec"
    plant "Customize stores under another key" src/js/customize.js "s/var KEY = 'aboutcorwin.customize';/var KEY = 'x';/" "$nodec"
    plant "associations computed wrongly"    src/js/taxonomy.js 's/-Math.log(pab);/-Math.log(pab) * 0.9;/' "$nodec"
    plant "fuzzy matching too loose"         src/js/taxonomy.js 's/ && q\[0\] === term\[0\]//'          "$nodec"
    plant "the browser code phones home"     src/js/site.js     's#^  html.classList.add(.js.);#  html.classList.add("js"); fetch("/x");#' "$nodec"
    plant "the old GitLab dotfiles come back (node reader)" content/site.txt 's#https://git.sr.ht/~mplscorwin/dotfiles#https://gitlab.com/mplscorwin/dotfiles#' "$nodec"
    plant "the About slips into the third person (node reader)" content/site.txt 's/^My work covers a few things/His work covers a few things/' "$nodec"
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
      plant "Customize is out of the tab order" src/index.html   's/id="custom-btn" class="custom-btn"/id="custom-btn" tabindex="-1" class="custom-btn"/' "$brc"
      plant "Escape does not close Customize" src/js/customize.js "s/ev.key !== 'Escape' || panel.hidden/ev.key !== 'Esc_' || panel.hidden/" "$brc"
      plant "Customize forgets across reload" src/js/customize.js 's/localStorage.setItem(KEY, JSON.stringify(v));/void 0;/' "$brc"
      plant "text size scales the mode-line too" src/css/site.css 's/^\.reading { font-size: calc(1.0625rem \* var(--read-scale, 1));/body { font-size: calc(1rem * var(--read-scale, 1)); }\n.modeline { font-size: calc(1rem * var(--read-scale, 1)); }\n.reading { font-size: calc(1.0625rem * var(--read-scale, 1));/' "$brc"
      plant "Customize fetches after load"   src/js/customize.js 's#^    cur = read(); apply(cur); say(describe());#    cur = read(); apply(cur); say(describe()); new Image().src = "/x?" + Date.now();#' "$brc"
      plant "the side column is not beside the text" src/css/site.css 's/justify-content: space-between; }/justify-content: space-between; grid-template-columns: minmax(0, 1fr); }/' "$brc"
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
