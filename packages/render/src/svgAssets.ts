/// <reference lib="dom" />
import { sanitizeSvgDocument, type SvgSafetyIssue } from './svgSafety.js';
export interface AssetMount { id: string; wrapper: HTMLElement }
export interface SvgAssetWarning extends SvgSafetyIssue { elementId: string }
export class SvgAssetError extends Error { readonly code = 'E_ASSET'; readonly property = 'asset'; constructor(message: string, readonly elementId: string) { super(message); this.name = 'SvgAssetError'; } }
/** Remove only the exact external-only SVG 1.1 doctype emitted by plotting tools. */
export function stripStandardSvgDoctype(source: string): { svg: string; stripped: boolean } {
  const standard = /^(\s*(?:<\?xml\s[^?]*\?>\s*)?)<!DOCTYPE\s+svg\s+PUBLIC\s+["']-\/\/W3C\/\/DTD SVG 1\.1\/\/EN["']\s+["']https?:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd["']\s*>/;
  const svg = source.replace(standard, '$1'); return { svg, stripped: svg !== source };
}
/** Validate all required sources while inert. Failed assets never mount, including for PNG. */
export function mountSvgAssets(mounted: readonly AssetMount[], registry: Readonly<Record<string, string>> = {}): SvgAssetWarning[] {
  const warnings: SvgAssetWarning[] = []; const work: { slot: SVGElement; svg: SVGSVGElement }[] = []; let ordinal = 0; let totalBytes = 0;
  for (const mount of mounted) {
    for (const slot of Array.from(mount.wrapper.querySelectorAll('[data-svg-asset]'))) {
      const key = slot.getAttribute('data-svg-asset') ?? '';
      if (!(slot instanceof SVGElement) || !slot.ownerSVGElement) { throw new SvgAssetError('SVG assets require an SVG slot.', mount.id); }
      if (!Object.prototype.hasOwnProperty.call(registry, key) || typeof registry[key] !== 'string') { throw new SvgAssetError(`No caller-provided SVG asset named "${key}".`, mount.id); }
      const raw = registry[key]!; totalBytes += new TextEncoder().encode(raw).length;
      if (totalBytes > 20 * 1024 * 1024 || ordinal >= 128) { throw new SvgAssetError('SVG asset request exceeds 20 MiB or 128 mounts.', mount.id); }
      const source = stripStandardSvgDoctype(raw); const result = sanitizeSvgDocument({ svg: source.svg, options: { namespace: `sci-asset-${ordinal++}` } });
      if (!result.ok) { throw new SvgAssetError(result.errors.map((issue) => issue.message).join(' ').slice(0, 2000), mount.id); }
      for (const issue of result.warnings) { warnings.push({ ...issue, elementId: mount.id }); }
      if (source.stripped) { warnings.push({ code: 'W_SVG_DOCTYPE', message: 'Standard SVG 1.1 doctype removed without fetching it.', path: '', elementId: mount.id }); }
      const asset = document.importNode(new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
      if (!asset.querySelector('text')) { warnings.push({ code: 'W_SVG_NO_TEXT', message: 'This asset has no editable text; outlined glyphs are not reconstructed.', path: '', elementId: mount.id }); }
      const box = slot.ownerSVGElement.viewBox.baseVal;
      if (!(box.width > 0 && box.height > 0)) { throw new SvgAssetError('Asset slot requires explicit positive viewBox dimensions.', mount.id); }
      asset.setAttribute('x', '0'); asset.setAttribute('y', '0'); asset.setAttribute('width', String(box.width)); asset.setAttribute('height', String(box.height)); asset.setAttribute('preserveAspectRatio', 'xMidYMid meet'); asset.setAttribute('overflow', 'hidden'); work.push({ slot, svg: asset });
    }
  }
  for (const item of work) { item.slot.replaceChildren(item.svg); }
  return warnings;
}
