import { connectionSchema, entitySchema, CssColor, type JsonSchema } from '@eraserlabs/protocol/schema';
import { NormalizationError, type AuthoredLibrary, type ElementNormalizer } from '@eraserlabs/resolve';
import type { TemplateFile } from '@eraserlabs/protocol';
import { timelineGeometry, type TimelineInput } from './geometry.js';
export { arrange, linearPosition, timelineGeometry } from './geometry.js';
export type { Arrangement, PositionedEntity, TimelineInput, TimelineItem, TimelineLane } from './geometry.js';

const number: JsonSchema = { type: 'number' };
const text: JsonSchema = { type: 'string', 'x-content': 'plain' };
const key: JsonSchema = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$' };
const point: JsonSchema = {
  type: 'object', required: ['x', 'y'], additionalProperties: false,
  properties: { x: number, y: number },
};
const lines: JsonSchema = {
  type: 'array', maxItems: 128,
  items: {
    type: 'object', additionalProperties: false, required: ['key', 'text', 'x', 'y'],
    properties: { key, text, x: number, y: number },
  },
};
const path: JsonSchema = { type: 'string', pattern: '^[MLHVQCZ0-9., \\-]*$' };
const common: Record<string, JsonSchema> = {
  label: { ...text, default: '' },
  fontSize: { type: 'number', minimum: 1, default: 16 },
  fontFamily: { type: 'string', enum: ['sans-serif', 'serif', 'monospace'], default: 'sans-serif' },
  textColor: { ...CssColor, default: '#17202a' },
  fill: { ...CssColor, default: '#ffffff' },
  stroke: { ...CssColor, default: '#364152' },
  strokeWidth: { type: 'number', minimum: 0, default: 1.5 },
  svgWidth: number, svgHeight: number, bodyWidth: number, bodyHeight: number,
  centerX: number, centerY: number, radiusX: number, radiusY: number,
  shapePath: path,
  lines,
  textAnchor: { type: 'string', enum: ['start', 'middle', 'end'] },
  outline: {
    type: 'object', additionalProperties: false, required: ['kind'],
    properties: { kind: { type: 'string', enum: ['ellipse'] } },
  },
};
const textMarkup = `<text data-each="line of lines" data-key="key" x="{{line.x}}" y="{{line.y}}" text-anchor="{{textAnchor}}" fill="{{textColor}}" stroke="none" font-family="{{fontFamily}}" font-size="{{fontSize}}">{{line.text}}</text>`;
const rectMarkup = `<rect x="1" y="1" width="{{bodyWidth}}" height="{{bodyHeight}}" rx="4" fill="{{fill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></rect>`;
function entityTemplate(name: string, content: string): TemplateFile {
  return {
    name,
    html: `<template name="${name}"><svg data-tpl="${name}" data-role="body" width="{{svgWidth}}" height="{{svgHeight}}" viewBox="0 0 {{svgWidth}} {{svgHeight}}">${content}</svg></template>`,
    css: 'svg { display: block; overflow: visible; }',
  };
}

