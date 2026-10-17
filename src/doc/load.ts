import { LoadError, type LoadedDocument, type LoadProgress, type Page } from './types';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';

// 150 dpi: an A4 page becomes 1240 x 1754 px, enough to read small print and small enough to edit live.
const PDF_DPI = 150;
const MAX_PAGE_PX = 4500;

export function sniffKind(file: File | Blob, name = ''): 'image' | 'pdf' | null {
  const type = file.type.toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return 'image';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  return null;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadImage(blob: Blob, name: string, mime: string): Promise<LoadedDocument> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new LoadError('corrupt', "That image wouldn't decode.");
  }
  const raster = canvasOf(bitmap.width, bitmap.height);
  const ctx = raster.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const page: Page = { index: 0, width: raster.width, height: raster.height, raster };
  return { name, kind: 'image', mime, pages: [page] };
}

async function loadPdf(
  blob: Blob,
  name: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<LoadedDocument> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    iccUrl: '/pdfjs/iccs/',
    wasmUrl: '/pdfjs/wasm/',
    useWorkerFetch: true,
    disableAutoFetch: true,
    stopAtErrors: false,
  });
  // No password prompt: an encrypted PDF is refused with the copy deck's line.
  task.onPassword = (_update: (password: string) => void, _reason: number) => {
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
  const pages: Page[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.({ page: i, total: pdf.numPages });
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      let scale = PDF_DPI / 72;
      const longest = Math.max(base.width, base.height) * scale;
      if (longest > MAX_PAGE_PX) scale *= MAX_PAGE_PX / longest;
      const viewport = page.getViewport({ scale });
      const raster = canvasOf(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvas: raster, viewport, background: '#ffffff' }).promise;
      pages.push({
        index: i - 1,
        width: raster.width,
        height: raster.height,
        raster,
        points: { w: base.width, h: base.height },
      });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { name, kind: 'pdf', mime: 'application/pdf', pages };
}

export async function loadFile(
  file: File | Blob,
  name = (file as File).name ?? 'pasted-image.png',
  onProgress?: (p: LoadProgress) => void,
): Promise<LoadedDocument> {
  const kind = sniffKind(file, name);
  if (!kind) throw new LoadError('unsupported', 'unsupported');
  if (kind === 'pdf') return loadPdf(file, name, onProgress);
  return loadImage(file, name, file.type || 'image/png');
}

export function imageFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && (item.type.startsWith('image/') || item.type === 'application/pdf')) {
      return item.getAsFile();
    }
  }
  return null;
}
