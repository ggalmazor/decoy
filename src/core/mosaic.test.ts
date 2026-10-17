import { describe, expect, it } from 'vitest';
import {
  blockDarkness,
  coverageFromRgba,
  mosaicCells,
  mosaicFromCoverage,
  mosaicGrid,
  mosaicSeed,
  rasterizeCells,
} from './mosaic';
import type { RGB } from './color';

const INK: RGB = [0x17, 0x14, 0x0f];
const PAPER: RGB = [0xf6, 0xf1, 0xe6];

// A straight port of the normalise/jitter/colour step from design/mockups/mosaic.js, used as an oracle.
function referenceCells(dark: number[], text: string, a: RGB, b: RGB): number[][] {
  let seed = 7;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let max = 0;
  for (const v of dark) if (v > max) max = v;
  return dark.map((v) => {
    let t = max > 0 ? Math.min(1, (v / max) * 0.9) : 0;
    t = Math.max(0, Math.min(1, t + (rnd() - 0.5) * 0.06));
    return [0, 1, 2].map((j) => Math.round(b[j] + (a[j] - b[j]) * t));
  });
}

function syntheticCoverage(w: number, h: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = ((i * 2654435761 + seed) >>> 0) % 7 === 0 ? 1 : 0;
  return out;
}

describe('mosaic', () => {
  it('grid rounds the box size to whole blocks', () => {
    expect(mosaicGrid(380, 24, 8)).toEqual({ cols: 48, rows: 3 });
    expect(mosaicGrid(3, 3, 8)).toEqual({ cols: 1, rows: 1 });
  });

  it('rasterizeCells covers every pixel at awkward sizes with opaque alpha', () => {
    for (const [w, h, cols, rows] of [
      [37, 13, 5, 2],
      [1, 1, 1, 1],
      [101, 17, 13, 2],
      [8, 300, 1, 37],
    ] as const) {
      const cells = new Uint8ClampedArray(cols * rows * 3);
      for (let k = 0; k < cols * rows; k++) {
        cells[k * 3] = 1 + (k % 250);
        cells[k * 3 + 1] = 7;
        cells[k * 3 + 2] = 9;
      }
      const rgba = rasterizeCells(cells, cols, rows, w, h);
      expect(rgba.length).toBe(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        expect(rgba[i * 4 + 3], `alpha at ${i} for ${w}x${h}`).toBe(255);
        expect(rgba[i * 4], `red at ${i} for ${w}x${h}`).toBeGreaterThan(0);
      }
    }
  });

  it('rasterizeCells puts block edges at round(c * w / cols)', () => {
    const cells = new Uint8ClampedArray([10, 0, 0, 20, 0, 0, 30, 0, 0]);
    const rgba = rasterizeCells(cells, 3, 1, 10, 1);
    // Edges at round(0)=0, round(3.33)=3, round(6.67)=7, 10.
    const reds = Array.from({ length: 10 }, (_, x) => rgba[x * 4]);
    expect(reds).toEqual([10, 10, 10, 20, 20, 20, 20, 30, 30, 30]);
  });

  it('blockDarkness averages per block and matches the reference mapping', () => {
    const w = 6;
    const h = 2;
    const coverage = new Float32Array([1, 1, 0, 0, 0.5, 0.5, 1, 1, 0, 0, 0.5, 0.5]);
    const dark = blockDarkness(coverage, w, h, 3, 1);
    expect(Array.from(dark)).toEqual([1, 0, 0.5]);
  });

  it('mosaicCells caps darkness at 0.9 plus jitter and matches the reference oracle', () => {
    const text = 'nice try, enhance harder';
    const dark = Array.from({ length: 40 }, (_, k) => (k % 5) / 4);
    const ours = mosaicCells(dark, INK, PAPER, mosaicSeed(text));
    const expected = referenceCells(dark, text, INK, PAPER).flat();
    expect(Array.from(ours)).toEqual(expected);
    const maxT = 0.9 + 0.03;
    for (let k = 0; k < dark.length; k++) {
      const r = ours[k * 3];
      expect(r).toBeGreaterThanOrEqual(PAPER[0] + (INK[0] - PAPER[0]) * maxT - 1);
    }
  });

  it('is deterministic for the same parameters', () => {
    const coverage = syntheticCoverage(90, 20, 3);
    const params = { w: 90, h: 20, cell: 6, ink: INK, paper: PAPER, seed: mosaicSeed('lol no') };
    expect(mosaicFromCoverage(coverage, params)).toEqual(mosaicFromCoverage(coverage, params));
  });

  it('coverageFromRgba reads darkness from the red channel', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(Array.from(coverageFromRgba(rgba, 2, 1))).toEqual([0, 1]);
  });
});
