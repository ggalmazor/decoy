import { describe, expect, it } from 'vitest';
import { hashString, lcg, mulberry32, pick, shuffle } from './rng';

describe('rng', () => {
  it('mulberry32 is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });

  it('hashString matches the reference mosaic.js hash', () => {
    let seed = 7;
    const text = 'you thought this was a password?';
    for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    expect(hashString(text)).toBe(seed);
  });

  it('lcg matches the reference mosaic.js generator', () => {
    let s = 12345;
    const reference = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const ours = lcg(12345);
    for (let i = 0; i < 20; i++) expect(ours()).toBe(reference());
  });

  it('shuffle is a seeded permutation', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const once = shuffle(mulberry32(9), items);
    const twice = shuffle(mulberry32(9), items);
    expect(once).toEqual(twice);
    expect([...once].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('pick never falls off the end', () => {
    const rng = () => 0.999999999;
    expect(pick(rng, ['a', 'b'])).toBe('b');
  });
});
