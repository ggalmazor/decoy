#!/usr/bin/env node
// QA for the security claim: attack DECOY's own exports with Depix, the standard pixelation-reversal tool
// (https://codeberg.org/spipm/Depixelization_poc), and compare with what Depix does to plain pixelation.
//
//   mise run qa -- setup                                  clone Depix (pinned) into tools/qa/.depix
//   mise run qa -- demo [--block 8] [--keep]              plain pixelation leaks, DECOY's export does not
//   mise run qa -- crop <image> <x,y,w,h> [--no-snap]     cut the mosaic out of an export, snapped to its grid
//   mise run qa -- pixelate <image> <x,y,w,h> --block 8   plain box-filter pixelation of a region (the control)
//   mise run qa -- search-image --height 24 [--chars ..]  De Bruijn search image in Courier Prime 700 at DECOY's size
//   mise run qa -- depix <pixelated.png> <search.png>     run Depix (and its block detector) on a cutout
//   mise run qa -- attack <export.png|export.pdf>         find every mosaic in an export and Depix each one
//
// Everything that draws text goes through headless Chromium against the built site, so the search image is
// rendered by the same engine, font, and size DECOY itself uses: the most favourable conditions an attacker
// could hope for. Outputs land in tmp/qa/. Needs: node, uv (mise installs both), and the build in dist/.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEPIX_DIR = resolve(ROOT, 'tools/qa/.depix');
const DEPIX_REPO = 'https://codeberg.org/spipm/Depixelization_poc.git';
const DEPIX_COMMIT = 'd2c81f8047e728816a859d721cdbdbf6db2a5285';
const OUT_DIR = resolve(ROOT, 'tmp/qa');
const SITE = process.env.DECOY_URL ?? 'http://127.0.0.1:4173';
const DEFAULT_CHARS = "abcdefghijklmnopqrstuvwxyz ,.'?!:";

const args = process.argv.slice(2);
const command = args.shift();
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  } else {
    positional.push(a);
  }
}

function log(message) {
  console.log(`==> ${message}`);
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function parseBox(text) {
  const parts = String(text ?? '')
    .split(',')
    .map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    die('box must be x,y,w,h in image pixels');
  const [x, y, w, h] = parts;
  return { x, y, w, h };
}

function outPath(name) {
  mkdirSync(OUT_DIR, { recursive: true });
  return resolve(OUT_DIR, name);
}

function openImage(path) {
  if (flags['no-open'] || process.platform !== 'darwin') return;
  try {
    execFileSync('open', [path]);
  } catch {
    /* fine */
  }
}

// --- Depix ------------------------------------------------------------------------------------------------

function ensureDepix() {
  if (!existsSync(resolve(DEPIX_DIR, 'depix.py'))) {
    log(`Cloning Depix into ${DEPIX_DIR}`);
    mkdirSync(dirname(DEPIX_DIR), { recursive: true });
    execFileSync('git', ['clone', '--quiet', DEPIX_REPO, DEPIX_DIR], { stdio: 'inherit' });
  }
  execFileSync('git', ['-C', DEPIX_DIR, 'checkout', '--quiet', DEPIX_COMMIT], { stdio: 'inherit' });
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
  } catch {
    die(
      'uv is required to run Depix. Install it with mise (mise install) or from https://docs.astral.sh/uv/.',
    );
  }
}

