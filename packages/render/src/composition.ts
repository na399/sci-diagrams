/** Deterministic measured-box composition, independent of DOM and domain vocabulary. */
export interface CompositionBox { x: number; y: number; width: number; height: number }
export interface CompositionSpec {
  type: 'row' | 'column' | 'grid' | 'stack' | 'overlay';
  gap?: number; padding?: number; header?: number; columns?: number;
  align?: 'start' | 'center' | 'end'; offsetX?: number; offsetY?: number;
}
export interface CompositionNode {
  id: string; containerId?: string | null; x?: number; y?: number; width: number; height: number;
  layout?: CompositionSpec;
  /** Generated coordinates stay flow-owned when a measured document is resubmitted. */
  layoutItem?: 'flow' | 'absolute';
}
export interface CompositionResult { boxes: Record<string, CompositionBox>; flowIds: string[] }
export class CompositionError extends Error {
  readonly code = 'E_COMPOSITION';
  constructor(message: string, readonly elementId?: string) { super(message); this.name = 'CompositionError'; }
}
function length(value: unknown, fallback: number, name: string, id: string): number {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < 0 || result > 1e6) {
    throw new CompositionError(`${name} must be finite and in [0, 1000000].`, id);
  }
  return result;
}
function spec(value: CompositionSpec, id: string): Required<CompositionSpec> {
  if (!value || !['row', 'column', 'grid', 'stack', 'overlay'].includes(value.type)) { throw new CompositionError('Unknown composition type.', id); }
  const columns = value.columns ?? 2;
  if (!Number.isInteger(columns) || columns < 1 || columns > 1000) { throw new CompositionError('columns must be an integer in [1, 1000].', id); }
  const align = value.align ?? 'start';
  if (!['start', 'center', 'end'].includes(align)) { throw new CompositionError('Unknown alignment.', id); }
  return { type: value.type, columns, align,
    gap: length(value.gap, 16, 'gap', id), padding: length(value.padding, 12, 'padding', id),
    header: length(value.header, 32, 'header', id), offsetX: length(value.offsetX, 12, 'offsetX', id), offsetY: length(value.offsetY, 12, 'offsetY', id) };
}
/** Minimum measured sizes enter; absolute scene-space boxes leave. No input mutation. */
export function composeLayout(input: readonly CompositionNode[]): CompositionResult {
  if (input.length > 10000) { throw new CompositionError('At most 10000 nodes are allowed.'); }
  const byId = new Map<string, CompositionNode>();
  const children = new Map<string, CompositionNode[]>();
  const specifications = new Map<string, Required<CompositionSpec>>();
  for (const source of input) {
    if (!source.id || byId.has(source.id)) { throw new CompositionError('IDs must be nonempty and unique.', source.id); }
    const node = structuredClone(source);
    for (const field of ['width', 'height'] as const) {
      if (length(node[field], 0, field, node.id) <= 0) { throw new CompositionError(`${field} must be positive.`, node.id); }
    }
    if ((node.x === undefined) !== (node.y === undefined)) { throw new CompositionError('Supply both x and y or neither.', node.id); }
    if (node.x !== undefined) { length(node.x, 0, 'x', node.id); length(node.y, 0, 'y', node.id); }
    if (node.layoutItem !== undefined && !['flow', 'absolute'].includes(node.layoutItem)) { throw new CompositionError('layoutItem must be flow or absolute.', node.id); }
    if (node.layout) { specifications.set(node.id, spec(node.layout, node.id)); }
    byId.set(node.id, node);
  }
  const flow = new Set<string>();
  for (const node of byId.values()) {
    const parent = node.containerId ? byId.get(node.containerId) : undefined;
    if (node.containerId && !parent) { throw new CompositionError('Unknown container.', node.id); }
    if (parent) { const list = children.get(parent.id) ?? []; list.push(node); children.set(parent.id, list); }
    const automatic = node.layoutItem === 'flow' || node.x === undefined;
    if (automatic) {
      if (!parent || !specifications.has(parent.id)) { throw new CompositionError('An unpositioned/flow node requires a composed parent.', node.id); }
      if (node.layoutItem === 'absolute') { throw new CompositionError('Absolute nodes require x and y.', node.id); }
      flow.add(node.id);
    }
  }
  const sizes = new Map<string, { width: number; height: number }>();
  const local = new Map<string, { x: number; y: number }>(); const visiting = new Set<string>();
  function measure(node: CompositionNode, depth = 0): { width: number; height: number } {
    if (depth > 128) { throw new CompositionError('Composition nesting exceeds 128 levels.', node.id); }
    if (visiting.has(node.id)) { throw new CompositionError('Containment cycle.', node.id); }
    const cached = sizes.get(node.id); if (cached) { return cached; }
    visiting.add(node.id);
    const members = children.get(node.id) ?? [];
    for (const child of members) { measure(child, depth + 1); }
    let width = node.width; let height = node.height; const layout = specifications.get(node.id);
    if (layout) {
      const auto = members.filter((child) => flow.has(child.id));
      const factor = layout.align === 'center' ? 0.5 : layout.align === 'end' ? 1 : 0;
      if (layout.type === 'overlay' || layout.type === 'stack') {
        const dx = layout.type === 'stack' ? layout.offsetX : 0; const dy = layout.type === 'stack' ? layout.offsetY : 0;
        const innerW = Math.max(0, ...auto.map((child, i) => sizes.get(child.id)!.width + i * dx));
        const innerH = Math.max(0, ...auto.map((child, i) => sizes.get(child.id)!.height + i * dy));
        auto.forEach((child, i) => {
          const size = sizes.get(child.id)!;
          local.set(child.id, { x: layout.padding + i * dx + (innerW - i * dx - size.width) * factor,
            y: layout.padding + layout.header + i * dy + (innerH - i * dy - size.height) * factor });
        });
        width = Math.max(width, innerW + 2 * layout.padding); height = Math.max(height, innerH + 2 * layout.padding + layout.header);
      } else {
        const count = layout.type === 'row' ? Math.max(1, auto.length) : layout.type === 'column' ? 1 : layout.columns;
        const rows = Math.ceil(auto.length / count);
        const ws = Array.from({ length: Math.min(count, auto.length) }, () => 0); const hs = Array.from({ length: rows }, () => 0);
        auto.forEach((child, i) => { const size = sizes.get(child.id)!; ws[i % count] = Math.max(ws[i % count]!, size.width); hs[Math.floor(i / count)] = Math.max(hs[Math.floor(i / count)]!, size.height); });
        const offsets = (values: number[], start: number): number[] => {
          let cursor = start; return values.map((value) => { const at = cursor; cursor += value + layout.gap; return at; });
        };
        const xs = offsets(ws, layout.padding); const ys = offsets(hs, layout.padding + layout.header);
        auto.forEach((child, i) => { const size = sizes.get(child.id)!; const col = i % count; const row = Math.floor(i / count);
          local.set(child.id, { x: xs[col]! + (ws[col]! - size.width) * factor, y: ys[row]! + (hs[row]! - size.height) * factor }); });
        width = Math.max(width, ws.reduce((a, b) => a + b, 0) + Math.max(0, ws.length - 1) * layout.gap + 2 * layout.padding);
        height = Math.max(height, hs.reduce((a, b) => a + b, 0) + Math.max(0, rows - 1) * layout.gap + 2 * layout.padding + layout.header);
      }
      if (flow.has(node.id) && members.some((child) => !flow.has(child.id))) { throw new CompositionError('A flow-positioned container cannot contain absolute children; use flow throughout that subtree.', node.id); }
      for (const child of members.filter((item) => !flow.has(item.id))) {
        const x = child.x! - node.x!; const y = child.y! - node.y!;
        if (x < layout.padding || y < layout.padding + layout.header) { throw new CompositionError('An absolute child lies before its container content origin.', child.id); }
        const size = sizes.get(child.id)!; width = Math.max(width, x + size.width + layout.padding); height = Math.max(height, y + size.height + layout.padding);
      }
    }
    length(width, 0, 'composed width', node.id); length(height, 0, 'composed height', node.id);
    visiting.delete(node.id); const result = { width, height }; sizes.set(node.id, result); return result;
  }
  for (const node of byId.values()) { measure(node); }
  const boxes: Record<string, CompositionBox> = Object.create(null) as Record<string, CompositionBox>;
  function place(node: CompositionNode, parent?: CompositionBox): void {
    const offset = local.get(node.id);
    const x = flow.has(node.id) ? parent!.x + offset!.x : node.x!; const y = flow.has(node.id) ? parent!.y + offset!.y : node.y!;
    const size = sizes.get(node.id)!; const box = { x, y, ...size }; boxes[node.id] = box;
    for (const child of children.get(node.id) ?? []) { place(child, box); }
  }
  for (const node of byId.values()) { if (!node.containerId) { place(node); } }
  return { boxes, flowIds: [...flow] };
}
