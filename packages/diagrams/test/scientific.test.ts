import { describe, expect, it } from 'vitest';
import { createResolver, NormalizationError, type AuthoredLibrary } from '@eraserlabs/resolve';
import { arrange, createScientificLibrary, linearPosition, scientificLibrary, scientificNormalizers, timelineGeometry, type TimelineInput } from '../src/scientific/index.js';
const input = (): TimelineInput => ({ start: -365, end: 90, width: 960, origin: 0,
  lanes: [{ id: 'baseline', label: 'Baseline' }],
  items: [{ id: 'window', lane: 'baseline', kind: 'interval', start: -365, end: -60, label: 'Ascertainment' }],
  ticks: [-365, -180, -60, 0, 90] });
async function resolver(library: AuthoredLibrary = scientificLibrary) { return createResolver({ library, normalizers: scientificNormalizers }); }
describe('scientific MDP profile', () => {
  it('boots through the real schema and template validators', async () => {
    const r = await resolver();
    const tags = r.registryInfo().tags.map((entry) => entry.tag);
    expect(tags).toEqual(expect.arrayContaining(['SciBlock', 'SciGroup', 'SciText', 'SciOperator', 'SciTensor', 'SciMatrix', 'SciDimension', 'SciBrace', 'SciTimeline', 'SciLink', 'SciBracket', 'SciCallout', 'SciPanel', 'SciLeader']));
    expect(new Set(tags).size).toBe(tags.length);
    expect(r.registryInfo().defaultConnectionTag).toBe('SciLink');
    for (const theme of ['publication', 'web'] as const) {
      const themed = await resolver(createScientificLibrary(theme));
      expect(themed.registryInfo().tags.map((entry) => entry.tag)).toEqual(tags);
    }
  });
  it('resolves non-timeline components without mutating authored data', async () => {
    const entities = ['SciBlock', 'SciGroup', 'SciText', 'SciOperator', 'SciTensor', 'SciMatrix', 'SciDimension', 'SciBrace', 'SciBracket', 'SciCallout', 'SciPanel'].map((tag, i) => ({ tag, id: `entity-${i}`, x: 20 + i * 240, y: 20, width: 200, height: 180, label: 'Example\nSecond line' }));
    const source = { entities, connections: [{ from: 'entity-0', to: 'entity-1', label: 'Data flow' }] };
    const before = structuredClone(source); const result = await (await resolver()).resolve(source);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true); expect(source).toEqual(before);
    expect(result.entities?.[0]?.props.svgWidth).toBe(200); expect(result.connections?.[0]?.tag).toBe('SciLink');
    expect(result.authored?.[0]?.source).toEqual(source.entities[0]); expect(result.authored?.[0]?.source).not.toHaveProperty('svgWidth');
  });
  it('sanitizes labels before template interpolation', async () => {
    const result = await (await resolver()).resolve({ entities: [{ tag: 'SciBlock', id: 'a', x: 0, y: 0, label: '<script>bad()</script> & study' }], connections: [] });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect((result.entities?.[0]?.props.lines as { text: string }[])[0]?.text).not.toContain('<script>');
  });
  it('validates a quantitative timeline', async () => {
    const source = { entities: [{ tag: 'SciTimeline', id: 'time', x: 0, y: 0, ...input() }], connections: [] };
    const before = structuredClone(source); const result = await (await resolver()).resolve(source);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true); expect(source).toEqual(before);
    expect(result.entities?.[0]?.props.hasOrigin).toBe(true); expect(result.entities?.[0]?.props.marks).toHaveLength(1);
  });
  it.each([{ start: 90, end: -365 }, { items: [{ id: 'w', lane: 'missing', kind: 'event', start: 0, label: 'Index' }] }, { items: [{ id: 'w', lane: 'baseline', kind: 'interval', start: 0, end: -10, label: 'Bad' }] }, { items: [{ id: 'w', lane: 'baseline', kind: 'event', start: 500, label: 'Outside' }] }, { lanes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }])('returns structured cross-field errors for %j', async (override) => {
    const result = await (await resolver()).validate({ entities: [{ tag: 'SciTimeline', id: 't', x: 0, y: 0, ...input(), ...override }], connections: [] });
    expect(result.ok).toBe(false); expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'E_SCHEMA', path: '/entities/0' })]));
  });
  it('does not run a normalizer on missing required input', async () => {
    const result = await (await resolver()).validate({ entities: [{ tag: 'SciTimeline', id: 't', x: 0, y: 0 }], connections: [] });
    expect(result.ok).toBe(false); expect(result.errors.some((e) => e.code === 'E_SCHEMA')).toBe(true);
  });
  it('does not hide programming errors in trusted normalizers', async () => {
    const r = await createResolver({ library: scientificLibrary, normalizers: { SciBlock: () => { throw new TypeError('Programming bug'); } } });
    await expect(r.validate({ entities: [{ tag: 'SciBlock', id: 'a', x: 0, y: 0 }], connections: [] })).rejects.toThrow('Programming bug');
  });
  it('qualifies expected normalizer errors in the elements envelope', async () => {
    const r = await createResolver({ library: scientificLibrary, normalizers: { SciBlock: () => { throw new NormalizationError('Invalid relationship', '/label'); } } });
    const result = await r.validate({ elements: [{ tag: 'SciBlock', id: 'a', x: 0, y: 0 }] }); expect(result.errors[0]?.path).toBe('/elements/0/label');
  });
});
describe('scientific geometry', () => {
  it('maps numeric coordinates proportionally', () => {
    expect(linearPosition(0, -100, 100, 20, 220)).toBe(120); expect(linearPosition(-100, -100, 100, 20, 220)).toBe(20); expect(linearPosition(100, -100, 100, 20, 220)).toBe(220);
    expect(() => linearPosition(101, -100, 100, 20, 220)).toThrow(RangeError); expect(() => linearPosition(0, 0, 0, 20, 220)).toThrow(RangeError); expect(() => linearPosition(Number.NaN, 0, 100, 20, 220)).toThrow(RangeError);
  });
  it('preserves time positions and explicit endpoint closure', () => {
    const source = input(); const before = structuredClone(source); const result = timelineGeometry(source); const mark = result.marks[0]!;
    expect(mark.x).toBe(result.left); expect(mark.endX).toBeCloseTo(linearPosition(-60, -365, 90, result.left, result.right)); expect(mark.startFill).toBe('currentColor'); expect(mark.endFill).toBe('white'); expect(result.originX).toBeCloseTo(linearPosition(0, -365, 90, result.left, result.right)); expect(source).toEqual(before);
  });
  it.each(['left', 'right', 'both', 'neither'] as const)('renders %s-closed interval endpoints', (closed) => {
    const source = input(); source.items = [{ ...source.items[0]!, closed }]; const mark = timelineGeometry(source).marks[0]!;
    expect(mark.startFill === 'currentColor').toBe(closed === 'left' || closed === 'both'); expect(mark.endFill === 'currentColor').toBe(closed === 'right' || closed === 'both');
  });
  it('arranges cloned entities without losing metadata', () => {
    const source = [{ id: 'a', width: 100, height: 40, label: 'A', metadata: { note: 'source' } }, { id: 'b', width: 80, height: 60, label: 'B', metadata: { note: 'source' } }];
    const output = arrange(source, { type: 'row', x: 10, y: 20, gap: 15, align: 'center' }); expect(output.map((e) => [e.x, e.y])).toEqual([[10, 30], [125, 20]]); expect(source[0]).not.toHaveProperty('x'); output[0]!.metadata.note = 'edited'; expect(source[0]!.metadata.note).toBe('source');
  });
  it('handles grid sizing and refuses ambiguous authored positions', () => {
    const source = Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, width: 100, height: 40 })); const result = arrange(source, { type: 'grid', columns: 2, x: 10, y: 20, gap: 10 }); expect(result.map((e) => [e.x, e.y])).toEqual([[10, 20], [120, 20], [10, 70], [120, 70]]);
    expect(() => arrange([{ id: 'a', width: 100, height: 40, x: 0 }], { type: 'row', x: 0, y: 0 })).toThrow('overwrite'); expect(() => arrange(source, { type: 'grid', columns: 0, x: 0, y: 0 })).toThrow(RangeError); expect(() => arrange([source[0]!, source[0]!], { type: 'row', x: 0, y: 0 })).toThrow('unique');
  });
});
