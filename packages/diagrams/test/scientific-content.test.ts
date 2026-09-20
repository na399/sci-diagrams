import { expect, it } from 'vitest';
import { createResolver } from '@eraserlabs/resolve';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';

it('keeps derived timeline views independent during sanitization', async () => {
  const source = {
    entities: [{
      tag: 'SciTimeline', id: 'timeline', x: 0, y: 0, width: 900,
      start: -10, end: 10,
      lanes: [{ id: 'a', label: 'A' }],
      items: [
        { id: 'interval', lane: 'a', kind: 'interval', start: -8, end: 0, label: 'A & B' },
        { id: 'event', lane: 'a', kind: 'event', start: 5, label: 'C < D' },
      ],
    }],
    connections: [],
  };
  const resolver = await createResolver({ library: scientificLibrary, normalizers: scientificNormalizers });
  const result = await resolver.resolve(source);
  expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  const props = result.entities?.[0]?.props;
  const marks = props?.marks as { label: string }[];
  const intervals = props?.intervalMarks as { label: string }[];
  const events = props?.eventMarks as { label: string }[];
  expect(marks[0]?.label).toBe('A &amp; B');
  expect(intervals[0]?.label).toBe(marks[0]?.label);
  expect(events[0]?.label).toBe(marks[1]?.label);
  expect(source.entities[0]?.items[0]?.label).toBe('A & B');
});

it('does not collapse different connection IDs into one arrowhead resource', async () => {
  const resolver = await createResolver({ library: scientificLibrary, normalizers: scientificNormalizers });
  const result = await resolver.resolve({
    entities: [
      { tag: 'SciBlock', id: 'a', x: 0, y: 0 },
      { tag: 'SciBlock', id: 'b', x: 400, y: 0 },
    ],
    connections: [
      { tag: 'SciLink', id: 'a-b', from: 'a', to: 'b', stroke: '#224488' },
      { tag: 'SciLink', id: 'a b', from: 'a', to: 'b', stroke: '#882244' },
    ],
  });
  expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  const ids = result.connections?.map((connection) => connection.props.markerId) ?? [];
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) {
    expect(id).toMatch(/^sci-arrow-[a-f0-9-]+$/);
  }
});
