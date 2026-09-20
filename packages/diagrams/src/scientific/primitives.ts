/** Scientific annotations are profile components, not protocol or router vocabulary. */
interface Schema {
  properties?: Record<string, Schema>;
  required?: string[];
  [key: string]: unknown;
}
interface Library {
  manifest: readonly string[];
  schemas: Record<string, object>;
  templates: { name: string; html: string; css: string }[];
}
type Normalizer = (element: Record<string, unknown>) => void;
export type AnnotationKind = 'dimension' | 'brace' | 'bracket' | 'divider';
export interface AnnotationGeometry {
  path: string;
  labelX: number;
  labelY: number;
  rotation: number;
}
function finite(value: unknown, fallback: number, name: string): number {
  const n = value ?? fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 100000) {
    throw new RangeError(`${name} must be finite and in [1, 100000].`);
  }
  return n;
}
export function annotationGeometry(kind: AnnotationKind, width: number, height: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'): AnnotationGeometry {
  finite(width, 120, 'width'); finite(height, 64, 'height');
  if (!['horizontal', 'vertical'].includes(orientation)) { throw new RangeError('Unknown annotation orientation.'); }
  const horizontal = orientation === 'horizontal';
  const span = horizontal ? width : height;
  const cross = horizontal ? height : width;
  if (span < 48 || cross < 40) { throw new RangeError('Annotations require at least 48 px span and 40 px cross-axis space.'); }
  const mid = span / 2; const y = cross - 16;
  let path: string;
  if (kind === 'brace') {
    path = `M 8 ${y - 12} Q 8 ${y} 24 ${y} H ${mid - 12} Q ${mid} ${y} ${mid} ${y + 8} Q ${mid} ${y} ${mid + 12} ${y} H ${span - 24} Q ${span - 8} ${y} ${span - 8} ${y - 12}`;
  } else if (kind === 'bracket') {
    path = `M 8 ${y - 8} V ${y} H ${span - 8} V ${y - 8}`;
  } else if (kind === 'dimension') {
    path = `M 8 ${y} H ${span - 8} M 8 ${y - 6} V ${y + 6} M ${span - 8} ${y - 6} V ${y + 6}`;
  } else if (kind === 'divider') {
    path = `M 8 ${y} H ${span - 8}`;
  } else { throw new RangeError('Unknown annotation kind.'); }
  return { path, labelX: mid, labelY: Math.max(20, y - 16), rotation: horizontal ? 0 : -90 };
}
const annotationTags: Record<string, AnnotationKind> = {
  SciDimension: 'dimension', SciBrace: 'brace', SciBracket: 'bracket', SciDivider: 'divider',
};
const annotationTemplate = (name: string): { name: string; html: string; css: string } => ({
  name,
  html: `<template name="${name}"><svg data-tpl="${name}" data-role="body" width="{{svgWidth}}" height="{{svgHeight}}" viewBox="0 0 {{svgWidth}} {{svgHeight}}"><g transform="translate({{translateX}} {{translateY}}) rotate({{rotation}})"><path d="{{shapePath}}" fill="none" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></path><g data-each="line of lines" data-key="key"><text x="{{line.x}}" y="{{line.y}}" text-anchor="middle" fill="{{textColor}}" stroke="none" font-family="{{fontFamily}}" font-size="{{fontSize}}">{{line.text}}</text></g></g></svg></template>`,
  css: 'svg { display: block; overflow: visible; }',
});
const extraSchemas: Record<string, Schema> = {
  orientation: { type: 'string', enum: ['horizontal', 'vertical'], default: 'horizontal' },
  rotation: { type: 'number' }, translateX: { type: 'number' }, translateY: { type: 'number' },
};
/** Returns a fresh library; the stock profile and caller's library are never mutated. */
export function extendScientificPrimitives<L extends Library>(source: L): L {
  const result = structuredClone(source);
  const aliases: Record<string, string> = {
    SciPanel: 'SciGroup', SciRegion: 'SciGroup', SciBracket: 'SciDimension',
    SciDivider: 'SciDimension', SciCallout: 'SciBlock', SciLeader: 'SciLink',
  };
  for (const [name, sourceName] of Object.entries(aliases)) {
    const schema = structuredClone(result.schemas[sourceName]) as Schema | undefined;
    const template = result.templates.find((item) => item.name === sourceName);
    if (!schema?.properties || !template) { throw new Error(`Missing scientific base component ${sourceName}.`); }
    schema.properties.tag = { type: 'string', const: name };
    result.schemas[name] = schema;
    result.templates.push({ ...template, name, html: template.html.replaceAll(`"${sourceName}"`, `"${name}"`) });
  }
  for (const name of Object.keys(annotationTags)) {
    const schema = result.schemas[name] as Schema;
    schema.properties = { ...schema.properties, ...extraSchemas };
    result.templates = result.templates.map((item) => item.name === name ? annotationTemplate(name) : item);
  }
  for (const name of ['SciGroup', 'SciPanel', 'SciRegion']) {
    const template = result.templates.find((item) => item.name === name)!;
    template.html = template.html.replace('<rect ', '<rect data-part="frame" ');
  }
  const region = result.schemas.SciRegion as Schema;
  region.properties = { ...region.properties, fill: { type: 'string', 'x-css-color': true, default: '#f1f4f8' } };
  const callout = result.templates.find((item) => item.name === 'SciCallout')!;
  callout.html = callout.html.replace(/<rect[^>]*><\/rect>/,
    '<path d="{{shapePath}}" fill="{{fill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></path>');
  const leader = result.templates.find((item) => item.name === 'SciLeader')!;
  leader.html = leader.html.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/ marker-end="[^"]*"/, '');
  result.manifest = result.templates.map((item) => item.name);
  return result;
}

export function extendPrimitiveNormalizers(base: Record<string, Normalizer>): Record<string, Normalizer> {
  const result = { ...base };
  for (const [name, source] of Object.entries({ SciPanel: 'SciGroup', SciRegion: 'SciGroup', SciLeader: 'SciLink' })) {
    result[name] = (element) => base[source]!(element);
  }
  result.SciCallout = (element) => {
    base.SciBlock!(element);
    const width = finite(element.svgWidth, 200, 'width'); const height = finite(element.svgHeight, 90, 'height');
    if (width < 64 || height < 48) { throw new RangeError('Callouts require width >= 64 and height >= 48.'); }
    element.shapePath = `M 1 1 H ${width - 1} V ${height - 17} H 36 L 20 ${height - 1} V ${height - 17} H 1 Z`;
    for (const line of element.lines as { y: number }[]) { line.y -= 8; }
  };
  for (const [name, kind] of Object.entries(annotationTags)) {
    result[name] = (element) => {
      base.SciBlock!(element);
      const width = finite(element.width, 200, 'width'); const height = finite(element.height, 90, 'height');
      const orientation = (element.orientation ?? 'horizontal') as 'horizontal' | 'vertical';
      const geometry = annotationGeometry(kind, width, height, orientation);
      element.shapePath = geometry.path; element.rotation = geometry.rotation;
      element.translateX = 0; element.translateY = orientation === 'vertical' ? height : 0;
      const font = finite(element.fontSize, 16, 'fontSize');
      const labels = String(element.label ?? '').split('\n');
      element.lines = labels.map((text, i) => ({ key: `line${i}`, text, x: geometry.labelX,
        y: geometry.labelY - (labels.length - 1 - i) * font * 1.3 }));
    };
  }
  return result;
}