const laneSchema: JsonSchema = {
  type: 'object', additionalProperties: false, required: ['id', 'label'],
  properties: { id: key, label: text },
};
const itemSchema: JsonSchema = {
  type: 'object', additionalProperties: false, required: ['id', 'lane', 'kind', 'start', 'label'],
  properties: {
    id: key, lane: key, kind: { type: 'string', enum: ['event', 'interval'] },
    start: number, end: number, label: text,
    closed: { type: 'string', enum: ['left', 'right', 'both', 'neither'], default: 'left' },
  },
};
const timelineProps: Record<string, JsonSchema> = {
  start: number, end: number, origin: number,
  laneHeight: { type: 'number', minimum: 32, default: 64 },
  labelWidth: { type: 'number', minimum: 0, default: 148 },
  lanes: { type: 'array', minItems: 1, maxItems: 32, items: laneSchema },
  items: { type: 'array', maxItems: 512, items: itemSchema },
  ticks: { type: 'array', maxItems: 64, items: number },
  axisLeft: number, axisRight: number, axisY: number, axisBottom: number, originX: number,
  hasOrigin: { type: 'boolean' },
  laneMarks: {
    type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { key, label: text, y: number, labelY: number },
    },
  },
  tickMarks: {
    type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { key, text, x: number, y: number, bottom: number, textY: number },
    },
  },
  marks: {
    type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        key, label: text, event: { type: 'boolean' }, interval: { type: 'boolean' },
        x: number, y: number, endX: number, width: number,
        labelX: number, labelY: number,
        labelAnchor: { type: 'string', enum: ['start', 'middle'] },
        startFill: { type: 'string', enum: ['currentColor', 'white'] },
        endFill: { type: 'string', enum: ['currentColor', 'white'] },
      },
    },
  },
};
const timelineMarkup = `
<line x1="{{axisLeft}}" x2="{{axisRight}}" y1="{{axisY}}" y2="{{axisY}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></line>
<line data-if="hasOrigin" x1="{{originX}}" x2="{{originX}}" y1="16" y2="{{axisBottom}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}" stroke-dasharray="4 4"></line>
<g data-each="tick of tickMarks" data-key="key">
  <line x1="{{tick.x}}" x2="{{tick.x}}" y1="{{tick.y}}" y2="{{tick.bottom}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></line>
  <text x="{{tick.x}}" y="{{tick.textY}}" text-anchor="middle" font-family="{{fontFamily}}" font-size="{{fontSize}}" fill="{{textColor}}">{{tick.text}}</text>
</g>
<g data-each="lane of laneMarks" data-key="key">
  <line x1="{{axisLeft}}" x2="{{axisRight}}" y1="{{lane.y}}" y2="{{lane.y}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}" stroke-opacity="0.2"></line>
  <text x="8" y="{{lane.labelY}}" font-family="{{fontFamily}}" font-size="{{fontSize}}" fill="{{textColor}}">{{lane.label}}</text>
</g>
<g data-each="mark of marks" data-key="key" color="{{stroke}}">
  <g data-if="mark.interval">
    <line x1="{{mark.x}}" x2="{{mark.endX}}" y1="{{mark.y}}" y2="{{mark.y}}" stroke="{{stroke}}" stroke-width="6"></line>
    <circle cx="{{mark.x}}" cy="{{mark.y}}" r="4" fill="{{mark.startFill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></circle>
    <circle cx="{{mark.endX}}" cy="{{mark.y}}" r="4" fill="{{mark.endFill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></circle>
  </g>
  <circle data-if="mark.event" cx="{{mark.x}}" cy="{{mark.y}}" r="5" fill="{{stroke}}"></circle>
  <text x="{{mark.labelX}}" y="{{mark.labelY}}" text-anchor="{{mark.labelAnchor}}" font-family="{{fontFamily}}" font-size="{{fontSize}}" fill="{{textColor}}">{{mark.label}}</text>
</g>`;

const linkSchema = connectionSchema('SciLink', {
  label: { ...text, default: '' },
  fontSize: { type: 'number', minimum: 1, default: 14 },
  fontFamily: { type: 'string', enum: ['sans-serif', 'serif', 'monospace'], default: 'sans-serif' },
  stroke: { ...CssColor, default: '#364152' },
  textColor: { ...CssColor, default: '#17202a' },
  strokeWidth: { type: 'number', minimum: 0.1, default: 1.5 },
  lineWidthPx: number,
  fromPort: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
  toPort: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
  connectorStyle: { type: 'string', enum: ['elbow', 'straight'], default: 'elbow' },
  cornerStyle: { type: 'string', enum: ['elbow', 'straight'], default: 'straight' },
  endArrowhead: { type: 'string', enum: ['triangle'], default: 'triangle' },
  points: { type: 'array', minItems: 2, items: point },
  labelWidth: { type: 'number', minimum: 1 },
  labelHeight: number, labelCenter: number, lines,
});
const linkTemplate: TemplateFile = {
  name: 'SciLink',
  html: `<template name="SciLink"><div data-tpl="SciLink">
  <svg class="sci-line"><defs><marker id="sci-arrow" viewBox="0 0 8 8" markerWidth="6" markerHeight="6" refX="8" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" fill="{{stroke}}"></path></marker></defs>
  <path data-role="anchor" d="{{ }}" fill="none" stroke="{{stroke}}" stroke-width="{{lineWidthPx}}" marker-end="url(#sci-arrow)"></path></svg>
  <span class="sci-label" data-if="label" data-role="external-text" data-text-grow-policy="width-only">
  <svg width="{{labelWidth}}" height="{{labelHeight}}" viewBox="0 0 {{labelWidth}} {{labelHeight}}">
    <text data-each="line of lines" data-key="key" x="{{line.x}}" y="{{line.y}}" text-anchor="middle" fill="{{textColor}}" font-family="{{fontFamily}}" font-size="{{fontSize}}">{{line.text}}</text>
  </svg></span></div></template>`,
  css: '.sci-line { display: block; } .sci-label { display: block; width: max-content; line-height: 0; } .sci-label svg { display: block; overflow: visible; }',
};

