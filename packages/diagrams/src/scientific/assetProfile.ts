interface Schema { properties?: Record<string, unknown>; required?: string[] }
interface Library { manifest: readonly string[]; schemas: Record<string, object>; templates: { name: string; html: string; css: string }[] }
export function withSvgAssetComponent<L extends Library>(source: L): L {
  const library = structuredClone(source); const schema = structuredClone(library.schemas.SciBlock) as Schema;
  schema.properties = { ...schema.properties, tag: { type: 'string', const: 'SciSvgAsset' }, asset: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_.-]{0,127}$' } };
  schema.required = [...(schema.required ?? []), 'asset']; library.schemas.SciSvgAsset = schema;
  library.templates.push({ name: 'SciSvgAsset', css: 'svg { display: block; overflow: visible; }', html: '<template name="SciSvgAsset"><svg data-tpl="SciSvgAsset" data-role="body" width="{{svgWidth}}" height="{{svgHeight}}" viewBox="0 0 {{svgWidth}} {{svgHeight}}"><g data-svg-asset="{{asset}}"></g></svg></template>' });
  library.manifest = library.templates.map((template) => template.name); return library;
}
