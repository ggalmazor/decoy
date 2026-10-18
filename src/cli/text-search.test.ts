import { describe, expect, it } from 'vitest';
import {
  compilePattern,
  findMatches,
  linesFromItems,
  padRect,
  rectOfRange,
  type TextItem,
} from './text-search';

// Two runs on one baseline with a word gap between them, as pdf.js reports "Password   Summer2026!".
const items: TextItem[] = [
  { str: 'Password', rect: { x: 100, y: 200, w: 160, h: 30 } },
  { str: 'Summer2026!', rect: { x: 300, y: 200, w: 220, h: 30 } },
  { str: 'IBAN', rect: { x: 100, y: 260, w: 80, h: 30 } },
  { str: 'ES91', rect: { x: 300, y: 260, w: 80, h: 30 } },
  { str: '2100', rect: { x: 390, y: 260, w: 80, h: 30 } },
];

describe('linesFromItems', () => {
  it('groups runs by baseline and joins them with spaces across gaps', () => {
    const lines = linesFromItems(items);
    expect(lines.map((l) => l.text)).toEqual(['Password Summer2026!', 'IBAN ES91 2100']);
    expect(lines[0].rect).toEqual({ x: 100, y: 200, w: 420, h: 30 });
  });

  it('keeps the character offsets of each run', () => {
    const [line] = linesFromItems(items);
    expect(line.items.map((i) => [i.start, i.end])).toEqual([
      [0, 8],
      [9, 20],
    ]);
  });
});

describe('rectOfRange', () => {
  it('returns the box of one run when the range is that run', () => {
    const [line] = linesFromItems(items);
    expect(rectOfRange(line, 9, 20)).toEqual({ x: 300, y: 200, w: 220, h: 30 });
  });

  it('slices a run proportionally for a partial match', () => {
    const [line] = linesFromItems(items);
    const rect = rectOfRange(line, 9, 15)!;
    expect(rect.x).toBe(300);
    expect(rect.w).toBe(120);
  });

  it('spans runs when the range crosses a gap', () => {
    const [, line] = linesFromItems(items);
    expect(rectOfRange(line, 5, 14)).toEqual({ x: 300, y: 260, w: 170, h: 30 });
  });
});

describe('findMatches', () => {
  it('finds a pattern inside a line and pads its box', () => {
    const lines = linesFromItems(items);
    const matches = findMatches(lines, compilePattern('Summer\\d{4}!'));
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('Summer2026!');
    expect(matches[0].rect).toEqual({ x: 298, y: 198, w: 224, h: 34 });
  });

  it('matches across runs, like an IBAN split at every space', () => {
    const lines = linesFromItems(items);
    const matches = findMatches(lines, compilePattern('ES\\d{2} \\d{4}'));
    expect(matches).toHaveLength(1);
    expect(matches[0].rect.x).toBe(298);
    expect(matches[0].rect.w).toBe(174);
  });

  it('clamps padding to the page', () => {
    expect(padRect({ x: 1, y: 1, w: 10, h: 10 }, 2, { w: 12, h: 12 })).toEqual({ x: 0, y: 0, w: 12, h: 12 });
  });

  it('refuses an invalid pattern with the reason', () => {
    expect(() => compilePattern('(')).toThrow(/Bad pattern/);
  });
});
