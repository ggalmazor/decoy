import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import type { PDFPageProxy } from 'pdfjs-dist';
import { LoadError, type DocumentKind } from '../doc/types';
import type { Rect } from '../core/geometry';
import type { TextItem } from './text-search';

export interface NodePage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  // The original pixels. Never drawn on; the output composites over a copy.
  readonly canvas: Canvas;
  readonly points?: { w: number; h: number };
  // The text layer in page pixels, empty for images and for image-only PDFs.
  readonly items: readonly TextItem[];
}

export interface NodeDocument {
  readonly path: string;
  readonly name: string;
  readonly kind: DocumentKind;
  readonly mime: string;
  readonly pages: readonly NodePage[];
  // PDF info dictionary, for verification.
  readonly info: Readonly<Record<string, string>>;
}

// Mirrors src/doc/load.ts: 150 dpi, longest side capped, so a box found here lands where the site
// would put it for the same document.
export const PDF_DPI = 150;
const MAX_PAGE_PX = 4500;

export function sniffMime(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 12));
  if (head.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'image/webp';
  return null;
}

async function loadImageDocument(path: string, bytes: Uint8Array, mime: string): Promise<NodeDocument> {
  let image;
  try {
    image = await loadImage(Buffer.from(bytes));
  } catch {
    throw new LoadError('corrupt', "That image wouldn't decode.");
  }
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return {
    path,
    name: basename(path),
    kind: 'image',
    mime,
    info: {},
    pages: [{ index: 0, width: canvas.width, height: canvas.height, canvas, items: [] }],
  };
}

function pdfjsRoot(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('pdfjs-dist/package.json'));
}

type Matrix = readonly number[];

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// A text run's box in page pixels. pdf.js gives the baseline origin and the advance in user space; the
// glyphs sit from about a fifth of the size below the baseline to four fifths above it.
function itemRect(transform: Matrix, width: number, height: number, viewport: Matrix): Rect {
  const size = height || Math.hypot(transform[2], transform[3]) || 1;
  const corners = [
    apply(transform, 0, -0.22),
    apply(transform, 0, 0.8),
    apply(transform, 0, 0.8),
    apply(transform, 0, -0.22),
  ];
  // The transform carries the font size, so the advance is applied in text space: width / size.
  const advance = width / size;
  corners[2] = apply(transform, advance, 0.8);
  corners[3] = apply(transform, advance, -0.22);
  const points = corners.map(([x, y]) => apply(viewport, x, y));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export interface LoadOptions {
  // Render a page that is one bitmap (a DECOY output, a scan) at that bitmap's own pixel size instead of
  // 150 dpi, so the pixels come back exactly as they were written. Used to verify outputs.
  readonly nativeImages?: boolean;
}

async function nativeImageSize(
  page: PDFPageProxy,
  OPS: Record<string, number>,
): Promise<{ w: number; h: number } | null> {
  try {
    const ops = await page.getOperatorList();
    const paints = ops.fnArray.map((fn, i) => (fn === OPS.paintImageXObject ? i : -1)).filter((i) => i >= 0);
    if (paints.length !== 1) return null;
    const name = (ops.argsArray[paints[0]] as unknown[])[0] as string;
    const image = await new Promise<{ width?: number; height?: number } | null>((done) => {
      try {
        page.objs.get(name, (value: unknown) => done(value as { width?: number; height?: number }));
      } catch {
        done(null);
      }
    });
    if (!image?.width || !image.height) return null;
    return { w: image.width, h: image.height };
  } catch {
    return null;
  }
}

async function loadPdfDocument(path: string, bytes: Uint8Array, options: LoadOptions): Promise<NodeDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = pdfjsRoot();
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: join(root, 'cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: join(root, 'standard_fonts/'),
    iccUrl: join(root, 'iccs/'),
    wasmUrl: join(root, 'wasm/'),
    useSystemFonts: false,
    stopAtErrors: false,
  });
  // No password prompt: an encrypted PDF is refused with the site's own line.
  task.onPassword = () => {
    throw new LoadError('encrypted', 'password');
  };
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (error) {
    if (error instanceof LoadError) throw error;
    if ((error as { name?: string }).name === 'PasswordException')
      throw new LoadError('encrypted', 'password');
    throw new LoadError('corrupt', "That PDF wouldn't open.");
  }
  const pages: NodePage[] = [];
  let info: Record<string, string> = {};
  try {
    const meta = await pdf.getMetadata().catch(() => null);
    if (meta?.info) {
      info = Object.fromEntries(
        Object.entries(meta.info as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => [k, v as string]),
      );
    }
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      let scale = PDF_DPI / 72;
      const native = options.nativeImages ? await nativeImageSize(page, pdfjs.OPS) : null;
      if (native && Math.abs(native.w / native.h - base.width / base.height) < 0.01)
        scale = native.w / base.width;
      const longest = Math.max(base.width, base.height) * scale;
      if (longest > MAX_PAGE_PX) scale *= MAX_PAGE_PX / longest;
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: '#ffffff' })
        .promise;
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.length === 0) continue;
        items.push({
          str: item.str,
          rect: itemRect(item.transform, item.width, item.height, viewport.transform),
        });
      }
      pages.push({
        index: i - 1,
        width: canvas.width,
        height: canvas.height,
        canvas,
        points: { w: base.width, h: base.height },
        items,
      });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { path, name: basename(path), kind: 'pdf', mime: 'application/pdf', pages, info };
}

export async function loadDocument(path: string, options: LoadOptions = {}): Promise<NodeDocument> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch {
    throw new LoadError('corrupt', `${path} could not be read.`);
  }
  const mime = sniffMime(bytes);
  if (!mime) throw new LoadError('unsupported', 'unsupported');
  if (mime === 'application/pdf') return loadPdfDocument(path, bytes, options);
  return loadImageDocument(path, bytes, mime);
}
