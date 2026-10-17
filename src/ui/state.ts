import { computed, signal } from '@preact/signals';
import { createHistory, type History } from '../core/history';
import type { Decoy, DecoyPages } from '../core/model';
import { DEFAULT_MOOD, type Mood } from '../core/phrases';
import type { LoadProgress, LoadedDocument } from '../doc/types';

export type Tool = 'select' | 'pan';
export type ZoomMode = 'fit' | 'manual';

export const doc = signal<LoadedDocument | null>(null);
export const pageIndex = signal(0);
export const history = signal<History<DecoyPages>>(createHistory<DecoyPages>([]));
export const pending = signal<Decoy | null>(null);
export const editingId = signal<string | null>(null);
export const tool = signal<Tool>('select');
export const zoom = signal(1);
export const zoomMode = signal<ZoomMode>('fit');
export const clean = signal(false);
export const mood = signal<Mood>(DEFAULT_MOOD);
export const cell = signal(8);
export const toast = signal<string | null>(null);
export const exportOpen = signal(false);
export const loading = signal<LoadProgress | null>(null);
export const loadError = signal<string | null>(null);
export const dragOver = signal(false);
export const sheetExpanded = signal(false);

export const decoyPages = computed(() => history.value.present);
export const currentPage = computed(() => doc.value?.pages[pageIndex.value] ?? null);
export const currentDecoys = computed<readonly Decoy[]>(() => decoyPages.value[pageIndex.value] ?? []);
export const activeDecoy = computed<Decoy | null>(
  () => pending.value ?? currentDecoys.value.find((d) => d.id === editingId.value) ?? null,
);
export const activeIsPending = computed(() => pending.value !== null);
export const activeIndex = computed(() => {
  const active = activeDecoy.value;
  if (!active) return 0;
  const at = currentDecoys.value.findIndex((d) => d.id === active.id);
  return at === -1 ? currentDecoys.value.length + 1 : at + 1;
});
export const totalDecoys = computed(() => decoyPages.value.reduce((n, list) => n + list.length, 0));
export const view = computed<'landing' | 'editor'>(() => (doc.value ? 'editor' : 'landing'));

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function showToast(message: string, ms = 2600): void {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, ms);
}
