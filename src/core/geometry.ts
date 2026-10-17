export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const CORNER_HANDLES: readonly Handle[] = ['nw', 'ne', 'se', 'sw'];

export const MIN_BOX = 4;

export function rectFromPoints(a: Point, b: Point): Rect {
  const x0 = Math.round(Math.min(a.x, b.x));
  const y0 = Math.round(Math.min(a.y, b.y));
  const x1 = Math.round(Math.max(a.x, b.x));
  const y1 = Math.round(Math.max(a.y, b.y));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function clampRect(rect: Rect, bounds: Size): Rect {
  const w = Math.max(1, Math.min(Math.round(rect.w), bounds.w));
  const h = Math.max(1, Math.min(Math.round(rect.h), bounds.h));
  const x = Math.max(0, Math.min(Math.round(rect.x), bounds.w - w));
  const y = Math.max(0, Math.min(Math.round(rect.y), bounds.h - h));
  return { x, y, w, h };
}

export function containsPoint(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h;
}

// Topmost (last drawn) wins, like every editor's z-order.
export function hitTest(rects: readonly Rect[], p: Point): number {
  for (let i = rects.length - 1; i >= 0; i--) {
    if (containsPoint(rects[i], p)) return i;
  }
  return -1;
}

export function handlePosition(rect: Rect, handle: Handle): Point {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  switch (handle) {
    case 'nw':
      return { x: rect.x, y: rect.y };
    case 'n':
      return { x: cx, y: rect.y };
    case 'ne':
      return { x: right, y: rect.y };
    case 'e':
      return { x: right, y: cy };
    case 'se':
      return { x: right, y: bottom };
    case 's':
      return { x: cx, y: bottom };
    case 'sw':
      return { x: rect.x, y: bottom };
    case 'w':
      return { x: rect.x, y: cy };
  }
}

export function handleAt(
  rect: Rect,
  p: Point,
  tolerance: number,
  handles: readonly Handle[] = HANDLES,
): Handle | null {
  let best: Handle | null = null;
  let bestDist = Infinity;
  for (const handle of handles) {
    const hp = handlePosition(rect, handle);
    const d = Math.max(Math.abs(hp.x - p.x), Math.abs(hp.y - p.y));
    if (d <= tolerance && d < bestDist) {
      best = handle;
      bestDist = d;
    }
  }
  return best;
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy) };
}

export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, min = MIN_BOX): Rect {
  let x0 = rect.x;
  let y0 = rect.y;
  let x1 = rect.x + rect.w;
  let y1 = rect.y + rect.h;
  if (handle.includes('w')) x0 = Math.min(x1 - min, x0 + dx);
  if (handle.includes('e')) x1 = Math.max(x0 + min, x1 + dx);
  if (handle.includes('n')) y0 = Math.min(y1 - min, y0 + dy);
  if (handle.includes('s')) y1 = Math.max(y0 + min, y1 + dy);
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    w: Math.round(x1 - x0),
    h: Math.round(y1 - y0),
  };
}

export function nudgeRect(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return clampRect(moveRect(rect, dx, dy), bounds);
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function scaleRect(rect: Rect, s: number): Rect {
  return { x: rect.x * s, y: rect.y * s, w: rect.w * s, h: rect.h * s };
}

export function expandRect(rect: Rect, margin: number, bounds: Size): Rect {
  const x0 = Math.max(0, rect.x - margin);
  const y0 = Math.max(0, rect.y - margin);
  const x1 = Math.min(bounds.w, rect.x + rect.w + margin);
  const y1 = Math.min(bounds.h, rect.y + rect.h + margin);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function cursorForHandle(handle: Handle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}
