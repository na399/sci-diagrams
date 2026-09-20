import { expect, test } from '@playwright/test';
import { createRenderer } from '../src/diagrams.js';
import { scientificLibrary, scientificNormalizers } from '../src/scientific/index.js';
import { CHROMIUM_PATH } from './support/browser.js';
const wrap = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 400 200"><title>Figure</title>${content}</svg>`;
test('publication lint measures physical text and strokes without mutating the scene', async () => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH, library: scientificLibrary, normalizers: scientificNormalizers });
  try {
    const svg = wrap('<rect x="10" y="10" width="100" height="60" fill="none" stroke="black" stroke-width="1"/><text x="15" y="40" font-size="16" font-family="sans-serif">Hello</text>');
    const report = await renderer.lintSvg(svg); expect(report.ok).toBe(true); expect(report.metrics?.widthMm).toBe(100); expect(report.metrics?.minFontPt).toBeCloseTo(11.3386, 2);
    const small = await renderer.lintSvg(svg, { widthMm: 20 }); expect(small.issues.some((issue) => issue.code === 'PUB002')).toBe(true);
    const first = await renderer.render({ entities: [{ tag: 'SciBlock', id: 'a', x: 0, y: 0, label: 'After lint', fontFamily: 'Arial, sans-serif' }], connections: [], outputs: { svg: true } }); expect(first.ok, JSON.stringify(first)).toBe(true);
  } finally { await renderer.close(); }
});
for (const [name, fragment] of [['script', '<script>alert(1)</script>'], ['event handler', '<rect onload="alert(1)"/>'], ['foreignObject', '<foreignObject/>'], ['external URL', '<use href="https://example.invalid/a#b"/>'], ['reference cycle', '<g id="x"><use href="#x"/></g>'], ['CSS fetch', '<style>@import "https://example.invalid/a";</style>'], ['CSS escape', '<rect style="fill:u\\72l(https://example.invalid/a)"/>']]) {
  test(`publication intake rejects ${name} before mounting`, async () => { const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH }); try { const result = await renderer.lintSvg(wrap(fragment)); expect(result.ok).toBe(false); expect(result.metrics).toBeNull(); } finally { await renderer.close(); } });
}
test('SVG styles are scoped through inlining and overflow is diagnostic', async () => {
  const renderer = await createRenderer({ chromiumPath: CHROMIUM_PATH });
  try { const result = await renderer.lintSvg(wrap('<style>text{fill:red;font-size:20px}</style><text x="399" y="50">Overflow</text>')); expect(result.ok).toBe(true); expect(result.issues.some((issue) => issue.code === 'PUB004')).toBe(true); const invalid = await renderer.lintSvg(wrap(''), { widthMm: -1 }); expect(invalid.ok).toBe(false); } finally { await renderer.close(); }
});
