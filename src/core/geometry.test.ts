import { describe, expect, it } from 'vitest';
import { clampRect, handleAt, hitTest, nudgeRect, rectFromPoints, resizeRect } from './geometry';

describe('geometry', () => {
  it('normalises a drag in any direction', () => {
    const expected = { x: 10, y: 20, w: 30, h: 40 };
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(rectFromPoints({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(rectFromPoints({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
    expect(rectFromPoints({ x: 10, y: 60 }, { x: 40, y: 20 })).toEqual(expected);
  });

  it('clamps to the page', () => {
    expect(clampRect({ x: -5, y: -5, w: 20, h: 20 }, { w: 100, h: 50 })).toEqual({
      x: 0,
      y: 0,
      w: 20,
      h: 20,
    });
    expect(clampRect({ x: 95, y: 45, w: 20, h: 20 }, { w: 100, h: 50 })).toEqual({
      x: 80,
      y: 30,
      w: 20,
      h: 20,
    });
    expect(clampRect({ x: 0, y: 0, w: 200, h: 200 }, { w: 100, h: 50 })).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 50,
    });
  });

  it('hit-tests topmost first', () => {
    const rects = [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 25, y: 25, w: 50, h: 50 },
    ];
    expect(hitTest(rects, { x: 30, y: 30 })).toBe(1);
    expect(hitTest(rects, { x: 5, y: 5 })).toBe(0);
    expect(hitTest(rects, { x: 90, y: 90 })).toBe(-1);
  });

  it('finds handles within a tolerance', () => {
    const rect = { x: 10, y: 10, w: 100, h: 20 };
    expect(handleAt(rect, { x: 11, y: 9 }, 4)).toBe('nw');
    expect(handleAt(rect, { x: 110, y: 30 }, 4)).toBe('se');
    expect(handleAt(rect, { x: 60, y: 10 }, 4)).toBe('n');
    expect(handleAt(rect, { x: 60, y: 20 }, 4)).toBeNull();
  });

  it('resizes from each side and keeps a minimum size', () => {
    const rect = { x: 10, y: 10, w: 100, h: 20 };
    expect(resizeRect(rect, 'e', 15, 0)).toEqual({ x: 10, y: 10, w: 115, h: 20 });
    expect(resizeRect(rect, 'w', 15, 0)).toEqual({ x: 25, y: 10, w: 85, h: 20 });
    expect(resizeRect(rect, 'nw', -5, -5)).toEqual({ x: 5, y: 5, w: 105, h: 25 });
    expect(resizeRect(rect, 'se', -500, -500)).toEqual({ x: 10, y: 10, w: 4, h: 4 });
  });

  it('nudges within the page', () => {
    const rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(nudgeRect(rect, -3, 2, { w: 100, h: 100 })).toEqual({ x: 0, y: 2, w: 10, h: 10 });
  });
});
