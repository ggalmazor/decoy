import { INK_FALLBACK, luma, type RGB } from './color';
import type { RgbaImage } from './raster';

export interface InkPaper {
  ink: RGB;
  paper: RGB;
  lowContrast: boolean;
}

export const SAMPLE_MARGIN = 6;
const MIN_CONTRAST = 48;

function meanOf(data: Uint8ClampedArray, indices: number[]): RGB {
  if (indices.length === 0) return [0, 0, 0];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of indices) {
    r += data[i * 4];
    g += data[i * 4 + 1];
    b += data[i * 4 + 2];
  }
  const n = indices.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// Paper is the mean of the brightest 40% of pixels (above the 60th luma percentile), ink the mean of the
// darkest 5%. Those two colours are the only thing the mosaic ever learns from the document.
export function sampleInkPaper(region: RgbaImage): InkPaper {
  const { data, w, h } = region;
  const n = w * h;
  if (n === 0) return { ink: INK_FALLBACK, paper: [255, 255, 255], lowContrast: true };
  const lumas = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lumas[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  const sorted = Array.from(lumas).sort((a, b) => a - b);
  const p60 = sorted[Math.min(n - 1, Math.floor(n * 0.6))];
  const p5 = sorted[Math.min(n - 1, Math.floor(n * 0.05))];
  const bright: number[] = [];
  const dark: number[] = [];
  for (let i = 0; i < n; i++) {
    if (lumas[i] >= p60) bright.push(i);
    if (lumas[i] <= p5) dark.push(i);
  }
  const paper = meanOf(data, bright);
  let ink = meanOf(data, dark);
  const contrast = Math.abs(luma(...paper) - luma(...ink));
  const lowContrast = contrast < MIN_CONTRAST;
  if (lowContrast) ink = INK_FALLBACK;
  return { ink, paper, lowContrast };
}
