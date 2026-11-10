#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
#
# sh tests/deploy/run.sh   -- the access card reader and the stage / go-live / rollback scripts, run
# against a temp directory standing in for the host's home. POSIX sh. Needs only what the scripts need.
set -u
here=$(cd "$(dirname "$0")/../.." && pwd)
cd "$here" || exit 2
T=$(mktemp -d 2>/dev/null || mktemp -d -t abdeploy)
trap 'rm -rf "$T"' EXIT INT TERM
fails=0
ok()   { printf 'ok    %s\n' "$1"; }
no()   { printf 'FAIL  %s\n' "$1"; fails=$((fails+1)); }
want() { # want NAME COMMAND...   passes when the command succeeds
  n=$1; shift; if "$@" >"$T/wout" 2>&1; then ok "$n"; else no "$n"; sed 's/^/        /' "$T/wout"; fi; }
wantno() { n=$1; shift; if "$@" >"$T/wout" 2>&1; then no "$n (it should have been refused)"; else ok "$n"; fi; }
has() { grep -q -- "$1" "$T/out"; }

# ---- the access card -------------------------------------------------------------------------
card=deploy/access/aboutcorwin.card
want "the aboutcorwin card is valid" sh scripts/access-card --check $card
sh scripts/access-card $card > "$T/say" 2>&1
want "the card is read back as a sentence" grep -q 'You reach iad1-shared-b8-03.dreamhost.com as the user dh_f4vxkv' "$T/say"
want "the card says what may not be done" grep -q 'touch mail, databases or the crontab' "$T/say"
mk() { sed "$1" $card > "$T/c.card"; }
mk 's/^host: .*/host: nowhere/';                      wantno "a malformed host is refused" sh scripts/access-card --check "$T/c.card"
mk '/^key-register:/d';                               wantno "a card without its key register is refused" sh scripts/access-card --check "$T/c.card"
mk 's#^key-register: .*#key-register: F:\\claude\\.keys\\id_ed25519#'; wantno "a key path on the card is refused" sh scripts/access-card --check "$T/c.card"
mk 's#^key-register: .*#key-register: /home/x/.ssh/id_rsa#';           wantno "a unix key path on the card is refused" sh scripts/access-card --check "$T/c.card"
mk 's/^note: .*/note: -----BEGIN OPENSSH PRIVATE KEY-----/';           wantno "key text on the card is refused" sh scripts/access-card --check "$T/c.card"
mk '/^may-not:/d';                                    wantno "a card with no may-not lines is refused" sh scripts/access-card --check "$T/c.card"
mk 's/^user: .*/user: dh_f4vxkv\nuser: other/';       wantno "a repeated one-value line is refused" sh scripts/access-card --check "$T/c.card"
mk 's/^tools:/gadgets:/';                             wantno "an unknown key is refused" sh scripts/access-card --check "$T/c.card"

# ---- stage, go-live, rollback ----------------------------------------------------------------
H=$T/home; mkdir -p "$H/aboutcorwin.com"
export HOME=$H
W=$H/aboutcorwin.com
printf 'old index\n' > "$W/index.html"; : > "$W/favicon.ico"
printf "root-owned diagnostics\n" > "$T/diag-target"
ln -s "$T/diag-target" "$W/.dh-diag"
unset RELEASES WEBROOT GOLIVE_CP
mkdir -p "$T/pub/css"
printf 'new index\n' > "$T/pub/index.html"; printf 'body{}\n' > "$T/pub/css/site.css"; printf 'RewriteEngine on\n' > "$T/pub/.htaccess"
printf 'planted by the release\n' > "$T/pub/.dh-diag"
OUT=$T/pub DIST=$T/dist sh scripts/make-dist >/dev/null 2>&1
want "make-dist writes a tarball and a stage script" test -f "$T/dist/about-corwin.tar.gz" -a -f "$T/dist/stage.sh"
want "the manifest lists the dotfile" sh -c "tar -xzOf '$T/dist/about-corwin.tar.gz' MANIFEST.sha256 | grep -q ' site/.htaccess\$'"

STAMP=20261101-000001 sh "$T/dist/stage.sh" "$T/dist/about-corwin.tar.gz" > "$T/out" 2>&1
want "stage verifies a good release" grep -q '^VERIFIED: 7 files match MANIFEST.sha256, none extra' "$T/out"
R=$H/aboutcorwin.com-releases
want "stage left the live site alone" grep -q 'old index' "$W/index.html"

