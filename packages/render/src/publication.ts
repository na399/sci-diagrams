/// <reference lib="dom" />
import { sanitizeSvgDocument } from './svgSafety.js';
export interface PublicationOptions { widthMm?: number; minFontPt?: number; minStrokePt?: number; maxWidthMm?: number; maxHeightMm?: number; allowedFonts?: string[]; checkOverlaps?: boolean; requireText?: boolean }
export interface PublicationIssue { code: string; severity: 'error' | 'warning'; message: string; path: string; elementId?: string }
export interface PublicationReport {
  ok: boolean; issues: PublicationIssue[];
  metrics: { widthMm: number; heightMm: number; textElements: number; minFontPt: number | null; minStrokePt: number | null; fonts: string[] } | null;
}
/** Measure only after strict inert parsing. No arbitrary stylesheet reaches the page. */
export async function lintSvgPublication(request: { svg: string; options?: PublicationOptions }): Promise<PublicationReport> {
  const options = request.options ?? {}; const issues: PublicationIssue[] = [];
  const finding = (code: string, message: string, node?: Element, severity: 'error' | 'warning' = 'warning'): void => {
    const id = node?.closest('[data-mdp-id]')?.getAttribute('data-mdp-id');
    issues.push({ code, severity, message, path: node?.id ? `/svg/id/${node.id}` : '', ...(id ? { elementId: id } : {}) });
  };
  for (const [name, value] of Object.entries(options)) {
    if (!['widthMm','minFontPt','minStrokePt','maxWidthMm','maxHeightMm','allowedFonts','checkOverlaps','requireText'].includes(name)) { finding('PUB_CONFIG', `Unknown publication option ${name}.`, undefined, 'error'); }
    if (['widthMm','minFontPt','minStrokePt','maxWidthMm','maxHeightMm'].includes(name) && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000)) { finding('PUB_CONFIG', `${name} must be positive and at most 10000.`, undefined, 'error'); }
    if (['checkOverlaps','requireText'].includes(name) && typeof value !== 'boolean') { finding('PUB_CONFIG', `${name} must be boolean.`, undefined, 'error'); }
    if (name === 'allowedFonts' && (!Array.isArray(value) || value.length > 64 || value.some((font) => typeof font !== 'string' || font.length > 128))) { finding('PUB_CONFIG', 'allowedFonts must be a bounded array of font names.', undefined, 'error'); }
  }
  if (issues.length) { return { ok: false, issues, metrics: null }; }
  const safe = sanitizeSvgDocument({ svg: request.svg, options: { preserveIdentity: true } });
  if (!safe.ok) { return { ok: false, issues: safe.errors.map((issue) => ({ ...issue, severity: 'error' })), metrics: null }; }
  safe.warnings.forEach((issue) => issues.push({ ...issue, severity: 'warning' }));
  const mm = (raw: string | null): number | undefined => {
    const match = raw?.match(/^\s*(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|in|pt)\s*$/);
    if (!match) { return undefined; } const factor: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }; return Number(match[1]) * factor[match[2]!]!;
  };
  const sourceWidth = mm(safe.width); const sourceHeight = mm(safe.height);
  if (sourceWidth === undefined || sourceHeight === undefined) { finding('PUB001', 'Explicit physical width and height are missing.'); }
  const widthMm = options.widthMm ?? sourceWidth ?? safe.viewBox[2] * 25.4 / 96;
  const heightMm = widthMm * (sourceWidth && sourceHeight ? sourceHeight / sourceWidth : safe.viewBox[3] / safe.viewBox[2]);
  if (![widthMm, heightMm].every((n) => Number.isFinite(n) && n > 0 && n <= 10000)) { finding('PUB_DIMENSIONS', 'Invalid physical figure dimensions.', undefined, 'error'); return { ok: false, issues, metrics: null }; }
  if (widthMm > (options.maxWidthMm ?? 10000) || heightMm > (options.maxHeightMm ?? 10000)) { finding('PUB006', 'Figure exceeds configured physical dimensions.'); }
  const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none'; const shadow = holder.attachShadow({ mode: 'open' });
  const root = document.importNode(new DOMParser().parseFromString(safe.svg, 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
  root.setAttribute('width', `${widthMm}mm`); root.setAttribute('height', `${heightMm}mm`); shadow.appendChild(root); document.body.appendChild(holder);
  let minFont = Infinity; let minStroke = Infinity; const fonts = new Set<string>(); let textCount = 0; const textBoxes: { node: Element; box: DOMRect }[] = [];
  const minimumScale = (m: DOMMatrix): number => { const sum = m.a ** 2 + m.b ** 2 + m.c ** 2 + m.d ** 2; const det = m.a * m.d - m.b * m.c; return Math.sqrt(Math.max(0, (sum - Math.sqrt(Math.max(0, sum ** 2 - 4 * det ** 2))) / 2)); };
  try {
    await document.fonts.ready; const viewport = root.getBoundingClientRect();
    for (const node of Array.from(root.querySelectorAll('*'))) {
      if (!(node instanceof SVGGraphicsElement) || node.closest('defs,marker,mask,clipPath,pattern,symbol')) { continue; }
      const css = getComputedStyle(node); if (css.display === 'none' || css.visibility === 'hidden') { continue; }
      const matrix = node.getScreenCTM(); if (!matrix) { continue; } const scale = minimumScale(matrix); const stroke = Number.parseFloat(css.strokeWidth);
      if (['path','rect','line','polyline','polygon','circle','ellipse','text'].includes(node.localName) && css.stroke !== 'none' && stroke > 0) { minStroke = Math.min(minStroke, stroke * (css.vectorEffect === 'non-scaling-stroke' ? 1 : scale) * 72 / 96); }
      if (node.localName === 'text' || node.localName === 'tspan') { const font = Number.parseFloat(css.fontSize); if (Number.isFinite(font)) { minFont = Math.min(minFont, font * scale * 72 / 96); } const family = css.fontFamily.split(',')[0]!.trim().replace(/^['"]|['"]$/g, ''); fonts.add(family); }
      if (node.localName !== 'text' || !node.textContent?.trim()) { continue; }
      textCount += 1; const box = node.getBoundingClientRect(); const local = node.ownerSVGElement?.getBoundingClientRect() ?? viewport;
      if (box.left < local.left - .5 || box.top < local.top - .5 || box.right > local.right + .5 || box.bottom > local.bottom + .5) { finding('PUB004', 'Text extends beyond its SVG viewport.', node); }
      textBoxes.push({ node, box });
    }
    if (minFont < (options.minFontPt ?? 7)) { finding('PUB002', `Smallest measured text is ${minFont.toFixed(3)} pt.`); }
    if (minStroke < (options.minStrokePt ?? .5)) { finding('PUB003', `Smallest measured stroke is ${minStroke.toFixed(3)} pt.`); }
    if (!root.querySelector('title')?.textContent?.trim()) { finding('PUB_TITLE', 'Figure has no accessible title.'); }
    if (options.requireText !== false && !textCount) { finding('PUB_TEXT', 'No editable text was found; outlined glyphs cannot be reconstructed.'); }
    if (options.allowedFonts) { const approved = new Set(options.allowedFonts.map((name) => name.toLowerCase())); for (const family of fonts) { if (!approved.has(family.toLowerCase())) { finding('PUB005', `Declared font family is not approved by this profile: ${family}.`); } } }
    if (options.checkOverlaps && textBoxes.length <= 1000) {
      let overlaps = 0;
      for (let i = 0; i < textBoxes.length && overlaps < 20; i += 1) {
        const a = textBoxes[i]!;
        for (let j = i + 1; j < textBoxes.length && overlaps < 20; j += 1) { const b = textBoxes[j]!; if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1) { finding('PUB_OVERLAP', 'Text bounding boxes overlap; inspect intentional overlaps manually.', a.node); overlaps += 1; } }
      }
    } else if (options.checkOverlaps) { finding('PUB_OVERLAP_BUDGET', 'Overlap checks skipped above 1000 text objects.'); }
  } finally { holder.remove(); }
  return { ok: !issues.some((issue) => issue.severity === 'error'), issues, metrics: { widthMm, heightMm, textElements: textCount, minFontPt: Number.isFinite(minFont) ? minFont : null, minStrokePt: Number.isFinite(minStroke) ? minStroke : null, fonts: [...fonts].sort() } };
}
