/**
 * Server-side actions invoked from the panel over the manager→Node bridge.
 *
 * These are the operations that change code or governance state, so they run in
 * Node (where the filesystem lives), never in the browser. Each is a plain,
 * testable function; the preset's server channel just routes events to them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getAdapter } from './adapters/registry.js';
import { scanComponents, clearScanCache } from './scanner.js';
import { scanInstances } from './instances.js';
import { auditConformance, canonicalImports } from './conformance.js';
import { applyAlignments } from './apply.js';
import {
  loadManifest,
  saveManifest,
  setStatus,
  getStatus,
  ensureEntry,
  componentKey,
} from './governance.js';
import { addVariantValue, addVariantAxis } from './variant-config.js';
import { rewriteSpacing, spacingLiteralText, SPACING_PROPS } from './spacing.js';
import { loadTokens, saveTokens, writeThemeCss } from './tokens.js';
import { logger } from './logger.js';

function components(options) {
  clearScanCache();
  const adapter = getAdapter(options.resolvedFramework) || getAdapter('react');
  return { adapter, list: adapter ? scanComponents(adapter, options) : [] };
}

/**
 * Approve a component as canonical AND proliferate the alignment: every
 * non-conforming instance of its variants is repointed to it.
 *
 * @returns {{ ok:boolean, approved?:string, aligned?:number, files?:number, orphans?:string[], error?:string }}
 */
export function approveComponent(name, options, { dryRun = false } = {}) {
  const { list } = components(options);
  const comp = list.find((c) => c.name === name);
  if (!comp) return { ok: false, error: `Component "${name}" not found` };

  const manifest = loadManifest(options.configDir);
  setStatus(manifest, componentKey(comp, options.projectRoot), 'approved', {
    sourceHash: comp.sourceHash,
  });
  if (!dryRun) saveManifest(options.configDir, manifest);

  // Audit with the freshly-approved set, then align this canonical's variants.
  const canonicalNames = list
    .filter((c) => getStatus(manifest, componentKey(c, options.projectRoot)) === 'approved')
    .map((c) => c.name);
  const instances = scanInstances(list.map((c) => c.name), options);
  const audit = auditConformance({
    canonicalNames,
    components: list,
    instances,
    conformance: options.conformance,
  });
  const findings = audit.findings.filter((f) => f.to === name);
  const { edits, orphans } = applyAlignments(findings, {
    canonicalImports: canonicalImports(canonicalNames, list),
    projectRoot: options.projectRoot,
    dryRun,
  });

  logger.info(
    `approve <${name}>: ${dryRun ? 'would align' : 'aligned'} ${findings.length} instance(s) across ${edits.length} file(s)`,
  );
  return { ok: true, approved: name, aligned: findings.length, files: edits.length, orphans };
}

/**
 * Flag a component as "fix outside Storybook" — an edge case that needs real
 * code work (agents), not a mechanical align. Records a manifest flag the panel
 * surfaces as a badge.
 */
export function flagFixOutside(name, options, { value = true } = {}) {
  const { list } = components(options);
  const comp = list.find((c) => c.name === name);
  if (!comp) return { ok: false, error: `Component "${name}" not found` };

  const manifest = loadManifest(options.configDir);
  const entry = ensureEntry(manifest, componentKey(comp, options.projectRoot));
  entry.fixOutside = value;
  saveManifest(options.configDir, manifest);

  logger.info(`fix-outside <${name}>: ${value ? 'flagged' : 'cleared'}`);
  return { ok: true, component: name, fixOutside: value };
}

/**
 * Designate (or un-designate) a property as MANAGED — writes `.storybook/
 * conformance.json`. Takes effect on the next rerun (the preset re-reads it).
 */
export function setManaged(componentName, propName, value, options) {
  const file = path.join(options.configDir, 'conformance.json');
  let json = {};
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* new file */
  }
  json.managed = json.managed || {};
  const set = new Set(json.managed[componentName] || []);
  if (value) set.add(propName);
  else set.delete(propName);
  json.managed[componentName] = [...set];
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  logger.info(`set-managed <${componentName}>.${propName}: ${value ? 'managed' : 'unmanaged'}`);
  return { ok: true, component: componentName, prop: propName, managed: value };
}

/**
 * Change a hardcoded hex color in a component's source (every occurrence of the
 * old hex in that file). For components that don't use tokens — the Button case.
 */
export function setColor(componentName, from, to, options, { dryRun = false } = {}) {
  if (!from || !to) return { ok: false, error: 'from and to colors required' };
  const { list } = components(options);
  const comp = list.find((c) => c.name === componentName);
  if (!comp) return { ok: false, error: `Component "${componentName}" not found` };

  const src = fs.readFileSync(comp.filePath, 'utf8');
  const next = src.replace(new RegExp(escapeRe(from), 'gi'), to);
  const changed = next !== src;
  if (changed && !dryRun) fs.writeFileSync(comp.filePath, next, 'utf8');

  logger.info(`set-color <${componentName}>: ${from} → ${to} (${dryRun ? 'preview' : changed ? 'written' : 'no match'})`);
  return { ok: true, component: componentName, from, to, changed };
}

