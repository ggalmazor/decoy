import { parseHex, INK_FALLBACK, PAPER_FALLBACK } from '../core/color';
import { coverageFromRgba, mosaicFromCoverage, mosaicSeed } from '../core/mosaic';
import { rasterizeText } from './text';

export interface MosaicSpec {
  text: string;
  w: number;
  h: number;
  cell: number;
  ink: string;
  paper: string;
}

export interface MosaicBitmap {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
  readonly imageData: ImageData;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
}

const cache = new Map<string, MosaicBitmap>();
const CACHE_LIMIT = 256;

function keyOf(spec: MosaicSpec): string {
  return [spec.text, spec.w, spec.h, spec.cell, spec.ink.toLowerCase(), spec.paper.toLowerCase()].join('|');
}

function canvasFor(imageData: ImageData): HTMLCanvasElement | OffscreenCanvas {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(imageData.width, imageData.height)
      : Object.assign(document.createElement('canvas'), { width: imageData.width, height: imageData.height });
  const ctx = canvas.getContext('2d');
  ctx?.putImageData(imageData, 0, 0);
  return canvas;
}

// The whole mosaic is a function of the spec: text, box size, block size, ink, and paper. The document is
// not an input, which is what makes caching by spec safe and the security property hold.
export function buildMosaic(spec: MosaicSpec): MosaicBitmap {
  const w = Math.max(1, Math.round(spec.w));
  const h = Math.max(1, Math.round(spec.h));
  const key = keyOf({ ...spec, w, h });
  const hit = cache.get(key);
  if (hit) return hit;
  const coverage = coverageFromRgba(rasterizeText(spec.text, w, h), w, h);
  const data = mosaicFromCoverage(coverage, {
    w,
    h,
    cell: spec.cell,
    ink: parseHex(spec.ink, INK_FALLBACK),
    paper: parseHex(spec.paper, PAPER_FALLBACK),
    seed: mosaicSeed(spec.text),
  });
  const imageData = new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h);
  const bitmap: MosaicBitmap = { data, w, h, imageData, canvas: canvasFor(imageData) };
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, bitmap);
  return bitmap;
}

export function clearMosaicCache(): void {
  cache.clear();
}
