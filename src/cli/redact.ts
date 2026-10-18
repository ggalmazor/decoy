import { createCanvas, ImageData, type Canvas } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { toHex } from '../core/color';
import { fitDecoy } from '../core/fit';
import { clampRect, expandRect, MIN_BOX, type Rect } from '../core/geometry';
import { DEFAULT_CELL } from '../core/mosaic';
import { DEFAULT_MOOD, fallbacksFor, phrasesFor, type Mood } from '../core/phrases';
import { hashString, randomSeed } from '../core/rng';
import { sampleInkPaper, SAMPLE_MARGIN } from '../core/sample';
import { assemblePdf, type AssembledPage } from '../doc/pdf-assemble';
import { mosaicPixels } from '../render/mosaic';
import { measureText } from '../render/text';
import { setupNodeCanvas } from './backend';
import type { NodeDocument, NodePage } from './document';
import { compilePattern, findMatches, linesFromItems, type TextMatch } from './text-search';

export interface RedactBox {
  readonly page: number;
  readonly rect: Rect;
  // What put the box there: the matched text, or "box" for one given by hand.
  readonly source: string;
}

export interface RedactOptions {
  readonly mood: Mood;
  readonly clean: boolean;
  readonly cell: number;
  // When set, every choice is reproducible; otherwise each box gets a fresh random seed.
  readonly seed?: number;
  // A phrase to use for every box instead of letting the fit choose.
  readonly text?: string;
  readonly watermark: boolean;
  readonly keepTitle: boolean;
}

export const DEFAULT_OPTIONS: RedactOptions = {
  mood: DEFAULT_MOOD,
  clean: false,
  cell: DEFAULT_CELL,
  watermark: false,
  keepTitle: false,
};

export interface PlannedDecoy {
  readonly page: number;
  readonly rect: Rect;
  readonly source: string;
  readonly text: string;
  readonly ink: string;
  readonly paper: string;
  readonly seed: number;
}

export type OutputFormat = 'pdf' | 'png';

export interface PageMatches {
  readonly page: number;
  readonly matches: readonly TextMatch[];
}

export function findInDocument(doc: NodeDocument, patterns: readonly string[]): PageMatches[] {
  const compiled = patterns.map(compilePattern);
  return doc.pages.map((page) => {
    const lines = linesFromItems(page.items);
    const bounds = { w: page.width, h: page.height };
    const matches = compiled.flatMap((pattern) => findMatches(lines, pattern, bounds));
    return { page: page.index, matches };
  });
}

export function boxesFromMatches(found: readonly PageMatches[]): RedactBox[] {
  return found.flatMap(({ page, matches }) => matches.map((m) => ({ page, rect: m.rect, source: m.text })));
}

// "x,y,w,h" or "x,y,w,h@page" with a 1-based page; page 1 when omitted.
export function parseBoxArg(text: string): RedactBox {
  const [coords, pageText] = text.split('@');
  const parts = coords.split(',').map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error(`A box is x,y,w,h in page pixels, optionally @page: got ${JSON.stringify(text)}`);
  const page = pageText === undefined ? 1 : Number(pageText);
  if (!Number.isInteger(page) || page < 1) throw new Error(`Bad page in ${JSON.stringify(text)}`);
  const [x, y, w, h] = parts;
  return { page: page - 1, rect: { x, y, w, h }, source: 'box' };
}

function sampleColours(page: NodePage, rect: Rect): { ink: string; paper: string } {
  const region = expandRect(rect, SAMPLE_MARGIN, { w: page.width, h: page.height });
  const ctx = page.canvas.getContext('2d');
  const image = ctx.getImageData(region.x, region.y, Math.max(1, region.w), Math.max(1, region.h));
  const sampled = sampleInkPaper({ data: image.data, w: image.width, h: image.height });
  return { ink: toHex(sampled.ink), paper: toHex(sampled.paper) };
}

function normalise(rect: Rect, page: NodePage): Rect {
  const rounded = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.max(MIN_BOX, Math.round(rect.w)),
    h: Math.max(MIN_BOX, Math.round(rect.h)),
  };
  return clampRect(rounded, { w: page.width, h: page.height });
}

