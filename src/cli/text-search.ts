import type { Rect } from '../core/geometry';

// A run of text as pdf.js reports it, already converted to page pixels: box of the glyphs, top-left origin.
export interface TextItem {
  readonly str: string;
  readonly rect: Rect;
}

export interface LineItem {
  readonly item: TextItem;
  readonly start: number;
  readonly end: number;
}

export interface TextLine {
  readonly text: string;
  readonly items: readonly LineItem[];
  readonly rect: Rect;
}

export interface TextMatch {
  readonly text: string;
  readonly line: string;
  readonly rect: Rect;
}

export const MATCH_PADDING = 2;

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// pdf.js splits a line at every gap, so "Password   Summer2026!" arrives as two items. Items whose
// vertical centres are within half a glyph height of each other form a line; a gap wider than a fifth
// of the glyph height becomes a space, so a pattern can span items the way it spans words.
export function linesFromItems(items: readonly TextItem[]): TextLine[] {
  const sorted = items
    .filter((item) => item.str.length > 0 && item.rect.w > 0 && item.rect.h > 0)
    .map((item) => ({ item, cy: item.rect.y + item.rect.h / 2 }))
    .sort((a, b) => a.cy - b.cy || a.item.rect.x - b.item.rect.x);
  const groups: { items: TextItem[]; cy: number; h: number }[] = [];
  for (const { item, cy } of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(cy - last.cy) <= Math.max(last.h, item.rect.h) / 2) {
      last.items.push(item);
    } else {
      groups.push({ items: [item], cy, h: item.rect.h });
    }
  }
  return groups.map(({ items: group }) => {
    group.sort((a, b) => a.rect.x - b.rect.x);
    let text = '';
    let rect = group[0].rect;
    const lineItems: LineItem[] = [];
    group.forEach((item, i) => {
      if (i > 0) {
        const prev = group[i - 1];
        const gap = item.rect.x - (prev.rect.x + prev.rect.w);
        if (gap > item.rect.h * 0.2 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' ';
      }
      lineItems.push({ item, start: text.length, end: text.length + item.str.length });
      text += item.str;
      rect = union(rect, item.rect);
    });
    return { text, items: lineItems, rect };
  });
}

// The box of a character range inside a line: each item it touches contributes the slice of its box
// proportional to the characters taken, which is exact for monospace and close enough for the rest.
export function rectOfRange(line: TextLine, start: number, end: number): Rect | null {
  let rect: Rect | null = null;
  for (const { item, start: s, end: e } of line.items) {
    const from = Math.max(start, s);
    const to = Math.min(end, e);
    if (to <= from) continue;
    const len = Math.max(1, e - s);
    const x0 = item.rect.x + (item.rect.w * (from - s)) / len;
    const x1 = item.rect.x + (item.rect.w * (to - s)) / len;
    const part = { x: x0, y: item.rect.y, w: x1 - x0, h: item.rect.h };
    rect = rect ? union(rect, part) : part;
  }
  return rect;
}

export function padRect(rect: Rect, pad: number, bounds?: { w: number; h: number }): Rect {
  const x = Math.max(0, Math.floor(rect.x - pad));
  const y = Math.max(0, Math.floor(rect.y - pad));
  let w = Math.ceil(rect.x + rect.w + pad) - x;
  let h = Math.ceil(rect.y + rect.h + pad) - y;
  if (bounds) {
    w = Math.min(w, bounds.w - x);
    h = Math.min(h, bounds.h - y);
  }
  return { x, y, w, h };
}

export function compilePattern(source: string): RegExp {
  const flags = 'gu';
  try {
    return new RegExp(source, flags);
  } catch (error) {
    throw new Error(`Bad pattern ${JSON.stringify(source)}: ${(error as Error).message}`, { cause: error });
  }
}

export function findMatches(
  lines: readonly TextLine[],
  pattern: RegExp,
  bounds?: { w: number; h: number },
): TextMatch[] {
  const matches: TextMatch[] = [];
  for (const line of lines) {
    pattern.lastIndex = 0;
    for (const m of line.text.matchAll(pattern)) {
      if (m[0].length === 0) continue;
      const rect = rectOfRange(line, m.index, m.index + m[0].length);
      if (!rect) continue;
      matches.push({ text: m[0], line: line.text, rect: padRect(rect, MATCH_PADDING, bounds) });
    }
  }
  return matches;
}
