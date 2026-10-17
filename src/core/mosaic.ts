import { lerpColor, type RGB } from './color';
import { hashString, lcg } from './rng';

export interface MosaicGrid {
  cols: number;
  rows: number;
}

export const DEFAULT_CELL = 8;
export const MIN_CELL = 4;
export const MAX_CELL = 16;
export const MAX_DARKNESS = 0.9;
export const JITTER = 0.06;

export function mosaicGrid(w: number, h: number, cell: number): MosaicGrid {
  return { cols: Math.max(1, Math.round(w / cell)), rows: Math.max(1, Math.round(h / cell)) };
}

// The seed the reference implementation derives from the decoy text, so the jitter pattern is a function
// of the phrase and nothing else.
export function mosaicSeed(text: string): number {
  return hashString(text, 7);
}

// Darkness per pixel (1 - luminance) from an RGBA raster of black text on white. Only the red channel is
// read, exactly like the reference, which is correct for a grayscale rendering.
export function coverageFromRgba(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = 1 - rgba[i * 4] / 255;
  }
  return out;
}

export function blockDarkness(
  coverage: ArrayLike<number>,
  w: number,
  h: number,
  cols: number,
  rows: number,
): Float64Array {
  const dark = new Float64Array(cols * rows);
  for (let y = 0; y < h; y++) {
    const r = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 0; x < w; x++) {
      const c = Math.min(cols - 1, Math.floor((x * cols) / w));
      dark[r * cols + c] += coverage[y * w + x];
    }
  }
  const area = (w / cols) * (h / rows);
  for (let k = 0; k < dark.length; k++) dark[k] = dark[k] / area;
  return dark;
}

// Normalise by the darkest block, cap at 0.9 so no block reaches pure ink, add seeded jitter, and map
// paper to ink. Returns packed RGB triples, one per block.
export function mosaicCells(
  darkness: ArrayLike<number>,
  ink: RGB,
  paper: RGB,
  seed: number,
): Uint8ClampedArray {
  const rnd = lcg(seed);
  let max = 0;
  for (let k = 0; k < darkness.length; k++) if (darkness[k] > max) max = darkness[k]!;
  const cells = new Uint8ClampedArray(darkness.length * 3);
  for (let k = 0; k < darkness.length; k++) {
    let t = max > 0 ? Math.min(1, (darkness[k] / max) * MAX_DARKNESS) : 0;
    t = Math.max(0, Math.min(1, t + (rnd() - 0.5) * JITTER));
    const [r, g, b] = lerpColor(paper, ink, t);
    cells[k * 3] = r;
    cells[k * 3 + 1] = g;
    cells[k * 3 + 2] = b;
  }
  return cells;
}

// Block edges sit at round(c * w / cols), so the blocks tile the box exactly: no gaps at odd sizes, every
// pixel written, alpha 255 throughout.
export function rasterizeCells(
  cells: Uint8ClampedArray,
  cols: number,
  rows: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round((r * h) / rows);
    const y1 = r === rows - 1 ? h : Math.round(((r + 1) * h) / rows);
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round((c * w) / cols);
      const x1 = c === cols - 1 ? w : Math.round(((c + 1) * w) / cols);
      const k = (r * cols + c) * 3;
      const red = cells[k];
      const green = cells[k + 1];
      const blue = cells[k + 2];
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++) {
          out[i] = red;
          out[i + 1] = green;
          out[i + 2] = blue;
          out[i + 3] = 255;
          i += 4;
        }
      }
    }
  }
  return out;
}

export interface MosaicParams {
  w: number;
  h: number;
  cell: number;
  ink: RGB;
  paper: RGB;
  seed: number;
}

// The pure half of the pipeline: from a per-pixel coverage of the rasterised decoy phrase to the RGBA block
// image that replaces the box. Nothing here can see the document.
export function mosaicFromCoverage(coverage: ArrayLike<number>, params: MosaicParams): Uint8ClampedArray {
  const { w, h, cell, ink, paper, seed } = params;
  const { cols, rows } = mosaicGrid(w, h, cell);
  const dark = blockDarkness(coverage, w, h, cols, rows);
  const cells = mosaicCells(dark, ink, paper, seed);
  return rasterizeCells(cells, cols, rows, w, h);
}
