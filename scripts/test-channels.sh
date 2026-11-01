#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Checks for the channel scripts in deploy/ (puller, schedule) against local fakes: a fake web
# folder, a fake web root, a fake crontab. Nothing here touches a real host or a real crontab.
#   sh scripts/test-channels.sh               run the checks
#   sh scripts/test-channels.sh --prove-red   plant a fault in a copy of the scripts; each must turn a check red
# The minter is checked in the second language: python3 scripts/test_channels.py (also run by --prove-red).
# DEPLOY_DIR=dir uses the scripts in dir instead of deploy/.
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
SD=$REPO/deploy
D=${DEPLOY_DIR:-$SD}
PASS=0; FAIL=0

# ---- the prove-red driver comes first so a plant never runs the checks inline ----
if [ "${1:-}" = "--prove-red" ]; then
  t=$(mktemp -d); bad=0
  plant() {  # name file sed-expr which(sh|py)
    rm -rf "$t/d"; mkdir "$t/d"; cp "$SD"/pull-aboutcorwin.sh "$SD"/mint-about-corwin.sh "$SD"/schedule "$SD"/chan-read.sh "$t/d/"
    sed "$3" "$t/d/$2" > "$t/x" && cp "$t/x" "$t/d/$2"
    if cmp -s "$SD/$2" "$t/d/$2"; then echo "PLANT FAILED  $1"; bad=1; return; fi
    if [ "$4" = sh ]; then DEPLOY_DIR=$t/d sh "$0" >"$t/log" 2>&1; else DEPLOY_DIR=$t/d python3 "$REPO/scripts/test_channels.py" >"$t/log" 2>&1; fi
    if [ $? = 0 ]; then echo "STAYED GREEN  $1"; bad=1; else echo "went red      $1  ($(grep -m1 -E '^(FAIL|not ok)' "$t/log" | cut -c1-70))"; fi
  }
  plant "puller: sha256 not checked"            pull-aboutcorwin.sh 's/^\[ "\$got" = "\$sha" \] ||.*$/:/' sh
  plant "puller: same key installs again"       pull-aboutcorwin.sh 's/^if \[ "\$have" = "\$key" \]; then.*$/if false; then :; fi/' sh
  plant "puller: compares revision, not key"    pull-aboutcorwin.sh 's/^have=.*$/have=$(sed -n "s\/^revision=\/\/p" "$INST" 2>\/dev\/null | head -n 1); key=$rev/' sh
  plant "puller: missing artifact not an error" pull-aboutcorwin.sh 's/|| bye "cannot download \$url[^"]*"/|| :/' sh
  plant "puller: lock ignored"                  pull-aboutcorwin.sh 's/^if ! mkdir "\$LOCK" 2>\/dev\/null; then/mkdir -p "$LOCK"; if false; then/' sh
  plant "puller: a failed stage is not counted" pull-aboutcorwin.sh 's/^  \[ "\$fkey" = "\$key" \] && nfail=.*$/  nfail=0; printf "x\\n0\\n" > "$FAILS"/' sh
  plant "puller: a required signature not required" pull-aboutcorwin.sh 's/^\[ "\${PULL_REQUIRE_SIG:-}" != 1 \].*$/:/' sh
  plant "puller: bad feed not refused"          pull-aboutcorwin.sh 's/|| bye "the feed does not pass its checks[^"]*"/|| :/' sh
  plant "schedule: strips to end of file"       schedule "s/\$0==e{skip=0;next} //" sh
  plant "schedule: duplicates the block"        schedule 's/^  if grep -qxF "\$BEGIN" "\$tmp.old"; then.*$/  if false; then/' sh
  plant "schedule: refuses nothing odd"         schedule 's/^  \[ "\$b" = "\$e" \] \&\& \[ "\$b" -le 1 \] ||.*$/  :/' sh
  plant "minter: moves on revision only"        mint-about-corwin.sh 's/^key=\$CHANNEL:\$rev12:\$ci8:\$blog8$/key=$CHANNEL:$rev12:x:x/' py
  plant "minter: failed checks ignored"         mint-about-corwin.sh 's/|| die "checks failed for/|| log "ignored: checks failed for/' py
  plant "minter: lock ignored"                  mint-about-corwin.sh 's/^if ! mkdir "\$LOCK" 2>\/dev\/null; then/mkdir -p "$LOCK"; if false; then/' py
  plant "minter: retention keeps nothing"       mint-about-corwin.sh 's/\[ \$n -gt "\$KEEP" \] || continue/[ $n -gt 0 ] || continue/' py
  plant "minter: feed written before artifact"  mint-about-corwin.sh 's/^mv -f "\$PUBLISH\/\.channel\.json\.part" "\$PUBLISH\/channel\.json".*$/:/' py
  rm -rf "$t"
  [ $bad = 0 ] && echo "PROVE-RED OK" || { echo "PROVE-RED FAILED"; exit 1; }
  exit 0
