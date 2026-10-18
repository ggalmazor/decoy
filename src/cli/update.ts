export const PACKAGE_NAME = '@ggalmazor/decoy';
export const REGISTRY = 'https://registry.npmjs.org';

export interface UpdateReport {
  readonly package: string;
  readonly installed: string;
  readonly latest: string | null;
  readonly updateAvailable: boolean;
  readonly command: string;
  readonly registry: string;
  readonly error?: string;
}

function parts(version: string): { numbers: number[]; prerelease: string | null } {
  const [core, prerelease = null] = version.replace(/^v/, '').split('-', 2);
  return { numbers: core.split('.').map((n) => Number(n) || 0), prerelease };
}

// Numeric semver order; a prerelease sorts before the release it precedes.
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa.numbers[i] ?? 0) - (pb.numbers[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;
  return 0;
}

export type Fetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

// The one network request in the whole product, and it runs only when asked: one GET to the npm
// registry for the latest version of this package. Nothing about the user or their files goes with it.
export async function checkForUpdate(
  installed: string,
  fetchImpl: Fetch = fetch,
  timeoutMs = 8000,
): Promise<UpdateReport> {
  const base = {
    package: PACKAGE_NAME,
    installed,
    command: `npm install -g ${PACKAGE_NAME}@latest`,
    registry: REGISTRY,
  };
  try {
    const res = await fetchImpl(`${REGISTRY}/${encodeURIComponent(PACKAGE_NAME)}/latest`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ...base, latest: null, updateAvailable: false, error: `registry answered ${res.status}` };
    }
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== 'string') {
      return { ...base, latest: null, updateAvailable: false, error: 'registry answer had no version' };
    }
    return { ...base, latest: body.version, updateAvailable: compareVersions(body.version, installed) > 0 };
  } catch (error) {
    return { ...base, latest: null, updateAvailable: false, error: (error as Error).message };
  }
}

export function describeUpdate(report: UpdateReport): string {
  if (report.error)
    return `${report.package} ${report.installed} installed; could not reach ${report.registry}: ${report.error}`;
  if (report.updateAvailable)
    return `${report.package} ${report.installed} installed, ${report.latest} available. Update with: ${report.command}`;
  return `${report.package} ${report.installed} is the latest version.`;
}
