import { describe, expect, it } from 'vitest';
import { mosaicFromCoverage, mosaicSeed } from './mosaic';
import { blitOpaque } from './raster';
import type { Rect } from './geometry';

// The security property: pixels inside a box never influence the output. The mosaic is a function of the
// decoy text (through its coverage and seed), the box size, the block size, and the ink and paper colours.
// Two documents that differ only inside the box must come out identical inside the box, and each must keep
// its own pixels outside it.

const W = 64;
const H = 32;
const BOX: Rect = { x: 10, y: 8, w: 40, h: 16 };

function page(fill: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fill(x, y);
      const i = (y * W + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function inside(x: number, y: number): boolean {
  return x >= BOX.x && x < BOX.x + BOX.w && y >= BOX.y && y < BOX.y + BOX.h;
}

// Stand-in for the rasterised decoy phrase: a pattern that depends on the text only.
function coverageFor(text: string, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  let s = mosaicSeed(text);
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = s % 3 === 0 ? 1 : 0;
  }
  return out;
}

describe('security property', () => {
  it('two originals that differ only inside the box produce identical output inside the box', () => {
    const a = page((x, y) => (inside(x, y) ? 0 : 200));
    const b = page((x, y) => (inside(x, y) ? (x * 7 + y * 13) % 256 : 200));
    const params = {
      w: BOX.w,
      h: BOX.h,
      cell: 4,
      ink: [23, 20, 15] as const,
      paper: [246, 241, 230] as const,
      seed: mosaicSeed('lol no'),
    };
    const mosaic = mosaicFromCoverage(coverageFor('lol no', BOX.w, BOX.h), params);

    const outA = a.slice();
    const outB = b.slice();
    blitOpaque(outA, { w: W, h: H }, mosaic, BOX);
    blitOpaque(outB, { w: W, h: H }, mosaic, BOX);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const pa = Array.from(outA.subarray(i, i + 4));
        const pb = Array.from(outB.subarray(i, i + 4));
        if (inside(x, y)) {
          expect(pa, `inside ${x},${y}`).toEqual(pb);
          expect(pa, `original leaked at ${x},${y}`).not.toEqual(Array.from(a.subarray(i, i + 4)));
        } else {
          expect(pa, `outside A ${x},${y}`).toEqual(Array.from(a.subarray(i, i + 4)));
          expect(pb, `outside B ${x},${y}`).toEqual(Array.from(b.subarray(i, i + 4)));
        }
      }
    }
  });

  it('the output inside the box is a pure function of text, size, cell, ink, and paper', () => {
    const params = {
      w: BOX.w,
      h: BOX.h,
      cell: 5,
      ink: [0, 0, 0] as const,
      paper: [255, 255, 255] as const,
      seed: mosaicSeed('nope'),
    };
    const one = mosaicFromCoverage(coverageFor('nope', BOX.w, BOX.h), params);
    const two = mosaicFromCoverage(coverageFor('nope', BOX.w, BOX.h), params);
    expect(one).toEqual(two);
    const other = mosaicFromCoverage(coverageFor('nah', BOX.w, BOX.h), {
      ...params,
      seed: mosaicSeed('nah'),
    });
    expect(other).not.toEqual(one);
  });

  it('blitOpaque forces alpha to 255 so no blend can mix in the original', () => {
    const dst = page(() => 128);
    const src = new Uint8ClampedArray(BOX.w * BOX.h * 4);
    for (let i = 0; i < BOX.w * BOX.h; i++) {
      src[i * 4] = 10;
      src[i * 4 + 1] = 20;
      src[i * 4 + 2] = 30;
      src[i * 4 + 3] = 0;
    }
    blitOpaque(dst, { w: W, h: H }, src, BOX);
    const i = (BOX.y * W + BOX.x) * 4;
    expect(Array.from(dst.subarray(i, i + 4))).toEqual([10, 20, 30, 255]);
  });
});