fi

T=$(mktemp -d); trap 'kill $(cat "$T/sleeper.pid" 2>/dev/null) 2>/dev/null; rm -rf "$T"' EXIT INT TERM
ok() { PASS=$((PASS+1)); }
no() { FAIL=$((FAIL+1)); echo "FAIL $1"; }
chk() { d=$1; shift; if "$@" >/dev/null 2>&1; then ok; else no "$d"; fi; }
sumc() { sha256sum "$1" | cut -d' ' -f1; }

FW=$T/web-fake; REL=$T/rel; WEB=$T/web; mkdir -p "$FW" "$REL" "$WEB"
echo "old site" > "$WEB/index.html"; echo "keep me" > "$WEB/extra.txt"

mkrel() {  # name version key [badmanifest]   -> $FW/<name>.tar.gz and a feed naming it
  w=$T/rb.$1; rm -rf "$w"; mkdir -p "$w/site" "$w/deploy"
  echo "site version $2" > "$w/site/index.html"
  for f in stage go-live rollback; do cp "$SD/$f.sh" "$w/deploy/$f.sh"; done
  (cd "$w" && find site deploy -type f | sort | while IFS= read -r f; do sha256sum "$f"; done > MANIFEST.sha256)
  [ "${4:-}" != bad ] || echo "site version tampered" > "$w/site/index.html"
  tar -czf "$FW/$1.tar.gz" -C "$w" site deploy MANIFEST.sha256
  feed "$1" "$(sumc "$FW/$1.tar.gz")" "$3" "$2"
}
feed() {  # name sha key rev
  cat > "$FW/channel.json.part" <<J
{
  "format": "channel/1",
  "channel": "about-corwin",
  "revision": "$(printf '%s' "$4" | sha1sum | cut -c1-40)",
  "stamp": "20261101-120000",
  "artifact": "$1.tar.gz",
  "sha256": "$2",
  "key": "$3"
}
J
  mv "$FW/channel.json.part" "$FW/channel.json"
}
pull() {  # runs the puller against the fakes; stdout+stderr to $T/out
  PULL_FEED=file://$FW/channel.json RELEASES=$REL WEBROOT=$WEB PULL_READER=$D/chan-read.sh sh "$D/pull-aboutcorwin.sh" "$@" >"$T/out" 2>&1
}
nrel() { ls "$REL" | grep -cE '^[0-9]{8}-[0-9]{6}$'; }
loglines() { wc -l < "$REL/pull.log" 2>/dev/null || echo 0; }

mkrel r1 1 about-corwin:aaaaaaaaaaaa:11111111:22222222

# 1. first run installs
pull -v; r=$?
chk "first run exits 0" test $r = 0
chk "first run: the web root has the new page" grep -q "site version 1" "$WEB/index.html"
chk "first run: installed record holds the key" grep -qx "key=about-corwin:aaaaaaaaaaaa:11111111:22222222" "$REL/.installed-about-corwin"
chk "first run: the log says installed" grep -q " installed about-corwin:aaaaaaaaaaaa" "$REL/pull.log"
chk "first run: one release folder" test "$(nrel)" = 1
chk "first run: a backup of the old web root exists" sh -c "grep -q 'old site' $REL/*-previous/index.html"
chk "first run: a file the release does not have is still there" grep -q "keep me" "$WEB/extra.txt"