// The same decision the site makes when a box is drawn: sample ink and paper around it, then let the fit
// choose a phrase for its size from the mood's pool, seeded so a run can be repeated exactly.
export function planDecoys(
  doc: NodeDocument,
  boxes: readonly RedactBox[],
  options: RedactOptions,
): PlannedDecoy[] {
  setupNodeCanvas();
  return boxes.map((box, i) => {
    const page = doc.pages[box.page];
    if (!page) throw new Error(`Page ${box.page + 1} does not exist; the document has ${doc.pages.length}.`);
    const rect = normalise(box.rect, page);
    const seed = options.seed === undefined ? randomSeed() : hashString(`${options.seed}:${i}`);
    const colours = sampleColours(page, rect);
    const text =
      options.text ??
      fitDecoy({
        w: rect.w,
        h: rect.h,
        measure: measureText,
        pool: phrasesFor(options.mood, options.clean),
        fallbacks: fallbacksFor(options.mood, options.clean),
        seed,
      }).best;
    return { page: box.page, rect, source: box.source, text, ink: colours.ink, paper: colours.paper, seed };
  });
}

function drawWatermark(canvas: Canvas): void {
  const ctx = canvas.getContext('2d');
  const px = Math.max(9, Math.round(Math.min(canvas.width, canvas.height) / 90));
  ctx.save();
  ctx.font = `600 ${px}px "IBM Plex Mono", "Courier New", monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(23, 20, 15, 0.55)';
  ctx.fillText('decoyed', canvas.width - px, canvas.height - px);
  ctx.restore();
}

// The flattened page: the original raster, then every decoy written over it with putImageData, which
// replaces pixels outright. The mosaic is computed from the decoy text alone; see src/render/mosaic.ts.
export function flattenPage(page: NodePage, decoys: readonly PlannedDecoy[], options: RedactOptions): Canvas {
  setupNodeCanvas();
  const canvas = createCanvas(page.width, page.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(page.canvas, 0, 0);
  for (const decoy of decoys) {
    const mosaic = mosaicPixels({
      text: decoy.text,
      w: decoy.rect.w,
      h: decoy.rect.h,
      cell: options.cell,
      ink: decoy.ink,
      paper: decoy.paper,
    });
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(mosaic.data), mosaic.w, mosaic.h),
      decoy.rect.x,
      decoy.rect.y,
    );
  }
  if (options.watermark) drawWatermark(canvas);
  return canvas;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'document';
}

export function defaultFormat(doc: NodeDocument): OutputFormat {
  return doc.kind === 'pdf' ? 'pdf' : 'png';
}

export function defaultOutput(doc: NodeDocument, format: OutputFormat): string {
  return join(dirname(doc.path), `${baseName(doc.name)}-decoyed.${format}`);
}

export interface WrittenFile {
  readonly path: string;
  readonly bytes: number;
}

// Writes the flattened document. A PDF is one file; PNG is one file per page, numbered when there are
// several. Nothing from the source file is copied: every page is re-encoded from pixels.
export async function writeRedacted(
  doc: NodeDocument,
  decoys: readonly PlannedDecoy[],
  options: RedactOptions,
  format: OutputFormat,
  out: string,
): Promise<WrittenFile[]> {
  const flattened = doc.pages.map((page) =>
    flattenPage(
      page,
      decoys.filter((d) => d.page === page.index),
      options,
    ),
  );
  if (format === 'png') {
    const many = flattened.length > 1;
    const files: WrittenFile[] = [];
    for (const [i, canvas] of flattened.entries()) {
      const path = many ? out.replace(/\.png$/i, '') + `-p${i + 1}.png` : out;
      const bytes = await canvas.encode('png');
      await writeFile(path, bytes);
      files.push({ path, bytes: bytes.byteLength });
    }
    return files;
  }
  const photographic = doc.kind === 'image' && doc.mime === 'image/jpeg';
  const pages: AssembledPage[] = [];
  for (const [i, canvas] of flattened.entries()) {
    const bytes = photographic ? await canvas.encode('jpeg', 92) : await canvas.encode('png');
    pages.push({
      bytes: new Uint8Array(bytes),
      kind: photographic ? 'jpeg' : 'png',
      width: canvas.width,
      height: canvas.height,
      points: doc.pages[i].points,
    });
  }
  const pdf = await assemblePdf(pages, { title: options.keepTitle ? baseName(doc.name) : null });
  await writeFile(out, pdf);
  return [{ path: out, bytes: pdf.byteLength }];
}
