import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  CORNER_HANDLES,
  cursorForHandle,
  handleAt,
  handlePosition,
  hitTest,
  moveRect,
  rectFromPoints,
  resizeRect,
  type Handle,
  type Point,
  type Rect,
} from '../../core/geometry';
import type { Decoy } from '../../core/model';
import { capacityFor } from '../../core/fit';
import { buildMosaic } from '../../render/mosaic';
import { measureText } from '../../render/text';
import * as actions from '../actions';
import * as s from '../state';

const PAGE_MARGIN = 40;
const HANDLE_TOLERANCE_PX = 7;

type Gesture =
  | { kind: 'draw'; start: Point }
  | { kind: 'move'; start: Point; origin: Rect; moved: boolean; id: string }
  | { kind: 'resize'; start: Point; origin: Rect; handle: Handle }
  | { kind: 'pan'; startX: number; startY: number; scrollLeft: number; scrollTop: number };

function pageSizeOf(w: number, h: number, zoom: number) {
  return { w: Math.round(w * zoom), h: Math.round(h * zoom) };
}

export function CanvasView() {
  const scroller = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useSignal(false);
  const hoverCursor = useSignal<string | null>(null);
  const draft = useSignal<Rect | null>(null);

  const page = s.currentPage;
  const zoom = s.zoom;

  // Fit-to-width follows the scroller's size until the user zooms by hand.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => {
      const current = s.currentPage.value;
      if (!current || s.zoomMode.value !== 'fit') return;
      const available = el.clientWidth - PAGE_MARGIN * 2;
      s.zoom.value = Math.max(0.1, Math.min(4, available / current.width));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const dispose = s.zoomMode.subscribe(fit);
    const disposePage = s.currentPage.subscribe(fit);
    return () => {
      ro.disconnect();
      dispose();
      disposePage();
    };
  }, []);

  // Composite: original raster, then every applied decoy, then the pending one. Mosaic bitmaps are opaque
  // and cached by parameters, so drawing them scaled is a plain blit.
  useSignalEffect(() => {
    const current = page.value;
    const canvas = canvasRef.current;
    if (!current || !canvas) return;
    const z = zoom.value;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const size = pageSizeOf(current.width, current.height, z);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = (size.w * dpr) / current.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current.raster, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const decoys: Decoy[] = [...s.currentDecoys.value];
    if (s.pending.value) decoys.push(s.pending.value);
    for (const decoy of decoys) {
      const bitmap = buildMosaic({
        text: decoy.text,
        w: decoy.rect.w,
        h: decoy.rect.h,
        cell: decoy.cell,
        ink: decoy.ink,
        paper: decoy.paper,
      });
      ctx.drawImage(bitmap.canvas, decoy.rect.x, decoy.rect.y, decoy.rect.w, decoy.rect.h);
    }
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        if (!e.repeat) spaceHeld.value = true;
        if (document.activeElement === document.body) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.value = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [spaceHeld]);

  const toPage = (e: PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const z = zoom.value;
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };

  const onPointerDown = (e: PointerEvent) => {
    const current = page.value;
    const el = scroller.current;
    if (!current || !el || e.button === 2) return;
    const panning = s.tool.value === 'pan' || spaceHeld.value || e.button === 1;
    if (panning) {
      gesture.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const p = toPage(e);
    const tolerance = HANDLE_TOLERANCE_PX / zoom.value;
    const active = s.activeDecoy.value;
    if (active) {
      const handle = handleAt(active.rect, p, tolerance);
      if (handle) {
        gesture.current = { kind: 'resize', start: p, origin: active.rect, handle };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    const decoys = s.currentDecoys.value;
    const rects = decoys.map((d) => d.rect);
    const hitActive = active && hitTest([active.rect], p) === 0;
    const hit = hitActive ? decoys.findIndex((d) => d.id === active.id) : hitTest(rects, p);
    if (hitActive || hit !== -1) {
      const target = hitActive ? active : decoys[hit];
      if (!hitActive) actions.selectDecoy(target.id);
      gesture.current = { kind: 'move', start: p, origin: target.rect, moved: false, id: target.id };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (s.pending.value) actions.cancelPending();
    else if (s.editingId.value) actions.selectDecoy(null);
    gesture.current = { kind: 'draw', start: p };
    draft.value = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    const current = page.value;
    if (!current) return;
    if (!g) {
      const active = s.activeDecoy.value;
      if (active && s.tool.value === 'select') {
        const p = toPage(e);
        const handle = handleAt(active.rect, p, HANDLE_TOLERANCE_PX / zoom.value);
        hoverCursor.value = handle
          ? cursorForHandle(handle)
          : hitTest([active.rect], p) === 0
            ? 'move'
            : null;
      } else if (hoverCursor.value) {
        hoverCursor.value = null;
      }
      return;
    }
    const el = scroller.current!;
    switch (g.kind) {
      case 'pan':
        el.scrollLeft = g.scrollLeft - (e.clientX - g.startX);
        el.scrollTop = g.scrollTop - (e.clientY - g.startY);
        break;
      case 'draw': {
        const p = toPage(e);
        const rect = rectFromPoints(g.start, p);
        draft.value = rect;
        break;
      }
      case 'move': {
        const p = toPage(e);
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        g.moved = true;
        actions.setActiveRect(moveRect(g.origin, dx, dy), `move:${g.id}`);
        break;
      }
      case 'resize': {
        const p = toPage(e);
        actions.setActiveRect(
          resizeRect(g.origin, g.handle, p.x - g.start.x, p.y - g.start.y),
          `resize:${g.handle}`,
        );
        break;
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (g.kind === 'draw') {
      const rect = draft.value;
      draft.value = null;
      if (rect && rect.w >= 4 && rect.h >= 4) actions.startPending(rect);
    } else if (g.kind === 'move' || g.kind === 'resize') {
      s.history.value = { ...s.history.value, lastKey: null };
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.002);
    actions.setZoom(zoom.value * factor);
  };

  const cursor = useComputed(() => {
    if (s.tool.value === 'pan' || spaceHeld.value) return 'grab';
    return hoverCursor.value ?? 'crosshair';
  });

  const current = page.value;
  if (!current) return null;
  const z = zoom.value;
  const size = pageSizeOf(current.width, current.height, z);
  const active = s.activeDecoy.value;
  const selection = draft.value ?? active?.rect ?? null;
  const capacity = selection ? capacityFor(selection.w, selection.h, measureText) : 0;

  return (
    <div
      ref={scroller}
      class="canvas-scroller"
      data-tool={s.tool.value}
      onWheel={onWheel}
      role="application"
      aria-label="Document page. Drag to box a secret."
    >
      <div
        class="canvas-stage"
        style={{ width: `${size.w + PAGE_MARGIN * 2}px`, height: `${size.h + PAGE_MARGIN * 2}px` }}
      >
        <div
          class="canvas-page"
          style={{
            width: `${size.w}px`,
            height: `${size.h}px`,
            left: `${PAGE_MARGIN}px`,
            top: `${PAGE_MARGIN}px`,
            cursor: cursor.value,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas
            ref={canvasRef}
            class="canvas-composite"
            data-testid="page-canvas"
            data-page-width={current.width}
            data-page-height={current.height}
          />
          <div class="canvas-overlay" aria-hidden="true">
            {s.currentDecoys.value.map((decoy, i) =>
              decoy.id === active?.id ? null : (
                <span
                  key={decoy.id}
                  class="decoy-badge"
                  style={{
                    left: `${(decoy.rect.x + decoy.rect.w) * z - 10}px`,
                    top: `${decoy.rect.y * z - 10}px`,
                  }}
                >
                  {i + 1}
                </span>
              ),
            )}
            {selection && (
              <div
                class={`selection${draft.value ? ' selection--draft' : ''}`}
                style={{
                  left: `${selection.x * z}px`,
                  top: `${selection.y * z}px`,
                  width: `${selection.w * z}px`,
                  height: `${selection.h * z}px`,
                }}
              >
                <span class="selection__tag">
                  {selection.w} × {selection.h} · fits {capacity} chars
                </span>
                {!draft.value &&
                  CORNER_HANDLES.map((h) => {
                    const pos = handlePosition({ x: 0, y: 0, w: selection.w, h: selection.h }, h);
                    return (
                      <span
                        key={h}
                        class="selection__handle"
                        style={{ left: `${pos.x * z}px`, top: `${pos.y * z}px` }}
                      />
                    );
                  })}
                {!draft.value && active && !s.pending.value && (
                  <span class="decoy-badge decoy-badge--active">{s.activeIndex.value}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