# a tampered file fails verification and is kept as -FAILED
mkdir "$T/bad"; (cd "$T/bad" && tar xzf "$T/dist/about-corwin.tar.gz" && printf 'evil\n' >> site/index.html && tar czf ../tampered.tar.gz site deploy MANIFEST.sha256)
STAMP=20261101-000002 sh "$T/dist/stage.sh" "$T/tampered.tar.gz" > "$T/out" 2>&1 && no "a tampered file must fail verification" || ok "a tampered file fails verification"
want "the failed release is kept, renamed -FAILED" test -d "$R/20261101-000002-FAILED"
# an extra file fails too
(cd "$T/bad" && tar xzf "$T/dist/about-corwin.tar.gz" && printf 'x\n' > site/extra.txt && tar czf ../extra.tar.gz site deploy MANIFEST.sha256)
STAMP=20261101-000003 sh "$T/dist/stage.sh" "$T/extra.tar.gz" > "$T/out" 2>&1 && no "an unlisted extra file must fail verification" || ok "an unlisted extra file fails verification"
# a tarball that climbs out is refused
(cd "$T/bad" && mkdir -p up && printf x > up/f && tar czPf ../climb.tar.gz up/../up/f) >/dev/null 2>&1
want "the climbing tarball was made" sh -c "tar -tzf '$T/climb.tar.gz' 2>/dev/null | grep -q '\\.\\.'"
STAMP=20261101-000004 sh "$T/dist/stage.sh" "$T/climb.tar.gz" > "$T/out" 2>&1 && no "a tarball naming .. must be refused" || ok "a tarball naming .. is refused"
want "and says why" grep -q 'absolute path or ..' "$T/out"
want "the one-word scripts were installed beside the releases" test -f "$R/go-live" -a -f "$R/rollback" -a -f "$R/stage"

# go-live refuses when the backup copy fails, and leaves the live site as it was
sleep 1
GOLIVE_CP=false sh "$R/go-live" 20261101-000001 > "$T/out" 2>&1 && no "go-live must refuse when the backup failed" || ok "go-live refuses when the backup copy failed"
want "the refusal says so" grep -q 'backup copy .* failed' "$T/out"
want "nothing in the web root changed on that refusal" grep -q 'old index' "$W/index.html"
# go-live refuses a release that fails its manifest
printf 'x\n' >> "$R/20261101-000001/site/css/site.css"
sleep 1
sh "$R/go-live" 20261101-000001 > "$T/out" 2>&1 && no "go-live must re-verify the release" || ok "go-live refuses a release that no longer verifies"
want "and says it fails its manifest" grep -q 'fails its manifest' "$T/out"
(cd "$R/20261101-000001" && sed '$d' site/css/site.css > "$T/s" && printf 'body{}\n' > site/css/site.css)

sleep 1
sh "$R/go-live" 20261101-000001 > "$T/out" 2>&1; rc=$?
[ $rc = 0 ] && ok "go-live succeeds" || { no "go-live succeeds"; cat "$T/out"; }
want "the site is now the new release" grep -q 'new index' "$W/index.html"
want "the dotfile arrived" test -f "$W/.htaccess"
want "go-live reports what changed" grep -q 'changed:  2 new, 1 changed, 0 unchanged' "$T/out"
want ".dh-diag is still the root-owned link" test -L "$W/.dh-diag"
want ".dh-diag still points where it did" sh -c "[ \"\$(readlink '$W/.dh-diag')\" = '$T/diag-target' ]"
want ".dh-diag's target was not written through" grep -q 'root-owned diagnostics' "$T/diag-target"
want "the 2021 favicon was not deleted" test -f "$W/favicon.ico"
want "a -previous copy of the old site exists" sh -c "grep -q 'old index' '$R'/*-previous/index.html"
want "the -previous copy kept the link too" sh -c "test -L '$R'/*-previous/.dh-diag"

# a copy made before DreamHost added its link must not make rollback remove the link
rm -f "$R"/*-previous/.dh-diag
sleep 1
sh "$R/rollback" > "$T/out" 2>&1; rc=$?
[ $rc = 0 ] && ok "rollback succeeds" || { no "rollback succeeds"; cat "$T/out"; }
want "rollback puts the old index back" grep -q 'old index' "$W/index.html"
want "rollback removed what only the release had" sh -c "test ! -e '$W/css/site.css' -a ! -e '$W/.htaccess'"
want "rollback kept .dh-diag" test -L "$W/.dh-diag"
want "rollback made its own backup first" sh -c "test -d '$R'/*-before-rollback && grep -q 'new index' '$R'/*-before-rollback/index.html"
sleep 1
GOLIVE_CP=false sh "$R/rollback" > "$T/out" 2>&1 && no "rollback must refuse when its backup failed" || ok "rollback refuses when its backup copy failed"
want "no release or copy was deleted along the way" sh -c "test -d '$R/20261101-000001' -a -d '$R/20261101-000002-FAILED'"

if [ $fails = 0 ]; then echo "DEPLOY CHECKS PASSED"; else echo "DEPLOY CHECKS FAILED ($fails)"; exit 1; fi
