#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# pull-aboutcorwin -- runs ON the DreamHost account, every 17 minutes (deploy/schedule installs the
# cron entry). Reads the channel feed; if its key is not the one installed, downloads the artifact,
# checks its sha256, stages a new dated release (stage.sh checks the manifest) and runs go-live
# (which copies the whole web root aside first). It never deletes anything in the web root or the
# releases folder. On any failure the site is left as it was and one line goes to the log.
#
#   sh pull-aboutcorwin.sh [-v] [-n]     -v say what happens   -n only say whether something is new
# Needs: sh, curl or wget, sha256sum or shasum, tar, awk; chan-read.sh beside this script.
# Settings (environment, all optional):
#   PULL_FEED      the feed address        (https://corwin.cloud/dist/about-corwin/channel.json)
#   RELEASES       releases folder         ($HOME/aboutcorwin.com-releases)
#   WEBROOT        the live site           ($HOME/aboutcorwin.com)
#   PULL_FETCHER   curl or wget            (curl if present, else wget)
#   PULL_KEYRING   a gpg keyring file holding the release public key; with it a feed that carries a signature is verified
#   PULL_REQUIRE_SIG=1   refuse any artifact without a signature that verifies (off until the C4 release key exists)
#   CHAN_ALLOW_INSECURE=1   accept http:// or file:// addresses (tests only)
# To install an older revision: PULL_FEED=<address of that revision's own .json> sh pull-aboutcorwin.sh -v
set -u
FEED=${PULL_FEED:-https://corwin.cloud/dist/about-corwin/channel.json}
REL=${RELEASES:-$HOME/aboutcorwin.com-releases}
WEB=${WEBROOT:-$HOME/aboutcorwin.com}
here=$(cd "$(dirname "$0")" && pwd)
READ=${PULL_READER:-$here/chan-read.sh}
V=0; DRY=0
for a in "$@"; do case $a in -v) V=1 ;; -n) DRY=1 ;; *) echo "usage: pull-aboutcorwin.sh [-v] [-n]" >&2; exit 64 ;; esac; done
LOG=$REL/pull.log
INST=$REL/.installed-about-corwin
FAILS=$REL/.failed-about-corwin
mkdir -p "$REL" 2>/dev/null || { echo "pull: cannot make $REL" >&2; exit 1; }
say() { [ $V = 1 ] && echo "$*"; return 0; }
log() { printf '%s %s\n' "$(date +%Y-%m-%dT%H:%M:%S)" "$*" >> "$LOG"; say "$*"; }
bye() { log "FAILED: $* (the site was left alone)"; echo "pull: $*" >&2; exit 1; }
sumc() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

LOCK=$REL/.pull.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  old=$(cat "$LOCK/pid" 2>/dev/null || echo 0)
  if [ "$old" != 0 ] && kill -0 "$old" 2>/dev/null; then log "skipped: another run (pid $old) is in progress"; exit 0; fi
  echo $$ > "$LOCK/pid" 2>/dev/null || bye "cannot take over the lock at $LOCK"
else echo $$ > "$LOCK/pid"; fi
tmp=$REL/.pull-tmp.$$
trap 'rm -rf "$tmp"; rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM   # only our own scratch and lock
mkdir "$tmp" || bye "cannot make $tmp"

fetcher=${PULL_FETCHER:-}
if [ -z "$fetcher" ]; then if command -v curl >/dev/null 2>&1; then fetcher=curl; else fetcher=wget; fi; fi
get() {  # address outfile
  case $fetcher in
    curl) curl -fsS --max-time 120 -o "$2" "$1" 2>"$tmp/get.err" ;;
    wget) wget -q -T 120 -O "$2" "$1" 2>"$tmp/get.err" ;;
    *) echo "unknown fetcher $fetcher" >"$tmp/get.err"; return 1 ;;
  esac
}

get "$FEED" "$tmp/channel.json" || bye "cannot read the feed $FEED: $(tail -n 1 "$tmp/get.err")"
sh "$READ" "$tmp/channel.json" >"$tmp/fields" 2>"$tmp/read.err" || bye "the feed does not pass its checks: $(cat "$tmp/read.err")"
fld() { sh "$READ" "$tmp/channel.json" "$1"; }
key=$(fld key); rev=$(fld revision); sha=$(fld sha256); art=$(fld artifact); chan=$(fld channel)
[ "$chan" = about-corwin ] || bye "the feed is for channel $chan, not about-corwin"

