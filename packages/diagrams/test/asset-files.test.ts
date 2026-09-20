import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSvgAssetFiles } from '../src/assetFiles.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'sci-assets-'));
  temporary.push(root);
  const directory = join(root, 'assets');
  await mkdir(directory);
  const path = join(directory, 'registry.json');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';
  await writeFile(join(directory, 'plot.svg'), svg);
  await writeFile(join(root, 'outside.svg'), svg);
  return { root, directory, path, svg, put: (value: unknown) => writeFile(path, JSON.stringify(value)) };
}
describe('local SVG registries', () => {
  it('loads named local files without modifying content', async () => {
    const s = await setup();
    await s.put({ plot: 'plot.svg' });
    const registry = await loadSvgAssetFiles(s.path);
    expect(registry.plot).toBe(s.svg);
    expect(Object.getPrototypeOf(registry)).toBeNull();
  });
  it.each([
    [], null, 2, 'bad', { plot: 42 }, { plot: 'https://example.org/a.svg' },
    { plot: '/etc/passwd' }, { plot: '../outside.svg' }, { plot: '..\\outside.svg' },
    { constructor: 'plot.svg' }, { plot: 'missing.svg' }, JSON.parse('{"__proto__":"plot.svg"}'),
  ])('rejects malformed or escaping registry %#', async (input) => {
    const s = await setup();
    await s.put(input);
    await expect(loadSvgAssetFiles(s.path)).rejects.toThrow();
  });
  it('rejects symlink escapes, oversized files, invalid UTF-8 and excessive entries', async () => {
    const s = await setup();
    await symlink(join(s.root, 'outside.svg'), join(s.directory, 'escape.svg'));
    await s.put({ plot: 'escape.svg' });
    await expect(loadSvgAssetFiles(s.path)).rejects.toThrow(/outside/);
    await writeFile(join(s.directory, 'huge.svg'), Buffer.alloc(5 * 1024 * 1024 + 1));
    await s.put({ plot: 'huge.svg' });
    await expect(loadSvgAssetFiles(s.path)).rejects.toThrow(/larger/);
    await writeFile(join(s.directory, 'invalid.svg'), Buffer.from([0xff]));
    await s.put({ plot: 'invalid.svg' });
    await expect(loadSvgAssetFiles(s.path)).rejects.toThrow();
    await s.put(Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`asset${i}`, 'plot.svg'])));
    await expect(loadSvgAssetFiles(s.path)).rejects.toThrow(/128/);
  });
});
