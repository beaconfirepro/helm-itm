/**
 * Glue that runs a full conformance audit for a project: scan components, scan
 * instances, read the approved set from the manifest, and diff. Shared by the
 * `audit` and `apply` CLIs (and usable from the preset/panel).
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateOptions } from './config.js';
import { getAdapter } from './adapters/registry.js';
import { scanComponents } from './scanner.js';
import { scanInstances } from './instances.js';
import { loadManifest } from './governance.js';
import { auditConformance, canonicalImports } from './conformance.js';

/** Parse `--config <dir>` and build validated options for a CLI run. */
export function resolveCliOptions(argv) {
  let configDir = path.resolve(process.cwd(), '.storybook');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') {
      configDir = path.resolve(argv[i + 1] || '.storybook');
      i += 1;
    }
  }
  const projectRoot = path.dirname(configDir);
  const { options } = validateOptions({ framework: 'auto' }, { projectRoot });
  options.configDir = configDir;
  // CLIs can't read .storybook/main.js options, so allow a sidecar override file
  // for aliases / deny / rework.
  try {
    const override = JSON.parse(fs.readFileSync(path.join(configDir, 'conformance.json'), 'utf8'));
    options.conformance = { ...options.conformance, ...override };
  } catch {
    /* no override file — fine */
  }
  return { options, configDir, projectRoot };
}

export function runProjectAudit(options) {
  const adapter = getAdapter(options.resolvedFramework) || getAdapter('react');
  const components = adapter ? scanComponents(adapter, options) : [];
  const instances = scanInstances(components.map((c) => c.name), options);
  const manifest = loadManifest(options.configDir);

  // The spec = approved canonicals (by component name).
  const approved = Object.entries(manifest.components)
    .filter(([, e]) => e.status === 'approved')
    .map(([key]) => key.split('::').pop());
  const canonicalNames = [...new Set(approved)].filter((n) =>
    components.some((c) => c.name === n),
  );

  const audit = auditConformance({
    canonicalNames,
    components,
    instances,
    conformance: options.conformance,
  });

  return {
    components,
    instances,
    manifest,
    canonicalNames,
    audit,
    imports: canonicalImports(canonicalNames, components),
  };
}

/** Resolve a variant component name to its source file (for orphan reporting). */
export function variantFile(name, components, projectRoot) {
  const comp = components.find((c) => c.name === name);
  return comp ? path.relative(projectRoot, comp.filePath).split(path.sep).join('/') : null;
}
