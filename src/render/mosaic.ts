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
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    canvas.getContext('2d')?.putImageData(imageData, 0, 0);
    return canvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d')?.putImageData(imageData, 0, 0);
  return canvas;
}

export interface MosaicPixels {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
}

// The whole mosaic is a function of the spec: text, box size, block size, ink, and paper. The document is
// not an input, which is what makes caching by spec safe and the security property hold. This is the
// environment-free part; buildMosaic wraps it for the browser.
export function mosaicPixels(spec: MosaicSpec): MosaicPixels {
  const w = Math.max(1, Math.round(spec.w));
  const h = Math.max(1, Math.round(spec.h));
  const coverage = coverageFromRgba(rasterizeText(spec.text, w, h), w, h);
  const data = mosaicFromCoverage(coverage, {
    w,
    h,
    cell: spec.cell,
    ink: parseHex(spec.ink, INK_FALLBACK),
    paper: parseHex(spec.paper, PAPER_FALLBACK),
    seed: mosaicSeed(spec.text),
  });
  return { data, w, h };
}

export function buildMosaic(spec: MosaicSpec): MosaicBitmap {
  const key = keyOf({ ...spec, w: Math.max(1, Math.round(spec.w)), h: Math.max(1, Math.round(spec.h)) });
  const hit = cache.get(key);
  if (hit) return hit;
  const { data, w, h } = mosaicPixels(spec);
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
