import { candidateDarkness, rankCandidates, targetDarkness, type Ranked } from '../core/depix';
import type { Rect } from '../core/geometry';
import { coverageFromRgba } from '../core/mosaic';
import { allPhrases, fallbacksFor, MOODS, type Mood } from '../core/phrases';
import { rasterizeText } from '../render/text';

export interface DepixOptions {
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
  box: Rect;
  // A single block size, or 'auto' to try every size the editor offers and keep the best match.
  cell: number | 'auto';
  moods: readonly Mood[];
  custom: readonly string[];
  limit?: number;
}

export interface DepixResult {
  cell: number;
  ranked: Ranked[];
  tried: number;
}

export const DEPIX_CELLS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

function cropBox(rgba: Uint8ClampedArray, w: number, box: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * w + box.x) * 4;
    out.set(rgba.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  return out;
}

export function dictionary(
  moods: readonly Mood[],
  custom: readonly string[],
): { text: string; custom: boolean }[] {
  const seen = new Set<string>();
  const out: { text: string; custom: boolean }[] = [];
  const add = (text: string, isCustom: boolean) => {
    const key = text.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ text: key, custom: isCustom });
  };
  for (const text of custom) add(text, true);
  for (const mood of moods) {
    for (const phrase of allPhrases(mood)) add(phrase.text, false);
    for (const phrase of fallbacksFor(mood, false)) add(phrase.text, false);
  }
  return out;
}

// Brute force in the open: render every candidate exactly as DECOY would for this box, pixelate it the
// same way, and keep the closest. The coverage for a candidate depends only on the box size, so it is
// shared across the block sizes tried.
export function depixelize(options: DepixOptions): DepixResult {
  const { rgba, w, box, custom, limit = 25 } = options;
  const moods = options.moods.length > 0 ? options.moods : MOODS;
  const region = cropBox(rgba, w, box);
  const words = dictionary(moods, custom);
  const coverages = words.map((word) => ({
    ...word,
    coverage: coverageFromRgba(rasterizeText(word.text, box.w, box.h), box.w, box.h),
  }));
  const cells = options.cell === 'auto' ? DEPIX_CELLS : [options.cell];
  let best: DepixResult | null = null;
  for (const cell of cells) {
    const target = targetDarkness(region, box.w, box.h, cell);
    const ranked = rankCandidates(
      target,
      coverages.map((c) => ({
        text: c.text,
        custom: c.custom,
        darkness: candidateDarkness(c.coverage, box.w, box.h, cell),
      })),
    );
    if (!best || ranked[0].score < best.ranked[0].score) best = { cell, ranked, tried: words.length };
  }
  return { ...best!, ranked: best!.ranked.slice(0, limit) };
}
