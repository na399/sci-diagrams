import type { ResolvedConnection, ResolvedElement, ResolvedEntity } from '@eraserlabs/protocol';
import type { SceneLayout } from '@eraserlabs/render';
import { externalTextOf, routeScene } from './route.js';
import { createFillEngine } from './fill.js';
import { injectStyles, mountScene } from './mount.js';
import { measureIntrinsics, measureScene, type ElementMeasure, type MeasuredBox } from './measure.js';
import { applyLayout } from './apply.js';
import { registerFonts, FONTS_STYLE_ID } from './fonts.js';
import { prepareWashMasters } from './masters.js';
import { constrainConnectionLabels, deferConstrainedConnectionLabels, resolveTextSizedElements } from './textSizing.js';
import { composeMeasuredScene } from './composition.js';
import { lintSvgPublication } from '../publication.js';
import { sanitizeSvgDocument } from '../svgSafety.js';
export type { WireFontFace, UrlFontFace, RegisterFontsRequest } from './fonts.js';
export type { ElementMeasure, MeasuredBox } from './measure.js';
export interface PageSetup { templates: Record<string, { html: string; css: string }>; baseCss: string; washMaster?: string }
export interface RunRequest { entities: ResolvedEntity[]; connections: ResolvedConnection[]; icons: Record<string, string> }
export interface RunResult { measures: ElementMeasure[]; layout: SceneLayout; flowIds?: string[] }
export interface SerializedScene { scene: string; css: string }
let templatesHtml: Record<string, string> | undefined; let washMaster: string | undefined;
function setup(config: PageSetup): void {
  templatesHtml = {}; washMaster = config.washMaster; const scoped: string[] = [];
  for (const [name, template] of Object.entries(config.templates)) { templatesHtml[name] = template.html; if (template.css.trim() !== '') { scoped.push(scopeCss(name, template.css)); } }
  injectStyles(config.baseCss + scoped.join(''));
}
function scopeCss(name: string, css: string): string { return `@scope([data-mdp-tag="${name}"]) to ([data-mdp-tag]){${css}}`; }
async function run(request: RunRequest): Promise<RunResult> {
  if (!templatesHtml) { throw new Error('__eraser.run before __eraser.setup'); }
  const { entities, connections } = request; const all: ResolvedElement[] = [...entities, ...connections];
  const washDefs = await prepareWashMasters(washMaster, all); const fill = createFillEngine({ templates: templatesHtml, icons: request.icons });
  const { scene, mounted } = mountScene(all, fill); if (washDefs !== '') { scene.insertAdjacentHTML('afterbegin', washDefs); }
  await document.fonts.ready; const intrinsics = measureIntrinsics(mounted); const resolvedSizes = resolveTextSizedElements(entities, mounted, intrinsics);
  const composed = composeMeasuredScene(entities, mounted, resolvedSizes); const activeEntities = composed.entities;
  let measures = measureScene(mounted, intrinsics); let finalExternalText = externalTextOf(measures);
  const provisional = deferConstrainedConnectionLabels(connections, mounted, finalExternalText); let layout = routeScene(activeEntities, connections, resolvedSizes, provisional.externalText);
  if (provisional.deferred) { constrainConnectionLabels(connections, mounted, layout); measures = measureScene(mounted, intrinsics); finalExternalText = externalTextOf(measures); layout = routeScene(activeEntities, connections, resolvedSizes, finalExternalText); }
  for (let pass = 0; pass < 2; pass += 1) { if (!constrainConnectionLabels(connections, mounted, layout)) { break; } measures = measureScene(mounted, intrinsics); finalExternalText = externalTextOf(measures); layout = routeScene(activeEntities, connections, resolvedSizes, finalExternalText); }
  applyLayout(scene, mounted, layout, containmentZIndex(all), measures); attachContainerContent(all, measures, layout);
  return { measures, layout, ...(composed.flowIds.length ? { flowIds: composed.flowIds } : {}) };
}
function containmentZIndex(elements: ResolvedElement[]): Map<string, number> {
  const byId = new Map(elements.map((element) => [element.id, element])); const nestedIds = new Set(elements.map((element) => element.containerId).filter((id): id is string => typeof id === 'string'));
  const depthOf = (element: ResolvedElement): number => { let depth = 0; let current = typeof element.containerId === 'string' ? element.containerId : undefined; while (current !== undefined && depth <= elements.length) { depth += 1; const parent = byId.get(current)?.containerId; current = typeof parent === 'string' ? parent : undefined; } return depth; };
  return new Map(elements.map((element) => [element.id, depthOf(element) * 2 + ((element as ResolvedEntity).isContainer === true || nestedIds.has(element.id) ? 0 : 1)]));
}
function attachContainerContent(elements: ResolvedElement[], measures: ElementMeasure[], layout: SceneLayout): void {
  const contentById = new Map<string, MeasuredBox>();
  for (const element of elements) { const box = layout.boxes[element.id]; if (typeof element.containerId !== 'string' || !box) { continue; } const current = contentById.get(element.containerId); if (!current) { contentById.set(element.containerId, { ...box }); continue; } const right = Math.max(current.x + current.width, box.x + box.width); const bottom = Math.max(current.y + current.height, box.y + box.height); current.x = Math.min(current.x, box.x); current.y = Math.min(current.y, box.y); current.width = right - current.x; current.height = bottom - current.y; }
  for (const measure of measures) { const content = contentById.get(measure.id); if (content) { measure.content = content; } }
}
function serialize(): SerializedScene { const scene = document.getElementById('eraser-scene'); if (!scene) { throw new Error('__eraser.serialize before __eraser.run'); } const css = [FONTS_STYLE_ID, 'eraser-styles'].map((id) => document.getElementById(id)?.textContent ?? '').join(''); return { scene: scene.outerHTML, css }; }
const api = { setup, registerFonts, run, serialize, lintSvg: lintSvgPublication, sanitizeSvg: sanitizeSvgDocument };
export type EraserBrowserApi = typeof api;
declare global { interface Window { __eraser: EraserBrowserApi } }
window.__eraser = api;
