import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { buildHtmlDocument, serializeSvgScene, type SvgExportOptions, type SvgIssue, type Box, type SceneLayout } from '@eraserlabs/render';
import { TimeTracker } from '@eraserlabs/utils';
import { createResolver, type AuthoredConnection, type AuthoredEntity, type AuthoredLibrary, type AuthoredRecord, type DiagramInput, type ElementNormalizer, type FontsConfig, type IconLoader, type Issue, type RegistryInfo, type TemplateOverrides, type ValidationResult } from '@eraserlabs/resolve';
import { stockLibrary } from './library/index.js';
import { stockNormalizers } from './library/normalizers.js';
import { buildRenderPageSetup } from './library/pageSetup.js';
import { createEraserIconLoader } from './icons/eraserLoader.js';
import { stageFonts, type StagedFonts } from './fonts/staging.js';
import { injectFonts, prepareFontsRequest } from './fonts/inject.js';
import { buildEmbeddedFontCss } from './fonts/embed.js';
import { eraserFonts } from './fonts/eraserFonts.js';
import { runWithDiagnostics, runtimeIssue, sourcePaths } from './browserRun.js';
export type BrowserProvider = () => Promise<Browser>;
interface CommonRendererOptions {
  library?: AuthoredLibrary; overrides?: TemplateOverrides; normalizers?: Record<string, ElementNormalizer>;
  iconLoader?: IconLoader; fonts?: FontsConfig; onUnknownIcon?: 'placeholder' | 'error';
  pages?: number; deviceScaleFactor?: number; svgOptions?: SvgExportOptions;
  transparentBackground?: boolean; outputs?: OutputRequest;
}
export type RendererOptions = CommonRendererOptions & ({ chromiumPath: string; browser?: never } | { browser: BrowserProvider; chromiumPath?: never });
/** Independent flags from one resolution and browser run. Omitted means PNG. */
export interface OutputRequest { png?: boolean; html?: boolean; json?: boolean; svg?: boolean }
export type DiagramJsonEntity = AuthoredEntity;
export type DiagramJsonConnection = AuthoredConnection;
export type DiagramJsonElement = DiagramJsonEntity | DiagramJsonConnection;
/** Pristine authored values plus measured geometry and explicit flow-position ownership. */
export interface DiagramJson { entities: DiagramJsonEntity[]; connections: DiagramJsonConnection[]; scene: Box }
export type RenderRequest = DiagramInput & { outputs?: OutputRequest };
type OutputSelection = { outputs?: OutputRequest };
type RequestedOutputs<R extends OutputSelection> = R['outputs'] extends OutputRequest ? R['outputs'] : { png: true };
type OutputField<O extends OutputRequest, K extends keyof OutputRequest, V> = K extends keyof O ? [O[K]] extends [true] ? { [P in K]: V } : [O[K]] extends [false | undefined] ? unknown : { [P in K]?: V } : unknown;
export type RenderFailure = { ok: false; errors: Issue[]; warnings: Issue[] };
export type RenderSuccess<R extends OutputSelection = { outputs: { png: true } }> = { ok: true; warnings: Issue[]; timingsMs: Record<string, number> } & OutputField<RequestedOutputs<R>, 'png', Buffer> & OutputField<RequestedOutputs<R>, 'html', string> & OutputField<RequestedOutputs<R>, 'json', DiagramJson> & OutputField<RequestedOutputs<R>, 'svg', string>;
export type RenderOutcome<R extends OutputSelection = { outputs: { png: true } }> = RenderSuccess<R> | RenderFailure;
export interface Renderer {
  render<const R extends RenderRequest>(request: R): Promise<RenderOutcome<R>>;
  validate(input: unknown): Promise<ValidationResult>; registryInfo(): RegistryInfo; tagSchema(tag: string): object | undefined;
  degradedFonts: string[]; close(): Promise<void>;
}
const require = createRequire(import.meta.url);
/** Do not persist resolved colors, defaults, sanitizer output or library interpretations. */
function toDiagramJson(authored: readonly AuthoredRecord[], layout: SceneLayout, flowIds: readonly string[] = []): DiagramJson {
  const entities: DiagramJsonEntity[] = []; const connections: DiagramJsonConnection[] = []; const flow = new Set(flowIds);
  for (const { id, kind, source } of authored) {
    if (kind === 'entity') {
      const element = structuredClone(source) as DiagramJsonEntity; const box = layout.boxes[id];
      if (box) { element.x = box.x; element.y = box.y; element.width = box.width; element.height = box.height; }
      if (flow.has(id)) { element.layoutItem = 'flow'; } entities.push(element); continue;
    }
    const element = structuredClone(source) as DiagramJsonConnection; const geometry = layout.connections[id]; const origin = geometry?.points[0];
    if (geometry && origin) {
      const [originX, originY] = origin; const label = geometry.labelBox; element.x = originX; element.y = originY;
      element.points = geometry.points.map(([x, y]) => ({ x: x - originX, y: y - originY }));
      if (label) { element.labelPlacement = { x: Math.round(label.x - originX), y: Math.round(label.y - originY), width: Math.round(label.width), height: Math.round(label.height) }; }
    }
    connections.push(element);
  }
  return { entities, connections, scene: layout.scene };
}
/** Existing conductor: injected I/O, warm pages, one pipeline and independent outputs. */
export async function createRenderer(options: RendererOptions): Promise<Renderer> {
  const defaultOutputs: OutputRequest = options.outputs ?? { png: true };
  const browserProvider: BrowserProvider | undefined = options.browser ?? (options.chromiumPath ? () => chromium.launch({ executablePath: options.chromiumPath, args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] }) : undefined);
  if (!browserProvider) { throw new TypeError('createRenderer requires either chromiumPath or browser.'); }
  const resolver = await createResolver({ library: options.library ?? stockLibrary, ...(options.overrides ? { overrides: options.overrides } : {}), normalizers: options.normalizers ?? stockNormalizers, iconLoader: options.iconLoader ?? createEraserIconLoader(), ...(options.onUnknownIcon ? { onUnknownIcon: options.onUnknownIcon } : {}) });
  const staged: StagedFonts = await stageFonts(options.fonts ?? eraserFonts());
  const iifePath = join(dirname(require.resolve('@eraserlabs/render/browser')), 'eraser-render.iife.js'); const pageSetup = buildRenderPageSetup(resolver.library);
  const browser: Browser = await browserProvider(); const context: BrowserContext = await browser.newContext({ deviceScaleFactor: options.deviceScaleFactor ?? 1 });
  const fontsRequest = staged ? prepareFontsRequest(staged) : undefined;
  async function preparePage(): Promise<Page> {
    const page = await context.newPage(); await page.addInitScript({ path: iifePath });
    await page.goto('data:text/html,<!doctype html><html><head></head><body></body></html>');
    await page.evaluate((setup) => window.__eraser.setup(setup), pageSetup); if (fontsRequest) { await injectFonts(page, fontsRequest); } return page;
  }
  const poolSize = Math.max(1, options.pages ?? 1); const pool = await Promise.all(Array.from({ length: poolSize }, preparePage)); const waiters: ((page: Page) => void)[] = [];
  function acquire(): Promise<Page> { const page = pool.pop(); if (page) { return Promise.resolve(page); } return new Promise((resolve) => waiters.push(resolve)); }
  function release(page: Page): void { const waiter = waiters.shift(); if (waiter) { waiter(page); return; } pool.push(page); }
  let embeddedFontCss: string | undefined;
  return {
    degradedFonts: staged?.degraded ?? [], validate: (input) => resolver.validate(input), registryInfo: () => resolver.registryInfo(), tagSchema: (tag) => resolver.tagSchema(tag),
    render: (async (request: RenderRequest) => {
      const requested: OutputRequest = request?.outputs ?? defaultOutputs; const tracker = new TimeTracker(); const resolved = await resolver.resolve(request);
      tracker.mark('resolve'); tracker.merge('resolve', resolved.meta.timingsMs);
      if (!resolved.ok) { return { ok: false as const, errors: resolved.errors, warnings: resolved.warnings }; }
      const paths = sourcePaths(request, resolved.authored ?? []); const page = await acquire();
      try {
        tracker.reset();
        const checked = await page.evaluate(runWithDiagnostics, { entities: resolved.entities ?? [], connections: resolved.connections ?? [], icons: resolved.icons ?? {} });
        tracker.mark('browserRun');
        if (!checked.ok) { return { ok: false as const, errors: [runtimeIssue(checked.failure, paths)], warnings: resolved.warnings }; }
        const run = checked.result; const outcome: Record<string, unknown> = { ok: true, warnings: resolved.warnings, timingsMs: tracker.timings };
        if (requested.json) { outcome['json'] = toDiagramJson(resolved.authored ?? [], run.layout, run.flowIds); }
        if (requested.svg) {
          const serialized = await page.evaluate(serializeSvgScene, options.svgOptions ?? {});
          const qualify = (issues: SvgIssue[]): Issue[] => issues.map((issue) => ({ ...issue, path: issue.elementId ? paths.get(issue.elementId) ?? '' : issue.path }));
          const warnings = [...resolved.warnings, ...qualify(serialized.warnings)];
          if (!serialized.ok) { return { ok: false as const, errors: qualify(serialized.errors), warnings }; }
          outcome['svg'] = serialized.svg; outcome['warnings'] = warnings; tracker.mark('svg');
        }
        if (requested.html) {
          embeddedFontCss ??= staged ? buildEmbeddedFontCss(staged) : ''; const serialized = await page.evaluate(() => window.__eraser.serialize());
          outcome['html'] = buildHtmlDocument({ title: 'Eraser diagram', styles: [embeddedFontCss, serialized.css], body: serialized.scene }); tracker.mark('serialize');
        }
        if (requested.png) { outcome['png'] = await page.locator('#eraser-scene').screenshot({ type: 'png', omitBackground: options.transparentBackground ?? false }); tracker.mark('screenshot'); }
        return outcome;
      } finally { release(page); }
    }) as Renderer['render'],
    async close(): Promise<void> { await context.close(); await browser.close(); },
  };
}
