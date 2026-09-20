#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, mkdir, rename, writeFile, access, rm } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRenderer } from '@eraserlabs/diagrams';
import { createScientificLibrary, scientificNormalizers } from '@eraserlabs/diagrams/scientific';

const usage = `Usage: node tools/scientific/render.mjs <source.json> [options]
  --out-dir <directory>     Output directory (default: out/scientific)
  --format <csv>            svg,png,html,json (default: svg,png)
  --width-mm <number>       Physical SVG width, preserving aspect ratio
  --theme <name>            publication or web (default: publication)
  --chromium-path <path>    Local Chromium/Chrome executable, or CHROMIUM_PATH
  --transparent            Transparent PNG canvas; explicit component fills remain
  --fail-on-warning        Write no outputs when any renderer/export warning occurs
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
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next executable. Browser installation remains caller-owned.
    }
  }
  throw new Error('No local browser found. Set --chromium-path or CHROMIUM_PATH.');
}

async function atomicWrite(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string', default: 'out/scientific' },
      format: { type: 'string', default: 'svg,png' },
      'width-mm': { type: 'string' },
      theme: { type: 'string', default: 'publication' },
      'chromium-path': { type: 'string' },
      transparent: { type: 'boolean', default: false },
      'fail-on-warning': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(usage);
    return;
  }
  if (positionals.length !== 1) {
    throw new Error(usage);
  }
  if (!['publication', 'web'].includes(values.theme)) {
    throw new Error('Unknown theme.');
  }
  const formats = [...new Set(values.format.split(','))];
  if (formats.some((f) => !['svg', 'png', 'html', 'json'].includes(f))) {
    throw new Error('Unknown output format.');
  }
  const widthMm = values['width-mm'] === undefined ? undefined : Number(values['width-mm']);
  if (widthMm !== undefined && (!Number.isFinite(widthMm) || widthMm <= 0)) {
    throw new Error('--width-mm must be positive.');
  }
  const sourcePath = resolve(positionals[0]);
  const document = JSON.parse(await readFile(sourcePath, 'utf8'));
  const renderer = await createRenderer({
    chromiumPath: await chromiumPath(values['chromium-path']),
    library: createScientificLibrary(values.theme),
    normalizers: scientificNormalizers,
    transparentBackground: values.transparent,
    svgOptions: {
      ...(widthMm === undefined ? {} : { widthMm }),
      background: values.transparent ? 'transparent' : 'white',
    },
  });
  try {
    const validation = await renderer.validate(document);
    if (!validation.ok) {
      process.stderr.write(`${JSON.stringify(validation, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    const outputs = Object.fromEntries(formats.map((format) => [format, true]));
    const result = await renderer.render({ ...document, outputs });
    const warnings = result.warnings ?? [];
    if (!result.ok || (values['fail-on-warning'] && warnings.length)) {
      process.stderr.write(`${JSON.stringify({ ok: false, errors: result.ok ? [] : result.errors, warnings }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    for (const warning of warnings) {
      process.stderr.write(`${JSON.stringify(warning)}\n`);
    }
    const outDir = resolve(values['out-dir']);
    const name = basename(sourcePath).replace(/\.json$/i, '');
    await mkdir(outDir, { recursive: true });
    for (const format of formats) {
      const destination = join(outDir, `${name}.${format === 'json' ? 'measured.json' : format}`);
      if (destination === sourcePath) {
        throw new Error('Refusing to overwrite the source.');
      }
      const value = format === 'json' ? `${JSON.stringify(result.json, null, 2)}\n` : result[format];
      await atomicWrite(destination, value);
      process.stdout.write(`${destination}\n`);
    }
  } finally {
    await renderer.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