# 2. same revision: quiet, nothing changes
before=$(loglines); nr=$(nrel)
pull; r=$?
chk "same key: exit 0" test $r = 0
chk "same key: no output at all" test ! -s "$T/out"
chk "same key: no new log line" test "$(loglines)" = "$before"
chk "same key: no new release" test "$(nrel)" = "$nr"
sleep 1

# 3. feed-only change: same revision, new key
mkrel r2 2 about-corwin:aaaaaaaaaaaa:33333333:22222222
sed -i 's/"revision": "[0-9a-f]*"/"revision": "'"$(printf '%s' 1 | sha1sum | cut -c1-40)"'"/' "$FW/channel.json"
pull; r=$?
chk "feed-only change installs" test $r = 0
chk "feed-only change: new page" grep -q "site version 2" "$WEB/index.html"
chk "feed-only change: installed key moved" grep -qx "key=about-corwin:aaaaaaaaaaaa:33333333:22222222" "$REL/.installed-about-corwin"
chk "feed-only change: older release kept" test "$(nrel)" = 2
sleep 1

# 4. bad sha: the file changed after the feed was written
mkrel r3 3 about-corwin:bbbbbbbbbbbb:33333333:22222222
echo junk >> "$FW/r3.tar.gz"
nr=$(nrel); pull; r=$?
chk "bad sha: exit 1" test $r = 1
chk "bad sha: the site is as it was" grep -q "site version 2" "$WEB/index.html"
chk "bad sha: the log says mismatch" grep -q "sha256 mismatch" "$REL/pull.log"
chk "bad sha: nothing staged" test "$(nrel)" = "$nr"
chk "bad sha: installed key unchanged" grep -qx "key=about-corwin:aaaaaaaaaaaa:33333333:22222222" "$REL/.installed-about-corwin"

# 5. missing artifact
mkrel r4 4 about-corwin:cccccccccccc:33333333:22222222
mv "$FW/r4.tar.gz" "$FW/r4.gone"
pull; r=$?
chk "missing artifact: exit 1" test $r = 1
chk "missing artifact: the log says cannot download" grep -q "cannot download" "$REL/pull.log"
chk "missing artifact: the site is as it was" grep -q "site version 2" "$WEB/index.html"
mv "$FW/r4.gone" "$FW/r4.tar.gz"

# 6. overlapping run: a live pid holds the lock
sleep 60 & echo $! > "$T/sleeper.pid"
mkdir "$REL/.pull.lock"; cat "$T/sleeper.pid" > "$REL/.pull.lock/pid"
pull; r=$?
chk "overlap: exit 0" test $r = 0
chk "overlap: nothing installed" grep -q "site version 2" "$WEB/index.html"
chk "overlap: the log says skipped" grep -q "skipped: another run" "$REL/pull.log"
chk "overlap: the other run's lock is still there" test -d "$REL/.pull.lock"
kill "$(cat "$T/sleeper.pid")" 2>/dev/null; wait 2>/dev/null
# a dead pid's lock is taken over
echo 999999 > "$REL/.pull.lock/pid"
sleep 1; pull; r=$?
chk "stale lock: taken over, exit 0" test $r = 0
chk "stale lock: install happened" grep -q "site version 4" "$WEB/index.html"
chk "stale lock: lock released afterward" test ! -d "$REL/.pull.lock"

# 7. a feed that fails its checks
printf '{"format":"channel/1"}' > "$FW/channel.json"
pull; r=$?
chk "bad feed: exit 1" test $r = 1
chk "bad feed: the log says why" grep -q "does not pass its checks" "$REL/pull.log"
chk "bad feed: the site is as it was" grep -q "site version 4" "$WEB/index.html"

