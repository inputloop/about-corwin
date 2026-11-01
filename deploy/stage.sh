#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# stage -- runs ON the host. Unpacks about-corwin.tar.gz into a new dated release folder under
# ~/aboutcorwin.com-releases/ and checks every file against MANIFEST.sha256. It never touches the
# live web root. A release that fails the check is renamed <stamp>-FAILED, never deleted.
#
#   sh stage.sh [tarball]      (default: about-corwin.tar.gz beside this script)
#
# Settings, all optional: RELEASES (default ~/aboutcorwin.com-releases), STAMP (default now).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tarball=${1:-$here/about-corwin.tar.gz}
REL=${RELEASES:-$HOME/aboutcorwin.com-releases}
stamp=${STAMP:-$(date +%Y%m%d-%H%M%S)}

sumc() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

[ -f "$tarball" ] || { echo "stage: no tarball at $tarball" >&2; exit 1; }
# Refuse a tarball that could write outside its own folder.
if tar -tzf "$tarball" 2>/dev/null | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "stage: refused, the tarball names an absolute path or .." >&2; exit 1
fi
mkdir -p "$REL"
dest=$REL/$stamp
[ ! -e "$dest" ] || { echo "stage: $dest already exists; nothing changed" >&2; exit 1; }
mkdir "$dest"
tar -xzf "$tarball" -C "$dest"
cd "$dest"
[ -f MANIFEST.sha256 ] || { cd "$REL"; mv "$stamp" "$stamp-FAILED"; echo "stage: FAILED, no MANIFEST.sha256 (kept as $stamp-FAILED)" >&2; exit 1; }

bad=0
sumc -c MANIFEST.sha256 >"$REL/.stage-check.$$" 2>&1 || bad=1
# Nothing may be present that the manifest does not list.
find site deploy -type f | sort > "$REL/.stage-have.$$"
sed 's/^[0-9a-f]*  //' MANIFEST.sha256 | sort > "$REL/.stage-want.$$"
extra=$(comm -23 "$REL/.stage-have.$$" "$REL/.stage-want.$$" | tr '\n' ' ')
[ -z "$extra" ] || { bad=1; echo "stage: files the manifest does not list: $extra" >&2; }
n=$(wc -l < MANIFEST.sha256 | tr -d ' ')
if [ $bad = 1 ]; then
  grep -v ': OK$' "$REL/.stage-check.$$" >&2 || true
  rm -f "$REL/.stage-check.$$" "$REL/.stage-have.$$" "$REL/.stage-want.$$"
  cd "$REL"; mv "$stamp" "$stamp-FAILED"
  echo "stage: VERIFICATION FAILED; kept as $REL/$stamp-FAILED; the live site was not touched" >&2
  exit 1
fi
rm -f "$REL/.stage-check.$$" "$REL/.stage-have.$$" "$REL/.stage-want.$$"

# One word each for the person: go-live and rollback, beside the releases.
for w in go-live rollback; do cp "$dest/deploy/$w.sh" "$REL/$w"; done
cp "$dest/deploy/stage.sh" "$REL/stage"

echo "VERIFIED: $n files match MANIFEST.sha256, none extra"
echo "staged:   $dest"
echo "to go live (copies the web root aside first):  sh $REL/go-live $stamp"
