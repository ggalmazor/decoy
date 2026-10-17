import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { comparePng, downloadBytes, dragBox, FIXTURES, openFixture } from './helpers';

const BOX = { x: 260, y: 270, w: 300, h: 24 };

test('boxing a region of a PNG replaces only that region in the export', async ({ page }) => {
  await openFixture(page, 'page.png');
  const canvas = page.getByTestId('page-canvas');

  await dragBox(page, canvas, BOX);
  await expect(page.locator('.selection')).toBeVisible();
  const text = await page.locator('#decoy-text').inputValue();
  expect(text.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Apply decoy' }).click();
  await expect(page.locator('.selection')).toHaveCount(0);
  await expect(page.locator('.on-page__text')).toHaveText(text);

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /PNG/ })).toBeChecked();
  await expect(dialog.locator('.enhance__phrase')).toHaveText(text);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('page-decoyed.png');
  const exported = await downloadBytes(download);

  const original = readFileSync(FIXTURES + 'page.png');
  const result = await comparePng(page, original, exported, BOX);
  expect(result.sameSize).toBe(true);
  expect(result.outsideChanged, JSON.stringify(result.bbox)).toBe(0);
  expect(result.insideChanged / result.inside).toBeGreaterThan(0.5);
  await expect(page.getByText('Leaked responsibly.')).toBeVisible();
});

test('shortcuts: Enter applies, R rerolls, Escape cancels, undo restores', async ({ page }) => {
  await openFixture(page, 'page.png');
  const canvas = page.getByTestId('page-canvas');
  await dragBox(page, canvas, BOX);
  const first = await page.locator('#decoy-text').inputValue();
  await page.keyboard.press('r');
  await expect(page.locator('#decoy-text')).not.toHaveValue(first);
  await page.keyboard.press('Enter');
  await expect(page.locator('.on-page__row')).toHaveCount(1);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.locator('.on-page__row')).toHaveCount(0);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect(page.locator('.on-page__row')).toHaveCount(1);
  await dragBox(page, canvas, { x: 40, y: 90, w: 200, h: 20 });
  await expect(page.locator('.selection')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.selection')).toHaveCount(0);
  await expect(page.locator('.on-page__row')).toHaveCount(1);
});
