/**
 * Component discovery. Walks the configured scan directories, applies excludes
 * and per-file opt-in/opt-out comments, and asks the active adapter to parse
 * each candidate into ComponentInfo records.
 *
 * Results are memoized per (adapter + config) so the preset can call into the
 * scanner from several hooks (viteFinal, indexers, stories) without re-parsing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { hasManualStory } from './manual.js';
import { contentHash } from './hash.js';
import { readVariantConfig } from './variant-config.js';
import { extractColors } from './colors.js';
import { extractSpacing } from './spacing.js';

const cache = new Map();

function cacheKey(options) {
  return JSON.stringify({
    fw: options.resolvedFramework,
    dirs: options.absoluteScanDirs,
    excl: options.excludeDirs,
    mode: options.outputMode,
  });
}

export function clearScanCache() {
  cache.clear();
}

/**
 * @returns {import('./adapters/registry.js').ComponentInfo[]}
 */
export function scanComponents(adapter, options) {
  const key = cacheKey(options);
  if (cache.has(key)) return cache.get(key);

  const start = Date.now();
  const files = [];
  for (const dir of options.absoluteScanDirs) {
    if (!fs.existsSync(dir)) {
      logger.warn(`scanDir does not exist: ${dir}`);
      continue;
    }
    walk(dir, options, adapter, files);
  }

  const components = [];
  const seen = new Set();
  for (const filePath of files) {
    let source;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      logger.warn(`Could not read ${filePath}: ${err.message}`);
      continue;
    }

    if (!shouldProcess(filePath, source, options)) continue;

    let parsed;
    try {
      parsed = adapter.parse(filePath, source, options) || [];
    } catch (err) {
      logger.warn(`Adapter failed on ${filePath}: ${err.message}`);
      continue;
    }

    const manual = hasManualStory(filePath);
    // Hash of the component source — drives drift-based re-review when the
    // component changes after it was approved.
    const sourceHash = contentHash(source);
    // Anti-component variant config (shadcn cva / Untitled UI tv), if present.
    const variantCfg = readVariantConfig(source);
    // Raw hardcoded hex colors (the non-token-driven ones).
    const colors = extractColors(source);
    // Hardcoded spacing/layout values (property-scoped style-object literals).
    const spacing = extractSpacing(source);
    for (const component of parsed) {
      const id = `${component.filePath}::${component.exportName}`;
      if (seen.has(id)) continue;
      seen.add(id);
      component.manualStory = manual;
      component.sourceHash = sourceHash;
      component.variantConfig = variantCfg.found
        ? { library: variantCfg.library, variants: variantCfg.variants }
        : null;
      component.colors = colors;
      component.spacing = spacing;
      components.push(component);
      logger.debug(
        `discovered <${component.name}> (${component.props.length} props) in ${path.relative(options.projectRoot, filePath)}`,
      );
    }
  }

  logger.info(
    `discovered ${components.length} component(s) across ${files.length} file(s) in ${Date.now() - start}ms`,
  );
  cache.set(key, components);
  return components;
}

function walk(dir, options, adapter, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn(`Could not read directory ${dir}: ${err.message}`);
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (options.excludeDirs.includes(entry.name)) {
        logger.debug(`excluding directory ${entry.name}`);
        continue;
      }
      walk(full, options, adapter, out);
    } else if (entry.isFile() && adapter.isComponentFile(full)) {
      out.push(full);
    }
  }
}

/**
 * Honor opt-out / opt-in magic comments.
 * - A file with the opt-out comment is always skipped.
 * - When the addon is globally enabled, files are processed by default.
 *   (The opt-in comment is reserved for a future "explicit opt-in only" mode.)
 */
function shouldProcess(filePath, source, options) {
  if (options.optOutComment && source.includes(options.optOutComment)) {
    logger.debug(`opt-out comment found, skipping ${path.basename(filePath)}`);
    return false;
  }
  return true;
}
