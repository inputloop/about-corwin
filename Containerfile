# SPDX-License-Identifier: GPL-3.0-or-later
# Everything the checks need, browsers included (Playwright's image carries node and Chromium;
# python3 comes from Ubuntu). Works with podman or docker:
#   podman build -t about-corwin -f Containerfile .
#   podman run --rm -v "$PWD":/site:Z about-corwin
FROM mcr.microsoft.com/playwright:v1.63.0-noble
RUN apt-get update && apt-get install -y --no-install-recommends python3 make && rm -rf /var/lib/apt/lists/*
WORKDIR /site
ENV NODE_PATH=/usr/lib/node_modules
RUN npm install -g playwright@1.63.0
CMD ["make", "check"]
