export interface PhysicalLength { value: number; unit: 'mm' | 'cm' | 'in' | 'pt' | 'px' }
const millimeters: Record<PhysicalLength['unit'], number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 };
/** CSS absolute units, not monitor DPI. Bare numbers are intentionally ambiguous and rejected. */
export function parsePhysicalLength(input: string): PhysicalLength {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|in|pt|px)\s*$/.exec(input);
  if (!match) { throw new RangeError('Use a positive physical length such as 178mm, 7in, or 504pt.'); }
  const value = Number(match[1]); const unit = match[2] as PhysicalLength['unit'];
  if (!Number.isFinite(value) || value <= 0 || value * millimeters[unit] > 10000) {
    throw new RangeError('Physical length must be positive and at most 10000mm.');
  }
  return { value, unit };
}
export function toMillimeters(length: PhysicalLength): number {
  if (!Object.prototype.hasOwnProperty.call(millimeters, length.unit) || !Number.isFinite(length.value) || length.value <= 0) {
    throw new RangeError('Invalid physical length.');
  }
  return length.value * millimeters[length.unit];
}
