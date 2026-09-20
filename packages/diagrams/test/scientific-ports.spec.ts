import { expect, test } from '@playwright/test';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';

test('named ports retain exact terminals through the real router and measured JSON echo', async () => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers });
  try {
    const input = { entities: [
      { tag: 'SciBlock', id: 'a', x: 20, y: 40, width: 120, height: 120, label: 'Source', ports: [{ id: 'signal', x: 1, y: .25 }] },
      { tag: 'SciBlock', id: 'b', x: 340, y: 40, width: 120, height: 120, label: 'Target', ports: [{ id: 'input', x: 0, y: .75 }] },
    ], connections: [{ id: 'signal', from: 'a', to: 'b', fromPort: 'signal', toPort: 'input' }], outputs: { json: true, svg: true } as const };
    const before = structuredClone(input); const result = await renderer.render(input);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) { return; }
    const edge = result.json.connections[0]!; const points = edge.points as { x: number; y: number }[];
    expect(edge.x).toBe(140); expect(edge.y).toBe(70);
    expect((edge.x as number) + points.at(-1)!.x).toBe(340); expect((edge.y as number) + points.at(-1)!.y).toBe(130);
    expect(edge.fromPort).toBe('signal'); expect(edge.toPort).toBe('input'); expect(input).toEqual(before);
    const echo = await renderer.render({ ...result.json, outputs: { json: true } });
    expect(echo.ok, JSON.stringify(echo)).toBe(true);
    if (echo.ok) { expect(echo.json.connections[0]!.points).toEqual(points); }
  } finally { await renderer.close(); }
});
