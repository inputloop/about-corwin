#!/bin/sh
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Copy public/ to a Dreamhost shared host (or any host you can rsync to over SSH).
#
#   DH_USER=you DH_HOST=pdx1-shared-a1-01.dreamhost.com sh scripts/deploy-dreamhost.sh          # dry run
#   DH_USER=you DH_HOST=... DEPLOY=yes sh scripts/deploy-dreamhost.sh                            # for real
#
# DH_PATH defaults to aboutcorwin.com (the folder Dreamhost makes in your home for the domain).
# It never runs a dry run by surprise and never deletes on the server unless DELETE=yes.
# The SSH key is yours: the script reads no secret and stores none.
set -eu
cd "$(dirname "$0")/.."
: "${DH_USER:?set DH_USER to your Dreamhost shell user}"
: "${DH_HOST:?set DH_HOST to your Dreamhost server name (panel: Websites, Manage, SFTP/SSH)}"
DH_PATH=${DH_PATH:-aboutcorwin.com}
[ -f public/index.html ] || { echo "public/ is empty: run make check (or python3 build.py) first" >&2; exit 1; }
flags="-rlptvz --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r --exclude=taxonomy.json"
[ "${DELETE:-}" = yes ] && flags="$flags --delete"
if [ "${DEPLOY:-}" = yes ]; then
  echo "deploying public/ to $DH_USER@$DH_HOST:$DH_PATH/"
else
  echo "dry run (set DEPLOY=yes to copy for real):"
  flags="$flags --dry-run"
fi
# shellcheck disable=SC2086
rsync $flags public/ "$DH_USER@$DH_HOST:$DH_PATH/"
