import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';
interface Case { name: string; source: string; widthMm: number; minimumEntities: number; minimumConnections: number; requiredText: string[]; conservation?: [string, string[]][] }
const root = new URL('../../../fixtures/scientific/acceptance/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8')) as { cases: Case[] };
for (const item of manifest.cases) {
  test(`expanded scientific acceptance: ${item.name}`, async ({ page }, info) => {
    const source = JSON.parse(await readFile(new URL(item.source, root), 'utf8')); const before = structuredClone(source);
    const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers, svgOptions: { widthMm: item.widthMm, title: source.title } });
    try {
      const first = await renderer.render({ ...source, outputs: { svg: true, png: true, json: true } });
      expect(first.ok, JSON.stringify(first.ok ? first.warnings : first.errors)).toBe(true); if (!first.ok) { return; }
      expect(source).toEqual(before); expect(first.json.entities.length).toBeGreaterThanOrEqual(item.minimumEntities); expect(first.json.connections.length).toBeGreaterThanOrEqual(item.minimumConnections); expect(first.png.byteLength).toBeGreaterThan(1000);
      const analysis = await page.evaluate((svg) => {
        const xml = new DOMParser().parseFromString(svg, 'image/svg+xml'); const ids = [...xml.querySelectorAll('[id]')].map((element) => element.id);
        return { parseErrors: xml.querySelectorAll('parsererror').length, ids, text: xml.documentElement.textContent, forbidden: xml.querySelectorAll('script,foreignObject,image').length, width: xml.documentElement.getAttribute('width'),
          missing: [...xml.querySelectorAll('*')].flatMap((element) => [...element.attributes]).flatMap((attribute) => [...attribute.value.matchAll(/url\(["']?#([^"')]+)["']?\)/g)]).map((m) => m[1]).filter((id) => !ids.includes(id!)) };
      }, first.svg);
      expect(analysis.parseErrors).toBe(0); expect(analysis.forbidden).toBe(0); expect(analysis.missing).toEqual([]); expect(new Set(analysis.ids).size).toBe(analysis.ids.length); expect(analysis.width).toBe(`${item.widthMm}mm`);
      for (const text of item.requiredText) { expect(analysis.text).toContain(text); }
      const entities = new Map(source.entities.map((entity: {id: string; label: string}) => [entity.id, entity.label]));
      const count = (id: string): number => Number(/n\s*=\s*(\d+)/.exec(String(entities.get(id)))?.[1]);
      for (const [parent, children] of item.conservation ?? []) { expect(count(parent)).toBe(children.reduce((sum, id) => sum + count(id), 0)); }
      const echo = await renderer.render({ ...first.json, outputs: { svg: true, json: true } }); expect(echo.ok, JSON.stringify(echo)).toBe(true); if (echo.ok) { expect(echo.json.entities).toEqual(first.json.entities); }
      await info.attach(`${item.name}.svg`, { body: first.svg, contentType: 'image/svg+xml' }); await info.attach(`${item.name}.png`, { body: first.png, contentType: 'image/png' }); await info.attach(`${item.name}.json`, { body: JSON.stringify(first.json, null, 2), contentType: 'application/json' });
    } finally { await renderer.close(); }
  });
}
