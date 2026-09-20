import { expect, test } from '@playwright/test';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';
test('timeline subrows and captions remain stable on measured JSON echo', async () => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers });
  try {
    const source = { entities: [{ tag: 'SciTimeline', id: 'timeline', x: 20, y: 20, width: 960, start: -365, end: 90, origin: 0, unit: 'day', lanes: [{ id: 'baseline', label: 'Baseline' }, { id: 'follow', label: 'Follow-up' }], items: [
      { id: 'window', lane: 'baseline', kind: 'interval', start: -365, end: -60, label: 'Ascertainment', row: 1 },
      { id: 'end', lane: 'follow', kind: 'censor', start: 90, label: 'End observation' },
    ] }], connections: [], outputs: { json: true, svg: true } as const };
    const first = await renderer.render(source); expect(first.ok, JSON.stringify(first)).toBe(true); if (!first.ok) { return; }
    const second = await renderer.render({ ...first.json, outputs: { json: true, svg: true } }); expect(second.ok, JSON.stringify(second)).toBe(true);
    if (second.ok) { expect(second.json.entities).toEqual(first.json.entities); }
    expect(first.svg).toContain('Time (day)'); expect(first.svg).toContain('End observation');
  } finally { await renderer.close(); }
});
