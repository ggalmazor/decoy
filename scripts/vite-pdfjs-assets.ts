import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

// pdf.js needs its CMaps, standard fonts, ICC profiles and WASM decoders fetched at runtime. They are
// served from /pdfjs/ so the app never reaches a CDN: the dev server reads them from node_modules and the
// build copies them into dist.
export const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'iccs', 'wasm'] as const;

function pdfjsRoot(): string {
  return dirname(require.resolve('pdfjs-dist/package.json'));
}

export function pdfjsAssetsPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'decoy:pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      const root = pdfjsRoot();
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const match = /^\/pdfjs\/(cmaps|standard_fonts|iccs|wasm)\/([^/]+)$/.exec(url);
        if (!match) return next();
        const file = join(root, match[1], match[2]);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const root = pdfjsRoot();
      for (const dir of PDFJS_ASSET_DIRS) {
        const from = join(root, dir);
        if (!existsSync(from)) continue;
        const to = join(outDir, 'pdfjs', dir);
        mkdirSync(to, { recursive: true });
        cpSync(from, to, { recursive: true });
      }
    },
  };
}
