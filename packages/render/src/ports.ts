/** Named perimeter ports lower to the router's existing relative-port/face contracts. */
export type PortFace = 'up' | 'down' | 'left' | 'right';
export interface NamedPort {
  id: string;
  x: number;
  y: number;
  /** Selects the exit face explicitly when a port lies at a corner. */
  side?: 'top' | 'bottom' | 'left' | 'right';
}
export interface PortEntity { id: string; props: Record<string, unknown> }
export interface PortConnection { id: string; props: Record<string, unknown> & { from: string; to: string } }
export interface PortBinding {
  relativeFromPort?: [number, number]; relativeToPort?: [number, number];
  authoredFromFace?: PortFace; authoredToFace?: PortFace;
}
export class PortError extends Error {
  constructor(readonly code: 'E_PORT' | 'E_UNKNOWN_PORT', message: string, readonly elementId: string,
    readonly property: string) { super(message); this.name = 'PortError'; }
}
const faces: Record<string, PortFace> = { top: 'up', bottom: 'down', left: 'left', right: 'right' };
const own = (value: object, name: string): boolean => Object.prototype.hasOwnProperty.call(value, name);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateNamedPorts(value: unknown, entityId: string): NamedPort[] {
  if (value === undefined) { return []; }
  if (!Array.isArray(value) || value.length > 128) {
    throw new PortError('E_PORT', 'ports must be an array of at most 128 definitions.', entityId, 'ports');
  }
  const used = new Set<string>();
  return value.map((item, index) => {
    const property = `ports/${index}`;
    if (!record(item) || typeof item.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.id) ||
      used.has(item.id) || own(faces, item.id)) {
      throw new PortError('E_PORT', 'Port IDs must be unique identifiers and cannot use reserved side names.', entityId, property);
    }
    used.add(item.id);
    if (typeof item.x !== 'number' || typeof item.y !== 'number' ||
      !Number.isFinite(item.x) || !Number.isFinite(item.y) ||
      item.x < 0 || item.x > 1 || item.y < 0 || item.y > 1 ||
      !(item.x === 0 || item.x === 1 || item.y === 0 || item.y === 1)) {
      throw new PortError('E_PORT', 'A port must lie on the normalized [0,1] body perimeter.', entityId, property);
    }
    const side = item.side;
    if (side !== undefined && (typeof side !== 'string' || !own(faces, side) ||
      (side === 'top' && item.y !== 0) || (side === 'bottom' && item.y !== 1) ||
      (side === 'left' && item.x !== 0) || (side === 'right' && item.x !== 1))) {
      throw new PortError('E_PORT', 'The requested port side does not contain its coordinate.', entityId, property);
    }
    return { id: item.id, x: item.x, y: item.y, ...(side === undefined ? {} : { side: side as NamedPort['side'] }) } as NamedPort;
  });
}
function faceOf(port: NamedPort): PortFace {
  if (port.side) { return faces[port.side]!; }
  return port.y === 0 ? 'up' : port.y === 1 ? 'down' : port.x === 0 ? 'left' : 'right';
}
/** Validates even unused definitions without mutating resolved or authored data. */
export function resolvePortBindings(entities: readonly PortEntity[], connections: readonly PortConnection[]): Map<string, PortBinding> {
  const ports = new Map<string, Map<string, NamedPort>>();
  for (const entity of entities) {
    ports.set(entity.id, new Map(validateNamedPorts(entity.props.ports, entity.id).map((p) => [p.id, p])));
  }
  const result = new Map<string, PortBinding>();
  for (const connection of connections) {
    const binding: PortBinding = {};
    for (const endpoint of ['from', 'to'] as const) {
      const property = `${endpoint}Port`; const name = connection.props[property];
      if (name === undefined) { continue; }
      if (typeof name !== 'string') {
        throw new PortError('E_PORT', `${property} must be a side or a named port.`, connection.id, property);
      }
      if (own(faces, name)) {
        if (endpoint === 'from') { binding.authoredFromFace = faces[name]!; }
        else { binding.authoredToFace = faces[name]!; }
        continue;
      }
      const entityId = connection.props[endpoint]; const port = ports.get(entityId)?.get(name);
      if (!port) { throw new PortError('E_UNKNOWN_PORT', `Unknown port "${name}" on entity "${entityId}".`, connection.id, property); }
      if (endpoint === 'from') { binding.relativeFromPort = [port.x, port.y]; binding.authoredFromFace = faceOf(port); }
      else { binding.relativeToPort = [port.x, port.y]; binding.authoredToFace = faceOf(port); }
    }
    result.set(connection.id, binding);
  }
  return result;
}
/** The existing router snaps bodies and endpoint tracks to whole CSS pixels. */
export function absolutePort(box: { x: number; y: number; width: number; height: number }, port: readonly [number, number]): [number, number] {
  return [Math.round(box.x + box.width * port[0]), Math.round(box.y + box.height * port[1])];
}
export function portRouteMatches(points: readonly (readonly [number, number])[], binding: PortBinding,
  from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }): boolean {
  const matches = (actual: readonly [number, number] | undefined, expected: readonly [number, number]): boolean =>
    actual !== undefined && Math.abs(actual[0] - expected[0]) <= 0.51 && Math.abs(actual[1] - expected[1]) <= 0.51;
  return (!binding.relativeFromPort || matches(points[0], absolutePort(from, binding.relativeFromPort))) &&
    (!binding.relativeToPort || matches(points.at(-1), absolutePort(to, binding.relativeToPort)));
}
