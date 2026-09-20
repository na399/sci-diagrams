import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import {
  buildHtmlDocument, serializeSvgScene, type SvgExportOptions, type SvgIssue,
  type Box, type SceneLayout, type PublicationOptions, type PublicationReport,
} from '@eraserlabs/render';
import { TimeTracker } from '@eraserlabs/utils';
import {
  createResolver, type AuthoredConnection, type AuthoredEntity, type AuthoredLibrary,
  type AuthoredRecord, type DiagramInput, type ElementNormalizer, type FontsConfig,
  type IconLoader, type Issue, type RegistryInfo, type TemplateOverrides, type ValidationResult,
} from '@eraserlabs/resolve';
import { stockLibrary } from './library/index.js';
import { stockNormalizers } from './library/normalizers.js';
import { buildRenderPageSetup } from './library/pageSetup.js';
import { createEraserIconLoader } from './icons/eraserLoader.js';
import { stageFonts, type StagedFonts } from './fonts/staging.js';
import { injectFonts, prepareFontsRequest } from './fonts/inject.js';
import { buildEmbeddedFontCss } from './fonts/embed.js';
import { eraserFonts } from './fonts/eraserFonts.js';
import { runWithDiagnostics, runtimeIssue, sourcePaths } from './browserRun.js';
import { printVectorPdf, VectorPdfError } from './vectorPdf.js';

export type BrowserProvider = () => Promise<Browser>;
interface CommonRendererOptions {
  library?: AuthoredLibrary;
  overrides?: TemplateOverrides;
  normalizers?: Record<string, ElementNormalizer>;
  iconLoader?: IconLoader;
  fonts?: FontsConfig;
  onUnknownIcon?: 'placeholder' | 'error';
  pages?: number;
  deviceScaleFactor?: number;
  svgOptions?: SvgExportOptions;
  transparentBackground?: boolean;
  svgAssets?: Record<string, string>;
  outputs?: OutputRequest;
}
export type RendererOptions = CommonRendererOptions &
  ({ chromiumPath: string; browser?: never } | { browser: BrowserProvider; chromiumPath?: never });
export interface OutputRequest { png?: boolean; html?: boolean; json?: boolean; svg?: boolean; pdf?: boolean }
export type DiagramJsonEntity = AuthoredEntity;
export type DiagramJsonConnection = AuthoredConnection;
export type DiagramJsonElement = DiagramJsonEntity | DiagramJsonConnection;
export interface DiagramJson { entities: DiagramJsonEntity[]; connections: DiagramJsonConnection[]; scene: Box }
export type RenderRequest = DiagramInput & { outputs?: OutputRequest };
type OutputSelection = { outputs?: OutputRequest };
type RequestedOutputs<R extends OutputSelection> = R['outputs'] extends OutputRequest ? R['outputs'] : { png: true };
type OutputField<O extends OutputRequest, K extends keyof OutputRequest, V> = K extends keyof O
  ? [O[K]] extends [true] ? { [P in K]: V }
    : [O[K]] extends [false | undefined] ? unknown : { [P in K]?: V }
  : unknown;
export type RenderFailure = { ok: false; errors: Issue[]; warnings: Issue[] };
export type RenderSuccess<R extends OutputSelection = { outputs: { png: true } }> = {
  ok: true; warnings: Issue[]; timingsMs: Record<string, number>;
} & OutputField<RequestedOutputs<R>, 'png', Buffer>
  & OutputField<RequestedOutputs<R>, 'html', string>
  & OutputField<RequestedOutputs<R>, 'json', DiagramJson>
  & OutputField<RequestedOutputs<R>, 'svg', string>
  & OutputField<RequestedOutputs<R>, 'pdf', Buffer>;
export type RenderOutcome<R extends OutputSelection = { outputs: { png: true } }> = RenderSuccess<R> | RenderFailure;
export interface Renderer {
  render<const R extends RenderRequest>(request: R): Promise<RenderOutcome<R>>;
  lintSvg(svg: string, options?: PublicationOptions): Promise<PublicationReport>;
  validate(input: unknown): Promise<ValidationResult>;
  registryInfo(): RegistryInfo;
  tagSchema(tag: string): object | undefined;
  degradedFonts: string[];
  close(): Promise<void>;
}
const require = createRequire(import.meta.url);

