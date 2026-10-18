import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadDocument } from './document';
import { boxesFromMatches, findInDocument, flattenPage, planDecoys, DEFAULT_OPTIONS } from './redact';
import { runRedact } from './run';
import { verifyOutput } from './verify';

const FIXTURE = new URL('../../e2e/fixtures/three-pages.pdf', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'decoy-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the CLI pipeline on the three-page fixture', () => {
  it('finds the secret on page 2 where the site would draw the box', async () => {
    const doc = await loadDocument(FIXTURE);
    expect(doc.kind).toBe('pdf');
    expect(doc.pages).toHaveLength(3);
    const found = findInDocument(doc, ['Summer\\d{4}!']);
    const boxes = boxesFromMatches(found);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].page).toBe(1);
    // "Summer2026!" sits at 148.4 pt from the left, 92.4 pt wide, on a 14 pt baseline 664 pt from the bottom
    // of an A4 page; at 150 dpi that is x 309..501 and y about 345..378.
    const r = boxes[0].rect;
    expect(r.x).toBeGreaterThan(300);
    expect(r.x).toBeLessThan(312);
    expect(r.w).toBeGreaterThan(190);
    expect(r.w).toBeLessThan(200);
    expect(r.y).toBeGreaterThan(338);
    expect(r.y).toBeLessThan(352);
    expect(r.y + r.h).toBeLessThan(386);
  });

  it('plans a decoy deterministically from a seed, with sampled colours', async () => {
    const doc = await loadDocument(FIXTURE);
    const boxes = boxesFromMatches(findInDocument(doc, ['Summer2026!']));
    const a = planDecoys(doc, boxes, { ...DEFAULT_OPTIONS, seed: 7 });
    const b = planDecoys(doc, boxes, { ...DEFAULT_OPTIONS, seed: 7 });
    expect(a[0].text).toBe(b[0].text);
    expect(a[0].text.length).toBeGreaterThan(0);
    expect(a[0].paper).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a[0].ink).not.toBe(a[0].paper);
  });

  it('changes pixels only inside the box when flattening', async () => {
    const doc = await loadDocument(FIXTURE);
    const page = doc.pages[1];
    const boxes = boxesFromMatches(findInDocument(doc, ['Summer2026!']));
    const [decoy] = planDecoys(doc, boxes, { ...DEFAULT_OPTIONS, seed: 1 });
    const out = flattenPage(page, [decoy], DEFAULT_OPTIONS);
    const before = page.canvas.getContext('2d').getImageData(0, 0, page.width, page.height).data;
    const after = out.getContext('2d').getImageData(0, 0, page.width, page.height).data;
    let inside = 0;
    let outside = 0;
    for (let y = 0; y < page.height; y++) {
      for (let x = 0; x < page.width; x++) {
        const i = (y * page.width + x) * 4;
        const same =
          before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2];
        if (same) continue;
        const r = decoy.rect;
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) inside++;
        else outside++;
      }
    }
    expect(outside).toBe(0);
    expect(inside).toBeGreaterThan(100);
  });

  it('writes an image-only PDF that verifies against the original', async () => {
    const doc = await loadDocument(FIXTURE);
    const out = join(dir, 'three-pages-decoyed.pdf');
    const result = await runRedact(doc, {
      patterns: ['Summer2026!', 'm\\.etxeberria'],
      boxes: [],
      seed: 3,
      out,
    });
    expect(result.decoys).toHaveLength(2);
    expect(result.outputs[0].path).toBe(out);

    const written = await loadDocument(out);
    expect(written.pages).toHaveLength(3);
    expect(written.pages.every((p) => p.items.length === 0)).toBe(true);
    expect(written.info.Producer).toBe('DECOY');
    expect(written.pages[1].points).toEqual(doc.pages[1].points);

    const report = await verifyOutput(out, {
      patterns: ['Summer2026!', 'm\\.etxeberria'],
      original: FIXTURE,
    });
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('flags a verify that was given a narrower pattern than the redaction', async () => {
    const out = join(dir, 'three-pages-decoyed.pdf');
    const report = await verifyOutput(out, { patterns: ['etxeberria'], original: FIXTURE });
    const untouched = report.checks.find((c) => c.name === 'page 2 untouched elsewhere');
    expect(untouched?.ok).toBe(false);
  });

  it('refuses to do nothing', async () => {
    const doc = await loadDocument(FIXTURE);
    await expect(runRedact(doc, { patterns: ['nothing-like-this'], boxes: [] })).rejects.toThrow(
      /Nothing to redact/,
    );
  });
});
