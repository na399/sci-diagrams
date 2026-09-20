import { relative } from 'node:path';
import { createRenderer, type OutputRequest, type Renderer, type RenderRequest } from '@eraserlabs/diagrams';
import { RegistryError, SchemaDefinitionError, type Issue } from '@eraserlabs/resolve';
import { booleanFlag, choiceFlag, numberFlag, stringFlag, type Flags } from '../args.js';
import { chromiumCandidates, detectChromium, hostDetectInput } from '../chromium.js';
import { CHROMIUM_ENV, OUTPUT_FORMATS, UNKNOWN_ICON_POLICIES, type ConfigOverrides, type EffectiveConfig, type IconsConfig } from '../config.js';
import { CliError } from '../errors.js';
import { readInput, STDIN, type InputRead } from '../inputs.js';
import { buildReport, formatTimings, type InputResult } from '../report.js';
import { rendererOptionsFrom } from '../setup.js';
import { vectorOptionsFrom } from '../vectorOptions.js';
import { planOutputs, writeArtifact } from '../artifactOutput.js';
import {
  commonOverrides, configFor, debugLine, emitReport, inputIssue, printConfigRequested,
  reportOptionsFor, requireInputs, type CommandInput,
} from '../shared.js';

function renderOverrides(flags: Flags): ConfigOverrides {
  const chromiumPath = stringFlag(flags, 'chromium-path');
  const format = choiceFlag(flags, 'format', OUTPUT_FORMATS);
  const outDir = stringFlag(flags, 'out-dir');
  const deviceScaleFactor = numberFlag(flags, 'scale');
  const pages = numberFlag(flags, 'pages');
  if (pages !== undefined && (!Number.isInteger(pages) || pages > 16)) {
    throw new CliError('--pages requires an integer in [1,16].');
  }
  const fonts = stringFlag(flags, 'fonts');
  const baseUrl = stringFlag(flags, 'icon-base-url');
  const cacheDir = stringFlag(flags, 'icon-cache-dir');
  const onUnknown = choiceFlag(flags, 'unknown-icon', UNKNOWN_ICON_POLICIES);
  const icons: IconsConfig = {
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(cacheDir !== undefined ? { cacheDir } : {}),
    ...(onUnknown !== undefined ? { onUnknown } : {}),
  };
  return {
    ...commonOverrides(flags),
    ...(chromiumPath !== undefined ? { chromiumPath } : {}),
    ...(format !== undefined ? { format } : {}),
    ...(outDir !== undefined ? { outDir } : {}),
    ...(deviceScaleFactor !== undefined ? { deviceScaleFactor } : {}),
    ...(pages !== undefined ? { pages } : {}),
    ...(fonts !== undefined ? { fonts } : {}),
    ...(Object.keys(icons).length > 0 ? { icons } : {}),
  };
}
function chromiumFor(config: EffectiveConfig, quiet: boolean): string {
  if (config.chromiumPath !== undefined) { return config.chromiumPath; }
  const detect = hostDetectInput();
  const detected = detectChromium(detect);
  if (detected !== undefined) {
    if (!quiet) { process.stderr.write(`Using Chromium: ${detected} (auto-detected; set chromiumPath to pin it)\n`); }
    return detected;
  }
  const probed = chromiumCandidates(detect).map((candidate) => `  ${candidate}`).join('\n');
  throw new CliError(`Rendering requires Chromium. Pass --chromium-path, set ${CHROMIUM_ENV}, or set "chromiumPath" in eraser-diagrams.config.json.\nProbed:\n${probed}`);
}
async function bootRenderer(config: EffectiveConfig, chromiumPath: string, flags: Flags): Promise<Renderer> {
  try {
    return await createRenderer({ ...await rendererOptionsFrom(config, chromiumPath), ...await vectorOptionsFrom(flags) });
  } catch (error) {
    if (error instanceof RegistryError || error instanceof SchemaDefinitionError || error instanceof TypeError) {
      throw new CliError(error.message);
    }
    throw error;
  }
}
function displayPath(target: string): string {
  const rel = relative(process.cwd(), target);
  return rel.startsWith('..') ? target : rel;
}
interface RenderJob { spec: string; read: InputRead }
function failedRead(spec: string, message: string): InputResult {
  return { input: spec, ok: false, errors: [inputIssue(message)], warnings: [] };
}
function renderRequestFrom<const O extends OutputRequest>(document: unknown, outputs: O): RenderRequest & { outputs: O } {
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    return { ...(document as object), outputs } as RenderRequest & { outputs: O };
  }
  return document as RenderRequest & { outputs: O };
}
async function renderOne(
  renderer: Renderer, spec: string, document: unknown, config: EffectiveConfig, target: string, lint: boolean,
): Promise<InputResult> {
  const started = performance.now();
  const outputs: OutputRequest = { [config.format]: true, ...(lint ? { svg: true } : {}) };
  const outcome = await renderer.render(renderRequestFrom(document, outputs));
  if (!outcome.ok) { return { input: spec, ok: false, errors: outcome.errors, warnings: outcome.warnings }; }
  const warnings: Issue[] = [...outcome.warnings];
  const errors: Issue[] = [];
  if (lint && outcome.svg !== undefined) {
    const report = await renderer.lintSvg(outcome.svg);
    for (const finding of report.issues) {
      const issue: Issue & { stageCode: string } = {
        code: finding.severity === 'error' ? 'E_SCHEMA' : 'W_CONTENT_SANITIZED',
        stageCode: finding.code, severity: finding.severity, path: finding.path,
        message: `${finding.code}: ${finding.message}`,
        ...(finding.elementId ? { elementId: finding.elementId } : {}),
      };
      (issue.severity === 'error' ? errors : warnings).push(issue);
    }
  }
  if (errors.length || (config.failOnWarning && (warnings.length || renderer.degradedFonts.length))) {
    return { input: spec, ok: false, errors, warnings };
  }
  const data = outcome[config.format];
  if (typeof data !== 'string' && !Buffer.isBuffer(data)) {
    throw new Error(`Renderer did not return requested ${config.format} output.`);
  }
  await writeArtifact(target, data);
  return {
    input: spec, ...(target === STDIN ? {} : { out: displayPath(target) }),
    ok: true, errors: [], warnings, ms: Math.round(performance.now() - started), timingsMs: outcome.timingsMs,
  };
}
export async function runRender(input: CommandInput): Promise<number> {
  const config = configFor(input.flags, renderOverrides(input.flags));
  if (printConfigRequested(input.flags, config)) { return 0; }
  const specs = requireInputs(input, 'render');
  const outFlag = stringFlag(input.flags, 'out');
  const options = reportOptionsFor(input.flags, config);
  if (outFlag === STDIN && booleanFlag(input.flags, 'json')) {
    throw new CliError('--json and "-o -" both write to stdout; choose one.');
  }
  const targets = planOutputs(specs, config.format, config.outDir, outFlag);
  const jobs: RenderJob[] = specs.map((spec) => ({ spec, read: readInput(spec) }));
  if (options.debug) { debugLine(`config: ${config.configPath ?? '(none)'}`); }
  if (!jobs.some((job) => job.read.ok)) {
    const failures = jobs.flatMap((job) => job.read.ok ? [] : [failedRead(job.spec, job.read.message)]);
    emitReport(buildReport(failures, [], config.failOnWarning), input.flags, options);
    return 1;
  }
  const chromiumPath = chromiumFor(config, options.quiet);
  if (options.debug) { debugLine(`chromium: ${chromiumPath} (${config.chromiumSource ?? 'auto-detected'})`); }
  for (const job of jobs) {
    if (job.read.ok && job.read.unwrapped && !options.quiet) {
      process.stderr.write(`note  ${job.spec}: unwrapped { definition: { elements } } export\n`);
    }
  }
  const bootStart = performance.now();
  const renderer = await bootRenderer(config, chromiumPath, input.flags);
  const bootMs = performance.now() - bootStart;
  const onSignal = (signal: NodeJS.Signals): void => {
    process.stderr.write(`\nReceived ${signal}; closing Chromium.\n`);
    void renderer.close().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  let results: InputResult[];
  try {
    results = await Promise.all(jobs.map((job) => job.read.ok
      ? renderOne(renderer, job.spec, job.read.document, config, targets.get(job.spec)!, booleanFlag(input.flags, 'lint'))
      : Promise.resolve(failedRead(job.spec, job.read.message))));
  } finally {
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
    await renderer.close();
  }
  const report = buildReport(results, renderer.degradedFonts, config.failOnWarning);
  emitReport(report, input.flags, options);
  if (options.debug) {
    process.stderr.write(formatTimings('Boot', { 'boot (chromium + pages + fonts)': bootMs }));
    for (const result of results) {
      if (result.timingsMs) { process.stderr.write(formatTimings(`Timings: ${result.input}`, result.timingsMs)); }
    }
  }
  return report.ok ? 0 : 1;
}
