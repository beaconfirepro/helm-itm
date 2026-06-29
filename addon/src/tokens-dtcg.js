/**
 * External design-token adapter — W3C DTCG / style-dictionary format.
 *
 * The addon's native token system (`tokens.js`) owns its own `tokens.json` and
 * generates a Tailwind `@theme` sheet. But a real design system usually already
 * has a token source of truth — e.g. a style-dictionary file
 * (`{ color: { accent: { default: { "$value": "#f59e0b", "$type": "color" } } } }`)
 * that builds out `--ds-*` CSS variables. This adapter lets the panel edit THAT
 * file directly, so the team's actual tokens are what change — and optionally
 * patches the generated CSS so the change recolors the canvas live without
 * waiting for a full token rebuild.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

const isLeaf = (node) =>
  node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, '$value');

/**
 * Flatten a DTCG token tree to `{ 'color-accent-default': { value, type, path } }`.
 * Keys are the dotted path joined by '-', matching the usual CSS-var naming.
 */
export function flattenDtcg(obj, prefix = [], out = {}) {
  for (const [key, val] of Object.entries(obj || {})) {
    if (key.startsWith('$')) continue;
    const next = [...prefix, key];
    if (isLeaf(val)) {
      out[next.join('-')] = { value: val.$value, type: val.$type, path: next };
    } else if (val && typeof val === 'object') {
      flattenDtcg(val, next, out);
    }
  }
  return out;
}

export function loadDtcgTokens(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const flat = flattenDtcg(json);
  const colors = {};
  const dimensions = {};
  for (const [name, info] of Object.entries(flat)) {
    if (info.type === 'color') colors[name] = info.value;
    else if (info.type === 'dimension') dimensions[name] = info.value;
  }
  return { json, flat, colors, dimensions };
}

/**
 * Patch a single CSS custom property's value in a generated stylesheet, so the
 * canvas recolors immediately (Vite HMR) without re-running the token build.
 * The var name is `${prefix}${tokenName}` (e.g. `--ds-color-accent-default`).
 */
function patchCssVar(cssFile, varName, value) {
  let css;
  try {
    css = fs.readFileSync(cssFile, 'utf8');
  } catch {
    return false;
  }
  const re = new RegExp(`(${varName.replace(/[-\\]/g, '\\$&')}\\s*:\\s*)([^;]*)(;)`);
  if (!re.test(css)) return false;
  fs.writeFileSync(cssFile, css.replace(re, `$1${value}$3`), 'utf8');
  return true;
}

/**
 * Update a token's `$value` in the DTCG source file. If `cssFile`/`cssPrefix`
 * are given, also patch the matching CSS variable for an instant live recolor.
 *
 * @returns {{ ok:boolean, name?:string, value?:string, cssPatched?:boolean, error?:string }}
 */
export function setDtcgToken(file, name, value, { cssFile, cssPrefix = '--' } = {}) {
  if (!name) return { ok: false, error: 'token name required' };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, error: `cannot read ${file}: ${err.message}` };
  }
  const info = flattenDtcg(json)[name];
  if (!info) return { ok: false, error: `token "${name}" not found in ${path.basename(file)}` };

  // Walk to the leaf and set its value (preserving $type and siblings).
  let node = json;
  for (const k of info.path) node = node[k];
  node.$value = value;
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  let cssPatched = false;
  if (cssFile) cssPatched = patchCssVar(cssFile, `${cssPrefix}${name}`, value);

  logger.info(`set-token (dtcg) ${name}: ${value}${cssPatched ? ' (+css)' : ''}`);
  return { ok: true, name, value, cssPatched };
}
