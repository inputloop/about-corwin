#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
#
# rollback -- runs ON the host. Puts the newest <stamp>-previous copy (made by go-live) back as the
# web root. First copies the current web root to <stamp>-before-rollback/ and refuses to go on if
# that failed. Files that only the rolled-back release had are removed from the web root (they are
# in the copy just made); .dh-diag is never touched. Old copies are never deleted.
#
#   sh rollback.sh [name-of-previous-folder]
set -eu
WEB=${WEBROOT:-$HOME/aboutcorwin.com}
REL=${RELEASES:-$HOME/aboutcorwin.com-releases}
now=$(date +%Y%m%d-%H%M%S)
CP=${GOLIVE_CP:-cp}
die() { echo "rollback: $*" >&2; exit 1; }

if [ $# -ge 1 ]; then prev=$REL/$1
else prev=$REL/$(ls "$REL" | grep -E '^[0-9]{8}-[0-9]{6}-previous$' | sort | tail -n 1)
fi
[ -d "$prev" ] && [ "$prev" != "$REL/" ] || die "no -previous copy found in $REL"
[ -d "$WEB" ] || die "no web root at $WEB"

bk=$REL/$now-before-rollback
[ ! -e "$bk" ] || die "$bk already exists; try again in a second; nothing changed"
mkdir -p "$bk"
if ! $CP -a "$WEB/." "$bk/"; then die "the backup copy of $WEB failed; refusing to go on, nothing was changed"; fi
have=$(cd "$WEB" && find . | wc -l | tr -d ' ')
got=$(cd "$bk" && find . | wc -l | tr -d ' ')
[ "$have" = "$got" ] || die "backup holds $got entries, the web root $have; refusing to go on, nothing was changed"
echo "backup:   $bk ($got entries)"

restored=0; removed=0
( cd "$prev" && find . -mindepth 1 \( -type f -o -type l \) ! -path ./.dh-diag | sed 's#^\./##' ) > "$REL/.rb-want.$$"
while IFS= read -r p; do
  d=$(dirname "$p"); mkdir -p "$WEB/$d"
  if [ -e "$WEB/$p" ] && cmp -s "$prev/$p" "$WEB/$p"; then continue; fi
  cp -p "$prev/$p" "$WEB/$d/.rollback.$$" && mv -f "$WEB/$d/.rollback.$$" "$WEB/$p"
  restored=$((restored+1))
done < "$REL/.rb-want.$$"
( cd "$WEB" && find . -mindepth 1 \( -type f -o -type l \) ! -path ./.dh-diag | sed 's#^\./##' ) | sort > "$REL/.rb-have.$$"
sort "$REL/.rb-want.$$" > "$REL/.rb-want2.$$"
for p in $(comm -13 "$REL/.rb-want2.$$" "$REL/.rb-have.$$"); do rm -f "$WEB/$p"; removed=$((removed+1)); done
rm -f "$REL/.rb-want.$$" "$REL/.rb-want2.$$" "$REL/.rb-have.$$"
echo "restored: $restored file(s) from $prev; $removed file(s) only the release had removed from the web root"