/** Persist author values plus measured geometry, never resolved paint or sanitized content. */
function toDiagramJson(authored: readonly AuthoredRecord[], layout: SceneLayout, flowIds: readonly string[] = []): DiagramJson {
  const entities: DiagramJsonEntity[] = [];
  const connections: DiagramJsonConnection[] = [];
  const flow = new Set(flowIds);
  for (const { id, kind, source } of authored) {
    if (kind === 'entity') {
      const element = structuredClone(source) as DiagramJsonEntity;
      const box = layout.boxes[id];
      if (box) { element.x = box.x; element.y = box.y; element.width = box.width; element.height = box.height; }
      if (flow.has(id)) { element.layoutItem = 'flow'; }
      entities.push(element);
      continue;
    }
    const element = structuredClone(source) as DiagramJsonConnection;
    const geometry = layout.connections[id];
    const origin = geometry?.points[0];
    if (geometry && origin) {
      const [originX, originY] = origin;
      const label = geometry.labelBox;
      element.x = originX; element.y = originY;
      element.points = geometry.points.map(([x, y]) => ({ x: x - originX, y: y - originY }));
      if (label) {
        element.labelPlacement = { x: Math.round(label.x - originX), y: Math.round(label.y - originY), width: Math.round(label.width), height: Math.round(label.height) };
      }
    }
    connections.push(element);
  }
  return { entities, connections, scene: layout.scene };
}

