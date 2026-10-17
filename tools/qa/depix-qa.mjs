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
//
// Everything that draws text goes through headless Chromium against the built site, so the search image is
// rendered by the same engine, font, and size DECOY itself uses: the most favourable conditions an attacker
// could hope for. Outputs land in tmp/qa/. Needs: node, uv (mise installs both), and the build in dist/.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

function runShowBoxes(pixelated, search, output) {
  ensureDepix();
  const script = resolve(DEPIX_DIR, 'tool_show_boxes.py');
  try {
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
        script,
        '-p',
        pixelated,
        '-s',
        search,
        '-o',
        output,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONPATH: DEPIX_DIR },
      },
    );
    return true;
  } catch {
    return false;
  }
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
  const page = await browser.newPage({ acceptDownloads: true, deviceScaleFactor: 1 });
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
  (async ({ base64 }) => {
    const res = await fetch('data:image/png;base64,' + base64);
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
      crop(box) {
        const c = document.createElement('canvas');
        c.width = box.w; c.height = box.h;
        c.getContext('2d').putImageData(ctx.getImageData(box.x, box.y, box.w, box.h), 0, 0);
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

async function loadImage(page, buffer) {
  return page.evaluate(`${IMAGE_TOOLS}(${JSON.stringify({ base64: buffer.toString('base64') })})`);
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
  const boxes = out.replace(/\.png$/, '-boxes.png');
  const text = runDepix(resolve(pixelated), resolve(search), out, {
    average: flags.average,
    background: flags.background,
  });
  const summary = summariseDepix(text);
  log(`Depix saw ${summary.blocks} blocks; result ${summary.matches}`);
  log(`Output: ${out}`);
  if (runShowBoxes(resolve(pixelated), resolve(search), boxes)) log(`Block detection: ${boxes}`);
  openImage(out);
  return out;
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
    const box = { x: Math.floor(40 + 2 + advance) - 2, y: lineY, w: Math.ceil(secretWidth) + 4, h };

    // 2. The search image: a De Bruijn sequence in the same font, size, and vertical placement.
    const searchText = deBruijn(chars, order);
    const search = outPath(`demo-search-h${h}.png`);
    writeFileSync(search, await renderText(page, searchText, h, { pad: 2 }));

    // 3. Plain pixelation of the secret, the way everyone does it.
    await loadImage(page, pagePng);
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
  runShowBoxes(result.plain, result.search, plainOut.replace(/\.png$/, '-boxes.png'));

  const decoyOut = outPath('demo-decoy-depix.png');
  const b = summariseDepix(runDepix(result.decoyCrop, result.search, decoyOut));
  runShowBoxes(result.decoyCrop, result.search, decoyOut.replace(/\.png$/, '-boxes.png'));

  console.log('');
  console.log(`Plain pixelation (block ${block}):  ${a.blocks} blocks, ${a.matches}`);
  console.log(`   Depix output: ${plainOut}`);
  console.log(`DECOY export:                      ${b.blocks} blocks, ${b.matches}`);
  console.log(`   Depix output: ${decoyOut}`);
  console.log('');
  console.log('Read the outputs side by side: Depix should reconstruct glyphs of the secret from the plain');
  console.log(
    'pixelation and find nothing to reconstruct in the DECOY export, whose blocks are not averages',
  );
  console.log(`of any text in the search image. Everything is in ${OUT_DIR}.`);
  openImage(plainOut);
  openImage(decoyOut);
}

const commands = {
  setup: cmdSetup,
  'search-image': cmdSearchImage,
  crop: cmdCrop,
  pixelate: cmdPixelate,
  depix: cmdDepix,
  demo: cmdDemo,
};
if (!command || !commands[command]) {
  console.error(
    'usage: depix-qa.mjs <setup|demo|crop|pixelate|search-image|depix> [...]  (see the header of this file)',
  );
  process.exit(2);
}
await commands[command]();
