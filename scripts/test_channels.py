#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Checks for deploy/mint-about-corwin.sh and, over real HTTP, deploy/pull-aboutcorwin.sh.

The second language for the channel scripts (the first is scripts/test-channels.sh). It builds
its own fake git repository, fake feeds and fake web root; it shares no code or fixtures with the sh
test. Standard library only. `sh scripts/test-channels.sh --prove-red` runs this against planted faults.
DEPLOY_DIR=dir tests the scripts in dir instead of deploy/.
"""
import hashlib
import http.server
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SD = os.path.join(REPO, "deploy")
D = os.environ.get("DEPLOY_DIR", SD)
FAILS = []
PASSED = [0]


def check(desc, cond):
    if cond:
        PASSED[0] += 1
    else:
        FAILS.append(desc)
        print("FAIL " + desc)


def sh(args, env=None, cwd=None):
    e = dict(os.environ)
    e.update(env or {})
    return subprocess.run(args, env=e, cwd=cwd, capture_output=True, text=True, timeout=300)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def git(cwd, *a):
    return sh(["git", "-c", "user.name=T", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false", *a], cwd=cwd)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def make_repo(root):
    """A small repository shaped like about-corwin: build.py, scripts/*, deploy/*, tests/run.sh, content/*."""
    r = os.path.join(root, "fake-origin")
    os.makedirs(r)
    git(r, "init", "-q", "-b", "main")
    for n in ("make-dist", "fetch-ci", "fetch-feeds"):
        shutil.copy(os.path.join(REPO, "scripts", n), os.path.join(r, "scripts", n) if os.path.isdir(os.path.join(r, "scripts")) else _mk(os.path.join(r, "scripts"), n))
    for n in ("stage.sh", "go-live.sh", "rollback.sh"):
        os.makedirs(os.path.join(r, "deploy"), exist_ok=True)
        shutil.copy(os.path.join(SD, n), os.path.join(r, "deploy", n))
    write(os.path.join(r, "build.py"), """import sys, os, json
out = sys.argv[sys.argv.index('--out') + 1]
ci = json.load(open('content/ci/builds.json'))
blog = json.load(open('content/feeds/emacs-blog.json'))
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write('<p>%s</p><p>%s</p><p>%s</p>' % (open('content/site.txt').read().strip(), ci['data'][0]['latest'], blog['posts'][0]['title']))
""")
    write(os.path.join(r, "tests", "run.sh"), "#!/bin/sh\n[ ! -f FAIL ] || { echo checks red; exit 1; }\necho checks green\n")
    write(os.path.join(r, "content", "site.txt"), "version one\n")
    write(os.path.join(r, "content", "ci", "builds.json"), json.dumps({"source": "x", "fetched": "2020-01-01", "data": [{"branch": "emacs-31", "latest": "0", "date": "2020-01-01.01"}]}))
    write(os.path.join(r, "content", "feeds", "emacs-blog.json"), json.dumps({"source": "x", "fetched": "2020-01-01", "posts": [{"title": "Old", "date": None, "url": "https://corwin.bru.st/", "tags": []}]}))
    git(r, "add", "-A")
    git(r, "commit", "-q", "-m", "one")
    return r


def _mk(d, n):
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, n)


def commit(r, text):
    write(os.path.join(r, "content", "site.txt"), text + "\n")
    git(r, "add", "-A")
    git(r, "commit", "-q", "-m", text)


class Server:
    def __init__(self, directory):
        class H(http.server.SimpleHTTPRequestHandler):
            def __init__(s, *a, **k):
                super().__init__(*a, directory=directory, **k)

            def log_message(s, *a):
                pass
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def stop(self):
        self.httpd.shutdown()


def count(pat_dir, suffix):
    return len([n for n in os.listdir(pat_dir) if n.endswith(suffix) and not n.startswith(".")]) if os.path.isdir(pat_dir) else 0


def feed_of(pub):
    return json.load(open(os.path.join(pub, "channel.json")))


def test_minter(T):
    origin = make_repo(T)
    pub = os.path.join(T, "pub")
    os.makedirs(pub)
    srv = Server(pub)
    base = "http://127.0.0.1:%d" % srv.port
    work = os.path.join(T, "mintwork")
    ci1 = os.path.join(T, "emacs-latest-1.json")
    ci2 = os.path.join(T, "emacs-latest-2.json")
    blog = os.path.join(T, "blog.xml")
    write(ci1, '[{"branch":"emacs-31","latest":"31.0.50","date":"2026-11-01.10"}]')
    write(ci2, '[{"branch":"emacs-31","latest":"31.0.51","date":"2026-11-01.11"}]')
    write(blog, '<rss version="2.0"><channel><title>x</title><item><title>Post one</title><link>https://corwin.bru.st/one/</link><pubDate>Sat, 01 Nov 2026 10:00:00 +0000</pubDate></item></channel></rss>')

    def mint(*flags, ci=ci1, extra=None):
        env = {"MINT_REPO": origin, "MINT_WORK": work, "MINT_PUBLISH": pub, "MINT_BASE_URL": base, "MINT_CI_FROM": ci,
               "MINT_BLOG_FROM": blog, "CHAN_ALLOW_INSECURE": "1"}
        env.update(extra or {})
        return sh(["sh", os.path.join(D, "mint-about-corwin.sh"), *flags], env=env)

    def readfield(f):
        return sh(["sh", os.path.join(D, "chan-read.sh"), os.path.join(pub, "channel.json"), f], env={"CHAN_ALLOW_INSECURE": "1"}).stdout.strip()

    # first mint
    r = mint("-v")
    check("minter: first run exits 0 (%s)" % r.stderr.strip()[:80], r.returncode == 0)
    check("minter: one artifact published", count(pub, ".tar.gz") == 1)
    fd = feed_of(pub) if os.path.exists(os.path.join(pub, "channel.json")) else {}
    art = os.path.join(pub, os.path.basename(fd.get("artifact", "x")))
    check("minter: the feed's sha256 is the artifact's", os.path.exists(art) and fd.get("sha256") == sha(art))
    check("minter: the feed passes the sh reader", sh(["sh", os.path.join(D, "chan-read.sh"), os.path.join(pub, "channel.json")], env={"CHAN_ALLOW_INSECURE": "1"}).returncode == 0)
    head = git(origin, "rev-parse", "HEAD").stdout.strip()
    check("minter: the feed names main's commit", fd.get("revision") == head)
    check("minter: the key carries commit, ci and blog digests", fd.get("key", "").startswith("about-corwin:" + head[:12] + ":") and len(fd.get("key", "").split(":")) == 4)
    check("minter: a per-artifact feed and a manifest beside it", count(pub, ".json") == 2 and count(pub, ".MANIFEST.sha256") == 1)
    check("minter: history.log has a line", os.path.exists(os.path.join(pub, "history.log")) and len(open(os.path.join(pub, "history.log")).read().splitlines()) == 1)
    with tarfile.open(art) as tf:
        names = tf.getnames()
        page = tf.extractfile("site/index.html").read().decode()
    check("minter: the tarball holds site/, deploy/, MANIFEST.sha256", "MANIFEST.sha256" in names and "deploy/stage.sh" in names and "site/index.html" in names)
    check("minter: the page was built from the CI and blog snapshots", "31.0.50" in page and "Post one" in page and "version one" in page)

    # nothing new
    n0 = count(pub, ".tar.gz"); ch0 = open(os.path.join(pub, "channel.json")).read()
    r = mint()
    check("minter: same revision and feeds: exit 0", r.returncode == 0)
    check("minter: same revision and feeds: no new artifact", count(pub, ".tar.gz") == n0 and open(os.path.join(pub, "channel.json")).read() == ch0)
    check("minter: same revision and feeds: quiet", r.stdout == "" and r.stderr == "")

    time.sleep(1)
    # main moves
    commit(origin, "version two")
    r = mint()
    check("minter: main moved: exit 0", r.returncode == 0)
    check("minter: main moved: a second artifact", count(pub, ".tar.gz") == 2)
    check("minter: main moved: the feed names the new commit", readfield("revision") == git(origin, "rev-parse", "HEAD").stdout.strip())
    key2 = readfield("key")

    time.sleep(1)
    # feed-only change: same commit, new CI snapshot
    r = mint(ci=ci2)
    check("minter: feed-only change: exit 0", r.returncode == 0)
    check("minter: feed-only change: a third artifact", count(pub, ".tar.gz") == 3)
    check("minter: feed-only change: same revision, new key", readfield("revision") == git(origin, "rev-parse", "HEAD").stdout.strip() and readfield("key") != key2)
    a3 = os.path.join(pub, os.path.basename(readfield("artifact")))
    with tarfile.open(a3) as tf:
        check("minter: feed-only change: the page shows the new CI value", b"31.0.51" in tf.extractfile("site/index.html").read())
    r = mint(ci=ci2)
    check("minter: the new feed value is then the settled state", count(pub, ".tar.gz") == 3)

    # -n only notices
    time.sleep(1)
    commit(origin, "version three")
    r = mint("-n", ci=ci2)
    check("minter: -n says it would mint and builds nothing", "would mint" in r.stdout and count(pub, ".tar.gz") == 3)

    # checks fail: nothing published, one failure line
    write(os.path.join(origin, "FAIL"), "x")
    git(origin, "add", "-A"); git(origin, "commit", "-q", "-m", "red")
    r = mint(ci=ci2)
    check("minter: red checks: exit 1", r.returncode == 1)
    check("minter: red checks: nothing published", count(pub, ".tar.gz") == 3)
    check("minter: red checks: the log says FAILED", "FAILED: checks failed" in open(os.path.join(work, "mint.log")).read())
    os.remove(os.path.join(origin, "FAIL")); git(origin, "add", "-A"); git(origin, "commit", "-q", "-m", "green")

    # overlapping run
    sleeper = subprocess.Popen(["sleep", "60"])
    try:
        os.makedirs(os.path.join(work, "lock"), exist_ok=True)
        write(os.path.join(work, "lock", "pid"), str(sleeper.pid))
        r = mint(ci=ci2)
        check("minter: overlap: exit 0", r.returncode == 0)
        check("minter: overlap: nothing published", count(pub, ".tar.gz") == 3)
        check("minter: overlap: the log says skipped", "skipped: another run" in open(os.path.join(work, "mint.log")).read())
    finally:
        sleeper.kill()
        shutil.rmtree(os.path.join(work, "lock"), ignore_errors=True)

    # retention: -f mints each time; keep 3
    for i in range(4):
        time.sleep(1)
        r = mint("-f", ci=ci2, extra={"MINT_KEEP": "3"})
    check("minter: retention keeps 3", count(pub, ".tar.gz") == 3)
    names = sorted(n for n in os.listdir(pub) if n.endswith(".tar.gz"))
    check("minter: retention keeps the newest, the one the feed names", os.path.basename(readfield("artifact")) == names[-1])
    check("minter: retention removes the per-artifact feed with its tarball", count(pub, ".json") - 1 == 3)
    r = mint("-f", ci=ci2, extra={"MINT_KEEP": "1"})
    time.sleep(1)
    r = mint("-f", ci=ci2, extra={"MINT_KEEP": "1"})
    check("minter: a cap below 3 still keeps 3", count(pub, ".tar.gz") == 3)

    # end to end: the puller installs what was minted, over http
    rel = os.path.join(T, "e2e-rel"); web = os.path.join(T, "e2e-web")
    os.makedirs(web); write(os.path.join(web, "index.html"), "old")
    penv = {"PULL_FEED": base + "/channel.json", "RELEASES": rel, "WEBROOT": web, "CHAN_ALLOW_INSECURE": "1", "PULL_READER": os.path.join(D, "chan-read.sh")}
    r = sh(["sh", os.path.join(D, "pull-aboutcorwin.sh"), "-v"], env=penv)
    check("e2e: puller installs the minted site (%s)" % r.stderr.strip()[:80], r.returncode == 0 and "version three" in open(os.path.join(web, "index.html")).read())
    check("e2e: the installed key is the feed's key", ("key=" + readfield("key")) in open(os.path.join(rel, ".installed-about-corwin")).read().splitlines())
    r = sh(["sh", os.path.join(D, "pull-aboutcorwin.sh"), "-v"], env=penv)
    check("e2e: a second pull has nothing new", r.returncode == 0 and "nothing new" in r.stdout)
    srv.stop()


def test_puller_http(T):
    """The five promised cases, over http, with curl and with wget, written independently of the sh test."""
    for fetcher in ("curl", "wget"):
        if shutil.which(fetcher) is None:
            print("note: %s not installed here; its run is skipped" % fetcher)
            continue
        base_dir = os.path.join(T, "p-" + fetcher)
        fw = os.path.join(base_dir, "fw"); rel = os.path.join(base_dir, "rel"); web = os.path.join(base_dir, "web")
        for d in (fw, rel, web):
            os.makedirs(d)
        write(os.path.join(web, "index.html"), "old")
        srv = Server(fw)
        env = {"PULL_FEED": "http://127.0.0.1:%d/channel.json" % srv.port, "RELEASES": rel, "WEBROOT": web, "PULL_FETCHER": fetcher,
               "PULL_READER": os.path.join(D, "chan-read.sh"), "CHAN_ALLOW_INSECURE": "1"}

        def release(tag, key, tamper=False, publish=True):
            w = os.path.join(base_dir, "w-" + tag)
            os.makedirs(os.path.join(w, "site")); os.makedirs(os.path.join(w, "deploy"))
            write(os.path.join(w, "site", "index.html"), "release " + tag)
            for n in ("stage.sh", "go-live.sh", "rollback.sh"):
                shutil.copy(os.path.join(SD, n), os.path.join(w, "deploy", n))
            lines = []
            for dp, _, fs in os.walk(w):
                for f in sorted(fs):
                    p = os.path.join(dp, f); lines.append("%s  %s" % (sha(p), os.path.relpath(p, w)))
            write(os.path.join(w, "MANIFEST.sha256"), "\n".join(sorted(lines, key=lambda s: s.split("  ")[1])) + "\n")
            tb = os.path.join(fw, "a-%s.tar.gz" % tag)
            with tarfile.open(tb, "w:gz") as tf:
                for n in ("site", "deploy", "MANIFEST.sha256"):
                    tf.add(os.path.join(w, n), arcname=n)
            digest = sha(tb)
            if tamper:
                open(tb, "ab").write(b"x")
            if not publish:
                os.remove(tb)
            lines = ['{', '  "format": "channel/1",', '  "channel": "about-corwin",', '  "revision": "%s",' % hashlib.sha1(tag[:1].encode()).hexdigest(),
                     '  "stamp": "20261101-120000",', '  "artifact": "a-%s.tar.gz",' % tag, '  "sha256": "%s",' % digest, '  "key": "%s"' % key, '}']
            write(os.path.join(fw, "channel.json"), "\n".join(lines) + "\n")

        def pull(*flags, extra=None):
            e = dict(env); e.update(extra or {})
            return sh(["sh", os.path.join(D, "pull-aboutcorwin.sh"), *flags], env=e)

        def page():
            return open(os.path.join(web, "index.html")).read()

        def logtext():
            return open(os.path.join(rel, "pull.log")).read() if os.path.exists(os.path.join(rel, "pull.log")) else ""

        tag = fetcher + ": "
        release("a", "about-corwin:r1:c1:b1")
        r = pull()
        check(tag + "new revision installs (%s)" % r.stderr.strip()[:80], r.returncode == 0 and page() == "release a")
        n_rel = len(os.listdir(rel)); log0 = logtext()
        r = pull()
        check(tag + "same revision: quiet, exit 0, nothing added", r.returncode == 0 and r.stdout == "" and r.stderr == "" and len(os.listdir(rel)) == n_rel and logtext() == log0)
        time.sleep(1)
        release("b", "about-corwin:r1:c2:b1")
        r = pull()
        check(tag + "feed-only change installs", r.returncode == 0 and page() == "release b")
        time.sleep(1)
        release("c", "about-corwin:r2:c2:b1", tamper=True)
        r = pull()
        check(tag + "bad sha: refused, site alone", r.returncode == 1 and page() == "release b" and "sha256 mismatch" in logtext())
        release("d", "about-corwin:r2:c2:b1", publish=False)
        r = pull()
        check(tag + "missing artifact: refused, site alone", r.returncode == 1 and page() == "release b" and "cannot download" in logtext())
        release("e", "about-corwin:r3:c2:b1")
        sleeper = subprocess.Popen(["sleep", "60"])
        try:
            os.makedirs(os.path.join(rel, ".pull.lock")); write(os.path.join(rel, ".pull.lock", "pid"), str(sleeper.pid))
            r = pull()
            check(tag + "overlap: skipped, exit 0, site alone", r.returncode == 0 and page() == "release b" and "skipped: another run" in logtext())
        finally:
            sleeper.kill()
            shutil.rmtree(os.path.join(rel, ".pull.lock"), ignore_errors=True)
        check(tag + "nothing deleted: the old backups and releases are all still there", len([n for n in os.listdir(rel) if n.endswith("-previous")]) == 2)
        srv.stop()


def main():
    T = tempfile.mkdtemp(prefix="chan-test-")
    try:
        test_puller_http(T)
        test_minter(T)
    finally:
        shutil.rmtree(T, ignore_errors=True)
    print("%d passed, %d failed" % (PASSED[0], len(FAILS)))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
