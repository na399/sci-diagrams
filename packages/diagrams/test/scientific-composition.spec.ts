import { expect, test } from '@playwright/test';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';
test('flow composition is measured, frame-safe and reentrant', async () => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers });
  try {
    const input = { entities: [
      { tag: 'SciPanel', id: 'p', x: 20, y: 20, width: 100, height: 80, label: 'Panel A', layout: { type: 'row', gap: 16 } },
      { tag: 'SciBlock', id: 'a', containerId: 'p', width: 200, height: 64, label: 'First' },
      { tag: 'SciBlock', id: 'b', containerId: 'p', width: 200, height: 64, label: 'Second' },
    ], connections: [], outputs: { svg: true, json: true } as const };
    const before = structuredClone(input); const first = await renderer.render(input);
    expect(first.ok, JSON.stringify(first)).toBe(true); if (!first.ok) { return; }
    const [panel, a, b] = first.json.entities; expect(panel!.width).toBeGreaterThan(400); expect(b!.x! - a!.x!).toBe(a!.width! + 16);
    expect(a!.layoutItem).toBe('flow'); expect(b!.layoutItem).toBe('flow'); expect(input).toEqual(before);
    const second = await renderer.render({ ...first.json, outputs: { json: true } });
    expect(second.ok, JSON.stringify(second)).toBe(true); if (second.ok) { expect(second.json.entities).toEqual(first.json.entities); }
    const failed = await renderer.render({ entities: [{ tag: 'SciBlock', id: 'a', x: 0, y: 0 }, { tag: 'SciBlock', id: 'b', x: 300, y: 0 }], connections: [{ from: 'a', to: 'b', fromPort: 'missing' }] });
    expect(failed.ok).toBe(false); if (!failed.ok) { expect(failed.errors[0]).toMatchObject({ code: 'E_SCHEMA', stageCode: 'E_UNKNOWN_PORT', path: '/connections/0/fromPort' }); }
    const recovered = await renderer.render(input); expect(recovered.ok).toBe(true);
  } finally { await renderer.close(); }
});
