#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# chan-read -- the second reader for a channel feed (see SPEC.md): POSIX sh + awk, no intervals,
# no gawk-isms, so it runs on a shared host. It must agree with chan_read.py on every file.
#
#   chan-read.sh FILE          check FILE; print name=value lines; exit 0 valid, 1 invalid
#   chan-read.sh FILE FIELD    print that field's value only; exit 2 if the valid document lacks it
#
# CHAN_ALLOW_INSECURE=1 lets an artifact or signature address start http:// or file:// (tests).
LC_ALL=C; export LC_ALL
[ $# -ge 1 ] && [ $# -le 2 ] || { echo "usage: chan-read.sh FILE [FIELD]" >&2; exit 64; }
[ -f "$1" ] && [ -r "$1" ] || { echo "chan-read: cannot read" >&2; exit 1; }
out=$(awk -v want="${2:-}" -v insecure="${CHAN_ALLOW_INSECURE:-}" '
function fail(m) { print "ERR " m; bad = 1; exit 1 }
function urlok(v,   rest, s) {
  s = ""
  if (substr(v, 1, 8) == "https://") s = "https://"
  else if (insecure == "1" && substr(v, 1, 7) == "http://") s = "http://"
  else if (insecure == "1" && substr(v, 1, 7) == "file://") s = "file://"
  if (s == "") return 0
  rest = substr(v, length(s) + 1)
  return (length(v) <= 300 && index(v, "..") == 0 && length(rest) > 0 && rest ~ /^[A-Za-z0-9._~:\/?&=%@+,-]+$/)
}
function bareok(v, e1, e2,   n) {
  if (length(v) < 8 || length(v) > 120 || index(v, "..") > 0 || substr(v, 1, 1) == ".") return 0
  if (v !~ /^[A-Za-z0-9._-]+$/) return 0
  n = length(v)
  if (substr(v, n - length(e1) + 1) == e1) return 1
  if (e2 != "" && substr(v, n - length(e2) + 1) == e2) return 1
  return 0
}
function isbad(name, v) {
  if (name == "format") return v != "channel/1"
  if (name == "channel") return !(length(v) >= 1 && length(v) <= 41 && v ~ /^[a-z][a-z0-9-]*$/)
  if (name == "revision") return !(length(v) >= 7 && length(v) <= 64 && v ~ /^[0-9a-f]+$/)
  if (name == "stamp") return !(length(v) == 15 && v ~ /^[0-9]+-[0-9]+$/ && substr(v, 9, 1) == "-")
  if (name == "artifact") return !(urlok(v) || bareok(v, ".tar.gz", ""))
  if (name == "sha256") return !(length(v) == 64 && v ~ /^[0-9a-f]+$/)
  if (name == "key") return !(length(v) >= 1 && length(v) <= 160 && v ~ /^[A-Za-z0-9._:+-]+$/)
  if (name == "signature") return !(urlok(v) || bareok(v, ".asc", ".sig"))
  if (name == "signature_type") return v != "openpgp-detached"
  if (name == "size") return !(length(v) >= 1 && length(v) <= 12 && v ~ /^[0-9]+$/)
  if (name == "inputs") return length(v) > 200
  return 0
}
{ L[NR] = $0 }
END {
  if (bad) exit 1
  n = NR
  for (i = 1; i <= n; i++) if (L[i] ~ /[^ -~]/) fail("line " i ": not the line form")
  if (n == 0 || L[1] != "{") fail("line 1: not the line form")
  if (n < 2 || L[n] != "}") fail("line " n ": not the line form")
  nb = n - 2
  for (j = 1; j <= nb; j++) {
    ln = L[j + 1]
    if (ln !~ /^  "[a-z][a-z0-9_]*": "[^"\\]*",?$/) fail("line " (j + 1) ": not the line form")
    comma = (substr(ln, length(ln), 1) == ",")
    if ((comma && j == nb) || (!comma && j != nb)) fail("line " (j + 1) ": not the line form")
    sub(/^  "/, "", ln); name = ln; sub(/".*$/, "", name)
    sub(/^[^"]*": "/, "", ln); sub(/",?$/, "", ln)
    if (name in V) fail("duplicate field " name)
    V[name] = ln
  }
  nreq = split("format channel revision stamp artifact sha256 key", REQ, " ")
  nall = split("format channel revision stamp artifact sha256 key signature signature_type size inputs", ALL, " ")
  for (i = 1; i <= nreq; i++) if (!(REQ[i] in V)) fail("missing " REQ[i])
  for (i = 1; i <= nall; i++) if ((ALL[i] in V) && isbad(ALL[i], V[ALL[i]])) fail("bad " ALL[i])
  if (("signature" in V) && !("signature_type" in V)) fail("signature without signature_type")
  if (("signature_type" in V) && !("signature" in V)) fail("signature_type without signature")
  if (want != "") {
    if (!(want in V) || index(" " "format channel revision stamp artifact sha256 key signature signature_type size inputs" " ", " " want " ") == 0) { print "ABSENT"; exit 2 }
    print "VAL " V[want]; exit 0
  }
  for (i = 1; i <= nall; i++) if (ALL[i] in V) print "VAL " ALL[i] "=" V[ALL[i]]
}' "$1")
rc=$?
case $rc in
  0) printf '%s\n' "$out" | sed 's/^VAL //' ;;
  2) exit 2 ;;
  *) echo "chan-read: ${out#ERR }" >&2; exit 1 ;;
esac
exit 0
