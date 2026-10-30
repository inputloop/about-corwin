# SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# GNU make or BSD make. Every target is a one-liner over build.py and tests/run.sh, so a machine
# without make loses nothing: run those directly (README, "Without make").

PYTHON ?= python3
NODE ?= node
OUT ?= public
PORT ?= 8000

all: build

build:
	$(PYTHON) build.py --out $(OUT)

content:
	$(PYTHON) build.py --check

check:
	PYTHON=$(PYTHON) NODE=$(NODE) SITE_OUT=$(CURDIR)/$(OUT) sh tests/run.sh

check-fast:
	PYTHON=$(PYTHON) NODE=$(NODE) SKIP_BROWSER=1 SITE_OUT=$(CURDIR)/$(OUT) sh tests/run.sh

prove-red:
	PYTHON=$(PYTHON) NODE=$(NODE) sh tests/run.sh --prove-red

serve: build
	$(PYTHON) -m http.server $(PORT) --bind 127.0.0.1 --directory $(OUT)

deploy: check
	sh scripts/deploy-dreamhost.sh

clean:
	rm -rf $(OUT)

.PHONY: all build content check check-fast prove-red serve deploy clean
