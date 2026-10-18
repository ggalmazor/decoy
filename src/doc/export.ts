import type { Decoy, DecoyPages } from '../core/model';
import { buildMosaic } from '../render/mosaic';
import { assemblePdf, type AssembledPage } from './pdf-assemble';
import type { LoadedDocument, Page } from './types';

export type ExportFormat = 'pdf' | 'png' | 'clipboard';

export interface ExportOptions {
  stripMetadata: boolean;
  watermark: boolean;
}

export { PRODUCER } from './pdf-assemble';

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const px = Math.max(9, Math.round(Math.min(width, height) / 90));
  ctx.save();
  ctx.font = `600 ${px}px "IBM Plex Mono", "Courier New", monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(23, 20, 15, 0.55)';
  ctx.fillText('decoyed', width - px, height - px);
  ctx.restore();
}

// The flattened page: the original raster, then every decoy written over it with putImageData, which
// replaces pixels outright. Nothing else from the document is read or kept.
export function flattenPage(page: Page, decoys: readonly Decoy[], options: ExportOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(page.raster, 0, 0);
  for (const decoy of decoys) {
    const mosaic = buildMosaic({
      text: decoy.text,
      w: decoy.rect.w,
      h: decoy.rect.h,
      cell: decoy.cell,
      ink: decoy.ink,
      paper: decoy.paper,
    });
    ctx.putImageData(mosaic.imageData, decoy.rect.x, decoy.rect.y);
  }
  if (options.watermark) drawWatermark(ctx, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), type, quality);
  });
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'document';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Re-encoding from a canvas is what drops EXIF and every other chunk the source carried: a PNG written by
// the browser has pixels and nothing else.
export async function exportPng(
  doc: LoadedDocument,
  decoys: DecoyPages,
  options: ExportOptions,
): Promise<string[]> {
  const names: string[] = [];
  const many = doc.pages.length > 1;
  for (const page of doc.pages) {
    const canvas = flattenPage(page, decoys[page.index] ?? [], options);
    const blob = await canvasToBlob(canvas, 'image/png');
    const name = many
      ? `${baseName(doc.name)}-decoyed-p${page.index + 1}.png`
      : `${baseName(doc.name)}-decoyed.png`;
    downloadBlob(blob, name);
    names.push(name);
    if (many) await sleep(300);
  }
  return names;
}

// Image-only pages at the original size in points. The PDF is built from scratch rather than edited, so no
// text layer, annotation, form field, attachment or metadata from the source can survive.
export async function buildPdf(
  doc: LoadedDocument,
  decoys: DecoyPages,
  options: ExportOptions,
): Promise<Uint8Array> {
  const photographic = doc.kind === 'image' && doc.mime === 'image/jpeg';
  const pages: AssembledPage[] = [];
  for (const page of doc.pages) {
    const canvas = flattenPage(page, decoys[page.index] ?? [], options);
    const blob = photographic
      ? await canvasToBlob(canvas, 'image/jpeg', 0.92)
      : await canvasToBlob(canvas, 'image/png');
    pages.push({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      kind: photographic ? 'jpeg' : 'png',
      width: page.width,
      height: page.height,
      points: page.points,
    });
  }
  return assemblePdf(pages, { title: options.stripMetadata ? null : baseName(doc.name) });
}

export async function exportPdf(
  doc: LoadedDocument,
  decoys: DecoyPages,
  options: ExportOptions,
): Promise<string> {
  const bytes = await buildPdf(doc, decoys, options);
  const name = `${baseName(doc.name)}-decoyed.pdf`;
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name);
  return name;
}

export async function copyPageToClipboard(
  page: Page,
  decoys: readonly Decoy[],
  options: ExportOptions,
): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard images are not supported in this browser.');
  }
  const canvas = flattenPage(page, decoys, options);
  // Safari needs the promise handed to ClipboardItem synchronously inside the user gesture.
  const item = new ClipboardItem({ 'image/png': canvasToBlob(canvas, 'image/png') });
  await navigator.clipboard.write([item]);
}
