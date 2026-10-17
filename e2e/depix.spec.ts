import { expect, test } from '@playwright/test';
import { downloadBytes, dragBox, openFixture } from './helpers';

// The attack, end to end: decoy a box, export, then hand the export to the Enhance lab with the real
// secret among the guesses. The lab must recover the decoy and rank the secret below it.
const BOX = { x: 260, y: 270, w: 300, h: 24 };
const SECRET = 'Summer2026!';

test('the Enhance lab recovers the decoy phrase, not the secret', async ({ page }) => {
  await openFixture(page, 'page.png');
  const canvas = page.getByTestId('page-canvas');
  await dragBox(page, canvas, BOX);
  const decoy = await page.locator('#decoy-text').inputValue();
  await page.getByRole('button', { name: 'Apply decoy' }).click();
  const appliedBox = await page.locator('.on-page__label').innerText();
  const size = /(\d+) × (\d+)/.exec(appliedBox)!;

  await page.getByRole('button', { name: 'Export' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Download PNG' }).click();
  const exported = await downloadBytes(await downloadPromise);

  // The drag starts at BOX and the applied label carries the size the editor actually used.
  await page.goto('/depix.html');
  await page
    .getByTestId('lab-file')
    .setInputFiles({ name: 'export.png', mimeType: 'image/png', buffer: exported });
  await expect(page.getByTestId('lab-canvas')).toBeVisible();
  const boxInput = page.getByTestId('lab-box');
  await boxInput.fill(`${BOX.x}, ${BOX.y}, ${size[1]}, ${size[2]}`);
  await boxInput.press('Enter');
  await boxInput.blur();
  await page.getByTestId('lab-custom').fill(`${SECRET}\nhunter2\ncorrect horse battery`);
  await page.getByTestId('lab-run').click();

  const results = page.getByTestId('lab-results');
  await expect(results).toBeVisible({ timeout: 60_000 });
  const phrases = await results.getByTestId('lab-phrase').allInnerTexts();
  expect(phrases[0]).toBe(decoy);
  const secretRank = phrases.findIndex((p) => p === SECRET);
  expect(secretRank === -1 || secretRank > 0).toBe(true);
  await expect(results.locator('.lab__verdict')).toContainText('The best match is a decoy phrase.');
});
