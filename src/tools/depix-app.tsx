import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { grawlix } from '../core/grawlix';
import { rectFromPoints, type Rect } from '../core/geometry';
import { MOOD_LABELS, MOODS, type Mood } from '../core/phrases';
import { decoyFontReady } from '../render/text';
import { Logo } from '../ui/shared/logo';
import { MosaicCanvas } from '../ui/shared/mosaic-canvas';
import { depixelize, type DepixResult } from './depix';

interface Loaded {
  name: string;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  canvas: HTMLCanvasElement;
}

async function loadImage(file: File): Promise<Loaded> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { name: file.name, w: canvas.width, h: canvas.height, rgba, canvas };
}

export function DepixApp() {
  const loaded = useSignal<Loaded | null>(null);
  const box = useSignal<Rect | null>(null);
  const draft = useSignal<Rect | null>(null);
  const cell = useSignal<string>('auto');
  const moods = useSignal<Mood[]>([...MOODS]);
  const custom = useSignal('');
  const result = useSignal<DepixResult | null>(null);
  const busy = useSignal(false);
  const zoom = useSignal(1);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const open = async (file: File) => {
    await decoyFontReady();
    loaded.value = await loadImage(file);
    box.value = null;
    result.value = null;
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) void open(file);
    };
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      void open(file);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('paste', onPaste);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  });

  useEffect(() => {
    const img = loaded.value;
    const canvas = viewRef.current;
    if (!img || !canvas) return;
    const maxW = Math.min(960, window.innerWidth - 64);
    const z = Math.min(1, maxW / img.w);
    zoom.value = z;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(img.w * z * dpr);
    canvas.height = Math.round(img.h * z * dpr);
    canvas.style.width = `${Math.round(img.w * z)}px`;
    canvas.style.height = `${Math.round(img.h * z)}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform((z * dpr * img.w) / img.w, 0, 0, z * dpr, 0, 0);
    ctx.drawImage(img.canvas, 0, 0);
  }, [loaded.value]);

  const toImage = (e: PointerEvent) => {
    const r = viewRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom.value, y: (e.clientY - r.top) / zoom.value };
  };

  const run = () => {
    const img = loaded.value;
    const rect = box.value;
    if (!img || !rect) return;
    busy.value = true;
    result.value = null;
    setTimeout(() => {
      try {
        result.value = depixelize({
          rgba: img.rgba,
          w: img.w,
          h: img.h,
          box: rect,
          cell: cell.value === 'auto' ? 'auto' : Number(cell.value),
          moods: moods.value,
          custom: custom.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        });
      } finally {
        busy.value = false;
      }
    }, 10);
  };

  const sel = draft.value ?? box.value;
  const z = zoom.value;
  const current = box.value;
  const found = result.value;

  return (
    <div class="lab">
      <header class="lab__header">
        <Logo />
        <span class="tag tag--accent">Enhance lab</span>
        <a href="/" class="lab__back">
          Back to DECOY
        </a>
      </header>
      <section class="lab__intro">
        <h1 class="display lab__title">Try to un-pixelate it.</h1>
        <p>
          This is the attack DECOY is built against, in the open. Drop an exported image, box a mosaic, and
          the lab renders every phrase it knows (plus anything you type, like the real secret) in the same
          font, pixelates each one the same way, and ranks them by how well they match the blocks. The winner
          is what a depixelizer would recover.
        </p>
      </section>

      <section class="lab__input">
        <label class="btn btn--shadow lab__pick">
          Choose an exported PNG
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="sr-only"
            data-testid="lab-file"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void open(file);
            }}
          />
        </label>
        <span class="lab__hint">or drop / paste an image. Then drag a box around one mosaic.</span>
      </section>

      {loaded.value && (
        <section class="lab__stage">
          <div
            class="lab__page"
            onPointerDown={(e) => {
              start.current = toImage(e);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!start.current) return;
              draft.value = rectFromPoints(start.current, toImage(e));
            }}
            onPointerUp={() => {
              const rect = draft.value;
              start.current = null;
              draft.value = null;
              if (rect && rect.w >= 4 && rect.h >= 4) {
                const img = loaded.value!;
                box.value = {
                  x: Math.max(0, rect.x),
                  y: Math.max(0, rect.y),
                  w: Math.min(rect.w, img.w - rect.x),
                  h: Math.min(rect.h, img.h - rect.y),
                };
                result.value = null;
              }
            }}
          >
            <canvas ref={viewRef} data-testid="lab-canvas" data-image-width={loaded.value.w} />
            {sel && (
              <div
                class="lab__box"
                style={{
                  left: `${sel.x * z}px`,
                  top: `${sel.y * z}px`,
                  width: `${sel.w * z}px`,
                  height: `${sel.h * z}px`,
                }}
              >
                <span class="lab__box-tag">
                  {sel.w} × {sel.h}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {loaded.value && (
        <section class="lab__controls">
          <label class="lab__field">
            <span class="label">Box (x, y, w, h)</span>
            <input
              type="text"
              data-testid="lab-box"
              value={box.value ? `${box.value.x}, ${box.value.y}, ${box.value.w}, ${box.value.h}` : ''}
              placeholder="drag on the image, or type"
              onChange={(e) => {
                const parts = e.currentTarget.value.split(/[\s,]+/).map(Number);
                if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
                  box.value = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
                }
              }}
            />
          </label>
          <label class="lab__field">
            <span class="label">Block size</span>
            <select
              data-testid="lab-cell"
              value={cell.value}
              onChange={(e) => (cell.value = e.currentTarget.value)}
            >
              <option value="auto">auto (try 4 to 16)</option>
              {Array.from({ length: 13 }, (_, i) => i + 4).map((n) => (
                <option key={n} value={String(n)}>
                  {n} px
                </option>
              ))}
            </select>
          </label>
          <fieldset class="lab__field lab__moods">
            <legend class="label">Dictionary</legend>
            {MOODS.map((m) => (
              <label key={m} class="check">
                <input
                  type="checkbox"
                  checked={moods.value.includes(m)}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    moods.value = on ? [...moods.value, m] : moods.value.filter((x) => x !== m);
                  }}
                />
                <span>{MOOD_LABELS[m]}</span>
              </label>
            ))}
          </fieldset>
          <label class="lab__field lab__custom">
            <span class="label">Your own guesses, one per line (try the real secret)</span>
            <textarea
              data-testid="lab-custom"
              rows={3}
              value={custom.value}
              onInput={(e) => (custom.value = e.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            class="btn btn--accent lab__run"
            data-testid="lab-run"
            disabled={!box.value || busy.value}
            onClick={run}
          >
            {busy.value ? 'Enhancing…' : 'Enhance'}
          </button>
        </section>
      )}

      {found && current && (
        <section class="lab__results" data-testid="lab-results">
          <div class="lab__results-head">
            <span class="label">Ranking</span>
            <span class="lab__meta">
              {found.tried} candidates · best block size {found.cell} px · lower is closer
            </span>
          </div>
          <ol class="lab__list">
            {found.ranked.map((r, i) => (
              <li
                key={r.text}
                class={`lab__row${i === 0 ? ' lab__row--best' : ''}${r.custom ? ' lab__row--custom' : ''}`}
                data-custom={r.custom}
              >
                <span class="lab__rank">{i + 1}</span>
                <MosaicCanvas
                  text={r.text}
                  w={Math.min(220, current.w)}
                  h={Math.min(28, current.h)}
                  cell={found.cell}
                />
                <span class="lab__phrase" data-testid="lab-phrase">
                  {grawlix(r.text)}
                </span>
                {r.custom && <span class="tag tag--outline">yours</span>}
                <span class="lab__score">{r.score.toFixed(4)}</span>
              </li>
            ))}
          </ol>
          <p class="lab__verdict">
            {found.ranked[0].custom
              ? 'Your guess matched best. If that is the real secret, this box was not made by DECOY.'
              : 'The best match is a decoy phrase. That is all the enhance button gets.'}
          </p>
        </section>
      )}
    </div>
  );
}
