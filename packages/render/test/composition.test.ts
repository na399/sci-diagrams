import { describe, expect, it } from 'vitest';
import { composeLayout, type CompositionNode } from '../src/composition.js';
const row = (): CompositionNode[] => [
  { id: 'g', x: 10, y: 20, width: 1, height: 1, layout: { type: 'row', gap: 20, padding: 10, header: 30 } },
  { id: 'a', containerId: 'g', width: 100, height: 40 }, { id: 'b', containerId: 'g', width: 80, height: 60 },
];
describe('measured composition', () => {
  it('uses measured sizes and never mutates input', () => {
    const source = row(); const before = structuredClone(source); const output = composeLayout(source);
    expect(output.boxes.a).toEqual({ x: 20, y: 60, width: 100, height: 40 }); expect(output.boxes.b?.x).toBe(140); expect(output.boxes.g?.width).toBe(220); expect(source).toEqual(before);
  });
  it.each(['row', 'column', 'grid', 'stack', 'overlay'] as const)('supports %s and stable position ownership', (type) => {
    const source = row(); source[0]!.layout = { type, columns: 2 }; const first = composeLayout(source); const flow = new Set(first.flowIds);
    const echo = source.map((node) => ({ ...node, ...first.boxes[node.id], ...(flow.has(node.id) ? { layoutItem: 'flow' as const } : {}) })); expect(composeLayout(echo)).toEqual(first);
  });
  it('keeps explicitly pinned objects out of automatic cells', () => {
    const source = row(); source.push({ id: 'pinned', containerId: 'g', x: 400, y: 100, width: 60, height: 50 }); const output = composeLayout(source);
    expect(output.boxes.pinned?.x).toBe(400); expect(output.boxes.a?.x).toBe(20);
  });
  it('rejects cycles and ambiguous partial coordinates', () => {
    const source = row(); source[1]!.x = 10; expect(() => composeLayout(source)).toThrow('both');
    expect(() => composeLayout([{ id: 'a', containerId: 'b', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', containerId: 'a', x: 0, y: 0, width: 10, height: 10 }])).toThrow('cycle');
    expect(() => composeLayout([{ id: 'orphan', width: 10, height: 10 }])).toThrow('parent');
  });
  it('rejects invalid spacing and column counts', () => {
    const source = row(); source[0]!.layout = { type: 'grid', columns: 1.5 }; expect(() => composeLayout(source)).toThrow('integer'); source[0]!.layout = { type: 'row', gap: -1 }; expect(() => composeLayout(source)).toThrow('finite');
  });
});
