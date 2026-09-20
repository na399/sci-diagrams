import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';
test('imported vector plot composes with native MDP panels', async ({ page }, info) => {
  const source = JSON.parse(await readFile(new URL('../../../fixtures/scientific/assets/panels.json', import.meta.url), 'utf8')); const plot = await readFile(new URL('../../../fixtures/scientific/assets/plot.svg', import.meta.url), 'utf8');
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers, svgAssets: { training: plot }, svgOptions: { widthMm: 178 } });
  try {
    const result = await renderer.render({ ...source, outputs: { svg: true, png: true, json: true } }); expect(result.ok, JSON.stringify(result)).toBe(true); if (!result.ok) { return; }
    const check = await page.evaluate(svg => { const document = new DOMParser().parseFromString(svg, 'image/svg+xml'); return { errors: document.querySelectorAll('parsererror').length, text: document.documentElement.textContent, ids: [...document.querySelectorAll('[id]')].map(node => node.id), forbidden: document.querySelectorAll('image,script,foreignObject,style').length }; }, result.svg);
    expect(check.errors).toBe(0); expect(check.forbidden).toBe(0); expect(check.text).toContain('AUROC'); expect(new Set(check.ids).size).toBe(check.ids.length); expect(result.json.entities.find(entity => entity.id === 'plot')?.asset).toBe('training');
    await info.attach('panels.svg', { body: result.svg, contentType: 'image/svg+xml' }); await info.attach('panels.png', { body: result.png, contentType: 'image/png' });
  } finally { await renderer.close(); }
});
for (const outputs of [{ png: true }, { svg: true }, { html: true }]) {
  test(`unsafe assets fail before paint for ${JSON.stringify(outputs)}`, async () => {
    const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers, svgAssets: { attack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><script>fetch("https://example.invalid/")</script></svg>' } });
    try { const result = await renderer.render({ entities: [{ tag: 'SciSvgAsset', id: 'asset', x: 0, y: 0, asset: 'attack' }], connections: [], outputs }); expect(result.ok).toBe(false); if (!result.ok) { expect(result.errors[0]).toMatchObject({ stageCode: 'E_ASSET', path: '/entities/0/asset' }); } } finally { await renderer.close(); }
  });
}
