import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/args.js';
import { planOutputs, writeArtifact } from '../src/artifactOutput.js';
import { vectorOptionsFrom } from '../src/vectorOptions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'dist', 'cli.js');
const temporary: string[] = [];
vi.setConfig({ testTimeout: 60_000 });
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'sci-cli-'));
  temporary.push(path);
  return path;
}
function fixture(root: string): string {
  const path = join(root, 'source.json');
  writeFileSync(path, JSON.stringify({
    entities: [{ tag: 'SciBlock', id: 'box', x: 16, y: 16, width: 200, height: 80, label: 'Scientific labels' }],
    connections: [],
  }));
  return path;
}
function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root, encoding: 'utf8', timeout: 45000,
    env: { ...process.env, ERASER_DIAGRAMS_CONFIG: '', CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? chromium.executablePath() },
  });
}
describe('vector CLI options and output safety', () => {
  it('parses vector flags and validates physical width', async () => {
    const parsed = parseCliArgs(['render', 'source.json', '--format', 'pdf', '--profile', 'scientific', '--width', '178mm', '--lint']);
    expect(parsed.flags).toMatchObject({ format: 'pdf', profile: 'scientific', width: '178mm', lint: true });
    const options = await vectorOptionsFrom(parsed.flags);
    expect(options.svgOptions?.widthMm).toBe(178);
    expect(options.library?.manifest).toContain('SciBlock');
    await expect(vectorOptionsFrom({ width: '178' })).rejects.toThrow(/width/);
    await expect(vectorOptionsFrom({ profile: 'unknown' })).rejects.toThrow(/profile/);
    expect(await vectorOptionsFrom({})).toEqual({});
  });
  it('rejects source aliases and duplicate batch destinations', async () => {
    const root = directory();
    const source = fixture(root);
    expect(() => planOutputs([source], 'svg', root, source)).toThrow(/overwrite/);
    await symlink(source, join(root, 'alias.svg'));
    expect(() => planOutputs([source], 'svg', root, join(root, 'alias.svg'))).toThrow(/overwrite/);
    await mkdir(join(root, 'other'));
    const other = fixture(join(root, 'other'));
    expect(() => planOutputs([source, other], 'svg', root)).toThrow(/Multiple inputs/);
    expect(() => planOutputs([source, other], 'pdf', root, '-')).toThrow(/one input/);
  });
  it('atomically replaces only the requested output and removes temporary files', async () => {
    const root = directory();
    const source = fixture(root);
    const before = await readFile(source, 'utf8');
    const path = planOutputs([source], 'svg', root).get(source)!;
    await writeArtifact(path, 'first');
    await writeArtifact(path, 'second');
    expect(await readFile(path, 'utf8')).toBe('second');
    expect(await readFile(source, 'utf8')).toBe(before);
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toHaveLength(0);
  });
});

describe('built CLI with real Chromium', () => {
  it.each(['svg', 'pdf'])('renders %s using the explicit scientific profile', (format) => {
    const root = directory();
    const source = fixture(root);
    const outcome = run(root, ['render', source, '--no-config', '--profile', 'scientific', '--format', format, '--width', '178mm']);
    expect(outcome.status, String(outcome.error ?? outcome.stderr)).toBe(0);
    const bytes = readFileSync(join(root, `source.${format}`));
    if (format === 'pdf') { expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); }
    else { expect(bytes.toString()).toContain('<text'); expect(bytes.toString()).toContain('width="178mm"'); }
  });
  it('publication warnings fail closed without writing an output', () => {
    const root = directory();
    const source = fixture(root);
    const outcome = run(root, ['render', source, '--no-config', '--profile', 'scientific', '--format', 'svg', '--width', '8mm', '--lint', '--fail-on-warning', '--json']);
    expect(outcome.status, String(outcome.error ?? outcome.stderr)).toBe(1);
    expect(JSON.parse(outcome.stdout).ok).toBe(false);
    expect(existsSync(join(root, 'source.svg'))).toBe(false);
  });
  it('refuses source overwrite before launching a renderer', () => {
    const root = directory();
    const source = fixture(root);
    const before = readFileSync(source, 'utf8');
    const outcome = run(root, ['render', source, '--profile', 'scientific', '--format', 'svg', '-o', source]);
    expect(outcome.status).toBe(2);
    expect(readFileSync(source, 'utf8')).toBe(before);
  });
});
