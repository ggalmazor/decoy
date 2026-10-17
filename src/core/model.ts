import type { Rect } from './geometry';
import type { Mood } from './phrases';

export interface Decoy {
  readonly id: string;
  readonly rect: Rect;
  readonly text: string;
  readonly mood: Mood;
  readonly clean: boolean;
  readonly cell: number;
  readonly ink: string;
  readonly paper: string;
  readonly inkSampled: boolean;
  readonly paperSampled: boolean;
  readonly seed: number;
  readonly locked: boolean;
}

// Decoys per page, indexed like the document's pages. This is the unit the undo history snapshots.
export type DecoyPages = readonly (readonly Decoy[])[];

export function withDecoy(pages: DecoyPages, pageIndex: number, decoy: Decoy): DecoyPages {
  return pages.map((list, i) => {
    if (i !== pageIndex) return list;
    const at = list.findIndex((d) => d.id === decoy.id);
    return at === -1 ? [...list, decoy] : list.map((d, j) => (j === at ? decoy : d));
  });
}

export function withoutDecoy(pages: DecoyPages, pageIndex: number, id: string): DecoyPages {
  return pages.map((list, i) => (i === pageIndex ? list.filter((d) => d.id !== id) : list));
}

export function countDecoys(pages: DecoyPages): number {
  return pages.reduce((n, list) => n + list.length, 0);
}

let counter = 0;
export function newDecoyId(): string {
  counter += 1;
  return `d${Date.now().toString(36)}${counter.toString(36)}`;
}
