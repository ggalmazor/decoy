import { availableWidth, fontSizeFor } from '../core/fit';

export const DECOY_FONT_FAMILY = '"Courier Prime", "Courier New", Courier, monospace';

function font(px: number): string {
  return `700 ${px}px ${DECOY_FONT_FAMILY}`;
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Canvas2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
}

let measureCtx: Canvas2D | null = null;
const widthCache = new Map<string, number>();

export function measureText(text: string, px: number): number {
  const key = `${px}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  measureCtx ??= makeCanvas(1, 1).ctx;
  measureCtx.font = font(px);
  const width = measureCtx.measureText(text).width;
  if (widthCache.size > 5000) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

let fontsPromise: Promise<void> | null = null;

// The measure cache is only valid once the real font is in; fallbacks have different advances.
export function decoyFontReady(): Promise<void> {
  fontsPromise ??= (async () => {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    try {
      await document.fonts.load(font(20));
      await document.fonts.ready;
    } catch {
      /* fall back to whatever the browser has */
    }
    widthCache.clear();
  })();
  return fontsPromise;
}

// Step 1 of the mosaic: only the decoy phrase is drawn, black on white, at 0.82 of the box height, shrunk
// to fit the width, left-aligned at x = 2 and vertically centred. Matches design/mockups/mosaic.js.
export function rasterizeText(text: string, w: number, h: number): Uint8ClampedArray {
  const { ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  let size = fontSizeFor(h);
  ctx.font = font(size);
  const width = ctx.measureText(text).width;
  const avail = availableWidth(w);
  if (width > avail) {
    size = Math.max(6, (size * avail) / width);
    ctx.font = font(size);
  }
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 2, h / 2 + 1);
  return ctx.getImageData(0, 0, w, h).data;
}
