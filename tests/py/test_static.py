# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Bryant Frankford (INPUTLOOP)
# SPDX-License-Identifier: GPL-3.0-or-later
"""src/static/: pages that travel as they are (2026-11-13: seam-splitter/, the Seam Splitter comic), until an
ENHANCE wires them into the site's frame. They reach public/ byte for byte, they keep the site's policy (no
script of their own unless labelled, no inline style, nothing from another host), and they cannot overwrite a
page the build makes.

python3 -m unittest discover -s tests/py   (standard library only)
"""
import filecmp
import os
import re
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import build  # noqa: E402

STATIC = os.path.join(ROOT, "src", "static")


class StaticPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = os.path.join(tempfile.mkdtemp(prefix="aboutcorwin-static-"), "public")
        build.build(cls.out)

    def files(self):
        for dp, _, fs in os.walk(STATIC):
            for f in fs:
                yield os.path.relpath(os.path.join(dp, f), STATIC)

    def test_every_static_file_travels_byte_for_byte(self):
        got = list(self.files())
        self.assertIn(os.path.join("seam-splitter", "index.html"), got)
        for rel in got:
            dest = os.path.join(self.out, rel)
            self.assertTrue(os.path.isfile(dest), rel + " did not reach public/")
            self.assertTrue(filecmp.cmp(os.path.join(STATIC, rel), dest, shallow=False), rel + " changed on the way")

    def test_static_pages_keep_the_policy(self):
        for rel in self.files():
            if not rel.endswith(".html"):
                continue
            with open(os.path.join(STATIC, rel), encoding="utf-8") as f:
                t = f.read()
            self.assertNotRegex(t, r"<script(?![^>]*\bsrc=)", rel + " has an inline script")
            self.assertNotRegex(t, r"<style|\sstyle=\"", rel + " has inline style")
            self.assertNotRegex(t, r"\s(?:src|href)=\"(?:https?:)?//", rel + " loads from another host")
            self.assertRegex(t, r"SPDX-License-Identifier", rel + " carries no licence line")

    def test_each_static_page_has_its_own_budget(self):
        # 100 KB a folder: the comic is about 66 KB; the site proper keeps its 400 KB (test_site.py)
        for sub in os.listdir(STATIC):
            size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(STATIC, sub)) for f in fs)
            self.assertLess(size, 100 * 1024, "src/static/%s is over its 100 KB" % sub)

    def test_a_static_folder_cannot_overwrite_a_built_page(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "src")
            import shutil
            shutil.copytree(os.path.join(ROOT, "src"), src)
            os.makedirs(os.path.join(src, "static", "cast"))
            with open(os.path.join(src, "static", "cast", "x.html"), "w") as f:
                f.write("x")
            with self.assertRaises(build.ContentError):
                build.build(os.path.join(d, "public"), src_dir=src)


if __name__ == "__main__":
    unittest.main()
