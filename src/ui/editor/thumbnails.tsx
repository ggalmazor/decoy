import { useEffect, useRef } from 'preact/hooks';
import type { Decoy } from '../../core/model';
import type { Page } from '../../doc/types';
import { buildMosaic } from '../../render/mosaic';
import * as actions from '../actions';
import * as s from '../state';

const THUMB_W = 100;

function Thumb({ page, decoys }: { page: Page; decoys: readonly Decoy[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = Math.max(24, Math.round((THUMB_W * page.height) / page.width));
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = THUMB_W * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = (THUMB_W * dpr) / page.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(page.raster, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const d of decoys) {
      const bitmap = buildMosaic({
        text: d.text,
        w: d.rect.w,
        h: d.rect.h,
        cell: d.cell,
        ink: d.ink,
        paper: d.paper,
      });
      ctx.drawImage(bitmap.canvas, d.rect.x, d.rect.y, d.rect.w, d.rect.h);
    }
  }, [page, decoys, h]);
  return <canvas ref={ref} style={{ width: `${THUMB_W}px`, height: `${h}px` }} aria-hidden="true" />;
}

export function Thumbnails() {
  const doc = s.doc.value!;
  const pages = s.decoyPages.value;
  return (
    <nav class="thumbs" aria-label="Pages">
      {doc.pages.map((page, i) => {
        const count = pages[i]?.length ?? 0;
        const current = i === s.pageIndex.value;
        return (
          <button
            key={i}
            type="button"
            class={`thumb${current ? ' thumb--current' : ''}`}
            aria-current={current ? 'page' : undefined}
            onClick={() => actions.goToPage(i)}
          >
            <span class="thumb__frame">
              <Thumb page={page} decoys={pages[i] ?? []} />
            </span>
            <span class="thumb__caption">
              {i + 1}
              {count > 0 ? ` · ${count} ${count === 1 ? 'decoy' : 'decoys'}` : ''}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
