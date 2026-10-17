import { mulberry32, shuffle } from './rng';
import type { Phrase } from './phrases';

export type Measure = (text: string, px: number) => number;

export type FitStatus = 'snug' | 'fits' | 'short' | 'long';

export const FIT_LABELS: Record<FitStatus, string> = {
  snug: 'Fits snugly',
  fits: 'Fits',
  short: 'A bit short',
  long: 'Too long, will shrink',
};

export const FONT_SCALE = 0.82;
export const SIDE_PADDING = 4;
export const MIN_RATIO = 0.85;
export const MAX_RATIO = 1;
export const TARGET_RATIO = 0.95;
const JOINER = '. ';
const RANK_UNIT = 0.05;
const RANK_NOISE = 1.5;

export interface FitResult {
  best: string;
  alternatives: string[];
  ratio: number;
  capacity: number;
  fontSize: number;
}

export interface FitOptions {
  w: number;
  h: number;
  measure: Measure;
  pool: readonly Phrase[];
  fallbacks: readonly Phrase[];
  seed: number;
  exclude?: string;
}

export function fontSizeFor(h: number): number {
  return Math.max(1, Math.round(h * FONT_SCALE));
}

export function availableWidth(w: number): number {
  return Math.max(1, w - SIDE_PADDING);
}

export function fitRatio(text: string, w: number, h: number, measure: Measure): number {
  return measure(text, fontSizeFor(h)) / availableWidth(w);
}

export function fitStatus(ratio: number): FitStatus {
  if (ratio > MAX_RATIO) return 'long';
  if (ratio >= 0.9) return 'snug';
  if (ratio >= 0.75) return 'fits';
  return 'short';
}

// Character capacity from the average advance of a sample string, so proportional fallbacks behave too.
export function capacityFor(w: number, h: number, measure: Measure): number {
  const sample = 'the quick brown fox 0123';
  const avg = measure(sample, fontSizeFor(h)) / sample.length;
  if (!(avg > 0)) return 0;
  return Math.max(0, Math.floor(availableWidth(w) / avg));
}

export function shrunkFontSize(text: string, w: number, h: number, measure: Measure): number {
  const px = fontSizeFor(h);
  const width = measure(text, px);
  const avail = availableWidth(w);
  if (width <= avail) return px;
  return Math.max(6, (px * avail) / width);
}

interface Scored {
  text: string;
  ratio: number;
}

function closeness(ratio: number): number {
  return Math.abs(ratio - TARGET_RATIO) / RANK_UNIT;
}

function inBand(ratio: number): boolean {
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO;
}

// Sort by distance from the target width plus seeded noise worth up to 1.5 units of 5%. A reroll can
// promote a phrase that fits a little less snugly, which is what gives rerolls variety in a narrow band,
// but it never promotes one that is far worse.
function rank(seed: number, scored: Scored[]): Scored[] {
  const rng = mulberry32(seed);
  return shuffle(rng, scored)
    .map((item) => ({ item, key: closeness(item.ratio) + rng() * RANK_NOISE }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

// For boxes longer than any pair: chain phrases until the line is wide enough, in seeded random order.
function chains(singles: Scored[], avail: number, px: number, measure: Measure, seed: number): Scored[] {
  const out: Scored[] = [];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 16 && out.length < 12; attempt++) {
    const rng = mulberry32((seed + attempt * 7919) >>> 0);
    const order = shuffle(rng, singles);
    let text = '';
    for (const item of order) {
      const next = text ? text + JOINER + item.text : item.text;
      const ratio = measure(next, px) / avail;
      if (ratio > MAX_RATIO) continue;
      text = next;
      if (ratio >= MIN_RATIO) break;
    }
    if (!text || seen.has(text)) continue;
    const ratio = measure(text, px) / avail;
    if (inBand(ratio)) {
      seen.add(text);
      out.push({ text, ratio });
    }
  }
  return out;
}

function pairs(singles: Scored[], avail: number, px: number, measure: Measure, seed: number): Scored[] {
  const joinerWidth = measure(JOINER, px);
  const widths = singles.map((item) => item.ratio * avail);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const order = shuffle(
    rng,
    singles.map((_, i) => i),
  );
  const out: Scored[] = [];
  const seen = new Set<string>();
  for (const i of order) {
    for (const j of order) {
      if (i === j) continue;
      const approx = (widths[i] + joinerWidth + widths[j]) / avail;
      if (!inBand(approx)) continue;
      const text = singles[i].text + JOINER + singles[j].text;
      if (seen.has(text)) continue;
      seen.add(text);
      const ratio = measure(text, px) / avail;
      if (inBand(ratio)) out.push({ text, ratio });
      if (out.length >= 24) return out;
    }
  }
  return out;
}

export function fitDecoy(options: FitOptions): FitResult {
  const { w, h, measure, pool, fallbacks, seed, exclude } = options;
  const px = fontSizeFor(h);
  const avail = availableWidth(w);
  const capacity = capacityFor(w, h, measure);

  const singles: Scored[] = pool.map((phrase) => ({
    text: phrase.text,
    ratio: measure(phrase.text, px) / avail,
  }));
  let candidates = singles.filter((item) => inBand(item.ratio));

  if (candidates.length === 0 && singles.length > 0) {
    const allTooShort = singles.every((item) => item.ratio < MIN_RATIO);
    if (allTooShort) {
      candidates = pairs(singles, avail, px, measure, seed);
      if (candidates.length === 0) candidates = chains(singles, avail, px, measure, seed);
      if (candidates.length === 0) {
        // Nothing reaches the band: take the widest pairs we can build and accept "a bit short".
        const widest = [...singles].sort((a, b) => b.ratio - a.ratio).slice(0, 6);
        candidates = widest.flatMap((a) =>
          widest
            .filter((b) => b.text !== a.text)
            .map((b) => {
              const text = a.text + JOINER + b.text;
              return { text, ratio: measure(text, px) / avail };
            }),
        );
      }
    }
  }

  if (candidates.length === 0) {
    const scoredFallbacks: Scored[] = fallbacks.map((phrase) => ({
      text: phrase.text,
      ratio: measure(phrase.text, px) / avail,
    }));
    const fitting = scoredFallbacks.filter((item) => item.ratio <= MAX_RATIO);
    candidates =
      fitting.length > 0 ? fitting : [...scoredFallbacks].sort((a, b) => a.ratio - b.ratio).slice(0, 1);
    if (fitting.length > 0) {
      // Fallbacks are few and short; the widest one that still fits is the best decoy.
      candidates.sort((a, b) => b.ratio - a.ratio);
      const best = candidates[0];
      return {
        best: best.text,
        alternatives: candidates.slice(1, 4).map((item) => item.text),
        ratio: best.ratio,
        capacity,
        fontSize: px,
      };
    }
  }

  const ranked = rank(seed, candidates);
  const withoutCurrent = exclude ? ranked.filter((item) => item.text !== exclude) : ranked;
  const ordered = withoutCurrent.length > 0 ? withoutCurrent : ranked;
  const best = ordered[0];
  const alternatives: string[] = [];
  for (const item of ordered.slice(1)) {
    if (item.text === best.text) continue;
    alternatives.push(item.text);
    if (alternatives.length === 3) break;
  }
  return { best: best.text, alternatives, ratio: best.ratio, capacity, fontSize: px };
}

// Alternatives for a text the user typed or locked: the best-ranked candidates other than the current text.
export function alternativesFor(options: FitOptions): string[] {
  return fitDecoy(options).alternatives;
}