function runDepix(pixelated, search, output, { average = 'gammacorrected', background } = {}) {
  ensureDepix();
  const script = resolve(DEPIX_DIR, 'depix.py');
  const cmd = [
    'run',
    '--quiet',
    '--python',
    '3.12',
    '--with',
    'pillow',
    'python',
    script,
    '-p',
    pixelated,
    '-s',
    search,
    '-o',
    output,
    '-a',
    average,
  ];
  if (background) cmd.push('-b', background);
  log(`Depix: uv ${cmd.join(' ')}`);
  // Depix reports through the logging module, which writes to stderr.
  const result = spawnSync('uv', cmd, { encoding: 'utf8', env: { ...process.env, PYTHONPATH: DEPIX_DIR } });
  if (result.status !== 0) die(`Depix failed:\n${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`;
}

function summariseDepix(stderrAndOut) {
  const lines = stderrAndOut.split('\n');
  const found = lines.find((l) => /Found \d+ same color rectangles/.test(l));
  const last = [...lines].reverse().find((l) => /straight matches/.test(l));
  return {
    blocks: found ? /Found (\d+)/.exec(found)[1] : '?',
    matches: last ? last.replace(/^.*\[/, '[').trim() : 'no match line',
  };
}

// --- Browser helpers ---------------------------------------------------------------------------------------

let serverProcess = null;

async function ensureSite() {
  try {
    const res = await fetch(SITE + '/version.json');
    if (res.ok) return;
  } catch {
    /* start it */
  }
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) die('No build in dist/. Run `mise run build` first.');
  log(`Starting vite preview at ${SITE}`);
  serverProcess = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(SITE + '/version.json');
      if (res.ok) return;
    } catch {
      /* wait */
    }
  }
  die('vite preview did not come up on port 4173');
}

