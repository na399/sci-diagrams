import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { serializeSvgScene } from '@eraserlabs/render';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';

const source = {
  entities: [
    { tag: 'SciBlock', id: 'a', x: 20, y: 20, width: 200, height: 90, label: 'First line\nSecond line' },
    { tag: 'SciBlock', id: 'b', x: 360, y: 20, width: 200, height: 90, label: 'Outcome' },
  ],
  connections: [{ tag: 'SciLink', id: 'ab', from: 'a', to: 'b', label: 'Data', labelWidth: 60, fromPort: 'right', toPort: 'left' }],
};

for (const name of ['dense-model', 'cohort-timeline', 'cohort-design']) {
  test(`acceptance source renders through Eraser: ${name}`, async ({ page }) => {
    const document = JSON.parse(await readFile(new URL(`../../../fixtures/scientific/${name}.json`, import.meta.url), 'utf8'));
    const original = structuredClone(document);
    const renderer = await createRenderer({
      chromiumPath: CHROMIUM_PATH,
      library: scientificLibrary,
      normalizers: scientificNormalizers,
      svgOptions: { widthMm: 178, background: 'white', title: name },
    });
    try {
      const result = await renderer.render({ ...document, outputs: { svg: true, png: true, html: true, json: true } });
      expect(result.ok, JSON.stringify(result.ok ? result.warnings : result.errors)).toBe(true);
      if (!result.ok) {
        throw new Error('Fixture did not render');
      }
      expect(result.png.length).toBeGreaterThan(100);
      expect(result.html).toContain('eraser-scene');
      expect(result.svg).toContain('width="178mm"');
      expect(result.svg).not.toMatch(/<foreignObject|<image|<script/);
      expect(document).toEqual(original);
      await page.setContent(result.svg);
      expect(await page.locator('parsererror').count()).toBe(0);
      expect(await page.locator('svg text').count()).toBeGreaterThan(5);
      const identities = await page.locator('[data-mdp-id]').evaluateAll((elements) => [...new Set(elements.map((e) => e.getAttribute('data-mdp-id')))]);
      for (const entity of document.entities as { id: string }[]) {
        expect(identities).toContain(entity.id);
      }
      const unresolved = await page.evaluate(() => {
        const root = document.querySelector('svg')!;
        const ids = new Set(Array.from(root.querySelectorAll('[id]')).map((e) => e.id));
        return Array.from(root.querySelectorAll('*')).flatMap((e) => Array.from(e.attributes)).flatMap((attribute) =>
          Array.from(attribute.value.matchAll(/url\(#([^)]*)\)/g)).map((match) => match[1]).filter((id) => !ids.has(id!)),
        );
      });
      expect(unresolved).toEqual([]);
      await test.info().attach(`${name}.svg`, { body: result.svg, contentType: 'image/svg+xml' });
      await test.info().attach(`${name}.png`, { body: result.png, contentType: 'image/png' });
    } finally {
      await renderer.close();
    }
  });
}

test('multiline text, link labels, stable IDs and source purity', async ({ page }) => {
  const renderer = await createRenderer({
    chromiumPath: CHROMIUM_PATH,
    library: scientificLibrary,
    normalizers: scientificNormalizers,
  });
  try {
    const original = structuredClone(source);
    const first = await renderer.render({ ...source, outputs: { svg: true, json: true } });
    const second = await renderer.render({ ...source, outputs: { svg: true } });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error(JSON.stringify({ first, second }));
    }
    expect(first.svg).toBe(second.svg);
    expect(source).toEqual(original);
    expect(first.json.entities[0]).not.toHaveProperty('svgWidth');
    await page.setContent(first.svg);
    await expect(page.locator('[data-mdp-id="a"] text')).toHaveText(['First line', 'Second line']);
    await expect(page.locator('[data-mdp-id="ab"] text')).toHaveText(['Data']);
    const positions = await page.locator('[data-mdp-id="a"] text').evaluateAll((nodes) => nodes.map((n) => [n.getAttribute('x'), n.getAttribute('y')]));
    expect(positions.every(([x, y]) => x !== '' && y !== '')).toBe(true);
  } finally {
    await renderer.close();
  }
});

test('timeline paints one event and two endpoints per interval', async ({ page }) => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers });
  try {
    const document = JSON.parse(await readFile(new URL('../../../fixtures/scientific/cohort-timeline.json', import.meta.url), 'utf8'));
    const result = await renderer.render({ ...document, outputs: { svg: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(JSON.stringify(result.errors));
    }
    await page.setContent(result.svg);
    await expect(page.locator('[data-mdp-id="timeline"] circle')).toHaveCount(9);
    await expect(page.locator('[data-mdp-id="timeline"] text').filter({ hasText: 'Index event' })).toHaveCount(1);
  } finally {
    await renderer.close();
  }
});

test('stock PNG remains supported and unsupported stock HTML fails SVG explicitly', async () => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH });
  try {
    const document = { entities: [{ tag: 'Shape', id: 'stock', x: 0, y: 0, texts: [{ text: 'Stock shape' }] }], connections: [] };
    const png = await renderer.render({ ...document, outputs: { png: true } });
    expect(png.ok).toBe(true);
    const svg = await renderer.render({ ...document, outputs: { svg: true } });
    expect(svg.ok).toBe(false);
    if (!svg.ok) {
      expect(svg.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_SVG_UNSUPPORTED', elementId: 'stock', path: '/entities/0' })]));
    }
  } finally {
    await renderer.close();
  }
});