/**
 * Change a hardcoded spacing/layout value in a component's source — scoped to
 * one style property (every `padding: 16` becomes `padding: 20`, but a bare
 * `16` or an unrelated property is left alone). Babel-driven, not a number
 * replace. The inline-style analog of {@link setColor}.
 */
export function setSpacing(componentName, { property, from, to } = {}, options, { dryRun = false } = {}) {
  if (!property || from == null || to == null) {
    return { ok: false, error: 'property, from and to are required' };
  }
  if (!SPACING_PROPS.has(property)) {
    return { ok: false, error: `"${property}" is not a spacing property` };
  }
  const { list } = components(options);
  const comp = list.find((c) => c.name === componentName);
  if (!comp) return { ok: false, error: `Component "${componentName}" not found` };

  const src = fs.readFileSync(comp.filePath, 'utf8');
  const res = rewriteSpacing(src, property, from, spacingLiteralText(to));
  if (!res.ok) return res;
  if (res.changed && !dryRun) fs.writeFileSync(comp.filePath, res.source, 'utf8');

  logger.info(
    `set-spacing <${componentName}>.${property}: ${from} → ${to} ` +
      `(${dryRun ? 'preview' : res.changed ? `written ×${res.count}` : 'no match'})`,
  );
  return { ok: true, component: componentName, property, from, to, changed: res.changed, count: res.count };
}

/**
 * "Tokenize this" — promote a hardcoded spacing value into a governed design
 * token: add it to `tokens.json` under `spacing`, regenerate the `--spacing-*`
 * `@theme` stylesheet, and repoint the component's source at `var(--spacing-…)`.
 * The off-scale literal becomes a single token-driven, auditable value.
 */
export function tokenizeSpacing(componentName, { property, value, token } = {}, options, { dryRun = false } = {}) {
  if (!property || value == null || !token) {
    return { ok: false, error: 'property, value and token are required' };
  }
  if (!SPACING_PROPS.has(property)) {
    return { ok: false, error: `"${property}" is not a spacing property` };
  }
  const { list } = components(options);
  const comp = list.find((c) => c.name === componentName);
  if (!comp) return { ok: false, error: `Component "${componentName}" not found` };

  const src = fs.readFileSync(comp.filePath, 'utf8');
  const res = rewriteSpacing(src, property, value, `'var(--spacing-${token})'`);
  if (!res.ok) return res;
  if (!res.changed) {
    return { ok: false, error: `No ${property}: ${value} found in ${componentName}` };
  }

  if (!dryRun) {
    fs.writeFileSync(comp.filePath, res.source, 'utf8');
    const tokens = loadTokens(options.configDir);
    tokens.spacing = tokens.spacing || {};
    tokens.spacing[token] = value;
    saveTokens(options.configDir, tokens);
    writeThemeCss(options);
  }

  logger.info(
    `tokenize-spacing <${componentName}>.${property}: ${value} → --spacing-${token} ` +
      `(${dryRun ? 'preview' : `written ×${res.count}`})`,
  );
  return { ok: true, component: componentName, property, value, token, count: res.count };
}

/**
 * Set (or remove) a design-token color: updates `tokens.json` and regenerates
 * the Tailwind `@theme` stylesheet, so `bg-<name>` etc. recolor live.
 */
export function setToken(name, value, options, { remove = false } = {}) {
  if (!name) return { ok: false, error: 'token name required' };
  const tokens = loadTokens(options.configDir);
  tokens.colors = tokens.colors || {};
  if (remove) delete tokens.colors[name];
  else tokens.colors[name] = value;
  saveTokens(options.configDir, tokens);
  writeThemeCss(options);
  logger.info(`set-token --color-${name}: ${remove ? 'removed' : value}`);
  return { ok: true, name, value, removed: remove };
}

