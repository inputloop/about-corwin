<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# What is scheduled, and how to see it

Two small jobs keep aboutcorwin.com current. Both run every 17 minutes. Both are owned by one
command, `deploy/schedule`, so nobody edits a crontab by hand. Written 2026-11-01.

## The two jobs

| | the minter | the puller |
|---|---|---|
| where | gw33 (`gw33@gw33.bru.st`) | DreamHost (`dh_f4vxkv@iad1-shared-b8-03.dreamhost.com`) |
| what it does | looks at `main` of inputloop/about-corwin and at the Emacs CI and blog snapshots; if any moved, runs the checks, builds the site, publishes a tarball and a feed | reads the feed; if its key is new, downloads the tarball, checks its sha256, stages a dated release, copies the whole web root aside, puts the new files in |
| scheduler | a systemd timer, `about-corwin-mint.timer` (shows in `systemctl list-timers`) | one marked block in the user's crontab |
| script | `~/bin/mint-about-corwin.sh` | `~/bin/pull-aboutcorwin.sh` |
| log | `~/mint-about-corwin/mint.log` | `~/aboutcorwin.com-releases/pull.log` |
| publishes / installs | `/var/www/corwin.cloud-dist/about-corwin/` (served at `https://corwin.cloud/dist/about-corwin/`) | `~/aboutcorwin.com`, releases in `~/aboutcorwin.com-releases/` |

The feed is `https://corwin.cloud/dist/about-corwin/channel.json`. Its format is in c4
`d/channels/SPEC.md`. The key in it changes when the site's code changes **or** when the CI or blog
snapshot changes; the puller installs when the key differs from the one it recorded.

## See it

On either host, from the checkout of the repository (`~/about-corwin-src`):

    sh ~/about-corwin-src/deploy/schedule status

It says in words what is scheduled, the last three lines of the job's log, the key now published or
installed, and (on DreamHost) what the feed says right now. It changes nothing.

Other quick looks:

    curl -s https://corwin.cloud/dist/about-corwin/channel.json         # what is published
    curl -s https://corwin.cloud/dist/about-corwin/history.log          # every artifact made
    systemctl list-timers about-corwin-mint.timer                       # gw33: next and last run
    cat ~/aboutcorwin.com-releases/.installed-about-corwin              # DreamHost: what is installed

A quiet puller writes nothing: "nothing new" is not logged. A line appears only when it installs,
fails, or skips because another run was going.

## Stop it

    sh ~/about-corwin-src/deploy/schedule remove          # on the host in question

On gw33 this stops and disables the timer and moves the two unit files to `~/schedule-removed/` (not
deleted). On DreamHost it takes out only the block between `# BEGIN about-corwin pull` and
`# END about-corwin pull`, after copying the crontab to `~/crontab-backup-<time>`. Other crontab
lines are never read or changed. A crontab with only one of the two markers is refused, not guessed at.

Start again with `install` in place of `remove`. Running `install` twice changes nothing the second time.

To run one now: `sh ~/bin/pull-aboutcorwin.sh -v` (DreamHost) or `sh ~/bin/mint-about-corwin.sh -v`
(gw33). `-n` only looks. The minter also has `-f` (mint even if nothing moved).

## Update the scripts

    git -C ~/about-corwin-src pull --ff-only && sh ~/about-corwin-src/deploy/schedule install

Copies changed scripts into `~/bin` and says which. The schedule is not rewritten if it already matches.

## Roll back

The site, one step: on DreamHost, `sh ~/aboutcorwin.com-releases/rollback` puts the newest
`<stamp>-previous` copy back (after first copying the current web root to `<stamp>-before-rollback`).
Then **stop the puller** (`schedule remove`), or it will install the newest revision again at its next
run. Nothing is deleted: every release and backup stays; the minter's cap retires old published
artifacts only (newest 20 kept, never fewer than 3).

An older revision on purpose: every artifact has its own feed file beside it. Find it in
`history.log`, then

    PULL_FEED=https://corwin.cloud/dist/about-corwin/about-corwin-<stamp>-<rev12>.json sh ~/bin/pull-aboutcorwin.sh -v

The nginx piece: `/etc/nginx/sites-available/corwin.cloud.pre-dist.<time>` is the file as it was
before `/dist/` was added. Copy it back with sudo, run `sudo nginx -t`, then `sudo systemctl reload nginx`.

## If something looks wrong

* **Main moved but the site did not.** `status` on gw33: the mint log's last line says why (checks
  red, build failed, clone failed). Check output: `~/mint-about-corwin/checks.log`.
* **The feed is new but the site is not.** `status` on DreamHost: look for `FAILED:` in the pull log.
  A failed run leaves the site as it was. After three failed installs of one key the puller waits for
  a newer key (each try copies the web root aside, so it does not keep trying).
* **The blog card never changes.** corwin.bru.st offers no feed this reader can use (observed
  2026-11-01: 404 on the usual addresses), so the minter keeps the last snapshot it has.
* **Signatures.** The feed has a slot for a detached signature; nothing is signed yet. When the C4
  release key exists, give the puller its public keyring (`PULL_KEYRING`) and, if wanted,
  `PULL_REQUIRE_SIG=1`. Until then sha256 guards a damaged download, not a wrong server.

## Checks

    sh scripts/test-channels.sh && python3 scripts/test_channels.py            # about-corwin
    sh scripts/test-channels.sh --prove-red                                    # each planted fault must turn a check red
    sh deploy/test-install-dist.sh && sh deploy/test-install-dist.sh --prove-red   # in corwin.cloud
