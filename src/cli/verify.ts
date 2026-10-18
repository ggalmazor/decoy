import type { Rect } from '../core/geometry';
import { PRODUCER } from '../doc/pdf-assemble';
import { loadDocument, type NodeDocument } from './document';
import { boxesFromMatches, findInDocument, type RedactBox } from './redact';

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface VerifyReport {
  readonly file: string;
  readonly ok: boolean;
  readonly checks: readonly Check[];
}

export interface VerifyOptions {
  readonly patterns: readonly string[];
  // Boxes given by hand to redact, so an image can be verified against its original too.
  readonly boxes?: readonly RedactBox[];
  readonly original?: string;
}

function inside(rects: readonly Rect[], x: number, y: number): boolean {
  return rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

// The corner the watermark may occupy: its text is at most about eight glyphs wide.
function watermarkCorner(w: number, h: number): Rect {
  const px = Math.max(9, Math.round(Math.min(w, h) / 90));
  return { x: w - px * 9, y: h - px * 3, w: px * 9, h: px * 3 };
}

function pixelChecks(
  original: NodeDocument,
  output: NodeDocument,
  boxesByPage: Map<number, Rect[]>,
): Check[] {
  const checks: Check[] = [];
  if (original.pages.length !== output.pages.length) {
    return [
      {
        name: 'pages',
        ok: false,
        detail: `the original has ${original.pages.length} page(s), the output ${output.pages.length}`,
      },
    ];
  }
  for (const page of original.pages) {
    const other = output.pages[page.index];
    if (page.width !== other.width || page.height !== other.height) {
      checks.push({
        name: `page ${page.index + 1} size`,
        ok: false,
        detail: `${page.width}×${page.height} became ${other.width}×${other.height}; pixels cannot be compared`,
      });
      continue;
    }
    const a = page.canvas.getContext('2d').getImageData(0, 0, page.width, page.height).data;
    const b = other.canvas.getContext('2d').getImageData(0, 0, page.width, page.height).data;
    const boxes = boxesByPage.get(page.index) ?? [];
    const corner = watermarkCorner(page.width, page.height);
    let insideChanged = 0;
    let insideTotal = 0;
    let outsideChanged = 0;
    for (let y = 0; y < page.height; y++) {
      for (let x = 0; x < page.width; x++) {
        const i = (y * page.width + x) * 4;
        const same = a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
        if (inside(boxes, x, y)) {
          insideTotal++;
          if (!same) insideChanged++;
        } else if (!same && !inside([corner], x, y)) {
          outsideChanged++;
        }
      }
    }
    if (boxes.length > 0) {
      checks.push({
        name: `page ${page.index + 1} matches covered`,
        ok: insideChanged > 0,
        detail: `${insideChanged} of ${insideTotal} pixels inside the ${boxes.length} matched box(es) differ from the original`,
      });
    }
    checks.push({
      name: `page ${page.index + 1} untouched elsewhere`,
      ok: outsideChanged === 0,
      detail:
        outsideChanged === 0
          ? 'every pixel outside the boxes (and the watermark corner) is identical to the original'
          : `${outsideChanged} pixel(s) outside the boxes changed`,
    });
  }
  return checks;
}

// What an agent can prove about a file it did not watch being made: a PDF carries no text layer and no
// metadata, the patterns it was asked to remove are not in any text layer, and, given the original, only
// the matched boxes changed. The mosaic's independence from the original is a property of the code
// (src/core/security.test.ts), not something a single output can show.
export async function verifyOutput(path: string, options: VerifyOptions): Promise<VerifyReport> {
  const output = await loadDocument(path, { nativeImages: true });
  const checks: Check[] = [];
  if (output.kind === 'pdf') {
    const text = output.pages.reduce((n, p) => n + p.items.filter((i) => i.str.trim()).length, 0);
    checks.push({
      name: 'no text layer',
      ok: text === 0,
      detail: text === 0 ? 'every page is image-only' : `${text} text run(s) survive in the PDF`,
    });
    const producer = output.info.Producer ?? '';
    checks.push({
      name: 'written by DECOY',
      ok: producer === PRODUCER,
      detail: producer ? `producer is "${producer}"` : 'no producer field',
    });
    const leftovers = ['Author', 'Subject', 'Keywords', 'Creator'].filter(
      (k) => (output.info[k] ?? '') !== '',
    );
    checks.push({
      name: 'metadata cleared',
      ok: leftovers.length === 0,
      detail:
        leftovers.length === 0
          ? 'author, subject, keywords, and creator are empty'
          : `${leftovers.join(', ')} set`,
    });
  }
  if (options.patterns.length > 0) {
    const found = findInDocument(output, options.patterns);
    const hits = found.reduce((n, p) => n + p.matches.length, 0);
    checks.push({
      name: 'patterns absent',
      ok: hits === 0,
      detail:
        hits === 0 ? 'no pattern matches any text in the output' : `${hits} match(es) still readable as text`,
    });
  }
  if (options.original) {
    const original = await loadDocument(options.original);
    const boxesByPage = new Map<number, Rect[]>();
    for (const box of options.boxes ?? []) {
      boxesByPage.set(box.page, [...(boxesByPage.get(box.page) ?? []), box.rect]);
    }
    if (options.patterns.length > 0) {
      for (const box of boxesFromMatches(findInDocument(original, options.patterns))) {
        boxesByPage.set(box.page, [...(boxesByPage.get(box.page) ?? []), box.rect]);
      }
      const total = [...boxesByPage.values()].reduce((n, r) => n + r.length, 0);
      checks.push({
        name: 'patterns found in original',
        ok: total > 0,
        detail:
          total > 0
            ? `${total} match(es) in the original`
            : 'nothing matched in the original, so nothing was tested',
      });
    }
    checks.push(...pixelChecks(original, output, boxesByPage));
  }
  return { file: path, ok: checks.every((c) => c.ok), checks };
}
