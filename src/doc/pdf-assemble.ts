export const PRODUCER = 'DECOY';

export interface AssembledPage {
  readonly bytes: Uint8Array;
  readonly kind: 'png' | 'jpeg';
  readonly width: number;
  readonly height: number;
  // Page size in PDF points when the source was a PDF, so the output keeps the original page size.
  readonly points?: { w: number; h: number };
}

export interface AssembleOptions {
  // null clears the title along with every other field; a string is the only metadata the output carries.
  readonly title: string | null;
}

// One image per page and nothing else: no text layer, annotation, form field, attachment, or metadata from
// the source can survive, because none of it is ever read. Shared by the browser export and the CLI.
export async function assemblePdf(
  pages: readonly AssembledPage[],
  options: AssembleOptions,
): Promise<Uint8Array> {
  // Loaded on demand: pdf-lib is 200 kB that only a PDF export needs.
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const page of pages) {
    const image = page.kind === 'jpeg' ? await out.embedJpg(page.bytes) : await out.embedPng(page.bytes);
    const size = page.points ?? { w: (page.width * 72) / 150, h: (page.height * 72) / 150 };
    const pdfPage = out.addPage([size.w, size.h]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: size.w, height: size.h });
  }
  out.setTitle(options.title ?? '');
  out.setAuthor('');
  out.setSubject('');
  out.setKeywords([]);
  out.setCreator('');
  out.setProducer(PRODUCER);
  return out.save({ useObjectStreams: true });
}