# 8. a signature is required and there is none
mkrel r5 5 about-corwin:dddddddddddd:33333333:22222222
PULL_REQUIRE_SIG=1 pull; r=$?
chk "required signature missing: exit 1" test $r = 1
chk "required signature missing: the log says so" grep -q "signature is required" "$REL/pull.log"
chk "required signature missing: site unchanged" grep -q "site version 4" "$WEB/index.html"

# 9. dry run says what it sees and changes nothing
pull -n; r=$?
chk "dry run: exit 0" test $r = 0
chk "dry run: says new" grep -q "^new: about-corwin:dddddddddddd" "$T/out"
chk "dry run: site unchanged" grep -q "site version 4" "$WEB/index.html"

# 10. a release whose manifest does not match its files: three tries, then it gives up
mkrel r6 6 about-corwin:eeeeeeeeeeee:33333333:22222222 bad
echo "site version 6" > "$T/dummy"
nr=$(nrel)
i=0; while [ $i -lt 4 ]; do sleep 1; pull; i=$((i+1)); done
chk "failed install: the site is as it was" grep -q "site version 4" "$WEB/index.html"
chk "failed install: three FAILED folders kept" test "$(ls "$REL" | grep -c -- '-FAILED$')" = 3
chk "failed install: the fourth run gave up" grep -q "gave up on about-corwin:eeeeeeeeeeee" "$REL/pull.log"
chk "failed install: nothing was deleted" test "$(nrel)" = "$nr"
sleep 1
mkrel r7 7 about-corwin:ffffffffffff:33333333:22222222
pull; r=$?
chk "a newer key is tried again after giving up" test $r = 0
chk "a newer key installs" grep -q "site version 7" "$WEB/index.html"

# 11. no web root: fail, change nothing
mkrel r8 8 about-corwin:999999999999:33333333:22222222
sleep 1; WEB2=$WEB; WEB=$T/nowhere; pull; r=$?; WEB=$WEB2
chk "no web root: exit 1" test $r = 1
chk "no web root: the log says so" grep -q "no web root" "$REL/pull.log"
chk "no web root: nothing staged for it" test "$(ls "$REL" | grep -c 20)" -ge 1

# ---- schedule, against a fake crontab and a fake systemctl ----
FB=$T/fakebin; mkdir "$FB"
cat > "$FB/crontab" <<'F'
#!/bin/sh
tab=${FAKE_CRONTAB:?}
case ${1:-} in
  -l) if [ -s "$tab" ]; then cat "$tab"; else echo "no crontab for x" >&2; exit 1; fi ;;
  -r) rm -f "$tab" ;;
  *) cat "$1" > "$tab" ;;
