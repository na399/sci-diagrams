import type { ResolvedEntity } from '@eraserlabs/protocol';
import { composeLayout, CompositionError, type CompositionSpec, type CompositionNode } from '../composition.js';
import type { Box } from '../scene.js';
import type { MountedElement } from './mount.js';
/** Compose measured bodies before routing; expand frame paint without scaling labels. */
export function composeMeasuredScene(entities: ResolvedEntity[], mounted: MountedElement[], sizes: Map<string, Box>): { entities: ResolvedEntity[]; flowIds: string[] } {
  if (!entities.some((entity) => entity.props.layout !== undefined || entity.props.layoutItem !== undefined)) { return { entities, flowIds: [] }; }
  const nodes: CompositionNode[] = entities.map((entity) => {
    const size = sizes.get(entity.id);
    if (!size) { throw new CompositionError('Missing measured body.', entity.id); }
    if (entity.props.layout !== undefined && !entity.isContainer) { throw new CompositionError('Only a semantic container can compose children.', entity.id); }
    return { id: entity.id, width: size.width, height: size.height,
      ...(entity.x === undefined ? {} : { x: entity.x }), ...(entity.y === undefined ? {} : { y: entity.y }),
      ...(entity.containerId === undefined ? {} : { containerId: entity.containerId }),
      ...(entity.props.layout === undefined ? {} : { layout: entity.props.layout as CompositionSpec }),
      ...(entity.props.layoutItem === undefined ? {} : { layoutItem: entity.props.layoutItem as 'flow' | 'absolute' }),
    };
  });
  const result = composeLayout(nodes); const mounts = new Map(mounted.map((mount) => [mount.id, mount]));
  const output = entities.map((entity) => {
    const box = result.boxes[entity.id]!; const mount = mounts.get(entity.id)!; const size = sizes.get(entity.id)!;
    if (box.width !== size.width || box.height !== size.height) {
      const root = mount.wrapper.querySelector('[data-role="body"]');
      if (root instanceof SVGSVGElement) {
        const frames = root.querySelectorAll<SVGRectElement>('[data-part="frame"]');
        if (!frames.length) { throw new CompositionError('A resizable SVG container requires a frame part.', entity.id); }
        root.setAttribute('width', String(box.width)); root.setAttribute('height', String(box.height)); root.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
        for (const frame of frames) { frame.setAttribute('width', String(Math.max(0, box.width - 2))); frame.setAttribute('height', String(Math.max(0, box.height - 2))); }
      }
    }
    mount.wrapper.style.width = `${box.width}px`; mount.wrapper.style.height = `${box.height}px`;
    sizes.set(entity.id, { x: 0, y: 0, width: box.width, height: box.height });
    return { ...entity, x: box.x, y: box.y, width: box.width, height: box.height };
  });
  return { entities: output, flowIds: result.flowIds };
}