async function withPage(fn) {
  await ensureSite();
  const browser = await chromium.launch();
  // The site's service worker would answer fetches itself, hiding them from Playwright's routes and
  // possibly serving a stale build; QA always talks to the server.
  const page = await browser.newPage({
    acceptDownloads: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await page.goto(SITE + '/');
  await page.evaluate(() => document.fonts.load('700 20px "Courier Prime"').then(() => document.fonts.ready));
  try {
    return await fn(page, browser);
  } finally {
    await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// Text drawing mirrors src/render/text.ts: 700 Courier Prime at 0.82 x box height, baseline middle, y = h/2 + 1.
const DRAW_TEXT = `
  (({ text, h, px, font, pad }) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + pad * 2;
    canvas.width = width;
    canvas.height = h;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, h);
    ctx.font = font;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, h / 2 + 1);
    return canvas.toDataURL('image/png');
  })`;

async function renderText(
  page,
  text,
  h,
  {
    px = Math.max(1, Math.round(h * 0.82)),
    family = '"Courier Prime", "Courier New", Courier, monospace',
    weight = 700,
    pad = 2,
  } = {},
) {
  const font = `${weight} ${px}px ${family}`;
  const url = await page.evaluate(`${DRAW_TEXT}(${JSON.stringify({ text, h, px, font, pad })})`);
  return dataUrlToBuffer(url);
}

function deBruijn(alphabet, order) {
  const k = alphabet.length;
  const a = new Array(k * order).fill(0);
  const sequence = [];
  const db = (t, p) => {
    if (t > order) {
      if (order % p === 0) for (let i = 1; i <= p; i++) sequence.push(a[i]);
    } else {
      a[t] = a[t - p];
      db(t + 1, p);
      for (let j = a[t - p] + 1; j < k; j++) {
        a[t] = j;
        db(t + 1, t);
      }
    }
  };
  db(1, 1);
  const text = sequence.map((i) => alphabet[i]).join('');
  // Wrap around so the last (order - 1) pairs exist too.
  return text + text.slice(0, order - 1);
}

// Loads an image file into the page and returns a handle for cropping, snapping, and pixelating.
const IMAGE_TOOLS = `
  (async ({ base64, mime }) => {
    const res = await fetch('data:' + mime + ';base64,' + base64);
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width, H = canvas.height;
    const luma = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
    // Block boundaries of a mosaic are luma steps; flat paper has none. The first and last steps on each
    // axis, measured across the middle half of the other axis, are the mosaic's outline.
    const edges = (box, axis, margin) => {
      const x0 = Math.max(1, box.x - margin), x1 = Math.min(W, box.x + box.w + margin);
      const y0 = Math.max(1, box.y - margin), y1 = Math.min(H, box.y + box.h + margin);
      const cx0 = box.x + Math.floor(box.w / 4), cx1 = box.x + Math.ceil(box.w * 3 / 4);
      const cy0 = box.y + Math.floor(box.h / 4), cy1 = box.y + Math.ceil(box.h * 3 / 4);
      const profile = [], positions = [];
      if (axis === 'x') {
        for (let x = x0; x < x1; x++) { let s = 0; for (let y = Math.max(y0, cy0); y < Math.min(y1, cy1); y++) s += Math.abs(luma(x, y) - luma(x - 1, y)); profile.push(s); positions.push(x); }
      } else {
        for (let y = y0; y < y1; y++) { let s = 0; for (let x = Math.max(x0, cx0); x < Math.min(x1, cx1); x++) s += Math.abs(luma(x, y) - luma(x, y - 1)); profile.push(s); positions.push(y); }
      }
      const max = Math.max(0, ...profile);
      if (max <= 0) return [];
      const thr = Math.max(max * 0.03, 1e-6);
      return positions.filter((_, i) => profile[i] > thr);
    };
    window.__qa = {
      size: { w: W, h: H },
      snap(box, margin) {
        const xs = edges(box, 'x', margin), ys = edges(box, 'y', margin);
        if (xs.length < 2 || ys.length < 2) return box;
        const x = xs[0], y = ys[0], w = xs[xs.length - 1] - x, h = ys[ys.length - 1] - y;
        return w >= 4 && h >= 4 ? { x, y, w, h } : box;
      },
      // Rows and columns of a box that carry ink (luma below 128), so a cutout can hug the glyphs.
      inkExtent(box) {
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
          if (luma(x, y) < 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        }
        return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      },
      crop(box) {
        const c = document.createElement('canvas');
        c.width = box.w; c.height = box.h;
        c.getContext('2d').putImageData(ctx.getImageData(box.x, box.y, box.w, box.h), 0, 0);
        return c.toDataURL('image/png');
      },
      // Mosaics are the only thing on a document page made of flat rectangles at least minBlock wide
      // that are not the paper colour and that sit edge to edge on a grid. Each block's interior (the
      // block minus its one-pixel rim, which borders other colours) is a connected run of identical
      // pixels; those rectangles are grown back by a pixel, clustered when they touch, and a cluster is
      // kept when it has enough rectangles and most of them share one size. Antialiased glyphs rarely
      // have flat interiors this large, and a filled shape is a single rectangle, so both drop out.
      findMosaics(minBlock) {
        const key = (x, y) => { const i = (y * W + x) * 4; return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; };
        const counts = new Map();
        const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
        for (let x = 0; x < W; x++) { bump(key(x, 0)); bump(key(x, H - 1)); }
        for (let y = 0; y < H; y++) { bump(key(0, y)); bump(key(W - 1, y)); }
        let paper = -1, best = -1;
        for (const [k, c] of counts) if (c > best) { best = c; paper = k; }
        const flat = new Uint8Array(W * H);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const k = key(x, y);
          if (k === paper) continue;
          if (key(x - 1, y) === k && key(x + 1, y) === k && key(x, y - 1) === k && key(x, y + 1) === k) flat[y * W + x] = 1;
        }
        const label = new Int32Array(W * H);
        const rects = [];
        const stack = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const p = y * W + x;
          if (!flat[p] || label[p]) continue;
          const id = rects.length + 1;
          let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
          label[p] = id; stack.push(p);
          while (stack.length) {
            const q = stack.pop(); n++;
            const qx = q % W, qy = (q - qx) / W;
            if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
            for (const r of [q - 1, q + 1, q - W, q + W]) {
              if (r >= 0 && r < W * H && flat[r] && !label[r] && Math.abs((r % W) - qx) <= 1) { label[r] = id; stack.push(r); }
            }
          }
          const w = x1 - x0 + 3, h = y1 - y0 + 3;
          if (w >= minBlock && h >= minBlock && n >= 0.8 * (w - 2) * (h - 2)) rects.push({ x: x0 - 1, y: y0 - 1, w, h });
        }
        let regions = rects.map((r) => ({ ...r, parts: [r] }));
        const gap = 2;
        for (let merged = true; merged;) {
          merged = false;
          for (let i = 0; i < regions.length; i++) {
            for (let j = i + 1; j < regions.length; j++) {
              const a = regions[i], b = regions[j];
              if (a.x <= b.x + b.w + gap && b.x <= a.x + a.w + gap && a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap) {
                const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
                regions[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, parts: a.parts.concat(b.parts) };
                regions.splice(j, 1);
                merged = true;
                j--;
              }
            }
          }
        }
        const mode = (values) => {
          const m = new Map();
          for (const v of values) m.set(v, (m.get(v) || 0) + 1);
          return [...m.entries()].sort((p, q) => q[1] - p[1])[0][0];
        };
        return regions
          .filter((r) => r.parts.length >= 6 && r.w >= 2 * minBlock && r.h >= 2 * minBlock)
          .map((r) => {
            const sizes = r.parts.flatMap((p) => [p.w, p.h]);
            const block = mode(sizes);
            const grid = sizes.filter((v) => Math.abs(v - block) <= 1 || Math.abs(v - 2 * block) <= 2).length / sizes.length;
            const covered = r.parts.reduce((sum, p) => sum + p.w * p.h, 0) / (r.w * r.h);
            return { x: r.x, y: r.y, w: r.w, h: r.h, blocks: r.parts.length, block, grid, covered };
          })
          .filter((r) => r.grid >= 0.5 && r.covered >= 0.3)
          .sort((a, b) => a.y - b.y || a.x - b.x);
      },
      outline(regions) {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const o = c.getContext('2d');
        o.drawImage(canvas, 0, 0);
        o.strokeStyle = '#ff2d55'; o.lineWidth = 2; o.font = '700 14px sans-serif'; o.fillStyle = '#ff2d55';
        regions.forEach((r, i) => { o.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); o.fillText(String(i + 1), r.x, Math.max(14, r.y - 4)); });
        return c.toDataURL('image/png');
      },
      // Plain pixelation the way everyone does it and the way Depix expects: the integer mean of the
      // 0-255 channel values of each block, blocks anchored at the box origin.
      pixelate(box, block) {
        const img = ctx.getImageData(box.x, box.y, box.w, box.h);
        const d = img.data;
        for (let by = 0; by < box.h; by += block) {
          for (let bx = 0; bx < box.w; bx += block) {
            const x1 = Math.min(box.w, bx + block), y1 = Math.min(box.h, by + block);
            let r = 0, g = 0, b = 0, n = 0;
            for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) { const i = (y * box.w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
            r = Math.floor(r / n); g = Math.floor(g / n); b = Math.floor(b / n);
            for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) { const i = (y * box.w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
          }
        }
        const c = document.createElement('canvas');
        c.width = box.w; c.height = box.h;
        c.getContext('2d').putImageData(img, 0, 0);
        return c.toDataURL('image/png');
      },
    };
    return { w: W, h: H };
  })`;

function sniffMime(bytes) {
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return 'image/png';
}

async function loadImage(page, buffer) {
  const mime = sniffMime(buffer);
  return page.evaluate(`${IMAGE_TOOLS}(${JSON.stringify({ base64: buffer.toString('base64'), mime })})`);
}

// Renders every page of a PDF to a PNG with pdf.js, served to the page from node_modules under a path the
// site's CSP allows (same origin). Image-only pages, which is what DECOY exports, are rendered at the pixel
// size of the bitmap they carry, so the mosaic's blocks come out exactly as exported; other PDFs at 150 dpi.
const PDF_TOOLS = `
  (async ({ base64, scale, origin }) => {
    const pdfjs = window.__pdfjs;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({
      data: bytes, cMapUrl: origin + '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: origin + '/pdfjs/standard_fonts/',
      iccUrl: origin + '/pdfjs/iccs/', wasmUrl: origin + '/pdfjs/wasm/', useWorkerFetch: false,
    }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      let s = scale, native = null;
      if (!s) {
        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length && !native; i++) {
          if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
          const img = await new Promise((done) => page.objs.get(ops.argsArray[i][0], done));
          if (img && img.width) native = { w: img.width, h: img.height };
        }
        s = native ? native.w / base.width : 150 / 72;
      }
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      pages.push({ n, url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height, scale: s, native });
    }
    return pages;
  })`;

async function renderPdf(page, bytes, scale) {
  const build = resolve(ROOT, 'node_modules/pdfjs-dist/build');
  await page.route(`${SITE}/qa-pdfjs/*`, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    // Playwright does not intercept a dedicated worker's own script request, so the worker is built from
    // a blob of the source fetched here instead; the site's CSP allows blob: workers.
    if (name === 'loader.mjs') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: [
          "import * as pdfjs from './pdf.min.mjs';",
          "const source = await (await fetch(new URL('./pdf.worker.min.mjs', import.meta.url))).text();",
          "const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));",
          "pdfjs.GlobalWorkerOptions.workerPort = new Worker(url, { type: 'module' });",
          'window.__pdfjs = pdfjs;',
        ].join('\n'),
      });
    }
    const file = resolve(build, name);
    if (!existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file) });
  });
  await page.addScriptTag({ url: `${SITE}/qa-pdfjs/loader.mjs`, type: 'module' });
  await page.waitForFunction(() => window.__pdfjs);
  const pages = await page.evaluate(
    `${PDF_TOOLS}(${JSON.stringify({ base64: bytes.toString('base64'), scale, origin: SITE })})`,
  );
  return pages.map((p) => ({ ...p, png: dataUrlToBuffer(p.url), url: undefined }));
}