export async function createRenderer(options: RendererOptions): Promise<Renderer> {
  const svgAssets = { ...(options.svgAssets ?? {}) };
  if (Object.keys(svgAssets).length > 128 || Object.entries(svgAssets).some(([key, value]) =>
    !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key) || typeof value !== 'string') ||
    Buffer.byteLength(JSON.stringify(svgAssets)) > 20 * 1024 * 1024) {
    throw new TypeError('Invalid or oversized SVG asset registry.');
  }
  const poolSize = options.pages ?? 1;
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 16) {
    throw new TypeError('pages must be an integer in [1,16].');
  }
  const defaultOutputs: OutputRequest = options.outputs ?? { png: true };
  const browserProvider: BrowserProvider | undefined = options.browser ?? (options.chromiumPath
    ? () => chromium.launch({ executablePath: options.chromiumPath, args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] })
    : undefined);
  if (!browserProvider) { throw new TypeError('createRenderer requires either chromiumPath or browser.'); }
  const resolver = await createResolver({
    library: options.library ?? stockLibrary,
    ...(options.overrides ? { overrides: options.overrides } : {}),
    normalizers: options.normalizers ?? stockNormalizers,
    iconLoader: options.iconLoader ?? createEraserIconLoader(),
    ...(options.onUnknownIcon ? { onUnknownIcon: options.onUnknownIcon } : {}),
  });
  const staged: StagedFonts = await stageFonts(options.fonts ?? eraserFonts());
  const iifePath = join(dirname(require.resolve('@eraserlabs/render/browser')), 'eraser-render.iife.js');
  const pageSetup = buildRenderPageSetup(resolver.library);
  const browser: Browser = await browserProvider();
  let context: BrowserContext;
  try { context = await browser.newContext({ deviceScaleFactor: options.deviceScaleFactor ?? 1 }); }
  catch (error) { await browser.close(); throw error; }
  const fontsRequest = staged ? prepareFontsRequest(staged) : undefined;
  async function preparePage(): Promise<Page> {
    const page = await context.newPage();
    try {
      await page.addInitScript({ path: iifePath });
      await page.goto('data:text/html,<!doctype html><html><head></head><body></body></html>');
      await page.evaluate((setup) => window.__eraser.setup(setup), pageSetup);
      if (fontsRequest) { await injectFonts(page, fontsRequest); }
      return page;
    } catch (error) { await page.close(); throw error; }
  }
  let pool: Page[];
  try { pool = await Promise.all(Array.from({ length: poolSize }, preparePage)); }
  catch (error) { await context.close(); await browser.close(); throw error; }
  const waiters: { resolve: (page: Page) => void; reject: (error: Error) => void }[] = [];
  let closing: Promise<void> | undefined;
  function acquire(): Promise<Page> {
    if (closing) { return Promise.reject(new Error('Renderer is closed.')); }
    const page = pool.pop();
    if (page) { return Promise.resolve(page); }
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }
  function release(page: Page): void {
    if (closing || page.isClosed()) { return; }
    const waiter = waiters.shift();
    if (waiter) { waiter.resolve(page); } else { pool.push(page); }
  }
  let embeddedFontCss: string | undefined;
  return {
    degradedFonts: staged?.degraded ?? [],
    validate: (input) => resolver.validate(input),
    registryInfo: () => resolver.registryInfo(),
    tagSchema: (tag) => resolver.tagSchema(tag),
    async lintSvg(svg: string, lintOptions: PublicationOptions = {}): Promise<PublicationReport> {
      const page = await acquire();
      try { return await page.evaluate((request) => window.__eraser.lintSvg(request), { svg, options: lintOptions }); }
      finally { release(page); }
    },
    render: (async (request: RenderRequest) => {
      const requested: OutputRequest = request?.outputs ?? defaultOutputs;
      const tracker = new TimeTracker();
      const resolved = await resolver.resolve(request);
      tracker.mark('resolve'); tracker.merge('resolve', resolved.meta.timingsMs);
      if (!resolved.ok) { return { ok: false as const, errors: resolved.errors, warnings: resolved.warnings }; }
      const paths = sourcePaths(request, resolved.authored ?? []);
      const page = await acquire();
      try {
        tracker.reset();
        const checked = await page.evaluate(runWithDiagnostics, {
          entities: resolved.entities ?? [], connections: resolved.connections ?? [], icons: resolved.icons ?? {}, svgAssets,
        });
        tracker.mark('browserRun');
        if (!checked.ok) { return { ok: false as const, errors: [runtimeIssue(checked.failure, paths)], warnings: resolved.warnings }; }
        const run = checked.result;
        let warnings: Issue[] = [...resolved.warnings, ...(run.assetWarnings ?? []).map((issue): Issue => ({
          code: 'W_CONTENT_SANITIZED', severity: 'warning', path: `${paths.get(issue.elementId) ?? ''}/asset`,
          elementId: issue.elementId, message: `${issue.code}: ${issue.message}`,
        }))];
        const outcome: Record<string, unknown> = { ok: true, warnings, timingsMs: tracker.timings };
        if (requested.json) { outcome['json'] = toDiagramJson(resolved.authored ?? [], run.layout, run.flowIds); }
        if (requested.svg || requested.pdf) {
          const serialized = await page.evaluate(serializeSvgScene, options.svgOptions ?? {});
          const qualify = (issues: SvgIssue[]): Issue[] => issues.map((issue) => ({ ...issue, path: issue.elementId ? paths.get(issue.elementId) ?? '' : issue.path }));
          warnings = [...warnings, ...qualify(serialized.warnings)];
          if (!serialized.ok) { return { ok: false as const, errors: qualify(serialized.errors), warnings }; }
          outcome['warnings'] = warnings;
          if (requested.svg) { outcome['svg'] = serialized.svg; }
          tracker.mark('svg');
          if (requested.pdf) {
            try { outcome['pdf'] = await printVectorPdf(preparePage, serialized.svg); }
            catch (error) {
              if (!(error instanceof VectorPdfError)) { throw error; }
              const issue: Issue & { stageCode: string } = {
                code: 'E_SCHEMA', stageCode: error.stageCode, severity: 'error', path: '/outputs/pdf', message: error.message,
              };
              return { ok: false as const, errors: [issue], warnings };
            }
            tracker.mark('pdf');
          }
        }
        if (requested.html) {
          embeddedFontCss ??= staged ? buildEmbeddedFontCss(staged) : '';
          const serialized = await page.evaluate(() => window.__eraser.serialize());
          outcome['html'] = buildHtmlDocument({ title: 'Eraser diagram', styles: [embeddedFontCss, serialized.css], body: serialized.scene });
          tracker.mark('serialize');
        }
        if (requested.png) {
          outcome['png'] = await page.locator('#eraser-scene').screenshot({ type: 'png', omitBackground: options.transparentBackground ?? false });
          tracker.mark('screenshot');
        }
        return outcome;
      } finally { release(page); }
    }) as Renderer['render'],
    close(): Promise<void> {
      if (!closing) {
        for (const waiter of waiters.splice(0)) { waiter.reject(new Error('Renderer is closed.')); }
        closing = (async () => { try { await context.close(); } finally { await browser.close(); } })();
      }
      return closing;
    },
  };
}
