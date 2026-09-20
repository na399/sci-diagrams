/** Pure scientific geometry. It never reads a DOM or changes an authored object. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEntity extends Record<string, unknown> {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface Arrangement {
  type: 'row' | 'column' | 'grid';
  x: number;
  y: number;
  gap?: number;
  columns?: number;
  align?: 'start' | 'center' | 'end';
}

function finite(value: number, name: string, positive = false): number {
  if (!Number.isFinite(value) || (positive && value <= 0)) {
    throw new RangeError(`${name} must be ${positive ? 'positive and ' : ''}finite.`);
  }
  return value;
}

/** Explicit helper, not an implicit rewrite of MDP x/y or containment semantics. */
export function arrange<T extends PositionedEntity>(
  entities: readonly T[],
  options: Arrangement,
): (T & { x: number; y: number })[] {
  finite(options.x, 'x');
  finite(options.y, 'y');
  if (options.x < 0 || options.y < 0) {
    throw new RangeError('MDP coordinates must be non-negative.');
  }
  const gap = options.gap ?? 24;
  finite(gap, 'gap');
  if (gap < 0) {
    throw new RangeError('gap cannot be negative.');
  }
  if (!['row', 'column', 'grid'].includes(options.type)) {
    throw new RangeError('Unknown arrangement.');
  }
  if (options.align !== undefined && !['start', 'center', 'end'].includes(options.align)) {
    throw new RangeError('Unknown alignment.');
  }
  const ids = new Set<string>();
  for (const entity of entities) {
    if (!entity.id || ids.has(entity.id)) {
      throw new RangeError('Entity IDs must be nonempty and unique.');
    }
    ids.add(entity.id);
    finite(entity.width, `${entity.id}.width`, true);
    finite(entity.height, `${entity.id}.height`, true);
    if (entity.x !== undefined || entity.y !== undefined) {
      throw new RangeError(`arrange refuses to overwrite authored coordinates on ${entity.id}.`);
    }
  }
  if (!entities.length) {
    return [];
  }
  const columns = options.type === 'row' ? entities.length : options.type === 'column' ? 1 : options.columns ?? 2;
  if (!Number.isInteger(columns) || columns < 1 || columns > 1000) {
    throw new RangeError('columns must be an integer in [1, 1000].');
  }
  const widths = Array.from({ length: columns }, () => 0);
  const heights = Array.from({ length: Math.ceil(entities.length / columns) }, () => 0);
  entities.forEach((entity, i) => {
    widths[i % columns] = Math.max(widths[i % columns]!, entity.width);
    heights[Math.floor(i / columns)] = Math.max(heights[Math.floor(i / columns)]!, entity.height);
  });
  const factor = options.align === 'end' ? 1 : options.align === 'center' ? 0.5 : 0;
  return entities.map((entity, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = options.x + widths.slice(0, col).reduce((a, b) => a + b + gap, 0) + (widths[col]! - entity.width) * factor;
    const y = options.y + heights.slice(0, row).reduce((a, b) => a + b + gap, 0) + (heights[row]! - entity.height) * factor;
    return { ...structuredClone(entity), x, y };
  });
}

/** Quantitative positions are never silently clamped or replaced by ordinal spacing. */
export function linearPosition(value: number, start: number, end: number, left: number, right: number): number {
  for (const [name, n] of Object.entries({ value, start, end, left, right })) {
    finite(n, name);
  }
  if (end <= start || right <= left) {
    throw new RangeError('Scale domains and ranges must increase.');
  }
  if (value < start || value > end) {
    throw new RangeError(`Time ${value} lies outside [${start}, ${end}].`);
  }
  return left + (value - start) / (end - start) * (right - left);
}

