import { luma } from './color';
import { blockDarkness, mosaicGrid } from './mosaic';

// The attacker's half of the story, kept in the repo so the security claim can be exercised: render a
// candidate phrase the way DECOY does, pixelate it the same way, and compare block by block with the
// mosaic in the exported image. Whichever candidate matches best is "what a depixelizer would get".

// Mean luma of each block of an exported region, with the same block edges rasterizeCells uses.
export function blockLuma(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  cols: number,
  rows: number,
): Float64Array {
  const out = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round((r * h) / rows);
    const y1 = r === rows - 1 ? h : Math.round(((r + 1) * h) / rows);
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round((c * w) / cols);
      const x1 = c === cols - 1 ? w : Math.round(((c + 1) * w) / cols);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum += luma(rgba[i], rgba[i + 1], rgba[i + 2]);
          n++;
        }
      }
      out[r * cols + c] = n > 0 ? sum / n : 0;
    }
  }
  return out;
}

// Darkness relative to the lightest block, scaled so the darkest block is 1. Independent of the ink and
// paper colours, which is what lets the comparison work on any document.
export function normalizedDarkness(values: ArrayLike<number>, lighterIsLess = true): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range <= 0) return out;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    out[i] = lighterIsLess ? (max - v) / range : (v - min) / range;
  }
  return out;
}

// The target grid of an exported box: normalised block darkness from the pixels.
export function targetDarkness(rgba: Uint8ClampedArray, w: number, h: number, cell: number): Float64Array {
  const { cols, rows } = mosaicGrid(w, h, cell);
  return normalizedDarkness(blockLuma(rgba, w, h, cols, rows));
}

// What the same box would look like for a candidate phrase, from its text coverage.
export function candidateDarkness(
  coverage: ArrayLike<number>,
  w: number,
  h: number,
  cell: number,
): Float64Array {
  const { cols, rows } = mosaicGrid(w, h, cell);
  return normalizedDarkness(blockDarkness(coverage, w, h, cols, rows), false);
}

export function meanSquaredError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / a.length;
}

export interface Candidate {
  text: string;
  darkness: ArrayLike<number>;
  custom?: boolean;
}

export interface Ranked {
  text: string;
  score: number;
  custom: boolean;
}

// Lower score is a closer match. Scores are mean squared error on normalised darkness, so 0 is identical
// and anything near 0.25 is no better than noise.
export function rankCandidates(target: ArrayLike<number>, candidates: Iterable<Candidate>): Ranked[] {
  const out: Ranked[] = [];
  for (const candidate of candidates) {
    out.push({
      text: candidate.text,
      score: meanSquaredError(target, candidate.darkness),
      custom: candidate.custom ?? false,
    });
  }
  return out.sort((a, b) => a.score - b.score || a.text.localeCompare(b.text));
}
