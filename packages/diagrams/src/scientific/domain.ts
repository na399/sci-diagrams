/** Optional scientific visual grammar, outside the protocol and generic renderer. */
interface Schema { properties?: Record<string, Schema>; required?: string[]; items?: Schema; [key: string]: unknown }
interface Library { manifest: readonly string[]; schemas: Record<string, object>; templates: { name: string; html: string; css: string }[] }
type Normalizer = (element: Record<string, unknown>) => void;
interface Labelled { id: string; label: string }
export interface SequenceCell { key: string; x: number; y: number; width: number; height: number }
export interface SequenceLine { key: string; text: string; x: number; y: number }
export function sequenceGeometry(items: readonly Labelled[], width: number, height: number, direction: 'horizontal' | 'vertical' = 'horizontal', font = 16): { cells: SequenceCell[]; lines: SequenceLine[] } {
  if (!items.length || items.length > 64 || new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => !item.id || typeof item.label !== 'string')) { throw new RangeError('A sequence requires 1 to 64 uniquely identified labels.'); }
  if (![width, height, font].every((n) => Number.isFinite(n) && n > 0) || !['horizontal', 'vertical'].includes(direction)) { throw new RangeError('Invalid sequence geometry.'); }
  const horizontal = direction === 'horizontal'; const gap = 8;
  const cw = horizontal ? (width - 16 - gap * (items.length - 1)) / items.length : width - 16;
  const ch = horizontal ? height - 48 : (height - 48 - gap * (items.length - 1)) / items.length;
  if (cw < 20 || ch < font * 1.4) { throw new RangeError('Increase sequence dimensions; cells would be too small.'); }
  const cells: SequenceCell[] = []; const lines: SequenceLine[] = [];
  items.forEach((item, i) => {
    const x = 8 + (horizontal ? i * (cw + gap) : 0); const y = 8 + (horizontal ? 0 : i * (ch + gap));
    cells.push({ key: item.id, x, y, width: cw, height: ch }); const labels = item.label.split('\n');
    if (labels.length > 8 || labels.length * font * 1.3 > ch - 4) { throw new RangeError('Increase sequence height to fit its text lines.'); }
    labels.forEach((text, j) => lines.push({ key: `${item.id}_${j}`, text, x: x + cw / 2, y: y + (ch - labels.length * font * 1.3) / 2 + font + j * font * 1.3 }));
  });
  return { cells, lines };
}
export function repeatGeometry(count: number, visible: number, width: number, height: number): SequenceCell[] {
  if (!Number.isInteger(count) || count < 1 || count > 1000000 || !Number.isInteger(visible) || visible < 1 || visible > Math.min(8, count)) { throw new RangeError('Repeat count must be 1..1000000; visible layers must be 1..min(8,count).'); }
  const w = width - 16 - 8 * (visible - 1); const h = height - 48 - 8 * (visible - 1);
  if (![w, h].every((n) => Number.isFinite(n) && n >= 24)) { throw new RangeError('Increase repeated-stack dimensions.'); }
  return Array.from({ length: visible }, (_, index) => { const i = visible - index - 1; return { key: `layer${i}`, x: 8 + i * 8, y: 8 + i * 8, width: w, height: h }; });
}
const number: Schema = { type: 'number' }; const text: Schema = { type: 'string', 'x-content': 'plain' }; const key: Schema = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$' };
const cellSchema: Schema = { type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false, properties: { key, x: number, y: number, width: number, height: number } } };
const lineSchema: Schema = { type: 'array', maxItems: 512, items: { type: 'object', additionalProperties: false, properties: { key, text, x: number, y: number, anchor: { type: 'string', enum: ['start', 'middle', 'end'] } } } };
const sequenceMarkup = `<g data-each="cell of cells" data-key="key"><rect x="{{cell.x}}" y="{{cell.y}}" width="{{cell.width}}" height="{{cell.height}}" rx="2" fill="{{fill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></rect></g><g data-each="line of sequenceLines" data-key="key"><text x="{{line.x}}" y="{{line.y}}" font-family="{{fontFamily}}" font-size="{{fontSize}}" fill="{{textColor}}" text-anchor="middle">{{line.text}}</text></g><g data-each="line of lines" data-key="key"><text x="{{line.x}}" y="{{line.y}}" font-family="{{fontFamily}}" font-size="{{fontSize}}" fill="{{textColor}}" text-anchor="middle">{{line.text}}</text></g>`;
export function extendDomainLibrary<L extends Library>(source: L): L {
  const result = structuredClone(source);
  for (const name of ['SciSequence', 'SciRepeat']) {
    const schema = structuredClone(result.schemas.SciBlock) as Schema;
    schema.properties = { ...schema.properties, tag: { type: 'string', const: name }, cells: cellSchema, sequenceLines: lineSchema,
      ...(name === 'SciSequence' ? { items: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'object', required: ['id', 'label'], additionalProperties: false, properties: { id: key, label: text } } }, direction: { type: 'string', enum: ['horizontal', 'vertical'], default: 'horizontal' } }
        : { repeatCount: { type: 'number', minimum: 1 }, visibleCount: { type: 'number', minimum: 1 } }),
    };
    schema.required = [...(schema.required ?? []), name === 'SciSequence' ? 'items' : 'repeatCount']; result.schemas[name] = schema;
    result.templates.push({ name, css: 'svg { display: block; overflow: visible; }', html: `<template name="${name}"><svg data-tpl="${name}" data-role="body" width="{{svgWidth}}" height="{{svgHeight}}" viewBox="0 0 {{svgWidth}} {{svgHeight}}">${sequenceMarkup}</svg></template>` });
  }
  const matrix = result.schemas.SciMatrix as Schema;
  matrix.properties = { ...matrix.properties, matrixRows: { type: 'number', minimum: 1, default: 4 }, matrixColumns: { type: 'number', minimum: 1, default: 4 } };
  for (const tag of ['SciLink', 'SciLeader']) {
    const schema = result.schemas[tag] as Schema;
    schema.properties = { ...schema.properties, relation: { type: 'string', enum: ['flow', 'association', 'annotation', 'uncertain'], default: 'flow' }, lineStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] }, dashArray: { type: 'string', enum: ['none', '6 4', '1 3'] }, endArrowhead: { type: 'string', enum: ['triangle', 'none'] }, markerEnd: { type: 'string', pattern: '^(none|url\\(#[A-Za-z][A-Za-z0-9_-]*\\))$' } };
    const template = result.templates.find((item) => item.name === tag)!;
    template.html = template.html.replace('data-role="anchor"', 'data-role="anchor" stroke-dasharray="{{dashArray}}"').replace('marker-end="url(#{{markerId}})"', 'marker-end="{{markerEnd}}"');
  }
  const timeline = result.schemas.SciTimeline as Schema; const props = timeline.properties!;
  props.unit = { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year', 'arbitrary'], default: 'day' }; props.originLabel = { ...text, default: 'Index' }; props.captions = lineSchema; props.subrowGap = { type: 'number', minimum: 24, default: 36 };
  const items = props.items!.items!;
  items.properties = { ...items.properties, kind: { type: 'string', enum: ['event', 'interval', 'censor'] }, row: { type: 'number', minimum: 0, default: 0 } };
  for (const field of ['marks', 'eventMarks', 'intervalMarks']) { const schema = structuredClone(props[field]!) as Schema; schema.items!.properties!.labelAnchor = { type: 'string', enum: ['start', 'middle', 'end'] }; props[field] = schema; }
  props.censorMarks = { type: 'array', maxItems: 512, items: { type: 'object', additionalProperties: false, properties: { key, x: number, top: number, bottom: number } } };
  const template = result.templates.find((item) => item.name === 'SciTimeline')!;
  template.html = template.html.replace('</svg></template>', `<g data-each="mark of censorMarks" data-key="key"><line x1="{{mark.x}}" x2="{{mark.x}}" y1="{{mark.top}}" y2="{{mark.bottom}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></line></g><g data-each="caption of captions" data-key="key"><text x="{{caption.x}}" y="{{caption.y}}" text-anchor="{{caption.anchor}}" font-family="{{fontFamily}}" font-size="{{fontSize}}" fill="{{textColor}}">{{caption.text}}</text></g></svg></template>`);
  result.manifest = result.templates.map((template) => template.name); return result;
}
interface TimelineMark { key: string; label: string; event: boolean; interval: boolean; x: number; y: number; endX: number; width: number; labelX: number; labelY: number; labelAnchor: string; startFill: string; endFill: string }
/** Refine only vertical packing and label placement. Time-to-x is never changed. */
export function refineTimeline(element: Record<string, unknown>, items: readonly { id: string; lane: string; kind: string; row?: number }[]): void {
  const lanes = element.lanes as { id: string }[]; const gap = Number(element.subrowGap ?? 36);
  if (!Number.isFinite(gap) || gap < 24 || gap > 500) { throw new RangeError('subrowGap must be in [24,500].'); }
  const rows = new Map(lanes.map((lane) => [lane.id, 0]));
  for (const item of items) { const row = item.row ?? 0;
    if (!Number.isInteger(row) || row < 0 || row > 15) { throw new RangeError('Timeline rows must be integers in [0,15].'); }
    if (!rows.has(item.lane)) { throw new RangeError('Unknown timeline lane.'); } rows.set(item.lane, Math.max(rows.get(item.lane)!, row));
  }
  let extra = 0; const offsets = new Map<string, number>(); for (const lane of lanes) { offsets.set(lane.id, extra); extra += rows.get(lane.id)! * gap; }
  const marks = (element.marks as TimelineMark[]).map((mark, i) => {
    const item = items[i]!; const dy = offsets.get(item.lane)! + (item.row ?? 0) * gap;
    const end = mark.event && mark.x > (Number(element.axisLeft) + Number(element.axisRight)) / 2;
    return { ...mark, y: mark.y + dy, labelY: mark.labelY + dy, ...(end ? { labelAnchor: 'end', labelX: mark.x - 10 } : {}) };
  });
  element.marks = marks; element.intervalMarks = marks.filter((mark) => mark.interval).map((mark) => ({ ...mark }));
  element.eventMarks = marks.filter((_, i) => items[i]!.kind === 'event').map((mark) => ({ ...mark }));
  element.censorMarks = marks.flatMap((mark, i) => items[i]!.kind === 'censor' ? [{ key: mark.key, x: mark.x, top: mark.y - 8, bottom: mark.y + 8 }] : []);
  element.laneMarks = (element.laneMarks as { key: string; label: string; y: number; labelY: number }[]).map((lane, i) => ({ ...lane, y: lane.y + offsets.get(lanes[i]!.id)!, labelY: lane.labelY + offsets.get(lanes[i]!.id)! }));
  const oldHeight = Number(element.svgHeight); const minimum = 120 + (lanes.length - 1) * Number(element.laneHeight ?? 64);
  const height = Math.max(oldHeight, minimum + extra + 56);
  element.svgHeight = height; element.bodyHeight = height - 2; element.axisBottom = height - 40;
  element.captions = [{ key: 'unit', text: `Time (${String(element.unit ?? 'day')})`, x: 8, y: height - 8, anchor: 'start' }, ...(element.hasOrigin ? [{ key: 'origin', text: String(element.originLabel ?? 'Index'), x: Number(element.originX), y: height - 28, anchor: 'middle' }] : [])];
}
export function extendDomainNormalizers(base: Record<string, Normalizer>): Record<string, Normalizer> {
  const result = { ...base };
  for (const tag of ['SciSequence', 'SciRepeat']) {
    result[tag] = (element) => {
      base.SciBlock!(element); const width = Number(element.svgWidth); const height = Number(element.svgHeight); const font = Number(element.fontSize ?? 16);
      if (tag === 'SciSequence') { const geometry = sequenceGeometry(element.items as Labelled[], width, height, (element.direction ?? 'horizontal') as 'horizontal' | 'vertical', font); element.cells = geometry.cells; element.sequenceLines = geometry.lines; }
      else { const count = Number(element.repeatCount); const visible = Number(element.visibleCount ?? Math.min(3, count)); element.cells = repeatGeometry(count, visible, width, height); element.sequenceLines = []; }
      const label = String(element.label ?? '') + (tag === 'SciRepeat' ? ` × ${String(element.repeatCount)}` : ''); element.lines = [{ key: 'caption', text: label, x: width / 2, y: height - 8 }];
    };
  }
  result.SciMatrix = (element) => {
    base.SciMatrix!(element); const rows = Number(element.matrixRows ?? 4); const columns = Number(element.matrixColumns ?? 4);
    if (![rows, columns].every((n) => Number.isInteger(n) && n >= 1 && n <= 64)) { throw new RangeError('Matrix rows/columns must be integers in [1,64].'); }
    const width = Number(element.svgWidth); const font = Number(element.fontSize ?? 16); const bottom = Number(element.svgHeight) - font * (element.lines as unknown[]).length * 1.3 - 12;
    element.shapePath = [...Array.from({ length: columns + 1 }, (_, i) => `M ${8 + i * (width - 16) / columns} 8 V ${bottom}`), ...Array.from({ length: rows + 1 }, (_, i) => `M 8 ${8 + i * (bottom - 8) / rows} H ${width - 8}`)].join(' ');
  };
  for (const tag of ['SciLink', 'SciLeader']) {
    result[tag] = (element) => {
      base[tag]!(element); const relation = element.relation ?? 'flow'; const style = element.lineStyle ?? (relation === 'uncertain' ? 'dashed' : 'solid');
      element.dashArray = style === 'dashed' ? '6 4' : style === 'dotted' ? '1 3' : 'none';
      const arrow = element.endArrowhead ?? (relation === 'association' || relation === 'annotation' ? 'none' : 'triangle'); element.markerEnd = arrow === 'none' ? 'none' : `url(#${String(element.markerId)})`;
    };
  }
  result.SciTimeline = (element) => {
    const items = element.items as { id: string; lane: string; kind: string; row?: number }[];
    element.items = items.map((item) => ({ ...item, kind: item.kind === 'censor' ? 'event' : item.kind }));
    try { base.SciTimeline!(element); } finally { element.items = items; }
    refineTimeline(element, items);
  };
  return result;
}
