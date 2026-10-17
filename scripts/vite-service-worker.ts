import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { appVersion } from './vite-version.ts';

// Writes dist/sw.js after the build with the exact list of files Vite emitted. The app shell (HTML, JS,
// CSS, fonts, the pdf.js worker) is precached so the page works with the network off once it has loaded;
// the pdf.js CMaps and standard fonts are cached on first use instead, because 2.5 MB of CJK tables is
// not something every visitor needs.
export function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'decoy:service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            if (relative(outDir, full) === 'pdfjs') continue;
            walk(full);
          } else {
            files.push('/' + relative(outDir, full).split('\\').join('/'));
          }
        }
      };
      walk(outDir);
      const shell = files.filter((f) => f !== '/sw.js' && f !== '/CNAME' && f !== '/version.json');
      const version = appVersion();
      const source = SW_TEMPLATE.replace(
        '__SHELL__',
        JSON.stringify(shell.map((f) => (f === '/index.html' ? '/' : f))),
      ).replace('__VERSION__', JSON.stringify(version));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

const SW_TEMPLATE = `/* DECOY service worker. Generated at build time; see scripts/vite-service-worker.ts. */
const VERSION = __VERSION__;
const SHELL = __SHELL__;
const SHELL_CACHE = 'decoy-shell-' + VERSION;
const RUNTIME_CACHE = 'decoy-runtime';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('decoy-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.pathname.startsWith('/pdfjs/')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          const network = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          return hit || network;
        }),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith('/assets/')) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
`;
