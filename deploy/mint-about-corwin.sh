#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# mint-about-corwin -- runs ON gw33, as gw33, every 17 minutes (deploy/schedule installs the timer).
# It notices that the site's code moved (main of inputloop/about-corwin) or that a feed the site
# shows moved (the Emacs CI strip, the blog card); if so it runs the checks that can run headless,
# builds the site, and publishes tarball + manifest + channel feed (the feed format is in SPEC.md of c4 d/channels)
# into a folder that nginx serves at https://corwin.cloud/dist/about-corwin/. It does not touch the
# site's own web folder and does not run as root.
#
#   sh mint-about-corwin.sh [-v] [-n] [-f]     -v say what happens   -n only notice, build nothing
#                                              -f mint even if nothing moved
# Settings (environment, all optional):
#   MINT_REPO      https clone address              (https://github.com/inputloop/about-corwin.git)
#   MINT_BRANCH    branch to follow                 (main)
#   MINT_WORK      private working folder           ($HOME/mint-about-corwin)
#   MINT_PUBLISH   publish folder, outside nginx's site root   (/var/www/corwin.cloud-dist/about-corwin)
#   MINT_BASE_URL  where the publish folder is served           (https://corwin.cloud/dist/about-corwin)
#   MINT_KEEP      artifacts to keep, never fewer than 3        (20)
#   MINT_CHECKS    command run in the clone before building; empty = none   (SKIP_BROWSER=1 sh tests/run.sh)
#   MINT_CI_FROM, MINT_BLOG_FROM   read the CI / blog snapshot from a saved file (tests)
#   PYTHON         python3
# Exit: 0 minted or nothing new; 1 something failed (one line in $MINT_WORK/mint.log; nothing published).
set -u
CHANNEL=about-corwin
REPO=${MINT_REPO:-https://github.com/inputloop/about-corwin.git}
BRANCH=${MINT_BRANCH:-main}
WORK=${MINT_WORK:-$HOME/mint-about-corwin}
PUBLISH=${MINT_PUBLISH:-/var/www/corwin.cloud-dist/about-corwin}
BASE=${MINT_BASE_URL:-https://corwin.cloud/dist/about-corwin}
KEEP=${MINT_KEEP:-20}
CHECKS=${MINT_CHECKS-SKIP_BROWSER=1 sh tests/run.sh}
PY=${PYTHON:-python3}
here=$(cd "$(dirname "$0")" && pwd)
V=0; DRY=0; FORCE=0
for a in "$@"; do case $a in -v) V=1 ;; -n) DRY=1 ;; -f) FORCE=1 ;; *) echo "usage: mint-about-corwin.sh [-v] [-n] [-f]" >&2; exit 64 ;; esac; done
case $KEEP in ''|*[!0-9]*) KEEP=20 ;; esac
[ "$KEEP" -ge 3 ] || KEEP=3

mkdir -p "$WORK/state" || { echo "mint: cannot make $WORK" >&2; exit 1; }
LOG=$WORK/mint.log
say() { [ $V = 1 ] && echo "$*"; return 0; }
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; say "$*"; }
die() { log "FAILED: $*"; echo "mint: $*" >&2; exit 1; }
sumc() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

# One run at a time. The lock is a folder with our pid; a dead pid's lock is taken over.
LOCK=$WORK/lock
if ! mkdir "$LOCK" 2>/dev/null; then
  old=$(cat "$LOCK/pid" 2>/dev/null || echo 0)
  if [ "$old" != 0 ] && kill -0 "$old" 2>/dev/null; then log "skipped: another run (pid $old) is in progress"; exit 0; fi
  echo $$ > "$LOCK/pid" 2>/dev/null || die "cannot take over the lock at $LOCK"
else echo $$ > "$LOCK/pid"; fi
trap 'rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

SRC=$WORK/src
if [ ! -d "$SRC/.git" ]; then
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$SRC" 2>"$WORK/git.err" || die "clone of $REPO failed: $(tail -n 1 "$WORK/git.err")"
else
  git -C "$SRC" fetch --quiet --depth 1 origin "$BRANCH" 2>"$WORK/git.err" || die "fetch of $BRANCH failed: $(tail -n 1 "$WORK/git.err")"
  git -C "$SRC" reset --quiet --hard FETCH_HEAD && git -C "$SRC" clean -fdxq || die "could not bring the clone to $BRANCH"
fi
rev=$(git -C "$SRC" rev-parse HEAD) || die "no revision"
rev12=$(printf %s "$rev" | cut -c1-12)

