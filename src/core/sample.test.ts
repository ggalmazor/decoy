import { describe, expect, it } from 'vitest';
import { INK_FALLBACK } from './color';
import { sampleInkPaper } from './sample';

function region(w: number, h: number, fill: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

describe('sampleInkPaper', () => {
  it('finds dark text on light paper', () => {
    const r = region(40, 10, (x, y) => (y >= 3 && y < 7 && x % 3 === 0 ? [20, 18, 15] : [246, 241, 230]));
    const { ink, paper, lowContrast } = sampleInkPaper(r);
    expect(paper).toEqual([246, 241, 230]);
    expect(ink).toEqual([20, 18, 15]);
    expect(lowContrast).toBe(false);
  });

  it('treats a mostly dark region as low contrast and keeps the default ink', () => {
    const r = region(40, 10, (x, y) => (y >= 3 && y < 7 && x % 3 === 0 ? [230, 230, 230] : [30, 30, 34]));
    const { ink, paper, lowContrast } = sampleInkPaper(r);
    // The 60th percentile of a dark region is still the dark ground, so "paper" stays dark and the
    // contrast check falls back to the default ink rather than inventing a light paper.
    expect(lowContrast).toBe(true);
    expect(ink).toEqual(INK_FALLBACK);
    expect(paper[0]).toBeLessThan(120);
  });

  it('falls back to the default ink when the region has no contrast', () => {
    const r = region(20, 20, () => [240, 240, 240]);
    const { ink, lowContrast } = sampleInkPaper(r);
    expect(lowContrast).toBe(true);
    expect(ink).toEqual(INK_FALLBACK);
  });

  it('handles an empty region', () => {
    const { ink, lowContrast } = sampleInkPaper({ data: new Uint8ClampedArray(0), w: 0, h: 0 });
    expect(lowContrast).toBe(true);
    expect(ink).toEqual(INK_FALLBACK);
  });
});
