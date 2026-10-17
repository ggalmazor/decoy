export type DocumentKind = 'image' | 'pdf';

export interface Page {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  // The original pixels. Never drawn on; the display and the export composite over a copy.
  readonly raster: HTMLCanvasElement;
  // Page size in PDF points when the source was a PDF, so the export keeps the original page size.
  readonly points?: { w: number; h: number };
}

export interface LoadedDocument {
  readonly name: string;
  readonly kind: DocumentKind;
  readonly mime: string;
  readonly pages: readonly Page[];
}

export type LoadErrorCode = 'unsupported' | 'encrypted' | 'corrupt';

export class LoadError extends Error {
  constructor(
    readonly code: LoadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LoadError';
  }
}

export const LOAD_MESSAGES: Record<LoadErrorCode, string> = {
  unsupported: "That's not a PDF, PNG, JPG or WebP. We only redact the classics.",
  encrypted: 'This PDF is password-protected. Ironic. Unlock it first.',
  corrupt: "That file wouldn't open. It may be damaged, or not what its name says.",
};

export interface LoadProgress {
  page: number;
  total: number;
}
