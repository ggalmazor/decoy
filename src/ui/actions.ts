import { batch } from '@preact/signals';
import { toHex } from '../core/color';
import { capacityFor, fitDecoy, fitRatio, type FitResult } from '../core/fit';
import { clampRect, expandRect, nudgeRect, type Rect } from '../core/geometry';
import * as hist from '../core/history';
import { newDecoyId, withDecoy, withoutDecoy, type Decoy, type DecoyPages } from '../core/model';
import { fallbacksFor, phrasesFor, type Mood } from '../core/phrases';
import { cropRgba } from '../core/raster';
import { randomSeed } from '../core/rng';
import { sampleInkPaper, SAMPLE_MARGIN } from '../core/sample';
import { loadFile } from '../doc/load';
import { LOAD_MESSAGES, LoadError, type Page } from '../doc/types';
import { decoyFontReady, measureText } from '../render/text';
import * as s from './state';

export async function openFile(file: File | Blob, name?: string): Promise<void> {
  batch(() => {
    s.loadError.value = null;
    s.loading.value = { page: 0, total: 0 };
  });
  try {
    const [loaded] = await Promise.all([
      loadFile(file, name, (p) => (s.loading.value = p)),
      decoyFontReady(),
    ]);
    batch(() => {
      s.doc.value = loaded;
      s.pageIndex.value = 0;
      s.history.value = hist.createHistory<DecoyPages>(loaded.pages.map(() => []));
      s.pending.value = null;
      s.editingId.value = null;
      s.zoomMode.value = 'fit';
      s.exportOpen.value = false;
      s.loading.value = null;
    });
  } catch (error) {
    const message = error instanceof LoadError ? LOAD_MESSAGES[error.code] : LOAD_MESSAGES.corrupt;
    batch(() => {
      s.loading.value = null;
      s.loadError.value = message;
    });
    if (s.doc.value) s.showToast(message, 4000);
  }
}

export function closeDocument(): void {
  batch(() => {
    s.doc.value = null;
    s.pending.value = null;
    s.editingId.value = null;
    s.history.value = hist.createHistory<DecoyPages>([]);
    s.exportOpen.value = false;
  });
}

export function goToPage(index: number): void {
  if (!s.doc.value || index < 0 || index >= s.doc.value.pages.length) return;
  batch(() => {
    s.pending.value = null;
    s.editingId.value = null;
    s.pageIndex.value = index;
  });
}

function pageSize(page: Page) {
  return { w: page.width, h: page.height };
}

function sampleColours(page: Page, rect: Rect): { ink: string; paper: string } {
  const region = expandRect(rect, SAMPLE_MARGIN, pageSize(page));
  const ctx = page.raster.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.getImageData(region.x, region.y, Math.max(1, region.w), Math.max(1, region.h));
  const cropped = cropRgba(
    { data: image.data, w: image.width, h: image.height },
    { x: 0, y: 0, w: image.width, h: image.height },
  );
  const sampled = sampleInkPaper(cropped);
  return { ink: toHex(sampled.ink), paper: toHex(sampled.paper) };
}

function fitFor(rect: Rect, mood: Mood, clean: boolean, seed: number, exclude?: string): FitResult {
  return fitDecoy({
    w: rect.w,
    h: rect.h,
    measure: measureText,
    pool: phrasesFor(mood, clean),
    fallbacks: fallbacksFor(mood, clean),
    seed,
    exclude,
  });
}

export function alternativesFor(decoy: Decoy): string[] {
  return fitFor(decoy.rect, decoy.mood, decoy.clean, decoy.seed, decoy.text).alternatives;
}

export function ratioFor(decoy: Decoy): number {
  return fitRatio(decoy.text, decoy.rect.w, decoy.rect.h, measureText);
}

export function startPending(rect: Rect): void {
  const page = s.currentPage.value;
  if (!page) return;
  const clamped = clampRect(rect, pageSize(page));
  const mood = s.mood.value;
  const clean = s.clean.value;
  const seed = randomSeed();
  const colours = sampleColours(page, clamped);
  const fit = fitFor(clamped, mood, clean, seed);
  batch(() => {
    s.editingId.value = null;
    s.pending.value = {
      id: newDecoyId(),
      rect: clamped,
      text: fit.best,
      mood,
      clean,
      cell: s.cell.value,
      ink: colours.ink,
      paper: colours.paper,
      inkSampled: true,
      paperSampled: true,
      seed,
      locked: false,
    };
  });
}

function commit(next: Decoy, key: string | null): void {
  if (s.pending.value && s.pending.value.id === next.id) {
    s.pending.value = next;
    return;
  }
  s.history.value = hist.push(
    s.history.value,
    withDecoy(s.history.value.present, s.pageIndex.value, next),
    key,
  );
}

export function updateActive(patch: Partial<Decoy>, key: string | null = null): void {
  const active = s.activeDecoy.value;
  if (!active) return;
  commit({ ...active, ...patch }, key);
}

// Resizing re-runs the fit unless the text is locked; moving and resizing both re-sample the colours
// that are still on automatic.
export function setActiveRect(rect: Rect, key: string): void {
  const active = s.activeDecoy.value;
  const page = s.currentPage.value;
  if (!active || !page) return;
  const clamped = clampRect(rect, pageSize(page));
  const sizeChanged = clamped.w !== active.rect.w || clamped.h !== active.rect.h;
  let text = active.text;
  if (sizeChanged && !active.locked) {
    text = fitFor(clamped, active.mood, active.clean, active.seed).best;
  }
  let { ink, paper } = active;
  if (active.inkSampled || active.paperSampled) {
    const sampled = sampleColours(page, clamped);
    if (active.inkSampled) ink = sampled.ink;
    if (active.paperSampled) paper = sampled.paper;
  }
  commit({ ...active, rect: clamped, text, ink, paper }, key);
}

