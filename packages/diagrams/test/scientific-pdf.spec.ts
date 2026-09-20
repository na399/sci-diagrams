import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { chromium } from 'playwright-core';
import { createRenderer } from '../src/index.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { printVectorPdf, VectorPdfError } from '../src/vectorPdf.js';

const browserPath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
const source = {
  entities: [{ tag: 'SciBlock', id: 'block', x: 16, y: 16, width: 200, height: 80, label: 'Editable labels' }],
  connections: [],
};
const setup = {
  chromiumPath: browserPath, library: scientificLibrary, normalizers: scientificNormalizers,
  svgOptions: { widthMm: 178, title: 'Scientific PDF test' },
};

test('all outputs share the renderer while PDF keeps vector text and exact page intent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sci-pdf-'));
  const renderer = await createRenderer(setup);
  const original = structuredClone(source);
  try {
    const result = await renderer.render({ ...source, outputs: { pdf: true, svg: true, png: true, html: true, json: true } });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) { return; }
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.pdf.toString('latin1')).not.toMatch(/\/Subtype\s*\/Image\b/);
    expect(result.svg).toContain('<text');
    expect(result.svg).not.toContain('foreignObject');
    expect(result.html).toContain('eraser-scene');
    expect(result.png.subarray(0, 4)).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(result.json.entities[0]?.id).toBe('block');
    expect(source).toEqual(original);
    const pdf = join(directory, 'figure.pdf');
    await writeFile(pdf, result.pdf);
    // Poppler is a test-only prerequisite, installed in CI. Missing inspection tools fail loudly.
    const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' });
    expect(info.status, String(info.error ?? info.stderr)).toBe(0);
    expect(info.stdout).toMatch(/Pages:\s+1\b/);
    const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info.stdout);
    expect(size).not.toBeNull();
    expect(Math.abs(Number(size![1]) - 178 * 72 / 25.4)).toBeLessThan(1);
    const svgHeight = /height="([\d.]+)mm"/.exec(result.svg);
    expect(svgHeight).not.toBeNull();
    expect(Math.abs(Number(size![2]) - Number(svgHeight![1]) * 72 / 25.4)).toBeLessThan(1);
    const textPath = join(directory, 'figure.txt');
    const text = spawnSync('pdftotext', [pdf, textPath], { encoding: 'utf8' });
    expect(text.status, String(text.error ?? text.stderr)).toBe(0);
    expect(await readFile(textPath, 'utf8')).toContain('Editable labels');
    const repeated = await renderer.render({ ...source, outputs: { svg: true } });
    expect(repeated.ok).toBe(true);
    if (repeated.ok) { expect(repeated.svg).toBe(result.svg); }
  } finally { await renderer.close(); await rm(directory, { recursive: true, force: true }); }
});

test('PDF-only selection, concurrent exports and idempotent close', async () => {
  const renderer = await createRenderer(setup);
  try {
    const results = await Promise.all([1, 2].map(() => renderer.render({ ...source, outputs: { pdf: true } })));
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (result.ok) { expect(Buffer.isBuffer(result.pdf)).toBe(true); expect(Object.hasOwn(result, 'svg')).toBe(false); }
    }
  } finally { await renderer.close(); await renderer.close(); }
  await expect(renderer.render({ ...source, outputs: { png: true } })).rejects.toThrow(/closed/);
});

test('expected print failures are structured and do not poison the renderer', async () => {
  const renderer = await createRenderer({ ...setup, svgOptions: { widthMm: 1001 } });
  try {
    const failed = await renderer.render({ ...source, outputs: { pdf: true } });
    expect(failed.ok).toBe(false);
    if (!failed.ok) { expect(failed.errors[0]).toMatchObject({ code: 'E_SCHEMA', stageCode: 'E_PDF', path: '/outputs/pdf' }); }
    const next = await renderer.render({ ...source, outputs: { png: true } });
    expect(next.ok).toBe(true);
  } finally { await renderer.close(); }
});

test('print helper rejects unsafe XML without network requests or leaked pages', async ({ browser }) => {
  const context = await browser.newContext();
  let requests = 0;
  context.on('request', () => { requests += 1; });
  try {
    const bad = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><image href="https://invalid.example/a.png"/></svg>';
    await expect(printVectorPdf(() => context.newPage(), bad)).rejects.toBeInstanceOf(VectorPdfError);
    expect(context.pages()).toHaveLength(0);
    expect(requests).toBe(0);
  } finally { await context.close(); }
});
