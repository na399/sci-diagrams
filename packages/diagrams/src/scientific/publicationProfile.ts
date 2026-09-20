interface Schema { properties?: Record<string, unknown> }
interface Library { schemas: Record<string, object> }
/** Font names are data, not CSS fragments. Fonts must already be installed or caller-staged. */
export function withPublicationFonts<L extends Library>(source: L): L {
  const result = structuredClone(source);
  for (const raw of Object.values(result.schemas)) { const schema = raw as Schema; if (schema.properties?.fontFamily) { schema.properties.fontFamily = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9 -]{0,80}(, *(sans-serif|serif|monospace))?$', default: 'sans-serif' }; } }
  return result;
}
