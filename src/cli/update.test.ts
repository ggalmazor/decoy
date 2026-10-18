import { describe, expect, it } from 'vitest';
import { checkForUpdate, compareVersions, describeUpdate, type Fetch } from './update';

function registry(version: string, ok = true, status = 200): Fetch {
  return () => Promise.resolve({ ok, status, json: () => Promise.resolve({ version }) });
}

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.2.1')).toBe(-1);
  });

  it('puts a prerelease before its release', () => {
    expect(compareVersions('1.3.0-rc.1', '1.3.0')).toBe(-1);
    expect(compareVersions('1.3.0', '1.3.0-rc.1')).toBe(1);
  });
});

describe('checkForUpdate', () => {
  it('reports an update when the registry is ahead', async () => {
    const report = await checkForUpdate('1.1.0', registry('1.2.0'));
    expect(report.updateAvailable).toBe(true);
    expect(report.latest).toBe('1.2.0');
    expect(describeUpdate(report)).toContain('npm install -g @ggalmazor/decoy@latest');
  });

  it('is quiet when up to date or ahead of the registry', async () => {
    expect((await checkForUpdate('1.2.0', registry('1.2.0'))).updateAvailable).toBe(false);
    expect((await checkForUpdate('1.3.0', registry('1.2.0'))).updateAvailable).toBe(false);
  });

  it('turns a registry failure into a report, not a crash', async () => {
    const down: Fetch = () => Promise.reject(new Error('ENOTFOUND'));
    const report = await checkForUpdate('1.2.0', down);
    expect(report.latest).toBeNull();
    expect(report.updateAvailable).toBe(false);
    expect(report.error).toBe('ENOTFOUND');
    expect(describeUpdate(report)).toContain('could not reach');
    expect((await checkForUpdate('1.2.0', registry('x', false, 503))).error).toBe('registry answered 503');
  });

  it('asks the registry for exactly the latest tag of this package', async () => {
    let seen = '';
    const spy: Fetch = (url) => {
      seen = url;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: '1.0.0' }) });
    };
    await checkForUpdate('1.0.0', spy);
    expect(seen).toBe('https://registry.npmjs.org/%40ggalmazor%2Fdecoy/latest');
  });
});