/** A separate MDP profile; the stock library and renderer defaults remain untouched. */
export function createScientificLibrary(theme: 'publication' | 'web' = 'publication'): AuthoredLibrary {
  const schemas: Record<string, JsonSchema> = {};
  const templates: TemplateFile[] = [];
  const add = (name: string, content: string, extras: Record<string, JsonSchema> = {}, container = false): void => {
    schemas[name] = entitySchema(name, {
      ...common,
      ...(theme === 'web' ? { fill: { ...CssColor, default: '#edf3f7' }, stroke: { ...CssColor, default: '#35566f' } } : {}),
      ...extras,
    }, { required: ['x', 'y'], isContainer: container });
    templates.push(entityTemplate(name, content));
  };
  add('SciBlock', rectMarkup + textMarkup);
  add('SciGroup', rectMarkup + textMarkup, {}, true);
  add('SciText', textMarkup);
  add('SciOperator', `<ellipse cx="{{centerX}}" cy="{{centerY}}" rx="{{radiusX}}" ry="{{radiusY}}" fill="{{fill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></ellipse>` + textMarkup);
  const shape = `<path d="{{shapePath}}" fill="none" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"></path>`;
  const dimensions: JsonSchema = { type: 'array', minItems: 1, maxItems: 4, items: text };
  add('SciTensor', shape + textMarkup, { dimensions });
  add('SciMatrix', shape + textMarkup, { dimensions });
  add('SciDimension', shape + textMarkup);
  add('SciBrace', shape + textMarkup);
  add('SciTimeline', timelineMarkup, timelineProps);
  const timeline = schemas['SciTimeline']!;
  timeline.required = [...timeline.required!, 'start', 'end', 'lanes', 'items'];
  schemas['SciLink'] = linkSchema;
  templates.push(linkTemplate);
  return {
    manifest: templates.map((t) => t.name), schemas, templates, baseCss: '', defaultConnectionTag: 'SciLink',
  };
}

