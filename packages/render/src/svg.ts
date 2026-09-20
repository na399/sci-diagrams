/// <reference lib="dom" />

/** Options are data so this function can also run through Playwright's page.evaluate. */
export interface SvgExportOptions {
  widthMm?: number;
  title?: string;
  description?: string;
  background?: 'transparent' | 'white';
  minFontPt?: number;
  minStrokePt?: number;
}

export interface SvgIssue {
  code: 'E_SVG_UNSUPPORTED' | 'E_SVG_INVALID' | 'E_SVG_OVERFLOW' | 'W_SVG_FONT_SIZE' | 'W_SVG_STROKE';
  severity: 'error' | 'warning';
  path: string;
  message: string;
  elementId?: string;
  tag?: string;
}

export type SvgExportResult =
  | { ok: true; svg: string; warnings: SvgIssue[] }
  | { ok: false; errors: SvgIssue[]; warnings: SvgIssue[] };

/**
 * Export the already measured/applied Eraser scene, not a second layout of the source.
 *
 * HTML may position SVG islands but must not paint anything. Every painted element must be
 * in the supported SVG subset. No foreignObject or raster fallback. Helpers remain inside
 * this function deliberately: Playwright serializes it into the page without closures.
 * Loading this module in Node is safe; DOM access happens only when the function is called.
 * This is an export validator, not a substitute for pre-render template/asset sanitization.
 */
