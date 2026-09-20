import { describe, expect, it } from 'vitest';
import { absolutePort, portRouteMatches, resolvePortBindings, validateNamedPorts } from '../src/ports.js';
describe('named ports', () => {
  it('lowers fractional perimeter coordinates without losing their identity', () => {
    const result = resolvePortBindings([{ id: 'a', props: { ports: [{ id: 'q', x: 1, y: .25 }] } }, { id: 'b', props: {} }], [{ id: 'c', props: { from: 'a', to: 'b', fromPort: 'q', toPort: 'left' } }]);
    expect(result.get('c')).toEqual({ relativeFromPort: [1, .25], authoredFromFace: 'right', authoredToFace: 'left' });
    expect(absolutePort({ x: 10, y: 20, width: 100, height: 80 }, [1, .25])).toEqual([110, 40]);
  });
  it('rejects interior, reserved and duplicate definitions', () => {
    for (const ports of [[{ id: 'top', x: 0, y: 0 }], [{ id: 'p', x: .5, y: .5 }], [{ id: 'p', x: 0, y: Number.NaN }], [{ id: 'p', x: 1, y: .5, side: 'left' }], [{ id: 'p', x: 0, y: 1 }, { id: 'p', x: 1, y: 0 }]]) { expect(() => validateNamedPorts(ports, 'x')).toThrow(); }
  });
  it('fails on an unknown name instead of substituting a side-center', () => {
    expect(() => resolvePortBindings([{ id: 'a', props: {} }], [{ id: 'c', props: { from: 'a', to: 'a', fromPort: 'missing' } }])).toThrow('Unknown port');
  });
  it('detects stale echoed route geometry', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(portRouteMatches([[100, 25], [0, 50]], { relativeFromPort: [1, .25] }, box, box)).toBe(true);
    expect(portRouteMatches([[100, 50], [0, 50]], { relativeFromPort: [1, .25] }, box, box)).toBe(false);
  });
});
