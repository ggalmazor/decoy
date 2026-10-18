import type { Rect } from '../core/geometry';
import type { Mood } from '../core/phrases';
import type { NodeDocument } from './document';
import {
  boxesFromMatches,
  DEFAULT_OPTIONS,
  defaultFormat,
  defaultOutput,
  findInDocument,
  planDecoys,
  writeRedacted,
  type OutputFormat,
  type RedactBox,
  type RedactOptions,
  type WrittenFile,
} from './redact';
import { linesFromItems } from './text-search';

// The one place both the command line and the MCP server call into, so they cannot drift apart.

export interface FoundLine {
  readonly page: number;
  readonly text: string;
  readonly rect: Rect;
}

export interface FoundMatch {
  readonly page: number;
  readonly text: string;
  readonly line: string;
  readonly rect: Rect;
}

export interface FindResult {
  readonly file: string;
  readonly kind: NodeDocument['kind'];
  readonly pages: { readonly page: number; readonly width: number; readonly height: number }[];
  readonly lines?: FoundLine[];
  readonly matches?: FoundMatch[];
}

export function runFind(doc: NodeDocument, patterns: readonly string[]): FindResult {
  const pages = doc.pages.map((p) => ({ page: p.index + 1, width: p.width, height: p.height }));
  if (patterns.length === 0) {
    const lines = doc.pages.flatMap((p) =>
      linesFromItems(p.items).map((line) => ({ page: p.index + 1, text: line.text, rect: round(line.rect) })),
    );
    return { file: doc.path, kind: doc.kind, pages, lines };
  }
  const matches = findInDocument(doc, patterns).flatMap(({ page, matches }) =>
    matches.map((m) => ({ page: page + 1, text: m.text, line: m.line, rect: round(m.rect) })),
  );
  return { file: doc.path, kind: doc.kind, pages, matches };
}

export interface RedactRequest {
  readonly patterns: readonly string[];
  readonly boxes: readonly RedactBox[];
  readonly mood?: Mood;
  readonly clean?: boolean;
  readonly cell?: number;
  readonly seed?: number;
  readonly text?: string;
  readonly watermark?: boolean;
  readonly keepTitle?: boolean;
  readonly format?: OutputFormat;
  readonly out?: string;
}

export interface RedactResult {
  readonly file: string;
  readonly format: OutputFormat;
  readonly outputs: WrittenFile[];
  readonly decoys: {
    readonly page: number;
    readonly covered: string;
    readonly rect: Rect;
    readonly text: string;
    readonly seed: number;
  }[];
}

export async function runRedact(doc: NodeDocument, request: RedactRequest): Promise<RedactResult> {
  const options: RedactOptions = {
    mood: request.mood ?? DEFAULT_OPTIONS.mood,
    clean: request.clean ?? DEFAULT_OPTIONS.clean,
    cell: request.cell ?? DEFAULT_OPTIONS.cell,
    seed: request.seed,
    text: request.text,
    watermark: request.watermark ?? DEFAULT_OPTIONS.watermark,
    keepTitle: request.keepTitle ?? DEFAULT_OPTIONS.keepTitle,
  };
  const fromText = request.patterns.length > 0 ? boxesFromMatches(findInDocument(doc, request.patterns)) : [];
  const boxes = [...fromText, ...request.boxes];
  if (boxes.length === 0) {
    throw new Error(
      doc.kind === 'pdf'
        ? 'Nothing to redact: no pattern matched the text layer and no box was given.'
        : 'Nothing to redact: images have no text layer, so give boxes in page pixels.',
    );
  }
  const decoys = planDecoys(doc, boxes, options);
  const format = request.format ?? defaultFormat(doc);
  const out = request.out ?? defaultOutput(doc, format);
  const outputs = await writeRedacted(doc, decoys, options, format, out);
  return {
    file: doc.path,
    format,
    outputs,
    decoys: decoys.map((d) => ({
      page: d.page + 1,
      covered: d.source,
      rect: d.rect,
      text: d.text,
      seed: d.seed,
    })),
  };
}

function round(rect: Rect): Rect {
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
}
