// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// windows.js: the moving pictures in each card's window. Plain canvas 2D, no libraries.
//
// Each renderer is draw(ctx, w, h, t, state, opts): t is seconds since it started, state is its own
// scratch object. One animation loop draws every window that is on screen, at most 30 times a
// second, and none that are off screen. With motion off (the person's setting, or the Motion
// button), every window draws one still frame instead and the loop stops.
//
// The ideas come from Corwin's earlier visual experiments: a cloudy orb, rings around a focus, a
// tension field, fog of war, planes in depth, the Emacs look, and the Okabe-Ito colours they all
// use, always paired with a shape.
(function (root) {
  'use strict';

  var C = { blue: '#0072b2', orange: '#e69f00', green: '#009e73', pink: '#cc79a7', sky: '#56b4e9',
            red: '#d55e00', yellow: '#f0e442', ink: '#f2ecdf', dim: '#7d8494', bg: '#10131a' };
  var PALETTE = [C.blue, C.orange, C.green, C.pink, C.sky, C.red, C.yellow];
  var STILL_T = 7.3;   // the moment a still frame shows

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function clear(ctx, w, h, bg) { ctx.fillStyle = bg || C.bg; ctx.fillRect(0, 0, w, h); }
  function font(ctx, px, mono) { ctx.font = Math.round(px) + 'px ' + (mono ? 'ui-monospace, "DejaVu Sans Mono", Consolas, monospace' : 'system-ui, sans-serif'); }

  // A shape per colour, so colour is never the only difference.
  function mark(ctx, k, x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    switch (k % 4) {
      case 0: ctx.arc(x, y, r, 0, Math.PI * 2); break;
      case 1: ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76); break;
      case 2: ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); break;
      default: ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x - r, y); ctx.closePath();
    }
    ctx.fill();
  }

  var TEXT = {
    'emacs-windows': { buf: '*build*', lines: ['$ ./autogen.sh && ./configure', '$ make -j8', '  CC       emacs.c', '  ELC      lisp/files.el', '$ make install prefix=/c/emacs', '$ makensis emacs.nsi', '  wrote emacs-installer.exe', '  wrote emacs-src.zip   ok'] },
    'ob-perl': { buf: 'notes.org', lines: ['#+begin_src perl', 'my @n = (1..5);', "print join ',',", '  map { $_ * $_ } @n;', '#+end_src', '', '#+RESULTS:', ': 1,4,9,16,25'] },
    'plain-files': { buf: 'plain-files.txt', lines: ['title: Plain files over', '  clever formats', 'do: read', 'tags: plain-files,', '  freedom', '', '== summary ==', 'Memory, catalogs and', 'this page are text.'] }
  };

  var R = {};

  R.buffer = function (ctx, w, h, t, st, o) {
    var spec = TEXT[o.slug] || TEXT['plain-files'];
    clear(ctx, w, h, '#10131a');
    var ml = Math.max(12, h * 0.12), fs = Math.max(8, (h - ml) / 10.5), lh = fs * 1.18;
    font(ctx, fs, true);
    var total = spec.lines.join('\n').length, rate = 22;
    var shown = Math.floor(t * rate) % Math.floor(total + rate * 2.5);
    var x0 = fs * 0.6, y = fs * 1.1, used = 0, cx = x0, cy = y;
    for (var i = 0; i < spec.lines.length; i++) {
      var line = spec.lines[i], take = Math.max(0, Math.min(line.length, shown - used));
      ctx.fillStyle = /^\s*(#|==|:)/.test(line) ? C.sky : (/^\$/.test(line) ? C.yellow : (/ok$/.test(line) ? C.green : C.ink));
      ctx.fillText(line.slice(0, take), x0, y);
      if (take < line.length || i === spec.lines.length - 1) { cx = x0 + ctx.measureText(line.slice(0, take)).width; cy = y; if (take < line.length) break; }
      used += line.length + 1; y += lh;
    }
    if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = C.orange; ctx.fillRect(cx + 1, cy - fs * 0.85, fs * 0.55, fs); }
    ctx.fillStyle = '#cfc7b6'; ctx.fillRect(0, h - ml, w, ml);
    ctx.fillStyle = '#1a1815'; font(ctx, ml * 0.62, true);
    ctx.fillText('-:--- ' + spec.buf + '   ' + (shown >= total ? 'Bot' : 'L' + (1 + Math.min(i, spec.lines.length - 1))), fs * 0.4, h - ml * 0.28);
  };

  R.ring = function (ctx, w, h, t, st, o) {
    clear(ctx, w, h);
    var n = o.slug === 'two-readers' ? 2 : 8, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.34;
    var hop = 1.1, k = Math.floor(t / hop), f = (t % hop) / hop, e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    ctx.strokeStyle = 'rgba(242,236,223,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    function at(i) { var a = -Math.PI / 2 + (i % n) / n * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    for (var i = 0; i < n; i++) {
      var p = at(i), on = (k % n) === i;
      mark(ctx, i, p[0], p[1], Math.max(3, r * (on ? 0.16 : 0.11)), PALETTE[i % PALETTE.length]);
    }
    var a = at(k), b = at(k + 1);
    var tx = a[0] + (b[0] - a[0]) * e, ty = a[1] + (b[1] - a[1]) * e - Math.sin(e * Math.PI) * r * 0.25;
    ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.arc(tx, ty, Math.max(2, r * 0.07), 0, Math.PI * 2); ctx.fill();
    if (n === 2) { font(ctx, r * 0.35); ctx.fillStyle = (k % 4 === 3) ? C.green : C.dim; ctx.textAlign = 'center'; ctx.fillText(k % 4 === 3 ? 'agree' : '…', cx, cy + r * 0.12); ctx.textAlign = 'start'; }
  };

  function maze(cols, rows, rand) {
    var open = [], seen = [], path = [], stack = [[0, 0]], i;
    for (i = 0; i < cols * rows; i++) { open.push({ n: 0, e: 0, s: 0, w: 0 }); seen.push(false); }
    seen[0] = true; path.push([0, 0]);
    while (stack.length) {
      var c = stack[stack.length - 1], x = c[0], y = c[1], opts = [];
      if (y > 0 && !seen[(y - 1) * cols + x]) opts.push([x, y - 1, 'n', 's']);
      if (x < cols - 1 && !seen[y * cols + x + 1]) opts.push([x + 1, y, 'e', 'w']);
      if (y < rows - 1 && !seen[(y + 1) * cols + x]) opts.push([x, y + 1, 's', 'n']);
      if (x > 0 && !seen[y * cols + x - 1]) opts.push([x - 1, y, 'w', 'e']);
      if (!opts.length) { stack.pop(); if (stack.length) path.push(stack[stack.length - 1]); continue; }
      var nx = opts[Math.floor(rand() * opts.length)];
      open[y * cols + x][nx[2]] = 1; open[nx[1] * cols + nx[0]][nx[3]] = 1;
      seen[nx[1] * cols + nx[0]] = true; stack.push([nx[0], nx[1]]); path.push([nx[0], nx[1]]);
    }
    return { open: open, path: path };
  }

  R.fog = function (ctx, w, h, t, st) {
    var cols = 14, rows = 9;
    if (!st.m) st.m = maze(cols, rows, rng(1984));
    clear(ctx, w, h, '#07080b');
    var cw = w / cols, ch = h / rows, step = Math.floor(t * 4) % (st.m.path.length + 12);
    var lit = {}, i, j, here = st.m.path[Math.min(step, st.m.path.length - 1)];
    for (i = 0; i <= Math.min(step, st.m.path.length - 1); i++) {
      var p = st.m.path[i];
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) lit[(p[0] + dx) + ',' + (p[1] + dy)] = 1;
    }
    ctx.lineWidth = Math.max(1, cw * 0.12); ctx.lineCap = 'square';
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      if (!lit[i + ',' + j]) continue;
      var c = st.m.open[j * cols + i], x = i * cw, y = j * ch;
      var d = Math.hypot(i - here[0], j - here[1]);
      ctx.fillStyle = 'rgba(214,196,150,' + Math.max(0.08, 0.32 - d * 0.03) + ')'; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = '#c9b98f'; ctx.beginPath();
      if (!c.n) { ctx.moveTo(x, y); ctx.lineTo(x + cw, y); }
      if (!c.w) { ctx.moveTo(x, y); ctx.lineTo(x, y + ch); }
      if (!c.s) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch); }
      if (!c.e) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch); }
      ctx.stroke();
    }
    var lx = (here[0] + 0.5) * cw, ly = (here[1] + 0.5) * ch;
    var g = ctx.createRadialGradient(lx, ly, 0, lx, ly, cw * 2.4);
    g.addColorStop(0, 'rgba(255,209,102,0.55)'); g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g; ctx.fillRect(lx - cw * 3, ly - ch * 3, cw * 6, ch * 6);
    mark(ctx, 0, lx, ly, Math.min(cw, ch) * 0.22, C.yellow);
  };

  R.coop = function (ctx, w, h, t, st) {
    var W = 40, H = 28, i;
    if (!st.p) {
      var r = rng(4); st.p = [];
      for (i = 0; i < 4; i++) st.p.push({ x: 18 + r() * 4, y: 12 + r() * 4, vx: 0, vy: 0 });
      st.r = r; st.cam = { x: 20, y: 14, z: 1 }; st.last = 0;
    }
    var steps = Math.min(120, Math.floor((t - st.last) * 30));
    if (t < st.last) steps = 0;
    st.last += steps / 30;
    var goal = { x: W / 2 + Math.cos(t * 0.21) * 13, y: H / 2 + Math.sin(t * 0.33) * 8 };
    for (var s = 0; s < steps; s++) {
      st.p.forEach(function (a, k) {
        var tgx = goal.x + Math.cos(k * 1.7 + t * 0.6) * 4, tgy = goal.y + Math.sin(k * 2.3 + t * 0.5) * 3;
        a.vx = a.vx * 0.9 + (tgx - a.x) * 0.004 + (st.r() - 0.5) * 0.05;
        a.vy = a.vy * 0.9 + (tgy - a.y) * 0.004 + (st.r() - 0.5) * 0.05;
        st.p.forEach(function (b) { if (a === b) return; var dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01; if (d2 < 4) { a.vx += dx / d2 * 0.02; a.vy += dy / d2 * 0.02; } });
        a.x += a.vx; a.y += a.vy;
      });
      var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      st.p.forEach(function (a) { minx = Math.min(minx, a.x); maxx = Math.max(maxx, a.x); miny = Math.min(miny, a.y); maxy = Math.max(maxy, a.y); });
      var z = Math.min(w / ((maxx - minx) + 8), h / ((maxy - miny) + 6)) / (w / 16);
      st.cam.x += ((minx + maxx) / 2 - st.cam.x) * 0.05; st.cam.y += ((miny + maxy) / 2 - st.cam.y) * 0.05;
      st.cam.z += (Math.max(0.6, Math.min(1.6, z)) - st.cam.z) * 0.03;
    }
    var u = (w / 16) * st.cam.z;
    clear(ctx, w, h, '#1d3a24');
    ctx.strokeStyle = 'rgba(160,210,140,0.18)'; ctx.lineWidth = 1;
    var ox = w / 2 - st.cam.x * u, oy = h / 2 - st.cam.y * u;
    for (i = 0; i <= W; i += 2) { ctx.beginPath(); ctx.moveTo(ox + i * u, oy); ctx.lineTo(ox + i * u, oy + H * u); ctx.stroke(); }
    for (i = 0; i <= H; i += 2) { ctx.beginPath(); ctx.moveTo(ox, oy + i * u); ctx.lineTo(ox + W * u, oy + i * u); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(242,236,223,0.5)'; ctx.setLineDash([4, 3]); ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8); ctx.setLineDash([]);
    st.p.forEach(function (a, k) { mark(ctx, k, ox + a.x * u, oy + a.y * u, Math.max(3, u * 0.45), PALETTE[k]); });
  };

  R.ledger = function (ctx, w, h, t, st, o) {
    clear(ctx, w, h);
    var who = o.slug === 'whose' ? ['Corwin', 'Bryant', 'Brigidt', 'Mentat', 'together'] : ['member A', 'member B', 'member C', 'member D', 'member E'];
    var what = o.slug === 'whose' ? ['wrote', 'built', 'checked', 'drafted', 'reviewed'] : null;
    var fs = Math.max(8, h / 9), lh = fs * 1.45, speed = 0.9, off = (t * speed) % 1, base = Math.floor(t * speed);
    font(ctx, fs, true);
    for (var i = -1; i < Math.ceil(h / lh) + 1; i++) {
      var n = base + i, y = h - (i + off) * lh - fs * 0.4;
      if (n < 0) continue;
      var r = rng(n * 7919 + 13), a = Math.floor(r() * 5), b = (a + 1 + Math.floor(r() * 4)) % 5;
      var line = what ? '#' + (100 + n) + ' ' + who[a] + ' ' + what[b] : '#' + (100 + n) + ' ' + who[a].slice(-1) + '→' + who[b].slice(-1) + '  ' + (0.5 + Math.floor(r() * 6) * 0.5).toFixed(1) + ' h';
      ctx.fillStyle = i === 0 ? 'rgba(255,209,102,' + (1 - off) + ')' : 'rgba(242,233,201,' + Math.max(0.25, 1 - i * 0.12) + ')';
      ctx.fillText(line, fs * 0.6, y);
    }
    ctx.fillStyle = '#262b36'; ctx.fillRect(0, h - 2, w, 2);
  };

  R.atom = function (ctx, w, h, t) {
    clear(ctx, w, h, '#0d1020');
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42, i;
    for (i = 0; i < 7; i++) {
      var a = i * 2.4, d = i ? r * 0.07 : 0;
      mark(ctx, 0, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.07, i % 2 ? C.sky : C.red);
    }
    for (i = 0; i < 3; i++) {
      var tilt = i * Math.PI / 3 + 0.3;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
      ctx.strokeStyle = 'rgba(86,180,233,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.34, 0, 0, Math.PI * 2); ctx.stroke();
      var th = t * (1.1 + i * 0.35) + i * 2;
      mark(ctx, 0, Math.cos(th) * r, Math.sin(th) * r * 0.34, Math.max(2, r * 0.06), C.yellow);
      ctx.restore();
    }
  };

  R.pipeline = function (ctx, w, h, t, st, o) {
    clear(ctx, w, h);
    var red = o.slug === 'prove-red';
    var names = red ? ['plant', 'run', 'red?', 'trust'] : ['patch', 'build', 'install', 'log in'];
    var cycle = red ? 7 : 6, k = Math.floor(t / 0.8) % cycle;
    var bw = w * 0.2, bh = h * 0.3, gap = (w - bw * 4) / 5, y = h / 2 - bh / 2;
    font(ctx, Math.max(8, bh * 0.3), false); ctx.textAlign = 'center';
    for (var i = 0; i < 4; i++) {
      var x = gap + i * (bw + gap), lit = k > i, fail = red && i === 2 && k > 2;
      if (red && i === 3) lit = false;
      ctx.fillStyle = fail ? C.red : (lit ? C.green : '#39404d');
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = lit || fail ? '#0b0d12' : C.dim;
      ctx.fillText(names[i], x + bw / 2, y + bh * 0.62);
      if (i < 3) { ctx.fillStyle = lit && !fail ? C.green : '#39404d'; ctx.fillRect(x + bw + gap * 0.2, h / 2 - 1, gap * 0.6, 2); }
    }
    if (red && k > 2) { ctx.fillStyle = C.red; ctx.fillText('stops here, on purpose', w / 2, y + bh * 1.9); }
    ctx.textAlign = 'start';
  };

  R.planes = function (ctx, w, h, t, st, o) {
    clear(ctx, w, h);
    var doors = o.slug === 'doors', n = 4, f = 3.2, cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.32;
    var yaw = doors ? 0.5 : Math.sin(t * 0.5) * 0.7 + 0.35;
    var quads = [];
    for (var i = 0; i < n; i++) {
      var swing = doors ? Math.max(0, Math.min(1, (t % 8) / 1.2 - i * 0.9)) * 1.3 : 0;
      var z = (i - (n - 1) / 2) * 0.55, pts = [[-1, -0.7], [1, -0.7], [1, 0.7], [-1, 0.7]].map(function (p) {
        var x = p[0], zz = z;
        if (doors) { var hx = -1, dx = x - hx; x = hx + dx * Math.cos(swing); zz = z - dx * Math.sin(swing); }
        var X = x * Math.cos(yaw) + zz * Math.sin(yaw), Z = -x * Math.sin(yaw) + zz * Math.cos(yaw);
        var k = f / (f + Z); return [cx + X * s * k, cy + p[1] * s * k, Z];
      });
      quads.push({ i: i, pts: pts, z: pts.reduce(function (a, p) { return a + p[2]; }, 0) / 4 });
    }
    quads.sort(function (a, b) { return b.z - a.z; });
    quads.forEach(function (q) {
      ctx.beginPath(); q.pts.forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      ctx.fillStyle = PALETTE[q.i] + '55'; ctx.fill(); ctx.strokeStyle = PALETTE[q.i]; ctx.lineWidth = 1.5; ctx.stroke();
    });
  };

  R.shells = function (ctx, w, h, t) {
    clear(ctx, w, h);
    var cx = w / 2, cy = h / 2, R0 = Math.min(w, h) * 0.14, i, k;
    for (i = 1; i <= 3; i++) {
      ctx.strokeStyle = 'rgba(240,228,66,' + (0.5 - i * 0.1) + ')'; ctx.setLineDash([2 + i * 2, 3 + i]);
      ctx.beginPath(); ctx.ellipse(cx, cy, R0 * i * 1.15, R0 * i * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    mark(ctx, 3, cx, cy, R0 * 0.32, C.yellow);
    for (i = 1; i <= 3; i++) {
      var count = 3 + i * 2;
      for (k = 0; k < count; k++) {
        var a = k / count * Math.PI * 2 + t * (0.25 / i) * (i % 2 ? 1 : -1);
        var wob = 1 + 0.08 * Math.sin(t * 2 + k);
        mark(ctx, k, cx + Math.cos(a) * R0 * i * 1.15, cy + Math.sin(a) * R0 * i * 0.8, Math.max(2, R0 * 0.16 * wob / Math.sqrt(i)), PALETTE[(k + i) % PALETTE.length]);
      }
    }
  };

  R.strata = function (ctx, w, h, t, st, o) {
    var names = o.slug === 'freedom' ? ['run', 'study', 'change', 'share'] : ['conduct', 'support', 'security', 'accessibility', 'profile'];
    var bh = h / names.length;
    font(ctx, Math.max(8, bh * 0.38), false);
    names.forEach(function (n, i) {
      ctx.fillStyle = PALETTE[i]; ctx.fillRect(0, i * bh, w, bh + 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, (i + 1) * bh - 2, w, 2);
      ctx.fillStyle = '#0b0d12'; ctx.fillText(n, bh * 0.4, i * bh + bh * 0.66);
    });
  };
  R.strata.still = true;

  var FACET = { do: C.orange, bring: C.sky, whose: C.pink, state: C.green, domain: C.yellow, technique: C.blue, value: C.red, presentation: '#c8adff' };
  R.field = function (ctx, w, h, t, st, o) {
    clear(ctx, w, h, '#0b0d14');
    var m = root.__fieldModel;
    if (!m || !m.nodes.length) return;
    var yaw = t * 0.12, pitch = 0.35, f = 900, s = Math.min(w, h) / 620;
    var pr = m.nodes.map(function (n) {
      var x = n.x * Math.cos(yaw) - n.z * Math.sin(yaw), z = n.x * Math.sin(yaw) + n.z * Math.cos(yaw);
      var y = n.y * Math.cos(pitch) - z * Math.sin(pitch); z = n.y * Math.sin(pitch) + z * Math.cos(pitch);
      var k = f / (f + z); return { x: w / 2 + x * k * s, y: h / 2 + y * k * s, z: z, k: k, n: n };
    });
    ctx.lineWidth = 0.6;
    (m.health.edges || []).forEach(function (e) {
      if (e.sim < 0.35) return;
      var a = pr[e.a], b = pr[e.b];
      ctx.strokeStyle = 'rgba(200,173,255,' + (0.08 + e.sim * 0.25) + ')';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    pr.slice().sort(function (a, b) { return b.z - a.z; }).forEach(function (p) {
      var r = Math.max(1.2, (1.2 + Math.sqrt(p.n.df) * 1.1) * p.k * s * 2);
      ctx.globalAlpha = Math.max(0.3, Math.min(1, p.k));
      ctx.fillStyle = FACET[p.n.facet] || C.ink; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (o.big && p.n.df >= 3) { font(ctx, 11, true); ctx.fillStyle = C.ink; ctx.fillText(p.n.label, p.x + r + 2, p.y + 3); }
    });
    ctx.globalAlpha = 1;
    if (o.big) { font(ctx, 12, true); ctx.fillStyle = C.dim; ctx.fillText('balance ' + m.health.balance.toFixed(3) + ' · ' + m.nodes.length + ' tags', 10, h - 10); }
  };

  // Value noise for the orb's clouds.
  function vnoise(seed) {
    var p = [], r = rng(seed), i;
    for (i = 0; i < 256; i++) p[i] = r();
    function h(x, y, z) { return p[(x * 73 ^ y * 151 ^ z * 283) & 255]; }
    function sm(t) { return t * t * (3 - 2 * t); }
    return function (x, y, z) {
      var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
      function l(a, b, t) { return a + (b - a) * t; }
      return l(l(l(h(X, Y, Z), h(X + 1, Y, Z), fx), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), fx), fy),
               l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), fx), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), fx), fy), fz);
    };
  }
  R.orb = function (ctx, w, h, t, st, o) {
    var res = o.big ? 150 : 72, rh = Math.round(res * h / w);
    if (!st.n) { st.n = vnoise(7); st.c = document.createElement('canvas'); }
    if (st.c.width !== res || st.c.height !== rh) { st.c.width = res; st.c.height = rh; st.img = st.c.getContext('2d').createImageData(res, rh); }
    var d = st.img.data, cx = res / 2, cy = rh / 2, R = Math.min(res, rh) * 0.42, sp = o.slug === 'lens' ? Math.sin(t * 0.4) : 0;
    var L = [-0.55 + sp * 0.9, -0.5, 0.67], ln = Math.hypot(L[0], L[1], L[2]); L = L.map(function (v) { return v / ln; });
    for (var y = 0; y < rh; y++) for (var x = 0; x < res; x++) {
      var i = (y * res + x) * 4, dx = (x - cx) / R, dy = (y - cy) / R, r2 = dx * dx + dy * dy;
      if (r2 > 1) { var glow = Math.max(0, 1 - (Math.sqrt(r2) - 1) * 5); d[i] = 11 + 60 * glow; d[i + 1] = 13 + 30 * glow; d[i + 2] = 20 + 110 * glow; d[i + 3] = 255; continue; }
      var dz = Math.sqrt(1 - r2), lam = Math.max(0, dx * L[0] + dy * L[1] + dz * L[2]);
      var u = Math.atan2(dx, dz) + t * 0.15, v = dy;
      var n = 0.55 * st.n(u * 2.2, v * 2.2, t * 0.05) + 0.3 * st.n(u * 4.4 + 3, v * 4.4, 1 - t * 0.04) + 0.15 * st.n(u * 9, v * 9, 2);
      var cloud = Math.max(0, Math.min(1, (n - 0.45) * 3)), rim = Math.pow(1 - dz, 3);
      var base = [91, 47, 145], wh = [235, 228, 255];
      for (var c = 0; c < 3; c++) d[i + c] = Math.min(255, (base[c] * (1 - cloud) + wh[c] * cloud) * (0.25 + 0.85 * lam) + rim * 120);
      d[i + 3] = 255;
    }
    st.c.getContext('2d').putImageData(st.img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(st.c, 0, 0, w, h);
  };

  // ---- the loop -------------------------------------------------------------------------------
  var handles = [], running = false, motion = true, last = 0, io = null;

  function size(hd) {
    var dpr = Math.min(2, root.devicePixelRatio || 1), cw = hd.host.clientWidth, chh = hd.host.clientHeight;
    if (!cw || !chh) return false;
    if (hd.canvas.width !== Math.round(cw * dpr) || hd.canvas.height !== Math.round(chh * dpr)) {
      hd.canvas.width = Math.round(cw * dpr); hd.canvas.height = Math.round(chh * dpr);
      hd.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); hd.w = cw; hd.h = chh;
    }
    return true;
  }

  function draw(hd, t) {
    if (!size(hd)) return;
    try { R[hd.kind](hd.ctx, hd.w, hd.h, t, hd.state, hd.opts); }
    catch (err) { hd.kind = 'strata'; }
    hd.host.setAttribute('data-state', motion && !R[hd.kind].still ? 'moving' : 'still');
  }

  function tick(now) {
    if (!motion) { running = false; return; }
    if (now - last >= 33) {
      last = now;
      handles.forEach(function (hd) { if (hd.visible && !R[hd.kind].still) draw(hd, (now - hd.t0) / 1000); });
    }
    root.requestAnimationFrame(tick);
  }
  function start() { if (!running && motion) { running = true; root.requestAnimationFrame(tick); } }

  function mount(host, kind, opts) {
    if (!R[kind]) kind = 'strata';
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var hd = { host: host, canvas: canvas, ctx: canvas.getContext('2d'), kind: kind, opts: opts || {},
               state: {}, t0: performance.now() - (hashSeed((opts && opts.slug) || kind) % 5000), visible: true };
    if (!hd.ctx) { canvas.remove(); return null; }
    handles.push(hd);
    if (io) { hd.visible = false; io.observe(host); }
    draw(hd, motion ? (performance.now() - hd.t0) / 1000 : STILL_T);
    start();
    return hd;
  }

  function unmount(hd) {
    if (!hd) return;
    var i = handles.indexOf(hd);
    if (i >= 0) handles.splice(i, 1);
    if (io) io.unobserve(hd.host);
    hd.canvas.remove();
  }

  function setMotion(on) {
    motion = !!on;
    handles.forEach(function (hd) { hd.state = {}; draw(hd, motion ? (performance.now() - hd.t0) / 1000 : STILL_T); });
    start();
  }

  function redrawAll() { handles.forEach(function (hd) { draw(hd, motion ? (performance.now() - hd.t0) / 1000 : STILL_T); }); }

  if (typeof root.IntersectionObserver === 'function') {
    io = new root.IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        handles.forEach(function (hd) {
          if (hd.host === en.target) { hd.visible = en.isIntersecting; if (hd.visible && !motion) draw(hd, STILL_T); }
        });
      });
    }, { rootMargin: '80px' });
  }

  root.Windows = { kinds: Object.keys(R), mount: mount, unmount: unmount, setMotion: setMotion,
                   redrawAll: redrawAll, count: function () { return handles.length; },
                   setField: function (model) { root.__fieldModel = model; } };
})(typeof self !== 'undefined' ? self : this);
// @license-end
