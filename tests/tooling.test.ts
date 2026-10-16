import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireEngine, dependencyDigest, inspectInstallation, releaseMetadata, resolveRelease, sha256, verifyCachedEngine, withInstallationLock } from '../src/tooling.js';

const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const release = { version: '0.19.0', integrity };
const metadata = { name: '@microsoft/vally-cli', version: release.version, dist: { integrity } };
const directories: string[] = [];
async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evals-tooling-')); directories.push(path); return path;
}
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });

async function fixture(root: string, selected = release): Promise<void> {
  const path = join(root, 'node_modules', '@microsoft', 'vally-cli');
  await mkdir(join(path, 'dist'), { recursive: true });
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: metadata.name, version: selected.version, bin: { vally: 'dist/index.js' } }));
  await writeFile(join(path, 'dist', 'index.js'), '// Synthetic fixture. Never executes Vally.');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({
    packages: {
      '': { name: 'evals-action-toolchain' },
      'node_modules/@microsoft/vally-cli': { ...selected, resolved: `https://registry.npmjs.org/@microsoft/vally-cli/-/vally-cli-${selected.version}.tgz` },
    },
  }));
}

describe('isolated engine acquisition primitives', () => {
  it('resolves latest stable once per job and keeps exact pins separate', async () => {
    const root = await temporary();
    const fetcher = vi.fn(async () => metadata);
    expect(await resolveRelease('latest', root, fetcher)).toEqual(release);
    expect(await resolveRelease('latest', root, fetcher)).toEqual(release);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await resolveRelease('0.19.0', root, fetcher)).toEqual(release);
    expect(await resolveRelease('0.18.0', root, async () => ({ ...metadata, version: '0.18.0' }))).toEqual({ ...release, version: '0.18.0' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects unsupported, drifting, prerelease and integrity-free registry metadata', () => {
    for (const value of [
      { ...metadata, version: '0.20.0' }, { ...metadata, version: '0.19.0-beta' },
      { ...metadata, name: 'other' }, { ...metadata, dist: { integrity: 'sha1-unsafe' } },
    ]) expect(() => releaseMetadata(value, '0.19.0')).toThrow();
  });
  it('does not downgrade on registry failure or quietly replace corrupt snapshots', async () => {
    const root = await temporary();
    await expect(resolveRelease('^1.0.0', root)).rejects.toThrow(/version/);
    await expect(resolveRelease('latest', root, async () => { throw new Error('registry unavailable'); })).rejects.toThrow(/unavailable/);
    await writeFile(join(root, 'resolution-latest.json'), '{bad');
    await expect(resolveRelease('latest', root, async () => metadata)).rejects.toThrow();
  });
  it('handles concurrent latest requests through a single persisted winner', async () => {
    const root = await temporary();
    const fetcher = vi.fn(async () => metadata);
    const results = await Promise.all([
      resolveRelease('latest', root, fetcher),
      resolveRelease('latest', root, fetcher),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('validates the complete dependency graph and detects stale cached files', async () => {
    const root = await temporary();
    await fixture(root);
    const identity = await inspectInstallation(root, release);
    expect(identity.sha256).toHaveLength(64);
    expect(identity.dependencySha256).toHaveLength(64);
    expect(await verifyCachedEngine(root, identity)).toEqual(identity);
    await writeFile(join(root, 'node_modules', 'changed.txt'), 'tampered');
    await expect(verifyCachedEngine(root, identity)).rejects.toThrow(/changed/);
    await expect(inspectInstallation(root, { ...release, version: '0.18.0' })).rejects.toThrow(/mismatch/);
    await expect(inspectInstallation(root, { ...release, integrity: 'different' })).rejects.toThrow(/mismatch/);
  });
  it('rejects changed package layout and non-registry dependencies', async () => {
    const root = await temporary(); await fixture(root);
    const manifest = join(root, 'node_modules', '@microsoft', 'vally-cli', 'package.json');
    await writeFile(manifest, JSON.stringify({ name: metadata.name, version: release.version, bin: { vally: '../escape.js' } }));
    await expect(inspectInstallation(root, release)).rejects.toThrow(/layout/);
    await fixture(root);
    const lockPath = join(root, 'package-lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { packages: Record<string, unknown> };
    lock.packages['node_modules/unsafe'] = { resolved: 'file:../../outside', integrity };
    await writeFile(lockPath, JSON.stringify(lock));
    await expect(inspectInstallation(root, release)).rejects.toThrow(/Non-registry/);
  });
  it('rejects dependency symlink escape and hashes internal links', async () => {
    const root = await temporary();
    const outside = await temporary();
    await mkdir(join(root, 'internal'));
    await symlink(join(root, 'internal'), join(root, 'internal-link'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await dependencyDigest(root)).toHaveLength(64);
    await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(dependencyDigest(root)).rejects.toThrow(/escapes/);
  });
  it('uses exact isolated installation with no lifecycle scripts or inherited credentials', async () => {
    const root = await temporary();
    const install = vi.fn(async (args: string[], cwd: string, env: NodeJS.ProcessEnv) => {
      expect(args).toContain('--ignore-scripts');
      expect(args).toContain('--userconfig');
      expect(args).toContain('--globalconfig');
      expect(args).toContain('https://registry.npmjs.org');
      expect(env).not.toHaveProperty('GITHUB_TOKEN');
      expect(env).not.toHaveProperty('COPILOT_GITHUB_TOKEN');
      const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
      expect(manifest.dependencies).toEqual({ '@microsoft/vally-cli': '0.19.0' });
      await fixture(cwd);
    });
    expect(await acquireEngine(release, root, install)).toMatchObject(release);
    expect(install).toHaveBeenCalledTimes(1);
    expect(await acquireEngine(release, root, install)).toMatchObject(release);
    expect(install).toHaveBeenCalledTimes(1);
    await expect(acquireEngine(release, await temporary(), async () => { throw new Error('install failed'); })).rejects.toThrow(/install failed/);
  });
  it('serializes concurrent installation and publishes only a complete coherent graph', async () => {
    const root = await temporary();
    const install = vi.fn(async (_args: string[], cwd: string) => { await fixture(cwd); });
    const [first, second] = await Promise.all([acquireEngine(release, root, install), acquireEngine(release, root, install)]);
    expect(first).toEqual(second);
    expect(install).toHaveBeenCalledTimes(1);
    expect(first.lockSha256).toHaveLength(64);
    await writeFile(join(first.entry, '..', 'changed.js'), 'stale');
    await expect(acquireEngine(release, root, install)).rejects.toThrow(/changed/);
    expect(install).toHaveBeenCalledTimes(1);
  });
  it('separates exact installed versions and never reuses changed lockfiles', async () => {
    const root = await temporary();
    const install = vi.fn(async (_args: string[], cwd: string) => {
      const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
      await fixture(cwd, { ...release, version: manifest.dependencies['@microsoft/vally-cli']! });
    });
    const first = await acquireEngine(release, root, install);
    const olderRelease = { ...release, version: '0.18.0' };
    const second = await acquireEngine(olderRelease, root, install);
    expect(second.entry).not.toBe(first.entry);
    expect(second.version).toBe('0.18.0');
    expect(await acquireEngine(olderRelease, root, install)).toEqual(second);
    expect(install).toHaveBeenCalledTimes(2);
    const lock = join(first.entry, '..', '..', '..', '..', '..', 'package-lock.json');
    await writeFile(lock, `${await readFile(lock, 'utf8')}\n`);
    await expect(acquireEngine(release, root, install)).rejects.toThrow(/changed/);
  });
  it('refuses corrupt and escaping cache receipts', async () => {
    const root = await temporary();
    const key = sha256(JSON.stringify([release, process.platform, process.arch, process.version]));
    await writeFile(join(root, `${key}.json`), JSON.stringify({ directory: '../escape', engine: release }));
    await expect(acquireEngine(release, root)).rejects.toThrow(/receipt/);
  });
  it('does not steal a stale installation lock, and releases its own on failure', async () => {
    const root = await temporary();
    const key = 'a'.repeat(64);
    await mkdir(join(root, `${key}.lock`));
    await expect(withInstallationLock(root, key, async () => 1, 1)).rejects.toThrow(/timed out/);
    await expect(withInstallationLock(root, '../escape', async () => 1)).rejects.toThrow(/key/);
    const other = 'b'.repeat(64);
    await expect(withInstallationLock(root, other, async () => { throw new Error('failure'); })).rejects.toThrow(/failure/);
    expect(await withInstallationLock(root, other, async () => 2)).toBe(2);
  });
});
