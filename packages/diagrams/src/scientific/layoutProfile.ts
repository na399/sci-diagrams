interface Schema { properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown }
interface Library { schemas: Record<string, object> }
export function withCompositionSchemas<L extends Library>(source: L): L {
  const library = structuredClone(source);
  for (const raw of Object.values(library.schemas)) {
    const schema = raw as Schema; if (schema['x-schema-kind'] !== 'entity') { continue; }
    schema.required = (schema.required ?? []).filter((key) => key !== 'x' && key !== 'y');
    const properties = schema.properties ?? {}; properties.layoutItem = { type: 'string', enum: ['flow', 'absolute'] };
    if (schema['x-is-container']) {
      const length = { type: 'number', minimum: 0 };
      properties.layout = { type: 'object', required: ['type'], additionalProperties: false, properties: {
        type: { type: 'string', enum: ['row', 'column', 'grid', 'stack', 'overlay'] }, gap: length, padding: length, header: length, offsetX: length, offsetY: length,
        columns: { type: 'number', minimum: 1 }, align: { type: 'string', enum: ['start', 'center', 'end'] },
      } };
    }
    schema.properties = properties;
  }
  return library;
}
/** Absence is layout intent, not an implicit zero. Only the prepared clone is annotated. */
export function normalizePlacement(element: Record<string, unknown>): void {
  if ((element.x === undefined) !== (element.y === undefined)) { throw new RangeError('Supply both x and y or neither.'); }
  if (element.x === undefined || element.layoutItem === 'flow') {
    if (typeof element.containerId !== 'string' || !element.containerId) { throw new RangeError('An unpositioned/flow entity requires a composed parent.'); }
    if (element.layoutItem === 'absolute') { throw new RangeError('Absolute entities require x and y.'); }
    element.layoutItem = 'flow';
  }
}