export function serializeSvgScene(options: SvgExportOptions = {}): SvgExportResult {
  const ns = 'http://www.w3.org/2000/svg';
  const warnings: SvgIssue[] = [];
  const errors: SvgIssue[] = [];
  const issue = (code: SvgIssue['code'], message: string, host?: Element): void => {
    const id = host?.getAttribute('data-mdp-id');
    const tag = host?.getAttribute('data-mdp-tag');
    const item: SvgIssue = {
      code,
      severity: code.startsWith('W_') ? 'warning' : 'error',
      path: '',
      message,
      ...(id ? { elementId: id } : {}),
      ...(tag ? { tag } : {}),
    };
    (item.severity === 'error' ? errors : warnings).push(item);
  };
  const invalid = (message: string): SvgExportResult => ({
    ok: false,
    errors: [{ code: 'E_SVG_INVALID', severity: 'error', path: '', message }],
    warnings: [],
  });
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return invalid('SVG options must be an object.');
  }
  for (const [key, value] of Object.entries(options)) {
    if (!['widthMm', 'title', 'description', 'background', 'minFontPt', 'minStrokePt'].includes(key)) {
      return invalid(`Unknown SVG export option: ${key}`);
    }
    if (['widthMm', 'minFontPt', 'minStrokePt'].includes(key) &&
        (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
      return invalid(`${key} must be a finite positive number.`);
    }
    if (['title', 'description'].includes(key) && typeof value !== 'string') {
      return invalid(`${key} must be a string.`);
    }
  }
  if (options.background !== undefined && !['white', 'transparent'].includes(options.background)) {
    return invalid('background must be white or transparent.');
  }
  const scene = document.getElementById('eraser-scene');
  if (!scene) {
    return invalid('No applied Eraser scene exists. Render a diagram first.');
  }
  const bounds = scene.getBoundingClientRect();
  if (![bounds.width, bounds.height].every((v) => Number.isFinite(v) && v > 0)) {
    return invalid('The scene must have finite positive dimensions.');
  }
  const round = (n: number): string => String(Math.round(n * 1000) / 1000 || 0);
  const widthMm = options.widthMm ?? bounds.width * 25.4 / 96;
  const ptPerPx = widthMm * 72 / 25.4 / bounds.width;
  const root = document.createElementNS(ns, 'svg');
  root.setAttribute('viewBox', `0 0 ${round(bounds.width)} ${round(bounds.height)}`);
  root.setAttribute('width', `${round(widthMm)}mm`);
  root.setAttribute('height', `${round(widthMm * bounds.height / bounds.width)}mm`);
  root.setAttribute('role', 'img');
  for (const [tag, content] of [['title', options.title], ['desc', options.description]] as const) {
    if (content) {
      const node = document.createElementNS(ns, tag);
      node.textContent = content;
      root.appendChild(node);
    }
  }
  if (options.background === 'white') {
    const background = document.createElementNS(ns, 'rect');
    background.setAttribute('width', '100%');
    background.setAttribute('height', '100%');
    background.setAttribute('fill', '#ffffff');
    root.appendChild(background);
  }
  const allowed = new Set([
    'svg', 'g', 'defs', 'symbol', 'use', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'path', 'text', 'tspan', 'title', 'desc', 'marker', 'mask', 'clipPath',
    'linearGradient', 'radialGradient', 'stop', 'pattern',
  ]);
  const paint = [
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'opacity', 'visibility', 'display', 'color', 'paint-order',
    'clip-rule', 'stop-color', 'stop-opacity', 'vector-effect', 'marker-start',
    'marker-mid', 'marker-end', 'mask', 'clip-path',
  ];
  const typography = [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline',
    'alignment-baseline', 'text-decoration',
  ];
  const transparent = (value: string): boolean =>
    value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
  // Smallest singular value accounts for non-uniform transforms conservatively.
  const minimumScale = (matrix: DOMMatrix | null): number => {
    if (!matrix) {
      return 1;
    }
    const sum = matrix.a ** 2 + matrix.b ** 2 + matrix.c ** 2 + matrix.d ** 2;
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    const discriminant = Math.max(0, sum ** 2 - 4 * determinant ** 2);
    return Math.sqrt(Math.max(0, (sum - Math.sqrt(discriminant)) / 2));
  };
  const hosts = Array.from(scene.children).filter((el) => el.hasAttribute('data-mdp-id'));
  const islands: { source: SVGSVGElement; host: Element; z: number; order: number }[] = [];
  for (const host of hosts) {
    const html = [host, ...Array.from(host.querySelectorAll('*'))].filter((el) => el.namespaceURI !== ns);
    for (const el of html) {
      const css = getComputedStyle(el);
      const hasText = Array.from(el.childNodes).some((node) => node.nodeType === 3 && node.textContent?.trim());
      const pseudo = ['::before', '::after'].some((p) => {
        const content = getComputedStyle(el, p).content;
        return content !== 'none' && content !== 'normal' && content !== '""';
      });
      const border = ['top', 'right', 'bottom', 'left'].some((side) =>
        parseFloat(css.getPropertyValue(`border-${side}-width`)) > 0 &&
        css.getPropertyValue(`border-${side}-style`) !== 'none');
      const matrix = css.transform.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(',').map(Number);
      const translation = css.transform === 'none' ||
        (matrix?.length === 6 && matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 1);
      if (hasText || pseudo || border || !transparent(css.backgroundColor) ||
          css.backgroundImage !== 'none' || css.boxShadow !== 'none' || css.filter !== 'none' ||
          css.opacity !== '1' || !translation || css.overflowX !== 'visible' || css.overflowY !== 'visible') {
        issue('E_SVG_UNSUPPORTED', 'HTML paint, clipping, or a non-translation HTML transform cannot be exported. Use a vector-safe template.', host);
        break;
      }
    }
    const svgRoots = Array.from(host.querySelectorAll('svg')).filter((svg) => !svg.parentElement?.closest('svg'));
    if (!svgRoots.length) {
      issue('E_SVG_UNSUPPORTED', 'This template contains no exportable SVG island.', host);
    }
    for (const source of svgRoots) {
      let z = 0;
      for (let el: Element | null = source; el && el !== scene; el = el.parentElement) {
        const value = Number.parseInt(getComputedStyle(el).zIndex, 10);
        if (Number.isFinite(value)) {
          z = Math.max(z, value);
        }
      }
      islands.push({ source, host, z, order: islands.length });
    }
  }
  let minimumFont = Infinity;
  let minimumStroke = Infinity;
  for (const { source, host, order } of islands.sort((a, b) => a.z - b.z || a.order - b.order)) {
    const clone = source.cloneNode(true) as SVGSVGElement;
    const originals = [source, ...Array.from(source.querySelectorAll('*'))];
    const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
    const ids = new Map<string, string>();
    for (const el of originals) {
      if (el.id) {
        if (ids.has(el.id)) {
          issue('E_SVG_INVALID', `Duplicate resource id: ${el.id}`, host);
        }
        ids.set(el.id, `sci-${order}-${ids.size}`);
      }
    }
    const reference = (value: string): string => value.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (_whole, target: string) => {
      if (!target.startsWith('#') || !ids.has(target.slice(1))) {
        issue('E_SVG_INVALID', `External or unresolved SVG reference: ${target}`, host);
        return 'none';
      }
      return `url(#${ids.get(target.slice(1))})`;
    });
    for (let index = 0; index < originals.length; index += 1) {
      const original = originals[index]!;
      const copy = copies[index]!;
      if (!allowed.has(original.localName) || original.namespaceURI !== ns) {
        issue('E_SVG_UNSUPPORTED', `Unsupported SVG element: ${original.localName}`, host);
        continue;
      }
      const css = getComputedStyle(original);
      if (css.filter !== 'none' || css.boxShadow !== 'none' || css.textShadow !== 'none' ||
          css.mixBlendMode !== 'normal' ||
          (css.transform !== 'none' && (!original.hasAttribute('transform') || original === source))) {
        issue('E_SVG_UNSUPPORTED', 'SVG filters, shadows, blend modes, and CSS-only transforms are not supported.', host);
      }
      for (const attribute of Array.from(copy.attributes)) {
        const name = attribute.name;
        if (name === 'xml:base') {
          issue('E_SVG_INVALID', 'xml:base is forbidden in self-contained SVG.', host);
          copy.removeAttribute(name);
        } else if (/^on/i.test(name)) {
          issue('E_SVG_INVALID', 'Event handlers are forbidden in SVG output.', host);
          copy.removeAttribute(name);
        } else if (name === 'style' || name === 'class' || name.startsWith('data-')) {
          copy.removeAttribute(name);
        } else if (attribute.localName === 'href') {
          const target = attribute.value;
          if (!target.startsWith('#') || !ids.has(target.slice(1))) {
            issue('E_SVG_INVALID', `External or unresolved href: ${target}`, host);
          } else {
            copy.setAttribute(name, `#${ids.get(target.slice(1))}`);
          }
        } else if (name === 'id') {
          copy.setAttribute('id', ids.get(attribute.value)!);
        } else if (attribute.value.includes('url(')) {
          copy.setAttribute(name, reference(attribute.value));
        }
      }
      const fields = original.localName === 'text' || original.localName === 'tspan' ? [...paint, ...typography] : paint;
      for (const property of fields) {
        const value = css.getPropertyValue(property).trim();
        if (value) {
          copy.setAttribute(property, reference(value));
        }
      }
      if (original.localName === 'text') {
        const text = original.getBoundingClientRect();
        const viewport = source.getBoundingClientRect();
        if (text.left < viewport.left - 0.5 || text.top < viewport.top - 0.5 ||
            text.right > viewport.right + 0.5 || text.bottom > viewport.bottom + 0.5) {
          issue('E_SVG_OVERFLOW', 'Text overflows its SVG viewport. Increase the component or label dimensions.', host);
        }
      }
      const matrix = original instanceof SVGGraphicsElement ? original.getScreenCTM() : null;
      const scale = minimumScale(matrix);
      if (original.localName === 'text' || original.localName === 'tspan') {
        const size = Number.parseFloat(css.fontSize);
        if (Number.isFinite(size)) {
          minimumFont = Math.min(minimumFont, size * scale * ptPerPx);
        }
      }
      const stroke = Number.parseFloat(css.strokeWidth);
      if (['path', 'rect', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'text'].includes(original.localName) &&
          css.stroke !== 'none' && stroke > 0 && Number.isFinite(stroke)) {
        const strokeScale = css.getPropertyValue('vector-effect') === 'non-scaling-stroke' ? 1 : scale;
        minimumStroke = Math.min(minimumStroke, stroke * strokeScale * ptPerPx);
      }
    }
    const box = source.getBoundingClientRect();
    clone.setAttribute('x', round(box.left - bounds.left));
    clone.setAttribute('y', round(box.top - bounds.top));
    clone.setAttribute('width', round(box.width));
    clone.setAttribute('height', round(box.height));
    clone.setAttribute('overflow', 'visible');
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('data-mdp-id', host.getAttribute('data-mdp-id') ?? '');
    group.setAttribute('data-mdp-tag', host.getAttribute('data-mdp-tag') ?? '');
    group.appendChild(clone);
    root.appendChild(group);
  }
  if (minimumFont < (options.minFontPt ?? 7)) {
    issue('W_SVG_FONT_SIZE', `Minimum text size at export width is ${round(minimumFont)} pt.`);
  }
  if (minimumStroke < (options.minStrokePt ?? 0.5)) {
    issue('W_SVG_STROKE', `Minimum stroke at export width is ${round(minimumStroke)} pt.`);
  }
  if (errors.length) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, svg: new XMLSerializer().serializeToString(root), warnings };
}
