<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# Building, checking and publishing

The build needs only **Python 3.8 or later**. The checks add **node 18 or later** (the taxonomy and
browser tests) and **Playwright's Chromium** (the browser tests). Every route below ends in the same
two commands, so if one tool is missing you can always fall back to them:

```sh
python3 build.py          # writes public/
sh tests/run.sh           # build, then every check; add --prove-red to break a copy on purpose
```

| What you have | Build | Check |
|---|---|---|
| Linux, macOS, BSD | `make` | `make check` (or `make check-fast` without a browser) |
| Windows, PowerShell | `.\build.ps1` | `.\build.ps1 check` |
| Windows, MSYS2 or Git Bash | `make` | `make check` |
| GNU Guix | `guix shell -m manifest.scm -- make` | `guix shell -m manifest.scm -- make check-fast` |
| podman or docker | | `podman build -t about-corwin -f Containerfile . && podman run --rm -v "$PWD":/site:Z about-corwin` |
| Emacs | `M-x compile` (the directory sets `make check`) | same |
| Only Python | `python3 build.py` | `python3 -m unittest discover -s tests/py` |

## The browser checks

```sh
npm install                          # just playwright, pinned in package.json
npx playwright install chromium      # once; add --with-deps on a fresh Debian or Ubuntu
make check
```

If Chromium is already somewhere else, point at it: `CHROMIUM_PATH=/path/to/chromium make check`.
Screenshots of every state the tests visit: `SHOTS=shots make check`.

## Windows notes

- Python: `winget install Python.Python.3.13`, or the installer from python.org with "Add to PATH".
  `build.ps1` finds `py`, `python3` or `python`.
- node: `winget install OpenJS.NodeJS.LTS`. Then `npm install` and `npx playwright install chromium`.
- If PowerShell refuses to run scripts: `powershell -ExecutionPolicy Bypass -File .\build.ps1 check`.
- `tests/run.sh --prove-red` needs a POSIX shell (MSYS2, Git Bash or WSL); the plain checks do not.

## Runners

All of these run the same `make check` and `make prove-red`, and keep `public/` as the artifact.

- **GitHub Actions**: `.github/workflows/site.yml`. A second job deploys to Dreamhost, but only on
  `main`, only when the repository variable `DEPLOY_DREAMHOST` is `yes`, and only with the secrets
  `DH_SSH_KEY` (a key that may log in to your Dreamhost shell user) and `DH_KNOWN_HOSTS` (the
  output of `ssh-keyscan your-server.dreamhost.com`), plus the variables `DH_USER` and `DH_HOST`.
  It runs in the `dreamhost` environment, so you can require an approval there.
- **Gitea Actions** and **Forgejo Actions**: `.gitea/workflows/site.yml`. Forgejo reads
  `.gitea/workflows` when there is no `.forgejo/workflows` folder (check this against your
  version's documentation). The job runs inside Playwright's container image, so it needs no
  `setup-*` actions; set `runs-on` to a label your runner offers (`docker` is common on Forgejo).
- **gitcha**: `gitcha-ci.org`. Each `#+NAME: step-*` sh block is a step, in order; the image is
  Playwright's, and the first step adds python3. To publish to a gitcha site, uncomment
  `#+GITCHA_DEPLOY:` with the site's name; only someone who may manage that site can start a
  deploying build, and sandbox runs never deploy. The file has been checked against gitcha's own
  `pipelineFromOrg` and `normalizePipeline`.
- **Anything else** (GitLab CI, sourcehut builds, Woodpecker, a cron job): use the Containerfile's
  image, or any image with python3, node and a browser, and run `make check`.

## Publishing to Dreamhost (shared hosting)

The site is static, so nothing runs on the server but Apache, and nothing needs installing there.
`src/.htaccess` travels with the site: it sets the security headers, compression, caching, the 404
page and the move to https. The deploy keeps every release and a copy of whatever it replaces.

One-time setup in the Dreamhost panel: under **Websites**, make aboutcorwin.com fully hosted (not
parked) and note the web directory (by default `~/aboutcorwin.com`) and the server name; under
**Users**, give the shell user **SSH** access and add your public key to `~/.ssh/authorized_keys`;
under **Websites, Secure Certificates**, turn on the free certificate (the redirect expects it).
Then write down what you have in an access card, [deploy/ACCESS-CARD.md](deploy/ACCESS-CARD.md),
and check it with `sh scripts/access-card deploy/access/aboutcorwin.card`.

The flow, one word per step:

1. **make dist** (your machine): builds `public/` and writes `dist/about-corwin.tar.gz` (the site,
   the three host scripts and `MANIFEST.sha256`, a sha256 per file) and `dist/stage.sh`.
2. Copy both to the host (scp, or any SFTP client) into a folder you made for them.
3. **stage** (on the host: `sh stage.sh`): unpacks into `~/aboutcorwin.com-releases/<YYYYMMDD-HHMMSS>/`
   and checks every file against the manifest, and that nothing unlisted is there. A release that
   fails is renamed `-FAILED`, never deleted. The live site is not touched. It prints the line to go
   live and leaves `go-live`, `rollback` and `stage` beside the releases.
4. **go-live** (on the host: `sh ~/aboutcorwin.com-releases/go-live <stamp>`, or the `deploy/go-live.sh`
   inside the release): verifies again, copies the whole web root to `<stamp>-previous/` and stops if
   that copy fails, then copies the release in file by file (each lands whole or not at all), leaves
   `.dh-diag` alone, deletes nothing, and prints what was new and what changed.
5. **rollback** (`sh ~/aboutcorwin.com-releases/rollback`): copies the current web root to
   `<stamp>-before-rollback/`, then puts the newest `-previous` back. Files only the rolled-back
   release added are removed from the web root (they are in the copy just made).

Only `sh`, `tar`, `find`, `cmp` and `sha256sum` (or `shasum`) are used on the host, not rsync, so it
works where rsync is missing. Set `RELEASES` or `WEBROOT` to change the folders. The checks run these
scripts against a temp directory standing in for the host home (`tests/deploy/run.sh`), with planted
faults: a tampered file, a failed backup, a planted `.dh-diag`.

The older `make deploy` (`scripts/deploy-dreamhost.sh`, rsync from your machine straight into the web
root) is still there for a quick copy to a site you do not mind overwriting; it keeps no backup.

Afterwards, check the live headers once: `curl -sI https://aboutcorwin.com/ | grep -i content-security`.
