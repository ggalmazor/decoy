import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export async function openFixture(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(FIXTURES + name);
  await expect(page.getByTestId('page-canvas')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Drags a box given in page pixels, converting through the canvas's on-screen size (zoom is fit-to-width).
export async function dragBox(page: Page, canvas: Locator, box: Box): Promise<void> {
  const bounds = (await canvas.boundingBox())!;
  const scale =
    bounds.width /
    (await canvas.evaluate((c: HTMLCanvasElement) => c.width / (window.devicePixelRatio || 1)));
  const x0 = bounds.x + box.x * scale;
  const y0 = bounds.y + box.y * scale;
  const x1 = bounds.x + (box.x + box.w) * scale;
  const y1 = bounds.y + (box.y + box.h) * scale;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
  await page.mouse.move(x1, y1, { steps: 4 });
  await page.mouse.up();
}

export async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFileSync(path);
}

// Decodes two PNGs in the browser and compares them pixel by pixel, inside and outside a rectangle.
export async function comparePng(page: Page, original: Buffer, exported: Buffer, box: Box) {
  return page.evaluate(
    async ({ a, b, box }) => {
      const decode = async (base64: string) => {
        const res = await fetch(`data:image/png;base64,${base64}`);
        const bitmap = await createImageBitmap(await res.blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return {
          data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          w: canvas.width,
          h: canvas.height,
        };
      };
      const A = await decode(a);
      const B = await decode(b);
      if (A.w !== B.w || A.h !== B.h)
        return { sameSize: false, insideChanged: 0, outsideChanged: 0, inside: 0, outside: 0 };
      let insideChanged = 0;
      let outsideChanged = 0;
      let inside = 0;
      let outside = 0;
      for (let y = 0; y < A.h; y++) {
        for (let x = 0; x < A.w; x++) {
          const i = (y * A.w + x) * 4;
          const same =
            A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2];
          const inBox = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
          if (inBox) {
            inside++;
            if (!same) insideChanged++;
          } else {
            outside++;
            if (!same) outsideChanged++;
          }
        }
      }
      return { sameSize: true, insideChanged, outsideChanged, inside, outside };
    },
    { a: original.toString('base64'), b: exported.toString('base64'), box },
  );
}
