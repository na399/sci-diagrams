import { NormalizationError } from '@eraserlabs/resolve';
import { validateNamedPorts, PortError } from '@eraserlabs/render';
import { createScientificLibrary as createBaseLibrary, scientificNormalizers as baseNormalizers } from './base.js';
import { withNamedPortSchemas } from './portProfile.js';
import { extendScientificPrimitives, extendPrimitiveNormalizers } from './primitives.js';
export { arrange, linearPosition, timelineGeometry } from './geometry.js';
export type { Arrangement, PositionedEntity, TimelineInput, TimelineItem, TimelineLane } from './geometry.js';
export { annotationGeometry } from './primitives.js';

/** Stock Eraser is unaffected; this opt-in MDP profile supplies scientific SVG components. */
export function createScientificLibrary(theme: 'publication' | 'web' = 'publication') {
  return withNamedPortSchemas(extendScientificPrimitives(createBaseLibrary(theme)));
}
export const scientificLibrary = createScientificLibrary();
export const scientificNormalizers: Record<string, (element: Record<string, unknown>) => void> = Object.fromEntries(
  Object.entries(extendPrimitiveNormalizers(baseNormalizers)).map(([tag, normalize]) => [tag,
    (element: Record<string, unknown>): void => {
      try { validateNamedPorts(element.ports, String(element.id)); normalize(element); }
      catch (error) {
        if (error instanceof PortError) { throw new NormalizationError(error.message, `/${error.property}`); }
        if (error instanceof RangeError) { throw new NormalizationError(error.message); }
        throw error;
      }
    },
  ]),
);
export const library = scientificLibrary;
export const normalizers = scientificNormalizers;