/** Open a file at a line in the user's editor (configurable via AUTO_DETECT_EDITOR). */
export function openInEditor(file, line = 1) {
  if (!file) return { ok: false, error: 'no file' };
  const editor = process.env.AUTO_DETECT_EDITOR || 'code';
  const target = `${file}:${line}`;
  try {
    // VS Code (and forks) use `-g file:line`; others typically accept `file:line`.
    const args = /code|cursor|windsurf/i.test(editor) ? ['-g', target] : [target];
    spawn(editor, args, { stdio: 'ignore', detached: true, shell: true }).unref();
    logger.info(`open in editor: ${target}`);
    return { ok: true, file, line, editor };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Add a property/value to an anti-component (shadcn cva / Untitled UI tv): a new
 * value on an existing variant axis, or a brand-new axis. The prop and its type
 * come free from the variant config, so this is a surgical edit to one object —
 * the closest thing to "author a new property from the UI" that isn't risky.
 */
export function addVariant(componentName, { variant, value, classes, newAxis = false }, options, { dryRun = false } = {}) {
  if (!variant || !value) return { ok: false, error: 'variant and value are required' };
  const { list } = components(options);
  const comp = list.find((c) => c.name === componentName);
  if (!comp) return { ok: false, error: `Component "${componentName}" not found` };
  if (!comp.variantConfig) {
    return { ok: false, error: `${componentName} has no cva/tv variant config to extend` };
  }

  const src = fs.readFileSync(comp.filePath, 'utf8');
  const res = newAxis
    ? addVariantAxis(src, variant, value, classes || '')
    : addVariantValue(src, variant, value, classes || '');
  if (!res.ok) return res;

  if (!dryRun) fs.writeFileSync(comp.filePath, res.source, 'utf8');
  logger.info(
    `add-variant <${componentName}>: ${newAxis ? 'new axis' : 'value'} ${variant}.${value} ` +
      `(${dryRun ? 'preview' : 'written'})`,
  );
  return { ok: true, component: componentName, variant, value, newAxis, source: res.source };
}

const stripQuotes = (v) =>
  typeof v === 'string' ? v.trim().replace(/^['"`](.*)['"`]$/, '$1') : v;
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrite one prop within a single JSX opening tag to the new value. */
function rewriteInstanceProp(tag, prop, value, isBool, oldValue) {
  if (isBool) {
    const to = value === 'true' || value === true;
    // prop={true} / prop={false}
    const braced = new RegExp(`(\\b${escapeRe(prop)}=\\{)(true|false)(\\})`);
    if (braced.test(tag)) return tag.replace(braced, `$1${to}$3`);
    // bare prop (=== true). Only act when setting to false: prop -> prop={false}.
    const bare = new RegExp(`\\b${escapeRe(prop)}\\b(?!\\s*=)`);
    if (bare.test(tag)) return to ? tag : tag.replace(bare, `${prop}={false}`);
    return tag;
  }
  // string / enum: prop="old" -> prop="new"
  if (oldValue == null) return tag;
  return tag.replace(
    new RegExp(`(\\b${escapeRe(prop)}=)(["'])${escapeRe(oldValue)}\\2`),
    `$1"${value}"`,
  );
}

/**
 * Set a MANAGED property's blessed value: update the component's library-level
 * default AND propagate to existing instances that carried the old value. Future
 * deviations get caught by the audit on the next Storybook run.
 */
export function setManagedProp(componentName, propName, value, options, { dryRun = false } = {}) {
  const managed = (options.conformance && options.conformance.managed) || {};
  const allowed = managed[componentName] || [];
  if (!allowed.includes(propName)) {
    return { ok: false, error: `"${propName}" is not a managed property of ${componentName}` };
  }

  const { list } = components(options);
  const comp = list.find((c) => c.name === componentName);
  if (!comp) return { ok: false, error: `Component "${componentName}" not found` };
  const prop = comp.props.find((p) => p.name === propName);
  const isBool = prop ? prop.tsType === 'boolean' : /^(true|false)$/.test(String(value));
  const oldValue = prop ? stripQuotes(prop.defaultValue) : null;

  // 1) Library: rewrite the prop's default — quoted for strings/enums, bare for
  //    booleans (`elevated = false`).
  let libSrc = fs.readFileSync(comp.filePath, 'utf8');
  const libBefore = libSrc;
  const libRe = isBool
    ? new RegExp(`(\\b${escapeRe(propName)}\\s*=\\s*)(true|false)`)
    : new RegExp(`(\\b${escapeRe(propName)}\\s*=\\s*)(['"\`])([^'"\`]*)\\2`);
  if (libRe.test(libSrc)) {
    libSrc = libSrc.replace(libRe, isBool ? `$1${value}` : `$1'${value}'`);
  }
  if (libSrc !== libBefore && !dryRun) fs.writeFileSync(comp.filePath, libSrc, 'utf8');

  // 2) Instances: move call sites to the new value — scoped to THIS component's
  //    own `<Name ...>` tags so we never clobber a sibling's same-named prop.
  const edits = [];
  const tagRe = new RegExp(`<${escapeRe(componentName)}\\b[^>]*?\\/?>`, 'g');
  const usages = scanInstances([componentName], options)[componentName] || [];
  for (const file of new Set(usages.map((u) => u.file))) {
    const src = fs.readFileSync(file, 'utf8');
    const next = src.replace(tagRe, (tag) => rewriteInstanceProp(tag, propName, value, isBool, oldValue));
    if (next !== src) {
      if (!dryRun) fs.writeFileSync(file, next, 'utf8');
      edits.push(path.relative(options.projectRoot, file).split(path.sep).join('/'));
    }
  }

  logger.info(
    `set-prop <${componentName}>.${propName}: ${oldValue} → ${value} ` +
      `(${dryRun ? 'would update' : 'updated'} library + ${edits.length} file(s))`,
  );
  return {
    ok: true,
    component: componentName,
    prop: propName,
    from: oldValue,
    to: value,
    libraryUpdated: libSrc !== libBefore,
    files: edits,
  };
}
