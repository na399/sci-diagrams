import { describe, expect, it } from 'vitest';
import { createResolver } from '@eraserlabs/resolve';
import { scientificLibrary, scientificNormalizers, sequenceGeometry, repeatGeometry } from '../src/scientific/index.js';
describe('scientific domain primitives', () => {
  it.each(['horizontal', 'vertical'] as const)('measures a %s sequence without mutating labels', (direction) => {
    const items = [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two\nLines' }]; const before = structuredClone(items); const result = sequenceGeometry(items, 300, 180, direction);
    expect(result.cells).toHaveLength(2); expect(result.lines).toHaveLength(3); expect(items).toEqual(before);
  });
  it('bounds sequence and stack density', () => {
    expect(() => sequenceGeometry([{ id: 'a', label: 'A' }], 10, 10)).toThrow(); expect(repeatGeometry(24, 3, 200, 120)).toHaveLength(3); expect(() => repeatGeometry(2, 3, 200, 120)).toThrow();
  });
  it('boots and resolves sequences, repeats, censoring and subrows through the real resolver', async () => {
    const resolver = await createResolver({ library: scientificLibrary, normalizers: scientificNormalizers });
    const input = { entities: [
      { tag: 'SciSequence', id: 's', x: 0, y: 0, width: 300, height: 120, items: [{ id: 'v1', label: 'Visit 1' }, { id: 'v2', label: 'Visit 2' }] },
      { tag: 'SciRepeat', id: 'r', x: 400, y: 0, width: 200, height: 120, repeatCount: 24, label: 'Blocks' },
      { tag: 'SciTimeline', id: 't', x: 0, y: 180, width: 960, start: -365, end: 90, origin: 0, unit: 'day', lanes: [{ id: 'follow', label: 'Follow-up' }], items: [{ id: 'c', lane: 'follow', kind: 'censor', start: 90, label: 'End', row: 1 }] },
    ], connections: [] };
    const before = structuredClone(input); const result = await resolver.resolve(input);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true); expect(input).toEqual(before);
    const timeline = result.entities?.find((e) => e.id === 't')?.props;
    expect(timeline?.censorMarks).toHaveLength(1); expect(timeline?.eventMarks).toHaveLength(0); expect((timeline?.marks as {labelAnchor: string}[])[0]?.labelAnchor).toBe('end');
  });
});