have=$(sed -n 's/^key=//p' "$INST" 2>/dev/null | head -n 1)
if [ "$have" = "$key" ]; then say "nothing new (installed key is $key)"; exit 0; fi
if [ $DRY = 1 ]; then echo "new: $key (installed: ${have:-none})"; exit 0; fi

# Give up on a key that has already failed three times at stage or go-live; every try copies the web root aside.
nfail=0; fkey=
if [ -f "$FAILS" ]; then fkey=$(sed -n 1p "$FAILS"); nfail=$(sed -n 2p "$FAILS"); fi
[ "$fkey" = "$key" ] || nfail=0
case $nfail in ''|*[!0-9]*) nfail=0 ;; esac
if [ "$nfail" -ge 3 ]; then log "gave up on $key after 3 failed installs; waiting for a newer key"; exit 1; fi

case $art in http*|file*) url=$art ;; *) url=${FEED%/*}/$art ;; esac
get "$url" "$tmp/artifact.tar.gz" || bye "cannot download $url: $(tail -n 1 "$tmp/get.err")"
got=$(sumc "$tmp/artifact.tar.gz" | cut -d' ' -f1)
[ "$got" = "$sha" ] || bye "sha256 mismatch for $url (feed says $sha, file is $got)"

sigfield=$(fld signature 2>/dev/null); sigok=no
if [ -n "$sigfield" ]; then
  if [ -n "${PULL_KEYRING:-}" ] && command -v gpg >/dev/null 2>&1; then
    case $sigfield in http*|file*) surl=$sigfield ;; *) surl=${FEED%/*}/$sigfield ;; esac
    get "$surl" "$tmp/artifact.sig" || bye "cannot download the signature $surl"
    gpg --no-default-keyring --keyring "$PULL_KEYRING" --verify "$tmp/artifact.sig" "$tmp/artifact.tar.gz" >"$tmp/gpg.out" 2>&1 || bye "the signature does not verify: $(tail -n 1 "$tmp/gpg.out")"
    sigok=yes
  fi
fi
[ "${PULL_REQUIRE_SIG:-}" != 1 ] || [ $sigok = yes ] || bye "a verified signature is required and there is none"

[ -d "$WEB" ] || bye "no web root at $WEB"
if tar -tzf "$tmp/artifact.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then bye "the artifact names an absolute path or .."; fi
mkdir "$tmp/x" && tar -xzf "$tmp/artifact.tar.gz" -C "$tmp/x" deploy/stage.sh || bye "the artifact holds no deploy/stage.sh"

now=$(date +%Y%m%d-%H%M%S)
fail_install() {
  [ "$fkey" = "$key" ] && nfail=$((nfail+1)) || nfail=1
  printf '%s\n%s\n' "$key" "$nfail" > "$FAILS"
  bye "$1"
}
RELEASES=$REL STAMP=$now sh "$tmp/x/deploy/stage.sh" "$tmp/artifact.tar.gz" >"$tmp/stage.out" 2>&1 || fail_install "stage failed: $(tail -n 1 "$tmp/stage.out")"
RELEASES=$REL WEBROOT=$WEB sh "$REL/go-live" "$now" >"$tmp/golive.out" 2>&1 || fail_install "go-live failed at release $now: $(tail -n 1 "$tmp/golive.out")"

printf 'key=%s\nrevision=%s\nsha256=%s\nrelease=%s\ninstalled=%s\n' "$key" "$rev" "$sha" "$now" "$now" > "$INST.part" && mv -f "$INST.part" "$INST"
printf '%s\n%s\n' "$key" 0 > "$FAILS"
bk=$(sed -n 's/^backup: *//p' "$tmp/golive.out" | head -n 1)
nf=$(grep -Ec '^  (new|changed) ' "$tmp/golive.out")
log "installed $key as release $now ($nf files new or changed; web root copied to ${bk:-?} first)"
exit 0
