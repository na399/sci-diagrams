import { describe, expect, it } from 'vitest';
import { annotationGeometry } from '../src/scientific/primitives.js';
import { createScientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
describe('scientific annotations', () => {
  for (const kind of ['dimension', 'brace', 'bracket', 'divider'] as const) {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      it(`${kind} ${orientation} emits finite rigid geometry`, () => {
        const result = annotationGeometry(kind, 200, 100, orientation);
        expect(result.path).toMatch(/^M/); expect(result.path).not.toContain('NaN');
        expect(result.rotation).toBe(orientation === 'vertical' ? -90 : 0);
      });
    }
  }
  it('rejects undersized annotations instead of clipping them', () => { expect(() => annotationGeometry('brace', 30, 20)).toThrow('at least'); });
  it('does not mutate one library when another is customized', () => {
    const a = createScientificLibrary(); const b = createScientificLibrary();
    a.templates[0]!.html = 'changed'; expect(b.templates[0]!.html).not.toBe('changed');
  });
  it('provides normalizers for every dispatched tag', () => {
    for (const tag of createScientificLibrary().manifest) { expect(typeof scientificNormalizers[tag]).toBe('function'); }
  });
});
