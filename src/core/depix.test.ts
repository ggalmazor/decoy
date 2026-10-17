import { describe, expect, it } from 'vitest';
import {
  candidateDarkness,
  meanSquaredError,
  normalizedDarkness,
  rankCandidates,
  targetDarkness,
} from './depix';
import { mosaicFromCoverage, mosaicSeed } from './mosaic';

// A deterministic stand-in for text rasterisation: each "glyph" is a column pattern derived from the
// character code, so different strings give different coverage maps of the same size.
function fakeCoverage(text: string, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const glyphW = Math.max(1, Math.floor(w / Math.max(1, text.length)));
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (let y = 2; y < h - 2; y++) {
      for (let x = i * glyphW; x < Math.min(w, (i + 1) * glyphW - 1); x++) {
        if ((code * 31 + x * 7 + y * 13) % 5 < 2) out[y * w + x] = 1;
      }
    }
  }
  return out;
}

const W = 240;
const H = 24;
const CELL = 8;

describe('depix', () => {
  it('normalises darkness to the lightest and darkest blocks', () => {
    expect(Array.from(normalizedDarkness([250, 200, 150]))).toEqual([0, 0.5, 1]);
    expect(Array.from(normalizedDarkness([0, 0.5, 1], false))).toEqual([0, 0.5, 1]);
    expect(Array.from(normalizedDarkness([7, 7]))).toEqual([0, 0]);
  });

  it('recovers the decoy from its mosaic and ranks the secret far below', () => {
    const decoy = 'nice try, enhance harder';
    const secret = 'Summer2026! pass';
    const others = ['you thought this was a password', 'keep squinting, nerd', 'lol no, not here'];
    const mosaic = mosaicFromCoverage(fakeCoverage(decoy, W, H), {
      w: W,
      h: H,
      cell: CELL,
      ink: [23, 20, 15],
      paper: [246, 241, 230],
      seed: mosaicSeed(decoy),
    });
    const target = targetDarkness(mosaic, W, H, CELL);
    const ranked = rankCandidates(
      target,
      [decoy, secret, ...others].map((text) => ({
        text,
        darkness: candidateDarkness(fakeCoverage(text, W, H), W, H, CELL),
        custom: text === secret,
      })),
    );
    expect(ranked[0].text).toBe(decoy);
    expect(ranked[0].score).toBeLessThan(0.01);
    const secretRank = ranked.findIndex((r) => r.text === secret);
    expect(secretRank).toBeGreaterThan(0);
    expect(ranked[secretRank].score).toBeGreaterThan(ranked[0].score * 5);
  });

  it('works whatever the ink and paper colours are', () => {
    const decoy = 'per my last email: no';
    const dark = mosaicFromCoverage(fakeCoverage(decoy, W, H), {
      w: W,
      h: H,
      cell: CELL,
      ink: [200, 220, 255],
      paper: [20, 24, 40],
      seed: mosaicSeed(decoy),
    });
    // Light ink on dark paper: the lightest block is text, so flip the sense when ink is lighter.
    const target = normalizedDarkness(targetDarkness(dark, W, H, CELL), false);
    const inverted = normalizedDarkness(
      target.map((v) => 1 - v),
      false,
    );
    const candidates = [decoy, 'let us take this offline', 'circling back: still no'].map((text) => ({
      text,
      darkness: candidateDarkness(fakeCoverage(text, W, H), W, H, CELL),
    }));
    const best = Math.min(
      rankCandidates(target, candidates)[0].score,
      rankCandidates(inverted, candidates)[0].score,
    );
    const winner = [rankCandidates(target, candidates)[0], rankCandidates(inverted, candidates)[0]].find(
      (r) => r.score === best,
    )!;
    expect(winner.text).toBe(decoy);
  });

  it('meanSquaredError is 0 for identical grids and Infinity for mismatched sizes', () => {
    expect(meanSquaredError([0, 1], [0, 1])).toBe(0);
    expect(meanSquaredError([0, 1], [1, 0])).toBe(1);
    expect(meanSquaredError([0], [0, 1])).toBe(Infinity);
  });
});
