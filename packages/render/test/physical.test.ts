import { expect, it } from 'vitest';
import { parsePhysicalLength, toMillimeters } from '../src/physical.js';
it('converts CSS absolute units independently of monitor DPI', () => {
  for (const value of ['1in', '72pt', '96px', '2.54cm', '25.4mm']) {
    expect(toMillimeters(parsePhysicalLength(value))).toBeCloseTo(25.4);
  }
});
it('rejects ambiguous and invalid lengths', () => {
  for (const value of ['178', '0mm', '-1in', '1e99mm', '1mm;display:none']) { expect(() => parsePhysicalLength(value)).toThrow(); }
});