# The two feeds. A snapshot that cannot be read leaves the last good one in place.
ST=$WORK/state
[ -f "$ST/ci.json" ] || cp "$SRC/content/ci/builds.json" "$ST/ci.json"
[ -f "$ST/blog.json" ] || cp "$SRC/content/feeds/emacs-blog.json" "$ST/blog.json"
rm -f "$ST/ci.new" "$ST/blog.new"
if [ -n "${MINT_CI_FROM:-}" ]; then set -- --from "$MINT_CI_FROM"; else set --; fi
if "$PY" "$SRC/scripts/fetch-ci" "$@" --out "$ST/ci.new" >"$WORK/feeds.out" 2>&1 && [ -s "$ST/ci.new" ]; then mv -f "$ST/ci.new" "$ST/ci.json"
else say "ci feed not read; keeping the last good snapshot"; fi
if [ -n "${MINT_BLOG_FROM:-}" ]; then set -- --from "$MINT_BLOG_FROM"; else set --; fi
if "$PY" "$SRC/scripts/fetch-feeds" "$@" --out "$ST/blog.new" >>"$WORK/feeds.out" 2>&1 && [ -s "$ST/blog.new" ]; then mv -f "$ST/blog.new" "$ST/blog.json"
else say "blog feed not read; keeping the last good snapshot"; fi
dig() { grep -v '"fetched"' "$1" | sumc | cut -c1-8; }
ci8=$(dig "$ST/ci.json"); blog8=$(dig "$ST/blog.json")
key=$CHANNEL:$rev12:$ci8:$blog8

cur=
if [ -f "$PUBLISH/channel.json" ]; then cur=$(sh "$here/chan-read.sh" "$PUBLISH/channel.json" key 2>/dev/null || true); fi
if [ "$cur" = "$key" ] && [ $FORCE = 0 ]; then say "nothing new (key $key)"; exit 0; fi
say "moved: $cur -> $key"
if [ $DRY = 1 ]; then echo "would mint $key"; exit 0; fi

cp "$ST/ci.json" "$SRC/content/ci/builds.json"; cp "$ST/blog.json" "$SRC/content/feeds/emacs-blog.json"
if [ -n "$CHECKS" ]; then
  (cd "$SRC" && eval "$CHECKS") >"$WORK/checks.log" 2>&1 || die "checks failed for $key; nothing published (see $WORK/checks.log)"
fi
(cd "$SRC" && "$PY" build.py --out public) >"$WORK/build.log" 2>&1 || die "build failed for $key (see $WORK/build.log)"
rm -rf "$WORK/dist-tmp"; mkdir -p "$WORK/dist-tmp"
(cd "$SRC" && DIST="$WORK/dist-tmp" sh scripts/make-dist) >>"$WORK/build.log" 2>&1 || die "make-dist failed for $key (see $WORK/build.log)"
tarball=$WORK/dist-tmp/about-corwin.tar.gz
[ -s "$tarball" ] || die "make-dist made no tarball"

stamp=$(date -u +%Y%m%d-%H%M%S)
name=$CHANNEL-$stamp-$rev12
mkdir -p "$PUBLISH" || die "cannot make $PUBLISH"
[ ! -e "$PUBLISH/$name.tar.gz" ] || die "$name already published"
cp "$tarball" "$PUBLISH/.$name.tar.gz.part" && mv -f "$PUBLISH/.$name.tar.gz.part" "$PUBLISH/$name.tar.gz" || die "could not write into $PUBLISH"
sha=$(sumc "$PUBLISH/$name.tar.gz" | cut -d' ' -f1)
size=$(wc -c < "$PUBLISH/$name.tar.gz" | tr -d ' ')
tar -xzOf "$PUBLISH/$name.tar.gz" MANIFEST.sha256 > "$PUBLISH/.$name.MANIFEST.part" && mv -f "$PUBLISH/.$name.MANIFEST.part" "$PUBLISH/$name.MANIFEST.sha256"
cat > "$PUBLISH/.$name.json.part" <<JSON
{
  "format": "channel/1",
  "channel": "$CHANNEL",
  "revision": "$rev",
  "stamp": "$stamp",
  "artifact": "$BASE/$name.tar.gz",
  "sha256": "$sha",
  "key": "$key",
  "size": "$size",
  "inputs": "git:$rev12 ci:$ci8 blog:$blog8"
}
JSON
sh "$here/chan-read.sh" "$PUBLISH/.$name.json.part" >/dev/null 2>"$WORK/read.err" || die "the feed I wrote does not pass its own reader: $(cat "$WORK/read.err")"
cp "$PUBLISH/.$name.json.part" "$PUBLISH/.channel.json.part"
mv -f "$PUBLISH/.$name.json.part" "$PUBLISH/$name.json"
mv -f "$PUBLISH/.channel.json.part" "$PUBLISH/channel.json"   # last, so no reader sees a feed before its artifact
chmod 644 "$PUBLISH/$name.tar.gz" "$PUBLISH/$name.json" "$PUBLISH/$name.MANIFEST.sha256" "$PUBLISH/channel.json" 2>/dev/null
printf '%s %s %s %s\n' "$stamp" "$rev12" "$key" "$sha" >> "$PUBLISH/history.log"
log "minted $key as $name.tar.gz ($size bytes, sha256 $(printf %s "$sha" | cut -c1-12)...)"

# Keep the newest $KEEP artifacts (never fewer than 3); the newest is the one the feed names.
n=0
for t in $(ls -1 "$PUBLISH"/$CHANNEL-*.tar.gz | sort -r); do
  n=$((n+1)); [ $n -gt "$KEEP" ] || continue
  b=${t%.tar.gz}; rm -f "$t" "$b.json" "$b.MANIFEST.sha256"; log "retired $(basename "$b")"
done
exit 0
