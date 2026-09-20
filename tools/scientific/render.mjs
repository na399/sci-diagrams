#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, mkdir, rename, writeFile, access, rm, realpath } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRenderer, loadSvgAssetFiles, parsePhysicalLength, toMillimeters } from '@eraserlabs/diagrams';
import { createScientificLibrary, scientificNormalizers } from '@eraserlabs/diagrams/scientific';

const usage = `Usage: node tools/scientific/render.mjs <source.json> [options]
  --out-dir <directory>     Output directory (default: out/scientific)
  --format <csv>            svg,pdf,png,html,json (default: svg,png)
  --width <length>          Physical SVG/PDF width, e.g. 178mm
  --width-mm <number>       Backward-compatible millimeter width
  --theme <name>            publication or web (default: publication)
  --assets <registry.json>  Asset-ID to relative SVG path map
  --lint                   Run publication checks before writing
  --chromium-path <path>    Local Chromium/Chrome executable, or CHROMIUM_PATH
  --transparent            Transparent canvas; explicit component fills remain
  --fail-on-warning        Write no outputs for any renderer/font/lint warning
  --help                   Show this message
`;
async function chromiumPath(explicit) {
  const candidates = explicit ? [explicit] : [
    process.env.CHROMIUM_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; }
    catch { /* Browser installation remains caller-owned. */ }
  }
  throw new Error('No local browser found. Set --chromium-path or CHROMIUM_PATH.');
}
async function atomicWrite(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, value, { flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string', default: 'out/scientific' },
      format: { type: 'string', default: 'svg,png' },
      width: { type: 'string' }, 'width-mm': { type: 'string' }, assets: { type: 'string' },
      theme: { type: 'string', default: 'publication' },
      'chromium-path': { type: 'string' },
      lint: { type: 'boolean', default: false },
      transparent: { type: 'boolean', default: false },
      'fail-on-warning': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) { process.stdout.write(usage); return; }
  if (positionals.length !== 1) { throw new Error(usage); }
  if (!['publication', 'web'].includes(values.theme)) { throw new Error('Unknown theme.'); }
  const formats = [...new Set(values.format.split(',').map((value) => value.trim()))];
  if (formats.some((format) => !['svg', 'pdf', 'png', 'html', 'json'].includes(format))) {
    throw new Error('Unknown output format.');
  }
  if (values.width !== undefined && values['width-mm'] !== undefined) {
    throw new Error('Use either --width or --width-mm, not both.');
  }
  const rawWidth = values.width ?? (values['width-mm'] === undefined ? undefined : `${Number(values['width-mm'])}mm`);
  const widthMm = rawWidth === undefined ? undefined : toMillimeters(parsePhysicalLength(rawWidth));
  const sourcePath = await realpath(resolve(positionals[0]));
  const document = JSON.parse(await readFile(sourcePath, 'utf8'));
  const outDir = resolve(values['out-dir']);
  const name = basename(sourcePath).replace(/\.json$/i, '');
  const paths = new Map(formats.map((format) => [format, join(outDir, `${name}.${format === 'json' ? 'measured.json' : format}`)]));
  for (const destination of paths.values()) {
    const existing = await realpath(destination).catch(() => resolve(destination));
    if (existing === sourcePath) { throw new Error('Refusing to overwrite the source.'); }
  }
  const svgAssets = values.assets === undefined ? undefined : await loadSvgAssetFiles(values.assets);
  const renderer = await createRenderer({
    chromiumPath: await chromiumPath(values['chromium-path']),
    library: createScientificLibrary(values.theme), normalizers: scientificNormalizers,
    ...(svgAssets ? { svgAssets } : {}), transparentBackground: values.transparent,
    svgOptions: {
      ...(widthMm === undefined ? {} : { widthMm }),
      ...(typeof document?.title === 'string' ? { title: document.title } : {}),
      background: values.transparent ? 'transparent' : 'white',
    },
  });
  try {
    const validation = await renderer.validate(document);
    if (!validation.ok) { process.stderr.write(`${JSON.stringify(validation, null, 2)}\n`); process.exitCode = 1; return; }
    const outputs = { ...Object.fromEntries(formats.map((format) => [format, true])), ...(values.lint ? { svg: true } : {}) };
    const result = await renderer.render({ ...document, outputs });
    const warnings = [...result.warnings];
    const errors = result.ok ? [] : [...result.errors];
    if (result.ok && values.lint) {
      const report = await renderer.lintSvg(result.svg);
      for (const issue of report.issues) { (issue.severity === 'error' ? errors : warnings).push(issue); }
    }
    const degradedFonts = renderer.degradedFonts;
    if (!result.ok || errors.length || (values['fail-on-warning'] && (warnings.length || degradedFonts.length))) {
      process.stderr.write(`${JSON.stringify({ ok: false, errors, warnings, degradedFonts }, null, 2)}\n`);
      process.exitCode = 1; return;
    }
    for (const warning of warnings) { process.stderr.write(`${JSON.stringify(warning)}\n`); }
    if (degradedFonts.length) { process.stderr.write(`${JSON.stringify({ degradedFonts })}\n`); }
    await mkdir(outDir, { recursive: true });
    for (const format of formats) {
      const destination = paths.get(format);
      const value = format === 'json' ? `${JSON.stringify(result.json, null, 2)}\n` : result[format];
      await atomicWrite(destination, value);
      process.stdout.write(`${destination}\n`);
    }
  } finally { await renderer.close(); }
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
