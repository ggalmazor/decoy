import { describe, expect, it } from 'vitest';
import {
  capacityFor,
  FIT_LABELS,
  fitDecoy,
  fitRatio,
  fitStatus,
  fontSizeFor,
  shrunkFontSize,
  type Measure,
} from './fit';
import { fallbacksFor, phrasesFor } from './phrases';

// Courier Prime is monospace with an advance of 0.6 em, which is what the editor measures at runtime.
const mono: Measure = (text, px) => text.length * px * 0.6;

const base = (w: number, h: number, seed = 1) => ({
  w,
  h,
  measure: mono,
  pool: phrasesFor('smug', false),
  fallbacks: fallbacksFor('smug', false),
  seed,
});

describe('fit', () => {
  it('font size is 0.82 of the box height', () => {
    expect(fontSizeFor(24)).toBe(20);
    expect(fontSizeFor(100)).toBe(82);
  });

  it('computes character capacity from the available width', () => {
    // 380 - 4 = 376 px available, 20 px font, 12 px per character.
    expect(capacityFor(380, 24, mono)).toBe(31);
  });

  it('labels follow the copy deck thresholds', () => {
    expect(FIT_LABELS[fitStatus(0.95)]).toBe('Fits snugly');
    expect(FIT_LABELS[fitStatus(0.9)]).toBe('Fits snugly');
    expect(FIT_LABELS[fitStatus(0.8)]).toBe('Fits');
    expect(FIT_LABELS[fitStatus(0.5)]).toBe('A bit short');
    expect(FIT_LABELS[fitStatus(1.1)]).toBe('Too long, will shrink');
  });

  it('keeps candidates between 85% and 100% of the available width', () => {
    const result = fitDecoy(base(380, 24));
    expect(result.ratio).toBeGreaterThanOrEqual(0.85);
    expect(result.ratio).toBeLessThanOrEqual(1);
    for (const alt of result.alternatives) {
      const ratio = fitRatio(alt, 380, 24, mono);
      expect(ratio).toBeGreaterThanOrEqual(0.85);
      expect(ratio).toBeLessThanOrEqual(1);
    }
    expect(result.alternatives).toHaveLength(3);
    expect(result.alternatives).not.toContain(result.best);
  });

  it('ranks by closeness to 95%: snug fits win more often than their share of the band', () => {
    const avail = 376;
    const inBand = base(380, 24)
      .pool.map((p) => mono(p.text, 20) / avail)
      .filter((r) => r >= 0.85 && r <= 1);
    const snugShare = inBand.filter((r) => r >= 0.9).length / inBand.length;
    let snugBest = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      if (fitDecoy(base(380, 24, seed)).ratio >= 0.9) snugBest++;
    }
    expect(snugBest / runs).toBeGreaterThan(snugShare);
    // And a best is never more than 1.5 steps of 5% further from the target than the closest candidate.
    const closest = Math.min(...inBand.map((r) => Math.abs(r - 0.95)));
    for (let seed = 1; seed <= 50; seed++) {
      expect(Math.abs(fitDecoy(base(380, 24, seed)).ratio - 0.95)).toBeLessThanOrEqual(
        closest + 0.075 + 1e-9,
      );
    }
  });

  it('rerolls are reproducible from a seed and vary across seeds', () => {
    const a = fitDecoy(base(380, 24, 7));
    const b = fitDecoy(base(380, 24, 7));
    expect(a).toEqual(b);
    const picks = new Set(Array.from({ length: 20 }, (_, i) => fitDecoy(base(380, 24, i)).best));
    expect(picks.size).toBeGreaterThan(3);
  });

  it('excludes the current text when rerolling', () => {
    const first = fitDecoy(base(380, 24, 3));
    const second = fitDecoy({ ...base(380, 24, 3), exclude: first.best });
    expect(second.best).not.toBe(first.best);
  });

  it('joins two phrases for boxes longer than any phrase', () => {
    const result = fitDecoy(base(700, 24));
    expect(result.best.split('. ')).toHaveLength(2);
    expect(result.ratio).toBeGreaterThanOrEqual(0.85);
    expect(result.ratio).toBeLessThanOrEqual(1);
  });

  it('chains more phrases for boxes longer than any pair', () => {
    const result = fitDecoy(base(1200, 24));
    expect(result.best.split('. ').length).toBeGreaterThanOrEqual(3);
    expect(result.ratio).toBeGreaterThanOrEqual(0.85);
    expect(result.ratio).toBeLessThanOrEqual(1);
  });

  it('falls back to the short words for tiny boxes', () => {
    const result = fitDecoy(base(40, 24));
    expect(['no', 'nope', 'lol', 'nah', 'no.']).toContain(result.best);
    expect(result.ratio).toBeLessThanOrEqual(1);
  });

  it('never offers the rude fallback in clean mode', () => {
    const result = fitDecoy({
      ...base(30, 24),
      pool: phrasesFor('rude', true),
      fallbacks: fallbacksFor('rude', true),
    });
    expect(result.best).not.toBe('fu');
  });

  it('shrinks the font only when the text overflows', () => {
    expect(shrunkFontSize('no', 380, 24, mono)).toBe(20);
    const px = shrunkFontSize('a'.repeat(60), 380, 24, mono);
    expect(px).toBeLessThan(20);
    expect(px * 0.6 * 60).toBeCloseTo(376, 5);
  });
});
