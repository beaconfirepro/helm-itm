/**
 * Spacing / layout extraction — the inline-style analog of `colors.js`, but
 * PROPERTY-SCOPED via Babel rather than a naive number scan. We only surface a
 * value when it is the right-hand side of a recognized spacing property in a
 * style object (`padding: 16`, `borderRadius: 8`, `margin: '0 0 8px'`) — never a
 * bare `16` or an unrelated `maxWidth: 320`. These are the hardcoded layout
 * values the per-component editor lets you change, and the candidates the
 * "tokenize this" action promotes into `tokens.json` as `--spacing-*`.
 *
 * We read via Babel (robust, property-aware) and write via precise char-offset
 * splicing (surgical — we never reformat the user's file), mirroring
 * `variant-config.js`.
 */

import { parse } from '@babel/parser';

/** Style-object keys we treat as spacing/layout (the handoff's set). */
export const SPACING_PROPS = new Set([
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'fontSize',
]);

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') walk(child, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function keyName(prop) {
  if (!prop || !prop.key) return null;
  return prop.key.name ?? prop.key.value ?? null;
}

/**
 * A value node is a "spacing literal" when it is a numeric literal (`16`) or a
 * string literal whose contents look like a length (`'0 0 8px'`, `'4px 10px'`,
 * `'50%'`). We require a digit so we don't grab `fontSize: 'inherit'`.
 */
function spacingLiteral(valueNode) {
  if (!valueNode) return null;
  if (valueNode.type === 'NumericLiteral') {
    return { kind: 'number', value: valueNode.value, display: String(valueNode.value) };
  }
  if (valueNode.type === 'StringLiteral' && /\d/.test(valueNode.value)) {
    return { kind: 'string', value: valueNode.value, display: valueNode.value };
  }
  return null;
}

function parseSource(source) {
  try {
    return parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch {
    return null;
  }
}

/**
 * Every recognized spacing assignment, with its value node's char offsets.
 * @returns {{ property:string, kind:'number'|'string', value:(number|string),
 *             display:string, start:number, end:number }[]}
 */
export function collectSpacingNodes(source) {
  const ast = parseSource(source);
  if (!ast) return [];
  const out = [];
  walk(ast.program, (node) => {
    if (node.type !== 'ObjectProperty' && node.type !== 'Property') return;
    const name = keyName(node);
    if (!name || !SPACING_PROPS.has(name)) return;
    const lit = spacingLiteral(node.value);
    if (!lit) return;
    out.push({ property: name, ...lit, start: node.value.start, end: node.value.end });
  });
  return out;
}

/**
 * Unique { property, value } spacing pairs in source order — what the panel
 * lists. A property/value that appears several times collapses to one row;
 * editing it rewrites every matching occurrence (property-scoped), the same
 * "everywhere in this component" semantics as the Colors editor.
 * @returns {{ property:string, kind:'number'|'string', value:(number|string), display:string }[]}
 */
export function extractSpacing(source) {
  const seen = new Set();
  const out = [];
  for (const node of collectSpacingNodes(source)) {
    const id = `${node.property}=${node.kind}:${node.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ property: node.property, kind: node.kind, value: node.value, display: node.display });
  }
  return out;
}

/** Render a JS literal for a new spacing value: bare number or single-quoted string. */
export function spacingLiteralText(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return value.trim();
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

/**
 * Rewrite a spacing property's value everywhere it currently holds `from`,
 * scoped to that property key. Splices from the end so earlier offsets stay
 * valid. `to` is emitted verbatim (caller controls literal vs. `var(--…)`).
 * @returns {{ ok:boolean, source?:string, changed:boolean, count:number, error?:string }}
 */
export function rewriteSpacing(source, property, from, to) {
  if (!property || !SPACING_PROPS.has(property)) {
    return { ok: false, changed: false, count: 0, error: `"${property}" is not a spacing property` };
  }
  const fromStr = String(from);
  const targets = collectSpacingNodes(source)
    .filter((n) => n.property === property && String(n.value) === fromStr)
    .sort((a, b) => b.start - a.start);
  if (!targets.length) {
    return { ok: true, source, changed: false, count: 0 };
  }
  let next = source;
  for (const t of targets) {
    next = next.slice(0, t.start) + to + next.slice(t.end);
  }
  return { ok: true, source: next, changed: next !== source, count: targets.length };
}