// Drives the real app: open an image, box a region, apply the decoy, export the PNG.
async function decoyThrough(page, imageBuffer, box, { mood } = {}) {
  await page.goto(SITE + '/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: imageBuffer });
  const canvas = page.getByTestId('page-canvas');
  await canvas.waitFor();
  await page.waitForTimeout(300);
  const bounds = await canvas.boundingBox();
  const scale = bounds.width / Number(await canvas.getAttribute('data-page-width'));
  await page.mouse.move(bounds.x + box.x * scale, bounds.y + box.y * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + (box.x + box.w) * scale, bounds.y + (box.y + box.h) * scale, { steps: 6 });
  await page.mouse.up();
  await page.locator('.selection').waitFor();
  if (mood) await page.getByRole('button', { name: new RegExp(`^${mood}$`, 'i') }).click();
  const decoy = await page.locator('#decoy-text').inputValue();
  const label = await page.locator('.on-page__label, .selection__tag').first().innerText();
  await page.getByRole('button', { name: 'Apply decoy' }).click();
  const applied = /(\d+) × (\d+)/.exec(await page.locator('.on-page__label').innerText());
  await page.getByRole('button', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Download PNG' }).click();
  const path = await (await download).path();
  const { readFileSync } = await import('node:fs');
  return {
    decoy,
    label,
    size: { w: Number(applied[1]), h: Number(applied[2]) },
    exported: readFileSync(path),
  };
}

// --- Commands ----------------------------------------------------------------------------------------------

async function cmdSetup() {
  ensureDepix();
  log(`Depix ${DEPIX_COMMIT.slice(0, 9)} is in ${DEPIX_DIR}`);
  execFileSync(
    'uv',
    [
      'run',
      '--quiet',
      '--python',
      '3.12',
      '--with',
      'pillow',
      'python',
      '-c',
      'import PIL; print("Pillow", PIL.__version__)',
    ],
    { stdio: 'inherit' },
  );
}

async function cmdSearchImage() {
  const h = Number(flags.height ?? 24);
  const chars = flags.chars ?? DEFAULT_CHARS;
  const order = Number(flags.order ?? 2);
  const text = deBruijn(chars, order);
  const out = flags.out ?? outPath(`search-h${h}.png`);
  await withPage(async (page) => {
    const png = await renderText(page, text, h, {
      px: flags.px ? Number(flags.px) : undefined,
      family: flags.font,
      pad: 2,
    });
    writeFileSync(out, png);
  });
  log(`Search image: ${out} (${text.length} characters, order ${order}, alphabet "${chars}")`);
  return out;
}

async function cmdCrop() {
  const [image, boxArg] = positional;
  if (!image || !boxArg) die('usage: crop <image> <x,y,w,h> [--no-snap] [--out path]');
  const { readFileSync } = await import('node:fs');
  const box = parseBox(boxArg);
  const out = flags.out ?? outPath('pixelated.png');
  await withPage(async (page) => {
    await loadImage(page, readFileSync(resolve(image)));
    const snapped = flags['no-snap'] ? box : await page.evaluate((b) => window.__qa.snap(b, 4), box);
    const png = dataUrlToBuffer(await page.evaluate((b) => window.__qa.crop(b), snapped));
    writeFileSync(out, png);
    log(`Cut out ${snapped.x},${snapped.y},${snapped.w},${snapped.h} -> ${out}`);
  });
  return out;
}

async function cmdPixelate() {
  const [image, boxArg] = positional;
  if (!image || !boxArg) die('usage: pixelate <image> <x,y,w,h> --block 8 [--out path]');
  const { readFileSync } = await import('node:fs');
  const box = parseBox(boxArg);
  const block = Number(flags.block ?? 8);
  const out = flags.out ?? outPath('plain-pixelated.png');
  await withPage(async (page) => {
    await loadImage(page, readFileSync(resolve(image)));
    const png = dataUrlToBuffer(
      await page.evaluate(({ b, block }) => window.__qa.pixelate(b, block), { b: box, block }),
    );
    writeFileSync(out, png);
    log(`Plain pixelation (block ${block}) of ${boxArg} -> ${out}`);
  });
  return out;
}

async function cmdDepix() {
  const [pixelated, search] = positional;
  if (!pixelated || !search)
    die(
      'usage: depix <pixelated.png> <search.png> [--average linear|gammacorrected] [--background r,g,b] [--out path]',
    );
  const out = flags.out ?? outPath('depix-output.png');
  const text = runDepix(resolve(pixelated), resolve(search), out, {
    average: flags.average,
    background: flags.background,
  });
  const summary = summariseDepix(text);
  log(`Depix saw ${summary.blocks} blocks; result ${summary.matches}`);
  log(`Output: ${out}`);
  openImage(out);
  return out;
}

async function cmdAttack() {
  const [file] = positional;
  if (!file)
    die(
      'usage: attack <export.png|.jpg|.webp|.pdf> [--page N] [--box x,y,w,h] [--block 4] [--height N] [--chars ..] [--font ..] [--px N] [--scale N]',
    );
  const path = resolve(file);
  if (!existsSync(path)) die(`${file} does not exist`);
  const bytes = readFileSync(path);
  const mime = sniffMime(bytes);
  const minBlock = Number(flags.block ?? 4);
  const chars = flags.chars ?? DEFAULT_CHARS;
  const order = Number(flags.order ?? 2);
  const stem = basename(file).replace(/\.[^.]+$/, '');
  const items = await withPage(async (page) => {
    const pages =
      mime === 'application/pdf'
        ? await renderPdf(page, bytes, flags.scale ? Number(flags.scale) : 0)
        : [{ n: 1, png: bytes }];
    const found = [];
    for (const p of pages) {
      if (flags.page && Number(flags.page) !== p.n) continue;
      const size = await loadImage(page, p.png);
      if (p.native) {
        log(
          `Page ${p.n}: ${size.w}×${size.h}, rendered at the embedded image's size (scale ${p.scale.toFixed(3)})`,
        );
        writeFileSync(outPath(`${stem}-p${p.n}.png`), p.png);
      } else if (mime === 'application/pdf') {
        log(
          `Page ${p.n}: ${size.w}×${size.h}, no single embedded image; rendered at scale ${p.scale.toFixed(3)}`,
        );
        writeFileSync(outPath(`${stem}-p${p.n}.png`), p.png);
      } else {
        log(`Image: ${size.w}×${size.h}`);
      }
      const regions = flags.box
        ? [{ ...parseBox(flags.box), blocks: '?', block: '?' }]
        : await page.evaluate((m) => window.__qa.findMosaics(m), minBlock);
      if (!regions.length) {
        log(`Page ${p.n}: no mosaic found (pass --box x,y,w,h to point at one, or a smaller --block)`);
        continue;
      }
      const overview = outPath(`${stem}-p${p.n}-regions.png`);
      writeFileSync(overview, dataUrlToBuffer(await page.evaluate((r) => window.__qa.outline(r), regions)));
      log(`Page ${p.n}: ${regions.length} mosaic region(s), outlined in ${overview}`);
      for (const [i, region] of regions.entries()) {
        const tag = `${stem}-p${p.n}-r${i + 1}`;
        const cut = outPath(`${tag}.png`);
        writeFileSync(cut, dataUrlToBuffer(await page.evaluate((b) => window.__qa.crop(b), region)));
        // The search image is drawn at the region's height: DECOY sizes its text from the box, so an
        // attacker who assumes the box hugged the original line gets the font size for free.
        const h = flags.height ? Number(flags.height) : region.h;
        const search = outPath(`${tag}-search.png`);
        writeFileSync(
          search,
          await renderText(page, deBruijn(chars, order), h, {
            px: flags.px ? Number(flags.px) : undefined,
            family: flags.font,
            pad: 2,
          }),
        );
        found.push({ page: p.n, index: i + 1, region, cut, search, overview });
      }
    }
    return found;
  });

  if (!items.length) {
    console.log('Nothing to attack. Files, if any, are in ' + OUT_DIR);
    return;
  }
  console.log('');
  for (const item of items) {
    const r = item.region;
    const out = outPath(`${stem}-p${item.page}-r${item.index}-depix.png`);
    const summary = summariseDepix(runDepix(item.cut, item.search, out));
    console.log(
      `Page ${item.page} region ${item.index}: ${r.x},${r.y},${r.w},${r.h}; ${r.blocks} blocks of ~${r.block} px; Depix saw ${summary.blocks} blocks, ${summary.matches}`,
    );
    console.log(`   cutout ${item.cut}`);
    console.log(`   Depix output ${out}`);
    if (items.length <= 4) openImage(out);
  }
  console.log('');
  console.log(
    'Open each Depix output next to its cutout, zoomed. Legible text there would be a finding; averaged',
  );
  console.log(
    `mush and coincidental matches are what a mosaic that never saw the original produces. Files: ${OUT_DIR}`,
  );
}

async function cmdDemo() {
  const block = Number(flags.block ?? 8);
  const secret = flags.secret ?? 'Summer2026!';
  const h = Number(flags.height ?? 24);
  // The alphabet is the lowercase set plus whatever the secret uses; a De Bruijn sequence grows with the
  // square of the alphabet, and Depix scans every offset of it, so the full ASCII set takes minutes.
  const chars = flags.chars ?? Array.from(new Set((DEFAULT_CHARS + secret).split(''))).join('');
  const order = Number(flags.order ?? 2);
  const result = await withPage(async (page) => {
    // 1. A page with the secret on it, in DECOY's own font and size, so the attacker's search image is a
    //    perfect match for the original. This is the best case for the attacker.
    const line = `Password   ${secret}`;
    const pageW = 640;
    const pageH = 200;
    const lineY = 88;
    const textPng = await renderText(page, line, h, { pad: 2 });
    const pagePng = dataUrlToBuffer(
      await page.evaluate(
        async ({ base64, pageW, pageH, lineY }) => {
          const res = await fetch('data:image/png;base64,' + base64);
          const bitmap = await createImageBitmap(await res.blob());
          const c = document.createElement('canvas');
          c.width = pageW;
          c.height = pageH;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, pageW, pageH);
          ctx.drawImage(bitmap, 40, lineY);
          return c.toDataURL('image/png');
        },
        { base64: textPng.toString('base64'), pageW, pageH, lineY },
      ),
    );
    const original = outPath('demo-original.png');
    writeFileSync(original, pagePng);
    // The secret starts after "Password   " (11 characters at 0.6 em each) plus the 2 px pad.
    const px = Math.round(h * 0.82);
    const advance = await page.evaluate(
      ({ px }) => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `700 ${px}px "Courier Prime"`;
        return ctx.measureText('Password   ').width;
      },
      { px },
    );
    const secretWidth = await page.evaluate(
      ({ px, secret }) => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `700 ${px}px "Courier Prime"`;
        return ctx.measureText(secret).width;
      },
      { px, secret },
    );
    // The box hugs the glyphs and spans whole blocks only. Depix's block detector merges neighbouring
    // blocks of identical colour and trips over partial blocks, so a blank row at the bottom or a sliver
    // at the edge can hide most of the mosaic from it. (The real app has no such constraint; this is
    // about giving Depix its best shot at the plain pixelation.)
    const whole = (n) => Math.ceil(n / block) * block;
    const loose = { x: Math.floor(40 + 2 + advance) - 2, y: lineY, w: Math.ceil(secretWidth) + 4, h };
    await loadImage(page, pagePng);
    const ink = await page.evaluate((b) => window.__qa.inkExtent(b), loose);
    const box = ink
      ? { x: ink.x - 1, y: ink.y - 1, w: whole(ink.w + 2), h: whole(ink.h + 2) }
      : { ...loose, w: whole(loose.w), h: whole(loose.h) };

    // 2. The search image: a De Bruijn sequence in the same font, size, and vertical placement.
    const searchText = deBruijn(chars, order);
    const search = outPath(`demo-search-h${h}.png`);
    writeFileSync(search, await renderText(page, searchText, h, { pad: 2 }));

    // 3. Plain pixelation of the secret, the way everyone does it.
    const plain = outPath('demo-plain-pixelated.png');
    writeFileSync(
      plain,
      dataUrlToBuffer(
        await page.evaluate(({ b, block }) => window.__qa.pixelate(b, block), { b: box, block }),
      ),
    );

    // 4. DECOY's export of the same box, through the real app, then the mosaic cut out of it.
    const decoyed = await decoyThrough(page, pagePng, box, { mood: flags.mood });
    const exported = outPath('demo-decoy-export.png');
    writeFileSync(exported, decoyed.exported);
    await loadImage(page, decoyed.exported);
    const snapped = await page.evaluate((b) => window.__qa.snap(b, 4), box);
    const decoyCrop = outPath('demo-decoy-pixelated.png');
    writeFileSync(decoyCrop, dataUrlToBuffer(await page.evaluate((b) => window.__qa.crop(b), snapped)));
    return { box, snapped, plain, decoyCrop, search, decoy: decoyed.decoy, secret };
  });

  log(
    `Secret "${result.secret}" at ${result.box.x},${result.box.y},${result.box.w},${result.box.h}; DECOY wrote "${result.decoy}" over it`,
  );
  log(`Search image: ${result.search}`);

  const plainOut = outPath('demo-plain-depix.png');
  const a = summariseDepix(runDepix(result.plain, result.search, plainOut));

  const decoyOut = outPath('demo-decoy-depix.png');
  const b = summariseDepix(runDepix(result.decoyCrop, result.search, decoyOut));

  console.log('');
  console.log(`Plain pixelation (block ${block}):  ${a.blocks} blocks, ${a.matches}`);
  console.log(`   Depix output: ${plainOut}`);
  console.log(`DECOY export:                      ${b.blocks} blocks, ${b.matches}`);
  console.log(`   Depix output: ${decoyOut}`);
  console.log('');
  console.log(
    'Read the two Depix outputs side by side, zoomed. "Straight" matches are blocks with exactly one',
  );
  console.log(
    'candidate in the search image; "multiple" matches are averaged, which is where the mush comes from.',
  );
  console.log(
    'Whatever Depix makes of the plain pixelation, it is working from the secret. In the DECOY export the',
  );
  console.log(
    `blocks are not averages of any text in any font, so nothing of the secret can appear. Files: ${OUT_DIR}`,
  );
  openImage(plainOut);
  openImage(decoyOut);
}

const commands = {
  setup: cmdSetup,
  'search-image': cmdSearchImage,
  crop: cmdCrop,
  pixelate: cmdPixelate,
  depix: cmdDepix,
  attack: cmdAttack,
  demo: cmdDemo,
};
if (!command || !commands[command]) {
  console.error(
    'usage: depix-qa.mjs <setup|demo|attack|crop|pixelate|search-image|depix> [...]  (see the header of this file)',
  );
  process.exit(2);
}
await commands[command]();
