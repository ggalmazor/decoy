import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

// The version in package.json is what the footer shows and what dist/version.json reports, so a deploy
// can be verified by asking the live site which version it is. Only deploy/release.sh moves it.
export function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

export function versionPlugin(): Plugin {
  const version = appVersion();
  return {
    name: 'decoy:version',
    config() {
      return { define: { __DECOY_VERSION__: JSON.stringify(version) } };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) + '\n' });
    },
  };
}
