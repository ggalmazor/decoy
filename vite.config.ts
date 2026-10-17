import { defineConfig } from 'vite';
import { cspPlugin } from './scripts/vite-csp.ts';
import { pdfjsAssetsPlugin } from './scripts/vite-pdfjs-assets.ts';
import { serviceWorkerPlugin } from './scripts/vite-service-worker.ts';
import { versionPlugin } from './scripts/vite-version.ts';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  plugins: [pdfjsAssetsPlugin(), versionPlugin(), cspPlugin(), serviceWorkerPlugin()],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
