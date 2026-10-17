// Command-line Enhance lab: rank candidate phrases against a mosaic in an exported image.
//
//   node scripts/depix.mjs <image.png> <x,y,w,h> [--cell 8|auto] [--guess 'Summer2026!' ...] [--url http://127.0.0.1:4173]
//
// Drives the /depix.html page in headless Chromium so the candidates are rendered with the same font and
// canvas as the app. Start `npm run preview` (or `npm run dev` and pass --url http://localhost:5173) first.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const args = process.argv.slice(2);
const positional = [];
const guesses = [];
let cell = 'auto';
let url = 'http://127.0.0.1:4173';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--cell') cell = args[++i];
  else if (a === '--guess') guesses.push(args[++i]);
  else if (a === '--url') url = args[++i];
  else positional.push(a);
}
const [file, boxArg] = positional;
if (!file || !boxArg) {
  console.error(
    "usage: node scripts/depix.mjs <image.png> <x,y,w,h> [--cell 8|auto] [--guess 'text'] [--url http://127.0.0.1:4173]",
  );
  process.exit(2);
}
const box = boxArg.split(',').map(Number);
if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) {
  console.error('box must be x,y,w,h in image pixels');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${url}/depix.html`);
await page.getByTestId('lab-file').setInputFiles({
  name: basename(file),
  mimeType: file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' : 'image/png',
  buffer: readFileSync(resolve(file)),
});
await page.getByTestId('lab-canvas').waitFor();
const boxInput = page.getByTestId('lab-box');
await boxInput.fill(box.join(', '));
await boxInput.press('Enter');
await boxInput.blur();
await page.getByTestId('lab-cell').selectOption(cell);
if (guesses.length) await page.getByTestId('lab-custom').fill(guesses.join('\n'));
await page.getByTestId('lab-run').click();
await page.getByTestId('lab-results').waitFor({ timeout: 120_000 });
const meta = await page.locator('.lab__meta').innerText();
const rows = await page.locator('.lab__row').evaluateAll((els) =>
  els.map((el) => ({
    phrase: el.querySelector('.lab__phrase')?.textContent ?? '',
    score: el.querySelector('.lab__score')?.textContent ?? '',
    yours: el.getAttribute('data-custom') === 'true',
  })),
);
await browser.close();

console.log(meta);
console.log('');
rows.forEach((r, i) =>
  console.log(`${String(i + 1).padStart(3)}  ${r.score}  ${r.phrase}${r.yours ? '   (your guess)' : ''}`),
);