const appliedScene = `<style>body{margin:0}svg{display:block}</style>
<div id="eraser-scene" style="position:relative;width:300px;height:120px">
<div data-mdp-id="box" data-mdp-tag="VectorBox" style="position:absolute;left:10px;top:10px">
<svg width="280" height="100" viewBox="0 0 280 100">
<defs><linearGradient id="paint"><stop offset="0" stop-color="#eeeeee"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
<rect x="1" y="1" width="278" height="98" fill="url(#paint)" stroke="#333333"/>
<text x="140" y="55" text-anchor="middle" font-size="18" font-family="sans-serif">Scientific SVG</text>
</svg></div></div>`;

test('export preserves an applied scene pixel-for-pixel', async ({ page }) => {
  await page.setContent(appliedScene);
  const original = await page.locator('#eraser-scene').screenshot();
  const result = await page.evaluate(serializeSvgScene, {});
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${result.svg}`);
  const exported = await page.locator('body > svg').screenshot();
  expect(exported).toEqual(original);
});

for (const [name, fragment] of [
  ['HTML paint', '<span>Unsupported text</span>'],
  ['raster image', '<svg width="40" height="40"><image href="https://example.invalid/image.png"/></svg>'],
  ['foreignObject', '<svg width="40" height="40"><foreignObject width="30" height="30"><div>HTML</div></foreignObject></svg>'],
  ['external use', '<svg width="40" height="40"><use href="https://example.invalid/asset.svg#x"/></svg>'],
  ['unresolved use', '<svg width="40" height="40"><use href="#missing"/></svg>'],
]) {
  test(`strict export rejects ${name}`, async ({ page }) => {
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<div id="eraser-scene" style="width:300px;height:200px"><div data-mdp-id="bad">${fragment}</div></div>`, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(serializeSvgScene, {});
    expect(result.ok).toBe(false);
  });
}

test('output sizing produces physical font warnings and rejects invalid options', async ({ page }) => {
  await page.setContent(appliedScene);
  const small = await page.evaluate(serializeSvgScene, { widthMm: 20 });
  expect(small.ok).toBe(true);
  expect(small.warnings.some((w) => w.code === 'W_SVG_FONT_SIZE')).toBe(true);
  expect((await page.evaluate(serializeSvgScene, { widthMm: -1 })).ok).toBe(false);
});
