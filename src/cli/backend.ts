import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setCanvasFactory } from '../render/backend';

const FONTS = [
  { file: 'courier-prime-latin-700-normal.woff2', family: 'Courier Prime' },
  { file: 'ibm-plex-mono-latin-600-normal.woff2', family: 'IBM Plex Mono' },
] as const;

// The built CLI carries the fonts in dist-cli/fonts; run from source (tests) they are the design kit's.
function fontPath(file: string): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['fonts', '../../design/fonts']) {
    const candidate = join(here, rel, file);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

let ready = false;

// Points the shared text rasteriser at a Node canvas with the same fonts the site serves, so a mosaic
// built here is the mosaic the browser would build for the same decoy and box.
export function setupNodeCanvas(): void {
  if (ready) return;
  for (const font of FONTS) {
    const path = fontPath(font.file);
    if (!path) throw new Error(`The font ${font.file} is missing next to the CLI; reinstall the package.`);
    GlobalFonts.registerFromPath(path, font.family);
  }
  setCanvasFactory((w, h) => createCanvas(w, h).getContext('2d'));
  ready = true;
}