esac
F
chmod +x "$FB/crontab"
cat > "$FB/systemctl" <<'F'
#!/bin/sh
echo "$@" >> "${FAKE_SYSLOG:?}"
case $1 in cat) [ -f "${FAKE_UNITS:?}/about-corwin-mint.timer" ] ;; *) : ;; esac
F
chmod +x "$FB/systemctl"
export FAKE_CRONTAB=$T/crontab FAKE_SYSLOG=$T/syslog FAKE_UNITS=$T/units
mkdir -p "$FAKE_UNITS"; : > "$FAKE_SYSLOG"
sched() { HOME=$T/home PATH=$FB:$PATH SCHED_BIN=$T/home/bin SCHED_UNITS=$FAKE_UNITS SCHED_SUDO= SCHED_SYSTEMCTL=$FB/systemctl RELEASES=$REL sh "$D/schedule" "$@" >"$T/sout" 2>&1; }
mkdir -p "$T/home"
printf '# my own line\n0 5 * * * /bin/true\n' > "$FAKE_CRONTAB"
sched install puller; r=$?
chk "schedule: install exits 0" test $r = 0
chk "schedule: the block is there once" test "$(grep -c '^# BEGIN about-corwin pull' "$FAKE_CRONTAB")" = 1
chk "schedule: the cron line names the puller and 17 minutes" grep -q '^\*/17 \* \* \* \* /bin/sh .*/bin/pull-aboutcorwin.sh' "$FAKE_CRONTAB"
chk "schedule: other lines kept" grep -qx '0 5 \* \* \* /bin/true' "$FAKE_CRONTAB"
chk "schedule: scripts copied" test -x "$T/home/bin/pull-aboutcorwin.sh" -a -f "$T/home/bin/chan-read.sh"
chk "schedule: old crontab backed up" sh -c "ls $T/home/crontab-backup-* >/dev/null"
cp "$FAKE_CRONTAB" "$T/after1"
sched install puller
chk "schedule: a second install changes nothing" cmp -s "$FAKE_CRONTAB" "$T/after1"
chk "schedule: the second install says unchanged" grep -q "unchanged" "$T/sout"
sched status puller
chk "schedule: status says SCHEDULED" grep -q "^SCHEDULED by cron" "$T/sout"
chk "schedule: status says what it last did" grep -q "installed" "$T/sout"
printf '# a line after the block\n' >> "$FAKE_CRONTAB"
cp "$FAKE_CRONTAB" "$T/after2"
sched install puller
chk "schedule: an install with lines after the block leaves it where it is" cmp -s "$FAKE_CRONTAB" "$T/after2"
sched remove puller
chk "schedule: remove keeps a line that came after the block" grep -qx '# a line after the block' "$FAKE_CRONTAB"
chk "schedule: remove takes out the block" test "$(grep -c 'about-corwin' "$FAKE_CRONTAB")" = 0
chk "schedule: remove keeps the other lines" sh -c "grep -qx '# my own line' $FAKE_CRONTAB && grep -qx '0 5 \* \* \* /bin/true' $FAKE_CRONTAB"
sched status puller
chk "schedule: status after remove says NOT SCHEDULED" grep -q "^NOT SCHEDULED" "$T/sout"
printf '# my own line\n# BEGIN about-corwin pull (managed by deploy/schedule)\nstray\n' > "$FAKE_CRONTAB"
cp "$FAKE_CRONTAB" "$T/broken"
sched install puller; r=$?
chk "schedule: a half-marked crontab is refused" test $r = 1
chk "schedule: a half-marked crontab is left exactly alone" cmp -s "$FAKE_CRONTAB" "$T/broken"
chk "schedule: the refusal says why" grep -q "will not guess" "$T/sout"
rm -f "$FAKE_CRONTAB"
sched install puller
chk "schedule: install into an empty crontab works" grep -q '^# END about-corwin pull' "$FAKE_CRONTAB"
sched remove puller
chk "schedule: removing the only block empties the crontab" test ! -s "$FAKE_CRONTAB"
# minter by systemd
sched install minter; r=$?
chk "schedule: minter install exits 0" test $r = 0
chk "schedule: minter writes a timer unit with 17 minutes" grep -q 'OnUnitActiveSec=17min' "$FAKE_UNITS/about-corwin-mint.timer"
chk "schedule: minter writes a service unit that runs the script" grep -q "ExecStart=/bin/sh $T/home/bin/mint-about-corwin.sh" "$FAKE_UNITS/about-corwin-mint.service"
chk "schedule: minter enables the timer" grep -q 'enable --now about-corwin-mint.timer' "$FAKE_SYSLOG"
sched status minter
chk "schedule: minter status says SCHEDULED by systemd" grep -q "^SCHEDULED by systemd" "$T/sout"
sched remove minter
chk "schedule: minter remove disables the timer" grep -q 'disable --now about-corwin-mint.timer' "$FAKE_SYSLOG"
chk "schedule: minter remove keeps the unit files (moved)" sh -c "ls $T/home/schedule-removed/ | grep -q timer"

echo "$PASS passed, $FAIL failed"
[ $FAIL = 0 ]
