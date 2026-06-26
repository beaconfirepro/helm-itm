/**
 * Instance discovery: find every place a detected component is *used* across the
 * codebase (JSX usage sites), so the panel can list them and a future Design
 * Review can reason about blast radius.
 *
 * This is a static, heuristic scan (no type resolution): for each file that
 * imports a known component name, we locate `<Name ...>` usages, capture the
 * line and the props set at that call site. Good enough to surface call sites;
 * deliberately conservative to avoid false positives (the name must be both
 * imported and used as a PascalCase JSX tag).
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

const SCANNABLE = /\.(jsx|tsx|js|ts)$/;
const MAX_INSTANCES_PER_COMPONENT = 200;

/**
 * @param {string[]} componentNames
 * @param {object} options  Validated addon options (uses projectRoot, excludeDirs, instanceScanDirs).
 * @returns {Record<string, Array<{file:string, relFile:string, line:number, props:string[]}>>}
 */
export function scanInstances(componentNames, options) {
  const names = new Set(componentNames);
  const result = Object.fromEntries(componentNames.map((n) => [n, []]));
  if (!names.size) return result;

  const roots = (options.instanceScanDirs || ['src']).map((d) =>
    path.resolve(options.projectRoot, d),
  );

  const files = [];
  for (const root of roots) {
    if (fs.existsSync(root)) walk(root, options, files);
  }

  for (const file of files) {
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // Only consider names actually imported in this file.
    const imported = importedNames(source, names);
    if (!imported.size) continue;

    for (const name of imported) {
      for (const usage of findUsages(source, name)) {
        const list = result[name];
        if (list.length >= MAX_INSTANCES_PER_COMPONENT) break;
        list.push({
          file,
          relFile: path.relative(options.projectRoot, file).split(path.sep).join('/'),
          line: usage.line,
          props: usage.props,
        });
      }
    }
  }

  const total = Object.values(result).reduce((n, arr) => n + arr.length, 0);
  logger.debug(`instances: found ${total} usage site(s) across ${files.length} file(s)`);
  return result;
}

function walk(dir, options, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (options.excludeDirs.includes(entry.name)) continue;
      walk(path.join(dir, entry.name), options, out);
    } else if (entry.isFile() && SCANNABLE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

/** Which of `names` are imported (default or named) in this source. */
function importedNames(source, names) {
  const found = new Set();
  const importRe = /import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"][^'"]+['"]/g;
  for (const m of source.matchAll(importRe)) {
    const def = m[1];
    if (def && names.has(def)) found.add(def);
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const id = part.trim().split(/\s+as\s+/i).pop().trim();
        if (names.has(id)) found.add(id);
      }
    }
  }
  return found;
}

/** Find `<Name ...>` / `<Name/>` usages and the props set at each. */
function findUsages(source, name) {
  const usages = [];
  // Match an opening JSX tag for the component, capturing its attribute span.
  const tagRe = new RegExp(`<${name}(\\s[^>]*?)?\\s*/?>`, 'gs');
  for (const m of source.matchAll(tagRe)) {
    const line = source.slice(0, m.index).split('\n').length;
    usages.push({ line, props: parseProps(m[1] || '') });
  }
  return usages;
}

/** Pull attribute names out of a JSX attribute span (names only, not values). */
function parseProps(attrSpan) {
  const props = [];
  const attrRe = /([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:\{[^}]*\}|"[^"]*"|'[^']*'))?/g;
  for (const m of attrSpan.matchAll(attrRe)) {
    if (m[1]) props.push(m[1]);
  }
  return props;
}
