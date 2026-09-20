import type { Page } from 'playwright-core';
import { parsePhysicalLength, toMillimeters, sanitizeSvgDocument } from '@eraserlabs/render';

export class VectorPdfError extends Error {
  readonly stageCode = 'E_PDF' as const;
  constructor(message: string) {
    super(message);
    this.name = 'VectorPdfError';
  }
}

/** A dedicated page prevents PDF sizing or failed exports from mutating a pooled scene. */
export async function printVectorPdf(
  createPage: () => Promise<Page>,
  svg: string,
): Promise<Buffer> {
  const page = await createPage();
  try {
    // Font staging is caller-owned and complete before this point. Figure resources stay local.
    await page.route('**/*', (route) => route.abort());
    const safe = await page.evaluate(sanitizeSvgDocument, { svg, options: { preserveIdentity: true } });
    if (!safe.ok) {
      throw new VectorPdfError(safe.errors.map((issue) => issue.message).join(' '));
    }
    if (!safe.width || !safe.height) {
      throw new VectorPdfError('PDF export requires explicit SVG width and height.');
    }
    let widthMm: number;
    let heightMm: number;
    try {
      widthMm = toMillimeters(parsePhysicalLength(safe.width));
      heightMm = toMillimeters(parsePhysicalLength(safe.height));
    } catch {
      throw new VectorPdfError('PDF dimensions must be positive absolute lengths.');
    }
    if (Math.max(widthMm, heightMm) > 1000) {
      throw new VectorPdfError('PDF figure dimensions must not exceed 1000 mm.');
    }
    await page.evaluate(async ({ source, width, height }) => {
      document.body.replaceChildren();
      document.documentElement.style.cssText = 'margin:0;padding:0';
      document.body.style.cssText = `margin:0;padding:0;width:${width}mm;height:${height}mm`;
      const sheet = document.createElement('style');
      sheet.textContent = `@page { size:${width}mm ${height}mm; margin:0; }`;
      document.head.appendChild(sheet);
      const host = document.createElement('div');
      host.style.cssText = `width:${width}mm;height:${height}mm;line-height:0`;
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ':host { display:block } svg { display:block; print-color-adjust:exact; -webkit-print-color-adjust:exact }';
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      const root = document.importNode(parsed.documentElement, true);
      root.setAttribute('width', `${width}mm`);
      root.setAttribute('height', `${height}mm`);
      shadow.append(style, root);
      document.body.appendChild(host);
      await document.fonts.ready;
    }, { source: safe.svg, width: widthMm, height: heightMm });
    await page.emulateMedia({ media: 'screen' });
    return await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      scale: 1,
    });
  } finally {
    await page.close();
  }
}
