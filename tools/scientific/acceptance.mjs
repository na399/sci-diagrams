#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createRenderer } from '../../packages/diagrams/dist/index.js';
import { scientificLibrary, scientificNormalizers } from '../../packages/diagrams/dist/scientific/index.js';

const { values } = parseArgs({ options: { 'out-dir': { type: 'string' }, 'chromium-path': { type: 'string' } }, strict: true });
const require = createRequire(new URL('../../packages/diagrams/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = new URL('../../fixtures/scientific/acceptance/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const out = resolve(values['out-dir'] ?? 'out/scientific-acceptance');
await mkdir(out, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const chromiumPath = values['chromium-path'] ?? process.env.CHROMIUM_PATH ?? chromium.executablePath();
const report = {
  version: 1, synthetic: true, qualified: false,
  environment: { node: process.version, platform: process.platform, architecture: process.arch, chromiumPath },
  cases: [],
};
let failed = false;
for (const item of manifest.cases) {
  if (!/^[a-z][a-z0-9-]*$/.test(item.name) || item.source !== `${item.name}.json`) { throw new Error('Invalid acceptance manifest path.'); }
  const raw = await readFile(new URL(item.source, root), 'utf8');
  const source = JSON.parse(raw);
  const renderer = await createRenderer({
    chromiumPath, library: scientificLibrary, normalizers: scientificNormalizers,
    svgOptions: { widthMm: item.widthMm, title: source.title, background: 'white' },
  });
  try {
    const result = await renderer.render({ ...source, outputs: { svg: true, pdf: true, png: true, json: true } });
    if (!result.ok) { failed = true; report.cases.push({ name: item.name, ok: false, errors: result.errors }); continue; }
    const publication = await renderer.lintSvg(result.svg);
    if (!publication.ok) { failed = true; }
    const measured = JSON.stringify(result.json, null, 2) + '\n';
    // Distinct extension prevents an out-dir mistake from replacing a source fixture.
    await Promise.all([
      ['svg', result.svg], ['pdf', result.pdf], ['png', result.png], ['measured.json', measured],
    ].map(([ext, bytes]) => writeFile(join(out, `${item.name}.${ext}`), bytes)));
    report.cases.push({
      name: item.name, ok: publication.ok, sourceSha256: hash(raw), svgSha256: hash(result.svg),
      pdfSha256: hash(result.pdf), warnings: result.warnings, publication,
      degradedFonts: renderer.degradedFonts,
      entities: result.json.entities.length, connections: result.json.connections.length,
      timingsMs: result.timingsMs,
    });
  } finally { await renderer.close(); }
}
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputDirectory: out, rendered: report.cases.filter((item) => item.ok).length, failed, humanReviewRequired: true }));
if (failed) { process.exitCode = 1; }