export function nudgeActive(dx: number, dy: number): void {
  const active = s.activeDecoy.value;
  const page = s.currentPage.value;
  if (!active || !page) return;
  setActiveRect(nudgeRect(active.rect, dx, dy, pageSize(page)), 'nudge');
}

export function reroll(): void {
  const active = s.activeDecoy.value;
  if (!active) return;
  const seed = randomSeed();
  const fit = fitFor(active.rect, active.mood, active.clean, seed, active.text);
  commit({ ...active, seed, text: fit.best, locked: false }, null);
}

export function setText(text: string): void {
  const active = s.activeDecoy.value;
  if (!active) return;
  commit({ ...active, text, locked: true }, 'text');
}

export function pickAlternative(text: string): void {
  const active = s.activeDecoy.value;
  if (!active) return;
  commit({ ...active, text, locked: false }, null);
}

export function toggleLock(): void {
  const active = s.activeDecoy.value;
  if (!active) return;
  commit({ ...active, locked: !active.locked }, null);
}

export function setMood(mood: Mood): void {
  s.mood.value = mood;
  const active = s.activeDecoy.value;
  if (!active) return;
  const fit = fitFor(active.rect, mood, active.clean, active.seed);
  commit({ ...active, mood, text: fit.best, locked: false }, null);
}

export function setClean(clean: boolean): void {
  s.clean.value = clean;
  const active = s.activeDecoy.value;
  if (!active) return;
  const pool = phrasesFor(active.mood, clean);
  const stillAllowed =
    !clean || active.locked || pool.some((p) => p.text === active.text) || !isKnownProfane(active.text);
  const text = stillAllowed ? active.text : fitFor(active.rect, active.mood, clean, active.seed).best;
  commit({ ...active, clean, text }, null);
}

function isKnownProfane(text: string): boolean {
  const parts = text.split('. ');
  return parts.some((part) => phrasesFor('rude', false).some((p) => p.profane && p.text === part));
}

export function setCell(cell: number): void {
  s.cell.value = cell;
  updateActive({ cell }, 'cell');
}

export function setInk(ink: string): void {
  updateActive({ ink, inkSampled: false }, 'ink');
}

export function setPaper(paper: string): void {
  updateActive({ paper, paperSampled: false }, 'paper');
}

export function resampleColours(): void {
  const active = s.activeDecoy.value;
  const page = s.currentPage.value;
  if (!active || !page) return;
  const sampled = sampleColours(page, active.rect);
  commit({ ...active, ink: sampled.ink, paper: sampled.paper, inkSampled: true, paperSampled: true }, null);
}

export function applyPending(): void {
  const decoy = s.pending.value;
  if (!decoy) return;
  batch(() => {
    s.history.value = hist.push(
      s.history.value,
      withDecoy(s.history.value.present, s.pageIndex.value, decoy),
    );
    s.pending.value = null;
    s.editingId.value = null;
  });
}

export function cancelPending(): void {
  batch(() => {
    s.pending.value = null;
    s.editingId.value = null;
  });
}

export function selectDecoy(id: string | null): void {
  batch(() => {
    s.pending.value = null;
    s.editingId.value = id;
    s.history.value = hist.breakCoalescing(s.history.value);
  });
}

export function removeDecoy(id: string): void {
  batch(() => {
    s.history.value = hist.push(
      s.history.value,
      withoutDecoy(s.history.value.present, s.pageIndex.value, id),
    );
    if (s.editingId.value === id) s.editingId.value = null;
  });
}

export function removeActive(): void {
  if (s.pending.value) {
    cancelPending();
    return;
  }
  if (s.editingId.value) removeDecoy(s.editingId.value);
}

export function undo(): void {
  batch(() => {
    s.pending.value = null;
    s.history.value = hist.undo(s.history.value);
    if (s.editingId.value && !s.currentDecoys.value.some((d) => d.id === s.editingId.value))
      s.editingId.value = null;
  });
}

export function redo(): void {
  batch(() => {
    s.pending.value = null;
    s.history.value = hist.redo(s.history.value);
    if (s.editingId.value && !s.currentDecoys.value.some((d) => d.id === s.editingId.value))
      s.editingId.value = null;
  });
}

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];

export function zoomIn(): void {
  const next = ZOOM_STEPS.find((z) => z > s.zoom.value + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  batch(() => {
    s.zoomMode.value = 'manual';
    s.zoom.value = next;
  });
}

export function zoomOut(): void {
  const next = [...ZOOM_STEPS].reverse().find((z) => z < s.zoom.value - 0.001) ?? ZOOM_STEPS[0];
  batch(() => {
    s.zoomMode.value = 'manual';
    s.zoom.value = next;
  });
}

export function zoomToFit(): void {
  s.zoomMode.value = 'fit';
}

export function setZoom(value: number): void {
  batch(() => {
    s.zoomMode.value = 'manual';
    s.zoom.value = Math.min(8, Math.max(0.1, value));
  });
}

export function capacityOf(decoy: Decoy): number {
  return capacityFor(decoy.rect.w, decoy.rect.h, measureText);
}
