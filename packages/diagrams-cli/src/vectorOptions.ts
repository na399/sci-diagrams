import {
  loadSvgAssetFiles, parsePhysicalLength, toMillimeters, type RendererOptions,
} from '@eraserlabs/diagrams';
import { createScientificLibrary, scientificNormalizers } from '@eraserlabs/diagrams/scientific';
import { booleanFlag, choiceFlag, stringFlag, type Flags } from './args.js';
import { CliError } from './errors.js';

type VectorOptions = Pick<RendererOptions, 'library' | 'normalizers' | 'svgOptions' | 'svgAssets' | 'transparentBackground'>;

/** Explicit CLI overrides; the existing config file and custom-library mechanism stay intact. */
export async function vectorOptionsFrom(flags: Flags): Promise<VectorOptions> {
  const profile = choiceFlag(flags, 'profile', ['scientific', 'scientific-web'] as const);
  const rawWidth = stringFlag(flags, 'width');
  let widthMm: number | undefined;
  try { widthMm = rawWidth === undefined ? undefined : toMillimeters(parsePhysicalLength(rawWidth)); }
  catch (error) { throw new CliError(`--width: ${(error as Error).message}`); }
  const assets = stringFlag(flags, 'assets');
  let svgAssets: Record<string, string> | undefined;
  try { svgAssets = assets === undefined ? undefined : await loadSvgAssetFiles(assets); }
  catch (error) { throw new CliError(`--assets: ${(error as Error).message}`); }
  const transparent = booleanFlag(flags, 'transparent');
  return {
    ...(profile ? {
      library: createScientificLibrary(profile === 'scientific-web' ? 'web' : 'publication'),
      normalizers: scientificNormalizers,
    } : {}),
    ...(widthMm !== undefined || transparent ? {
      svgOptions: { ...(widthMm === undefined ? {} : { widthMm }), ...(transparent ? { background: 'transparent' as const } : {}) },
    } : {}),
    ...(transparent ? { transparentBackground: true } : {}),
    ...(svgAssets ? { svgAssets } : {}),
  };
}
