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

The site is static, so nothing runs on the server but Apache. `src/.htaccess` travels with it: it
sets the security headers, compression, caching, the 404 page and the move to https.

1. In the Dreamhost panel, under **Websites**, make sure aboutcorwin.com is fully hosted (not
   parked) and note the web directory (by default `~/aboutcorwin.com`) and the server name.
2. Under **Users** (SFTP/SSH users), give that user **SSH** access, then add your public key to its
   `~/.ssh/authorized_keys`.
3. Turn on the free certificate under **Websites, Secure Certificates**; the `.htaccess` redirect
   to https expects it.
4. From your machine:

   ```sh
   make check
   DH_USER=youruser DH_HOST=yourserver.dreamhost.com sh scripts/deploy-dreamhost.sh             # dry run
   DH_USER=youruser DH_HOST=yourserver.dreamhost.com DEPLOY=yes sh scripts/deploy-dreamhost.sh  # copy
   ```

   `DH_PATH` changes the folder; `DELETE=yes` also removes files on the server that are no longer
   in `public/`. Without rsync, any SFTP client works: copy the contents of `public/`, including
   the hidden `.htaccess`.

Afterwards, check the live headers once: `curl -sI https://aboutcorwin.com/ | grep -i content-security`.
