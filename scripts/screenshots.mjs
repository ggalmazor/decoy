// Takes reference screenshots of the running dev server for a visual check against design/screens/.
//   node scripts/screenshots.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
mkdirSync('e2e/output/shots', { recursive: true });
const browser = await chromium.launch();

for (const [name, width, height] of [
  ['landing-desktop', 1440, 900],
  ['landing-mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(base);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `e2e/output/shots/${name}.png`, fullPage: true });
  await page.close();
}

for (const [name, width, height, fixture, box] of [
  ['editor-desktop', 1440, 900, 'e2e/fixtures/three-pages.pdf', { x: 250, y: 292, w: 180, h: 30 }],
  ['editor-mobile', 390, 844, 'e2e/fixtures/page.png', { x: 260, y: 270, w: 300, h: 24 }],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(base);
  await page.getByTestId('file-input').setInputFiles(fixture);
  const canvas = page.getByTestId('page-canvas');
  await canvas.waitFor();
  await page.waitForTimeout(400);
  if (name === 'editor-desktop') await page.locator('.thumb').nth(1).click();
  const bounds = await canvas.boundingBox();
  const cssW = await canvas.evaluate((c) => c.width / (window.devicePixelRatio || 1));
  const scale = bounds.width / cssW;
  const x0 = bounds.x + box.x * scale;
  const y0 = bounds.y + box.y * scale;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + box.w * scale, y0 + box.h * scale, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/output/shots/${name}-pending.png` });
  await page.getByRole('button', { name: 'Apply decoy' }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `e2e/output/shots/${name}-applied.png` });
  await page.getByRole('button', { name: 'Export' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `e2e/output/shots/${name}-export.png` });
  await page.close();
}
await browser.close();
console.log('shots in e2e/output/shots/');
