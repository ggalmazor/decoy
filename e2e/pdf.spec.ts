import { expect, test } from '@playwright/test';
import { downloadBytes, dragBox, openFixture } from './helpers';

async function extract(
  bytes: Buffer,
): Promise<{ pages: number; text: string; producer: string | undefined; title: string | undefined }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join('');
  }
  const meta = (await doc.getMetadata()).info as Record<string, string | undefined>;
  return { pages: doc.numPages, text, producer: meta.Producer, title: meta.Title };
}

test('a multi-page PDF exports as image-only pages with no text layer or metadata', async ({ page }) => {
  await openFixture(page, 'three-pages.pdf');
  await expect(page.locator('.thumb')).toHaveCount(3);
  await page.locator('.thumb').nth(1).click();
  await expect(page.locator('.thumb--current .thumb__caption')).toHaveText('2');

  const canvas = page.getByTestId('page-canvas');
  // "Password   Summer2026!" sits at 56pt from the left, 692pt from the bottom; at 150 dpi that is roughly
  // x 115..420, y 290..325.
  await dragBox(page, canvas, { x: 250, y: 292, w: 180, h: 30 });
  await page.getByRole('button', { name: 'Apply decoy' }).click();
  await expect(page.locator('.thumb').nth(1)).toContainText('1 decoy');

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /PDF/ })).toBeChecked();
  await expect(dialog.getByText('flattened, 3 pages')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('three-pages-decoyed.pdf');
  const bytes = await downloadBytes(download);

  const result = await extract(bytes);
  expect(result.pages).toBe(3);
  expect(result.text.trim()).toBe('');
  expect(result.producer).toBe('DECOY');
  expect(result.title ?? '').toBe('');
  expect(bytes.toString('latin1')).not.toContain('Summer2026');
  expect(bytes.toString('latin1')).not.toContain('Etxeberria');
});

test('an unsupported file is refused with the copy deck line', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert')).toContainText('We only redact the classics.');
});