export interface TimelineLane { id: string; label: string }
export interface TimelineItem {
  id: string;
  lane: string;
  kind: 'event' | 'interval';
  start: number;
  end?: number;
  label: string;
  closed?: 'left' | 'right' | 'both' | 'neither';
}
export interface TimelineInput {
  start: number;
  end: number;
  width: number;
  laneHeight?: number;
  labelWidth?: number;
  origin?: number;
  lanes: readonly TimelineLane[];
  items: readonly TimelineItem[];
  ticks?: readonly number[];
}
export interface TimelineGeometry {
  height: number;
  left: number;
  right: number;
  axisY: number;
  originX?: number;
  lanes: { key: string; label: string; y: number }[];
  ticks: { key: string; text: string; x: number; y: number }[];
  marks: {
    key: string; label: string; event: boolean; interval: boolean;
    x: number; y: number; endX: number; width: number;
    labelX: number; labelY: number; labelAnchor: 'start' | 'middle';
    startFill: string; endFill: string;
  }[];
}

export function timelineGeometry(input: TimelineInput): TimelineGeometry {
  finite(input.width, 'width', true);
  const laneHeight = input.laneHeight ?? 64;
  const left = input.labelWidth ?? 148;
  const right = input.width - 40;
  finite(laneHeight, 'laneHeight', true);
  finite(left, 'labelWidth');
  if (left < 0 || right - left < 100) {
    throw new RangeError('Timeline requires at least 100 px of plot width.');
  }
  if (!input.lanes.length || input.lanes.length > 32) {
    throw new RangeError('Use 1 to 32 timeline lanes.');
  }
  if (input.items.length > 512) {
    throw new RangeError('Use at most 512 timeline items.');
  }
  const scale = (time: number): number => linearPosition(time, input.start, input.end, left, right);
  scale(input.start);
  const laneIds = new Map<string, number>();
  input.lanes.forEach((lane, i) => {
    if (!lane.id || laneIds.has(lane.id)) {
      throw new RangeError('Timeline lane IDs must be unique and nonempty.');
    }
    laneIds.set(lane.id, i);
  });
  const axisY = 42;
  const ids = new Set<string>();
  const marks = input.items.map((item, i) => {
    if (!item.id || ids.has(item.id)) {
      throw new RangeError('Timeline item IDs must be unique and nonempty.');
    }
    ids.add(item.id);
    const lane = laneIds.get(item.lane);
    if (lane === undefined) {
      throw new RangeError(`Unknown timeline lane: ${item.lane}`);
    }
    if (!['event', 'interval'].includes(item.kind)) {
      throw new RangeError(`Unknown timeline item kind: ${item.kind}`);
    }
    const event = item.kind === 'event';
    if (!event && (item.end === undefined || item.end <= item.start)) {
      throw new RangeError(`Interval ${item.id} requires end > start.`);
    }
    if (event && item.end !== undefined) {
      throw new RangeError(`Event ${item.id} must not specify end.`);
    }
    const closed = item.closed ?? 'left';
    if (!['left', 'right', 'both', 'neither'].includes(closed)) {
      throw new RangeError('Invalid endpoint closure.');
    }
    const x = scale(item.start);
    const endX = event ? x : scale(item.end!);
    const y = 94 + lane * laneHeight;
    return {
      key: `item${i}`, label: item.label, event, interval: !event,
      x, y, endX, width: endX - x,
      labelX: event ? x + 10 : (x + endX) / 2,
      labelY: y - 12,
      labelAnchor: event ? 'start' as const : 'middle' as const,
      startFill: closed === 'left' || closed === 'both' ? 'currentColor' : 'white',
      endFill: closed === 'right' || closed === 'both' ? 'currentColor' : 'white',
    };
  });
  const ticks = input.ticks ?? Array.from({ length: 5 }, (_, i) => input.start + (input.end - input.start) * i / 4);
  if (ticks.length > 64 || new Set(ticks).size !== ticks.length) {
    throw new RangeError('Use at most 64 unique ticks.');
  }
  return {
    height: 120 + (input.lanes.length - 1) * laneHeight,
    left, right, axisY,
    ...(input.origin === undefined ? {} : { originX: scale(input.origin) }),
    lanes: input.lanes.map((lane, i) => ({ key: `lane${i}`, label: lane.label, y: 94 + i * laneHeight })),
    ticks: ticks.map((time, i) => ({ key: `tick${i}`, text: String(Math.round(time * 1000) / 1000), x: scale(time), y: axisY })),
    marks,
  };
}
