;; SPDX-License-Identifier: GPL-3.0-or-later
;; GNU Guix:  guix shell -m manifest.scm -- make check-fast
;; (The browser checks want Playwright's own Chromium; run them where npm can fetch it.)
(specifications->manifest
 (list "python" "node" "make" "rsync" "openssh"))