function value(element: Record<string, unknown>, name: string, fallback: number): number {
  const n = element[name] ?? fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100000) {
    throw new RangeError(`${name} must be a finite number in (0, 100000].`);
  }
  return n;
}
function normalize(element: Record<string, unknown>, tag: string): void {
  const label = typeof element.label === 'string' ? element.label : '';
  const font = value(element, 'fontSize', 16);
  const labelLines = label.split('\n');
  if (labelLines.length > 128) throw new RangeError('Use at most 128 text lines.');
  if (tag === 'SciLink') {
    const width = value(element, 'labelWidth', Math.max(24, ...labelLines.map((s) => [...s].length * font * 0.75 + 16)));
    element.labelWidth = width;
    element.labelHeight = labelLines.length * font * 1.4 + 8;
    element.lineWidthPx = value(element, 'strokeWidth', 1.5);
    element.lines = labelLines.map((text, i) => ({ key: `line${i}`, text, x: width / 2, y: 4 + font + i * font * 1.4 }));
    return;
  }
  const width = value(element, 'width', tag === 'SciTimeline' ? 960 : tag === 'SciOperator' ? 48 : 200);
  let height = value(element, 'height', tag === 'SciOperator' ? 48 : tag === 'SciGroup' ? 260 : 90);
  const dimensions = Array.isArray(element.dimensions) ? element.dimensions as string[] : [];
  if (dimensions.length) labelLines.push(dimensions.join(' × '));
  let anchor = 'middle';
  let textX = width / 2;
  let textY = (height - labelLines.length * font * 1.3) / 2 + font;
  let shapePath = '';
  if (tag === 'SciGroup' || tag === 'SciText') {
    anchor = 'start'; textX = 12; textY = font + 10;
  }
  if (tag === 'SciOperator') element.outline = { kind: 'ellipse' };
  if (tag === 'SciTensor') {
    shapePath = `M 4 18 H ${width - 18} V ${height - 4} H 4 Z M 4 18 L 18 4 H ${width - 4} V ${height - 18} L ${width - 18} ${height - 4} M ${width - 18} 18 L ${width - 4} 4`;
  }
  if (tag === 'SciMatrix') {
    const bottom = height - font * labelLines.length * 1.3 - 12;
    if (bottom < 24) throw new RangeError('Increase matrix height to leave space for its labels.');
    const cellW = (width - 16) / 4;
    const cellH = (bottom - 8) / 4;
    shapePath = Array.from({ length: 5 }, (_, i) => `M ${8 + i * cellW} 8 V ${bottom} M 8 ${8 + i * cellH} H ${width - 8}`).join(' ');
    textY = bottom + font + 8;
  }
  if (tag === 'SciDimension') {
    shapePath = `M 8 30 H ${width - 8} M 8 23 V 37 M ${width - 8} 23 V 37`;
    textY = font + 4;
  }
  if (tag === 'SciBrace') {
    const mid = width / 2;
    shapePath = `M 8 12 Q 8 28 24 28 H ${mid - 16} Q ${mid} 28 ${mid} 42 Q ${mid} 28 ${mid + 16} 28 H ${width - 24} Q ${width - 8} 28 ${width - 8} 12`;
    textY = 48 + font;
  }
  if (tag === 'SciTimeline') {
    const geometry = timelineGeometry({
      start: element.start as number, end: element.end as number, width,
      lanes: element.lanes as TimelineInput['lanes'], items: element.items as TimelineInput['items'],
      ...(element.ticks === undefined ? {} : { ticks: element.ticks as number[] }),
      ...(element.origin === undefined ? {} : { origin: element.origin as number }),
      ...(element.laneHeight === undefined ? {} : { laneHeight: element.laneHeight as number }),
      ...(element.labelWidth === undefined ? {} : { labelWidth: element.labelWidth as number }),
    });
    height = Math.max(height, geometry.height);
    element.axisLeft = geometry.left; element.axisRight = geometry.right;
    element.axisY = geometry.axisY; element.axisBottom = height - 8;
    element.hasOrigin = geometry.originX !== undefined; element.originX = geometry.originX ?? 0;
    element.laneMarks = geometry.lanes.map((lane) => ({ ...lane, labelY: lane.y + font * 0.3 }));
    element.tickMarks = geometry.ticks.map((tick) => ({ ...tick, bottom: tick.y + 6, textY: tick.y - 10 }));
    element.marks = geometry.marks;
  }
  element.svgWidth = width; element.svgHeight = height;
  element.bodyWidth = width - 2; element.bodyHeight = height - 2;
  element.centerX = width / 2; element.centerY = height / 2;
  element.radiusX = width / 2 - 2; element.radiusY = height / 2 - 2;
  element.textAnchor = anchor; element.shapePath = shapePath;
  element.lines = labelLines.map((text, i) => ({ key: `line${i}`, text, x: textX, y: textY + i * font * 1.3 }));
}

export const scientificLibrary = createScientificLibrary();
export const scientificNormalizers: Record<string, ElementNormalizer> = Object.fromEntries(
  scientificLibrary.manifest.map((tag) => [tag, (element: Record<string, unknown>) => {
    try { normalize(element, tag); }
    catch (error) {
      if (error instanceof RangeError) throw new NormalizationError(error.message);
      throw error;
    }
  }]),
);
/** CLI custom-library module contract. */
export const library = scientificLibrary;
export const normalizers = scientificNormalizers;
