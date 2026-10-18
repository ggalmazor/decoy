import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The command-line build: one ESM file in dist-cli/ with the core bundled in and every dependency left
// external, so `npm install -g @ggalmazor/decoy` pulls pdf.js, pdf-lib, and the Node canvas as normal
// packages. The decoy font travels with it, since the mosaic is a function of that font.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export const CLI_FONTS = ['courier-prime-latin-700-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2'];

function cliFontsPlugin(): Plugin {
  return {
    name: 'decoy:cli-fonts',
    writeBundle(options) {
      const dir = resolve(options.dir ?? 'dist-cli', 'fonts');
      mkdirSync(dir, { recursive: true });
      for (const font of CLI_FONTS) copyFileSync(resolve('design/fonts', font), resolve(dir, font));
    },
  };
}

export default defineConfig({
  define: { __DECOY_VERSION__: JSON.stringify(pkg.version) },
  publicDir: false,
  build: {
    ssr: 'src/cli/main.ts',
    outDir: 'dist-cli',
    target: 'node22',
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'decoy.mjs', format: 'es', banner: '#!/usr/bin/env node' },
    },
  },
  plugins: [cliFontsPlugin()],
});
