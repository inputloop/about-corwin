#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# go-live -- runs ON the host. Puts a staged release into the web root.
#
#   sh go-live.sh [stamp]    no stamp: the release this script sits in, or the newest staged one
#
# 1. verifies the release again;  2. copies the whole current web root to <stamp>-previous/ and
# refuses to go on if that copy failed;  3. copies the release's files in, one file at a time
# (each lands whole or not at all), never touching .dh-diag, never deleting;  4. says what changed.
# Settings, all optional: WEBROOT (default ~/aboutcorwin.com), RELEASES (~/aboutcorwin.com-releases).
set -eu
WEB=${WEBROOT:-$HOME/aboutcorwin.com}
REL=${RELEASES:-$HOME/aboutcorwin.com-releases}
here=$(cd "$(dirname "$0")" && pwd)
now=$(date +%Y%m%d-%H%M%S)
CP=${GOLIVE_CP:-cp}

sumc() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
die() { echo "go-live: $*" >&2; exit 1; }

if [ $# -ge 1 ]; then rel=$REL/$1
elif [ -d "$here/../site" ]; then rel=$(cd "$here/.." && pwd)
else rel=$REL/$(ls "$REL" | grep -E '^[0-9]{8}-[0-9]{6}$' | sort | tail -n 1)
fi
[ -d "$rel/site" ] || die "no staged release at $rel (run stage first)"
[ -d "$WEB" ] || die "no web root at $WEB"

(cd "$rel" && sumc -c MANIFEST.sha256 >/dev/null 2>&1) || die "release $rel fails its manifest; nothing changed"

bk=$REL/$now-previous
[ ! -e "$bk" ] || die "$bk already exists; wait a second and try again; nothing changed"
mkdir -p "$bk"
if ! $CP -a "$WEB/." "$bk/"; then die "the backup copy of $WEB failed; refusing to go on, nothing in $WEB was changed"; fi
have=$(cd "$WEB" && find . | wc -l | tr -d ' ')
got=$(cd "$bk" && find . | wc -l | tr -d ' ')
[ "$have" = "$got" ] || die "backup holds $got entries, the web root $have; refusing to go on, nothing in $WEB was changed"
echo "backup:   $bk ($got entries)"

new=0; changed=0; same=0; list=
while IFS= read -r line; do
  f=${line#*  }
  case $f in site/*) ;; *) continue ;; esac
  p=${f#site/}
  case $p in .dh-diag|.dh-diag/*) echo "skipped:  $p (not ours)"; continue ;; esac
  d=$(dirname "$p")
  mkdir -p "$WEB/$d"
  if [ ! -e "$WEB/$p" ]; then new=$((new+1)); list="$list
  new      $p"
  elif cmp -s "$rel/$f" "$WEB/$p"; then same=$((same+1)); continue
  else changed=$((changed+1)); list="$list
  changed  $p"; fi
  cp -p "$rel/$f" "$WEB/$d/.golive.$$" && mv -f "$WEB/$d/.golive.$$" "$WEB/$p"
done < "$rel/MANIFEST.sha256"
printf 'live:     %s\n' "$rel"
printf 'changed:  %s new, %s changed, %s unchanged%s\n' "$new" "$changed" "$same" "$list"
echo "to undo:  sh $REL/rollback"
