/**
 * Anti-component variant config — the shared model behind shadcn/ui (cva) and
 * Untitled UI (tailwind-variants / `tv`).
 *
 * Both express a component's appearance as a `variants: { name: { value: classes } }`
 * object plus `defaultVariants`. Because the prop AND its TS type are derived
 * from that object (`VariantProps<typeof x>` / `tv` inference), ADDING a variant
 * value or a whole new variant axis is a localized object edit — not authoring a
 * new component API by hand.
 *
 * We read the config via Babel (robust) and write via precise char-offset
 * insertion (surgical — we never reformat the user's file).
 */

import { parse } from '@babel/parser';

const VARIANT_FNS = new Set(['cva', 'tv']);

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
  if (!prop.key) return null;
  return prop.key.name ?? prop.key.value ?? null;
}

/**
 * @returns {{ found:boolean, library?:'cva'|'tv', variants?:Record<string,string[]>,
 *            variantsObject?:{start:number,end:number},
 *            variantObjects?:Record<string,{start:number,end:number}> }}
 */
export function readVariantConfig(source) {
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch {
    return { found: false };
  }

  let result = { found: false };
  walk(ast.program, (node) => {
    if (result.found) return;
    if (node.type !== 'CallExpression' || !node.callee || !VARIANT_FNS.has(node.callee.name)) return;

    const configObj = (node.arguments || []).find(
      (a) => a.type === 'ObjectExpression' && a.properties.some((p) => keyName(p) === 'variants'),
    );
    if (!configObj) return;

    const variantsProp = configObj.properties.find((p) => keyName(p) === 'variants');
    if (!variantsProp || variantsProp.value.type !== 'ObjectExpression') return;

    const variants = {};
    const variantObjects = {};
    for (const axis of variantsProp.value.properties) {
      const name = keyName(axis);
      if (!name || !axis.value || axis.value.type !== 'ObjectExpression') continue;
      variants[name] = axis.value.properties.map(keyName).filter(Boolean);
      variantObjects[name] = { start: axis.value.start, end: axis.value.end };
    }

    result = {
      found: true,
      library: node.callee.name,
      variants,
      variantsObject: { start: variantsProp.value.start, end: variantsProp.value.end },
      variantObjects,
    };
  });
  return result;
}

/** Insert `value: 'classes',` into an existing variant axis. */
export function addVariantValue(source, variant, value, classes) {
  const cfg = readVariantConfig(source);
  if (!cfg.found) return { ok: false, error: 'No cva/tv variant config found' };
  const target = cfg.variantObjects[variant];
  if (!target) return { ok: false, error: `Variant "${variant}" not found` };
  if ((cfg.variants[variant] || []).includes(value)) {
    return { ok: false, error: `"${variant}.${value}" already exists` };
  }
  const insertAt = target.start + 1; // just after the axis object's "{"
  const snippet = `\n      ${value}: '${classes}',`;
  return { ok: true, source: source.slice(0, insertAt) + snippet + source.slice(insertAt) };
}

/** Insert a whole new variant axis `prop: { value: 'classes' },` into `variants`. */
export function addVariantAxis(source, prop, value, classes) {
  const cfg = readVariantConfig(source);
  if (!cfg.found) return { ok: false, error: 'No cva/tv variant config found' };
  if (cfg.variants[prop]) return { ok: false, error: `Variant "${prop}" already exists` };
  const insertAt = cfg.variantsObject.start + 1; // just after the variants "{"
  const snippet = `\n    ${prop}: {\n      ${value}: '${classes}',\n    },`;
  return { ok: true, source: source.slice(0, insertAt) + snippet + source.slice(insertAt) };
}
