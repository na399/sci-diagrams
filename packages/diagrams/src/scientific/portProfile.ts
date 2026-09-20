/** Only the scientific profile opts into named ports. */
interface Schema { properties?: Record<string, unknown>; [key: string]: unknown }
interface Library { schemas: Record<string, object> }
export function withNamedPortSchemas<L extends Library>(source: L): L {
  const library = structuredClone(source);
  for (const raw of Object.values(library.schemas)) {
    const schema = raw as Schema; const properties = schema.properties ?? {};
    if (schema['x-schema-kind'] === 'entity') {
      properties.ports = { type: 'array', maxItems: 128, items: {
        type: 'object', additionalProperties: false, required: ['id', 'x', 'y'], properties: {
          id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' },
          x: { type: 'number', minimum: 0 }, y: { type: 'number', minimum: 0 },
          side: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
        },
      } };
    } else if (schema['x-schema-kind'] === 'connection') {
      properties.fromPort = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' };
      properties.toPort = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' };
    }
    schema.properties = properties;
  }
  return library;
}
