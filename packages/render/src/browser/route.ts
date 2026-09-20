import { LayoutManager, routeCorridorConnectionBatch, type LayoutConnection, type LayoutEntity } from '@eraserlabs/layout';
import type { ResolvedConnection, ResolvedEntity } from '@eraserlabs/protocol';
import type { Box, ConnectionGeometry, SceneLayout } from '../scene.js';
import { absolutePort, PortError, portRouteMatches, resolvePortBindings } from '../ports.js';
import { ELBOW_CORNER_RADIUS, toPathData } from './roundedPath.js';
import { routeScene as routeBase } from './routeBase.js';
export { externalTextOf } from './routeBase.js';
type Point = [number, number];

/** Named ports refine selected routes with the existing corridor router. */
export function routeScene(entities: ResolvedEntity[], connections: ResolvedConnection[],
  sizes: Map<string, Box>, externalText: Map<string, Box[]>): SceneLayout {
  const bindings = resolvePortBindings(entities, connections);
  const named = connections.filter((edge) => {
    const p = bindings.get(edge.id)!; return p.relativeFromPort || p.relativeToPort;
  });
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  for (const edge of named) {
    if ([edge.props.from, edge.props.to].some((id) => byId.get(id)?.props.outline !== undefined)) {
      throw new PortError('E_PORT', 'Named ports require rectangular routable bodies; use side ports for curved outlines.', edge.id, 'fromPort');
    }
  }
  const initial = routeBase(entities, connections, sizes, externalText);
  if (!named.length) { return initial; }
  const layoutEntities: LayoutEntity[] = entities.map((entity) => {
    const box = initial.boxes[entity.id]!; const labels = externalText.get(entity.id) ?? [];
    const left = Math.min(...labels.map((b) => b.x)); const top = Math.min(...labels.map((b) => b.y));
    const right = Math.max(...labels.map((b) => b.x + b.width)); const bottom = Math.max(...labels.map((b) => b.y + b.height));
    return { id: entity.id, ...box,
      ...(entity.containerId === undefined ? {} : { containerId: entity.containerId }),
      ...(entity.isContainer ? { isContainer: true } : {}),
      ...(labels.length ? { textPlacement: { relativeX: Math.floor(left), relativeY: Math.floor(top),
        width: Math.ceil(right) - Math.floor(left), height: Math.ceil(bottom) - Math.floor(top) } } : {}),
    };
  });
  const incumbent = (edge: ResolvedConnection): LayoutConnection => {
    const geometry = initial.connections[edge.id]!;
    return { id: edge.id, from: edge.props.from, to: edge.props.to, x: 0, y: 0,
      points: geometry.points.map(([x, y]): Point => [x, y]),
      ...(geometry.labelBox ? { textPlacement: { ...geometry.labelBox } } : {}),
    };
  };
  // Diagonal incumbents stay outside the corridor router, as in the upstream bridge.
  const manager = new LayoutManager({ entities: layoutEntities,
    connections: connections.filter((e) => e.props.connectorStyle !== 'straight' && initial.connections[e.id]).map(incumbent) });
  const changed = named.filter((edge) => {
    const geometry = initial.connections[edge.id];
    const from = initial.boxes[edge.props.from]; const to = initial.boxes[edge.props.to];
    if (!geometry || !from || !to) { throw new PortError('E_PORT', 'A named-port connection has no measured endpoint.', edge.id, 'fromPort'); }
    return !portRouteMatches(geometry.points, bindings.get(edge.id)!, from, to);
  });
  const selected = changed.filter((edge) => edge.props.connectorStyle !== 'straight').map((edge) => ({
    ...incumbent(edge), ...bindings.get(edge.id),
    ...(externalText.get(edge.id)?.[0] ? { textPlacement: { ...externalText.get(edge.id)![0]! } } : {}),
  }));
  if (selected.length) {
    const results = routeCorridorConnectionBatch({ layoutManager: manager, connectionsToRoute: selected,
      options: { preservePorts: true, pinUnaffectedRoutes: true, labels: true, repair: true, repairTimeBudgetMs: Number.POSITIVE_INFINITY } });
    for (const result of results ?? []) {
      if (result.status !== 'valid') { throw new PortError('E_PORT', 'No obstacle-safe route can satisfy the named perimeter ports.', result.connectionId, 'fromPort'); }
    }
  }
  const output: SceneLayout = { ...initial, connections: { ...initial.connections } };
  for (const edge of changed) {
    const binding = bindings.get(edge.id)!;
    const from = initial.boxes[edge.props.from]!; const to = initial.boxes[edge.props.to]!;
    let points: Point[]; let labelBox: Box | undefined;
    if (edge.props.connectorStyle === 'straight') {
      points = initial.connections[edge.id]!.points.map(([x, y]): Point => [x, y]);
      if (binding.relativeFromPort) { points[0] = absolutePort(from, binding.relativeFromPort); }
      if (binding.relativeToPort) { points[points.length - 1] = absolutePort(to, binding.relativeToPort); }
      const old = initial.connections[edge.id]!.labelBox; const center = midpoint(points);
      labelBox = old ? { ...old, x: center.x - old.width / 2, y: center.y - old.height / 2 } : undefined;
    } else {
      const route = manager.getConnectionById(edge.id);
      if (!route) { throw new PortError('E_PORT', 'The router did not commit a named-port connection.', edge.id, 'fromPort'); }
      points = route.points.map(([x, y]): Point => [route.x + x, route.y + y]); labelBox = route.textPlacement;
    }
    if (!portRouteMatches(points, binding, from, to)) {
      throw new PortError('E_PORT', 'The router moved a required named port; the figure was not exported.', edge.id, 'fromPort');
    }
    const geometry: ConnectionGeometry = { points,
      d: toPathData(points, edge.props.cornerStyle === 'elbow' ? ELBOW_CORNER_RADIUS : 0),
      label: labelBox ? { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 } : midpoint(points),
      ...(labelBox ? { labelBox } : {}),
    };
    output.connections[edge.id] = geometry;
  }
  output.scene = sceneBounds(output); return output;
}
function midpoint(points: Point[]): { x: number; y: number } {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i]!;
    if (remaining <= length) {
      const ratio = length ? remaining / length : 0; const a = points[i]!; const b = points[i + 1]!;
      return { x: a[0] + (b[0] - a[0]) * ratio, y: a[1] + (b[1] - a[1]) * ratio };
    }
    remaining -= length;
  }
  const p = points[0] ?? [0, 0]; return { x: p[0]!, y: p[1]! };
}
function sceneBounds(layout: SceneLayout): Box {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  const point = (x: number, y: number): void => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); };
  const box = (b: Box): void => { point(b.x, b.y); point(b.x + b.width, b.y + b.height); };
  Object.values(layout.boxes).forEach(box);
  for (const edge of Object.values(layout.connections)) { edge.points.forEach(([x, y]) => point(x, y)); if (edge.labelBox) { box(edge.labelBox); } }
  return Number.isFinite(left) ? { x: left - 16, y: top - 16, width: right - left + 32, height: bottom - top + 32 } : { x: 0, y: 0, width: 32, height: 32 };
}
