import type { Rect, Size } from './geometry';

export interface RgbaImage {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
}

export function cropRgba(src: RgbaImage, rect: Rect): RgbaImage {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(src.w, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(src.h, Math.ceil(rect.y + rect.h));
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * src.w + x0) * 4;
    data.set(src.data.subarray(from, from + w * 4), y * w * 4);
  }
  return { data, w, h };
}

// Opaque replace: every destination pixel inside the rectangle becomes the source pixel, alpha forced to
// 255. There is deliberately no blending path, because a blend would let the original pixels leak into the
// result in proportion to the source alpha.
export function blitOpaque(dst: Uint8ClampedArray, dstSize: Size, src: Uint8ClampedArray, rect: Rect): void {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(dstSize.w, rect.x + rect.w);
  const y1 = Math.min(dstSize.h, rect.y + rect.h);
  for (let y = y0; y < y1; y++) {
    const sy = y - rect.y;
    for (let x = x0; x < x1; x++) {
      const sx = x - rect.x;
      const si = (sy * rect.w + sx) * 4;
      const di = (y * dstSize.w + x) * 4;
      dst[di] = src[si]!;
      dst[di + 1] = src[si + 1]!;
      dst[di + 2] = src[si + 2]!;
      dst[di + 3] = 255;
    }
  }
}
