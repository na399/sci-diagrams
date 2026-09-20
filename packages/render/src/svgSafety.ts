/// <reference lib="dom" />
export interface SvgSafetyIssue { code: string; message: string; path: string }
export interface SvgSafetyOptions { namespace?: string; preserveIdentity?: boolean }
export type SvgSafetyResult =
  | { ok: true; svg: string; viewBox: [number, number, number, number]; width: string | null; height: string | null; warnings: SvgSafetyIssue[] }
  | { ok: false; errors: SvgSafetyIssue[]; warnings: SvgSafetyIssue[] };
/** Inert XML intake. No input stylesheet or element is inserted into a live document. Self-contained for isolated browser evaluation. */
export function sanitizeSvgDocument(request: { svg: string; options?: SvgSafetyOptions }): SvgSafetyResult {
  const errors: SvgSafetyIssue[] = []; const warnings: SvgSafetyIssue[] = [];
  const problem = (message: string, path = ''): void => { errors.push({ code: 'E_SVG_UNSAFE', message, path }); };
  const fail = (message: string): SvgSafetyResult => ({ ok: false, errors: [{ code: 'E_SVG_UNSAFE', message, path: '' }], warnings });
  if (!request || typeof request.svg !== 'string' || new TextEncoder().encode(request.svg).length > 5 * 1024 * 1024) { return fail('SVG must be a string no larger than 5 MiB.'); }
  const options = request.options ?? {};
  if (typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some((key) => !['namespace','preserveIdentity'].includes(key)) || (options.preserveIdentity !== undefined && typeof options.preserveIdentity !== 'boolean')) { return fail('Invalid SVG safety options.'); }
  if (options.namespace !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(options.namespace)) { return fail('Invalid SVG resource namespace.'); }
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(request.svg)) { return fail('DTD, entities and processing instructions are forbidden.'); }
  const parsed = new DOMParser().parseFromString(request.svg, 'image/svg+xml');
  const root = parsed.documentElement; const ns = 'http://www.w3.org/2000/svg';
  if (parsed.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== ns) { return fail('Expected well-formed SVG XML with its namespace.'); }
  const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
  if (nodes.length > 20000) { return fail('SVG contains more than 20000 elements.'); }
  const allowed = new Set(['svg','g','defs','symbol','use','rect','circle','ellipse','line','polyline','polygon','path','text','tspan','title','desc','marker','mask','clipPath','linearGradient','radialGradient','stop','pattern','style','metadata']);
  const paint = new Set(('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit opacity visibility display color paint-order clip-rule stop-color stop-opacity vector-effect marker-start marker-mid marker-end mask clip-path font-family font-size font-weight font-style font-variant font-variant-caps font-stretch font-kerning letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline text-decoration text-decoration-line line-height').split(' '));
  const attributes = new Set(('id class style xmlns xmlns:xlink href xlink:href xml:space role aria-label aria-labelledby aria-describedby width height viewBox preserveAspectRatio x y x1 y1 x2 y2 cx cy r rx ry d points dx dy rotate transform transform-origin textLength lengthAdjust pathLength version overflow refX refY orient markerWidth markerHeight markerUnits maskUnits maskContentUnits clipPathUnits gradientUnits gradientTransform spreadMethod offset fx fy fr patternUnits patternContentUnits patternTransform').split(' '));
  const ids = new Map<string, Element>(); const index = new Map(nodes.map((node, i) => [node, i]));
  const location = (node: Element): string => `/svg/elements/${index.get(node) ?? 0}`;
  const refs = new Map<Element, string[]>();
  const reference = (value: string, node: Element): void => {
    if (/[\\@]|javascript:|expression\s*\(|var\s*\(|env\s*\(/i.test(value)) { problem('Escaped, dynamic or executable CSS values are not supported.', location(node)); return; }
    const matches = [...value.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)];
    if (/url\s*\(/i.test(value) && !matches.length) { problem('Malformed SVG URL.', location(node)); }
    for (const match of matches) {
      if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(match[1]!)) { problem('Only local SVG resource references are allowed.', location(node)); }
      else { const list = refs.get(node) ?? []; list.push(match[1]!.slice(1)); refs.set(node, list); }
    }
  };
  const removed = new Set<Element>();
  for (const node of nodes) {
    let depth = 0; for (let parent = node.parentElement; parent; parent = parent.parentElement) { depth += 1; }
    if (depth > 128) { return fail('SVG nesting exceeds 128 levels.'); }
    if (node.closest('metadata')) { removed.add(node); continue; }
    if (node.namespaceURI !== ns || !allowed.has(node.localName)) { problem(`Unsupported SVG element: ${node.localName}`, location(node)); continue; }
    if (node.id) { if (ids.has(node.id)) { problem(`Duplicate SVG id: ${node.id}`, location(node)); } else { ids.set(node.id, node); } }
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name; const value = attribute.value;
      if (/^on/i.test(name) || name === 'xml:base') { problem(`Forbidden attribute: ${name}`, location(node)); continue; }
      if (name.startsWith('data-')) {
        if (!(options.preserveIdentity && ['data-mdp-id', 'data-mdp-tag'].includes(name))) { node.removeAttribute(name); }
        continue;
      }
      if (attribute.namespaceURI && !['http://www.w3.org/1999/xlink','http://www.w3.org/XML/1998/namespace','http://www.w3.org/2000/xmlns/'].includes(attribute.namespaceURI)) { node.removeAttributeNode(attribute); continue; }
      if (!attributes.has(name) && !paint.has(name)) { problem(`Unsupported SVG attribute: ${name}`, location(node)); continue; }
      if (value.length > 262144) { problem('An SVG attribute exceeds its size limit.', location(node)); }
      if (name === 'href' || name === 'xlink:href') {
        if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) { problem('External or malformed href is forbidden.', location(node)); }
        else { const list = refs.get(node) ?? []; list.push(value.slice(1)); refs.set(node, list); }
      } else if (name !== 'style') { reference(value, node); }
      if (['d','points','transform','gradientTransform','patternTransform'].includes(name)) {
        const numbers = value.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
        if (numbers.some((n) => !Number.isFinite(Number(n)) || Math.abs(Number(n)) > 1e7)) { problem('SVG geometry exceeds the supported numeric range.', location(node)); }
      }
    }
  }
  if (removed.size) {
    for (const node of removed) { if (node.localName === 'metadata') { node.remove(); } }
    warnings.push({ code: 'W_SVG_METADATA', message: 'Nonvisual metadata was removed from the portable vector artifact.', path: '/svg/metadata' });
  }
  if (errors.length) { return { ok: false, errors, warnings }; }
  interface Declaration { property: string; value: string; important: boolean }
  const declarations = (source: string, node: Element): Declaration[] => {
    if (/[\\@]|\/\*/.test(source)) { problem('CSS escapes, at-rules and comments are not accepted.', location(node)); return []; }
    const scratch = document.createElement('span').style; const result: Declaration[] = [];
    for (const part of source.split(';')) {
      if (!part.trim()) { continue; } const split = part.indexOf(':');
      if (split < 1) { problem('Invalid CSS declaration.', location(node)); continue; }
      const property = part.slice(0, split).trim().toLowerCase(); let value = part.slice(split + 1).trim();
      const important = /\s*!important\s*$/i.test(value); value = value.replace(/\s*!important\s*$/i, '').trim();
      if ((!paint.has(property) && property !== 'font') || !value) { problem(`Unsupported CSS property: ${property}`, location(node)); continue; }
      reference(value, node); scratch.cssText = ''; scratch.setProperty(property, value);
      if (!scratch.getPropertyValue(property)) { problem(`Invalid CSS value for ${property}.`, location(node)); continue; }
      if (property === 'font') {
        for (const name of ['font-family','font-size','font-weight','font-style','font-variant','font-stretch','line-height']) { const v = scratch.getPropertyValue(name); if (v) { result.push({ property: name, value: v, important }); } }
      } else { result.push({ property, value: scratch.getPropertyValue(property), important }); }
    }
    return result;
  };
  const styleNodes = nodes.filter((node) => node.localName === 'style' && !removed.has(node));
  const rules: { selector: string; specificity: number; values: Declaration[]; order: number }[] = [];
  for (const node of styleNodes) {
    const css = node.textContent ?? '';
    if (/[\\@]|\/\*/.test(css)) { problem('Only static SVG paint rules are allowed.', location(node)); continue; }
    const sheet = new CSSStyleSheet(); try { sheet.replaceSync(css); } catch { problem('Invalid SVG stylesheet.', location(node)); continue; }
    if (sheet.cssRules.length > 256) { problem('SVG stylesheet has too many rules.', location(node)); continue; }
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) { problem('SVG stylesheet may contain only ordinary style rules.', location(node)); continue; }
      for (const selector of rule.selectorText.split(',').map((value) => value.trim())) {
        if (!selector || !/^[A-Za-z0-9_.*# >-]+$/.test(selector)) { problem('Unsupported SVG stylesheet selector.', location(node)); continue; }
        const specificity = (selector.match(/#/g)?.length ?? 0) * 100 + (selector.match(/\./g)?.length ?? 0) * 10 + (selector.match(/(?:^|[ >]+)[A-Za-z][A-Za-z0-9_-]*/g)?.length ?? 0);
        rules.push({ selector, specificity, values: declarations(rule.style.cssText, node), order: rules.length });
      }
    }
  }
  if (rules.length * nodes.length > 2000000) { problem('SVG stylesheet expansion exceeds its budget.'); }
  if (errors.length) { return { ok: false, errors, warnings }; }
  const active = nodes.filter((node) => !removed.has(node) && node.localName !== 'style');
  for (const node of active) {
    const winners = new Map<string, { rank: number; order: number; value: string }>();
    const choose = (values: Declaration[], specificity: number, order: number): void => {
      for (const declaration of values) {
        const rank = specificity + (declaration.important ? 1000000 : 0); const old = winners.get(declaration.property);
        if (!old || rank > old.rank || (rank === old.rank && order >= old.order)) { winners.set(declaration.property, { rank, order, value: declaration.value }); }
      }
    };
    for (const rule of rules) { try { if (node.matches(rule.selector)) { choose(rule.values, rule.specificity, rule.order); } } catch { problem('Invalid SVG selector.'); } }
    choose(declarations(node.getAttribute('style') ?? '', node), 100000, rules.length);
    for (const [property, winner] of winners) { node.setAttribute(property, winner.value); reference(winner.value, node); }
    node.removeAttribute('style'); node.removeAttribute('class');
  }
  styleNodes.forEach((node) => node.remove());
  const activeSet = new Set(active); const adjacency = new Map<Element, Element[]>();
  for (const node of active) {
    const edges = Array.from(node.children).filter((child) => activeSet.has(child));
    for (const id of refs.get(node) ?? []) { const target = ids.get(id); if (!target || !activeSet.has(target)) { problem(`Unresolved SVG reference: #${id}`, location(node)); } else { edges.push(target); } }
    adjacency.set(node, edges);
  }
  const visiting = new Set<Element>(); const costs = new Map<Element, number>();
  const expansion = (node: Element, depth = 0): number => {
    if (visiting.has(node) || depth > 256) { throw new Error('Cyclic or excessively deep SVG resources.'); }
    const known = costs.get(node); if (known !== undefined) { return known; }
    visiting.add(node); let cost = 1;
    for (const next of adjacency.get(node) ?? []) { cost += expansion(next, depth + 1); if (cost > 200000) { throw new Error('SVG resource expansion exceeds its budget.'); } }
    visiting.delete(node); costs.set(node, cost); return cost;
  };
  if (!errors.length) { try { expansion(root); } catch (error) { problem(error instanceof Error ? error.message : 'Invalid SVG resources.'); } }
  const parts = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6) || parts[2]! <= 0 || parts[3]! <= 0) { problem('SVG requires a finite positive viewBox.'); }
  if (errors.length) { return { ok: false, errors, warnings }; }
  if (options.namespace) {
    const names = new Map([...ids.keys()].map((id, i) => [id, `${options.namespace}-${i}`]));
    for (const node of active) {
      if (node.id) { node.id = names.get(node.id)!; }
      for (const attribute of Array.from(node.attributes)) {
        let value = attribute.value;
        if (attribute.localName === 'href') { value = `#${names.get(value.slice(1))!}`; }
        else if (attribute.name === 'aria-labelledby' || attribute.name === 'aria-describedby') { value = value.split(/\s+/).map((id) => names.get(id) ?? '').filter(Boolean).join(' '); }
        else { value = value.replace(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/gi, (_, id: string) => `url(#${names.get(id)!})`); }
        node.setAttribute(attribute.name, value);
      }
    }
  }
  const comments = parsed.createTreeWalker(root, NodeFilter.SHOW_COMMENT); const toRemove: Node[] = [];
  while (comments.nextNode()) { toRemove.push(comments.currentNode); } toRemove.forEach((node) => node.parentNode?.removeChild(node));
  return { ok: true, svg: new XMLSerializer().serializeToString(root), viewBox: parts as [number, number, number, number], width: root.getAttribute('width'), height: root.getAttribute('height'), warnings };
}
