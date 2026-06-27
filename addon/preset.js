/**
 * Storybook preset — entry point Storybook loads via
 * `storybook-addon-auto-detect/preset`.
 *
 * Responsibilities:
 *  - Resolve + validate options, detect framework.
 *  - Discover components and their usage sites (instances).
 *  - Track each component in the governance manifest (surfaced/in-review/approved).
 *  - Emit stories: write real files (filesystem) or inject virtual ones (memory).
 *  - Register the manager-side Instances/Governance panel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateOptions } from './src/config.js';
import { getAdapter } from './src/adapters/registry.js';
import { scanComponents, clearScanCache } from './src/scanner.js';
import { scanInstances } from './src/instances.js';
import { writeStoryFiles } from './src/filesystem.js';
import { createIndexer, createVitePlugin } from './src/virtual.js';
import { createManualStoryIndexer } from './src/manual-indexer.js';
import { auditConformance, summarizeByComponent } from './src/conformance.js';
import { loadTokens, writeThemeCss, writeTokensStory } from './src/tokens.js';
import { injectTailwind, writeTailwindPreview } from './src/tailwind.js';
import {
  approveComponent,
  flagFixOutside,
  openInEditor,
  setManagedProp,
  setManaged,
  addVariant,
  setToken,
  setColor,
  setSpacing,
  tokenizeSpacing,
} from './src/actions.js';
import {
  loadManifest,
  saveManifest,
  ensureEntry,
  getStatus,
  componentKey,
  reconcileDrift,
  effectiveGroup,
} from './src/governance.js';
import { logger } from './src/logger.js';

const stripQuotes = (v) =>
  typeof v === 'string' ? v.trim().replace(/^['"`](.*)['"`]$/, '$1') : v;

// Memoize per configDir so the several preset hooks share one resolved config,
// one parsed component set, and one manifest read.
const prepared = new Map();

function prepare(storybookOptions) {
  const configDir = storybookOptions.configDir || process.cwd();
  if (prepared.has(configDir)) return prepared.get(configDir);

  const projectRoot = path.dirname(configDir);
  const raw = pickAddonOptions(storybookOptions);
  const { options, warnings } = validateOptions(raw, { projectRoot });
  options.configDir = configDir;
  warnings.forEach((w) => logger.warn(w));

  // Merge the .storybook/conformance.json sidecar (managed / aliases / deny /
  // rework), so the preset and the CLIs share one source of conformance config.
  try {
    const sidecar = JSON.parse(fs.readFileSync(path.join(configDir, 'conformance.json'), 'utf8'));
    options.conformance = { ...options.conformance, ...sidecar };
  } catch {
    /* no sidecar — fine */
  }

  const adapter = getAdapter(options.resolvedFramework);
  if (options.enabled && !adapter) {
    logger.warn(
      `No adapter for framework "${options.resolvedFramework}". Auto-detection disabled. ` +
        `Supported today: react.`,
    );
  }

  // One-line safe-usage reminder at startup — this addon writes to source on use.
  if (options.enabled && adapter) {
    logger.info(
      'edits your source on use — work on a fresh branch from a clean tree and review ' +
        '`git diff` before committing (see the README → "Safe usage").',
    );
  }

  const components = adapter ? scanComponents(adapter, options) : [];
  const instancesByComponent = adapter
    ? scanInstances(components.map((c) => c.name), options)
    : {};

  // Track every discovered component in the manifest (new -> surfaced) so the
  // governance CLI and panel always have something to act on.
  const manifest = loadManifest(configDir);
  if (options.governanceEnabled) {
    for (const c of components) {
      const entry = ensureEntry(manifest, componentKey(c, projectRoot));
      // Re-review on change: an approved component edited since sign-off drifts.
      reconcileDrift(entry, c.sourceHash);
    }
    saveManifest(configDir, manifest);
  }

  // Audit on startup: diff the repo against the approved canonicals (the spec).
  const canonicalNames = options.governanceEnabled
    ? components
        .filter((c) => getStatus(manifest, componentKey(c, projectRoot)) === 'approved')
        .map((c) => c.name)
    : [];
  const audit = canonicalNames.length
    ? auditConformance({
        canonicalNames,
        components,
        instances: instancesByComponent,
        conformance: options.conformance,
      })
    : { mappings: {}, findings: [], reworkFindings: [], summary: { instances: 0, files: 0 } };
  const conformanceByComponent = summarizeByComponent(audit);

  // Design tokens: keep the generated @theme stylesheet + the editor story current.
  writeThemeCss(options);
  writeTokensStory(options);
  const loadedTokens = loadTokens(configDir);
  const tokens = loadedTokens.colors;
  const spacingTokens = loadedTokens.spacing || {};
  if (audit.summary.instances || audit.reworkFindings.length) {
    logger.info(
      `audit: ${audit.summary.instances} non-conforming instance(s)` +
        (audit.reworkFindings.length ? `, ${audit.reworkFindings.length} flagged for rework` : ''),
    );
  }

  const managedConfig = (options.conformance && options.conformance.managed) || {};
  const managedFor = (component) => {
    const names = managedConfig[component.name] || [];
    return component.props
      .filter((p) => names.includes(p.name))
      .map((p) => ({
        name: p.name,
        tsType: p.tsType,
        value: stripQuotes(p.defaultValue),
        options: p.tsType === 'boolean' ? ['true', 'false'] : p.enumValues || [],
      }));
  };
  const allPropsFor = (component) => {
    const names = managedConfig[component.name] || [];
    return component.props.map((p) => ({
      name: p.name,
      tsType: p.tsType,
      options: p.enumValues || [],
      value: stripQuotes(p.defaultValue),
      managed: names.includes(p.name),
    }));
  };

  const getComponents = () => (adapter ? scanComponents(adapter, options) : []);
  const getContext = (component) => {
    const entry = manifest.components[componentKey(component, projectRoot)] || { status: 'surfaced' };
    return {
      status: options.governanceEnabled ? entry.status || 'surfaced' : 'surfaced',
      group: options.governanceEnabled ? effectiveGroup(entry) : null,
      drifted: Boolean(entry.drifted),
      fixOutside: Boolean(entry.fixOutside),
      instances: instancesByComponent[component.name] || [],
      conformance: conformanceByComponent[component.name] || { role: 'clean' },
      managed: managedFor(component),
      allProps: allPropsFor(component),
      variantConfig: component.variantConfig || null,
      colors: component.colors || [],
      spacing: component.spacing || [],
      tokens,
      spacingTokens,
    };
  };

  const result = {
    configDir,
    options,
    adapter,
    getComponents,
    getContext,
    instancesByComponent,
    conformanceByComponent,
    audit,
  };
  prepared.set(configDir, result);
  return result;
}

/** Extract just this addon's known options out of Storybook's merged options. */
function pickAddonOptions(storybookOptions) {
  const ns = storybookOptions.autoDetect || {};
  const KNOWN = [
    'enabled',
    'framework',
    'scanDirs',
    'instanceScanDirs',
    'excludeDirs',
    'propDefaults',
    'variantStrategy',
    'outputMode',
    'governanceEnabled',
    'titlePrefix',
    'optOutComment',
    'optInComment',
    'maxStoriesPerComponent',
    'debug',
  ];
  const raw = {};
  for (const key of KNOWN) {
    if (ns[key] !== undefined) raw[key] = ns[key];
    else if (storybookOptions[key] !== undefined) raw[key] = storybookOptions[key];
  }
  return raw;
}

export async function viteFinal(config, storybookOptions) {
  const { options, adapter, getComponents, getContext, instancesByComponent } =
    prepare(storybookOptions);
  if (!options.enabled || !adapter) return config;

  if (options.outputMode === 'filesystem') {
    writeStoryFiles(adapter, getComponents(), options, getContext);
  } else {
    config.plugins = config.plugins || [];
    config.plugins.push(createVitePlugin(getComponents, adapter, options, getContext));
  }
  // Optional: auto-wire Tailwind v4 (guarded — skips if the host already did).
  await injectTailwind(config, options);
  return config;
}

/**
 * When `tailwind: true`, add a preview entry that imports tailwindcss + the
 * generated token theme, so styles actually load in the canvas without the host
 * authoring any CSS. No-op otherwise (the host owns its own preview styles).
 */
export async function previewAnnotations(entries, storybookOptions) {
  const base = entries || [];
  const { options } = prepare(storybookOptions);
  if (!options.enabled || !options.tailwind) return base;
  const entry = writeTailwindPreview(options);
  return entry ? [...base, entry] : base;
}

export async function experimental_indexers(existingIndexers, storybookOptions) {
  const { options, adapter, getComponents, getContext } = prepare(storybookOptions);
  const base = existingIndexers || [];
  if (!options.enabled || !adapter) return base;

  const extra = [];
  // Re-group hand-written stories under their status (both output modes).
  if (options.governanceEnabled) {
    extra.push(createManualStoryIndexer(getComponents, options, getContext));
  }
  // Inject virtual auto-stories (memory mode only).
  if (options.outputMode === 'memory') {
    extra.push(createIndexer(getComponents, options, getContext));
  }
  return [...extra, ...base];
}

export async function stories(entries, storybookOptions) {
  const { options, adapter, configDir } = prepare(storybookOptions);
  const base = entries || [];
  if (!options.enabled || !adapter || options.outputMode !== 'memory') return base;

  const autoGlobs = options.absoluteScanDirs.map((absDir) => {
    let directory = path.relative(configDir, absDir).split(path.sep).join('/');
    if (!directory.startsWith('.')) directory = `./${directory}`;
    // Exclude *.stories.* / *.story.* so we never double-index manual stories.
    return { directory, files: '**/!(*.stories|*.story).@(jsx|tsx)', titlePrefix: '' };
  });
  return [...base, ...autoGlobs];
}

/**
 * Manager→Node bridge. The panel emits events; we run the real work in Node
 * (governance writes, the applier codemod) and emit the result back so the
 * panel can confirm. Channel events are namespaced under `auto-detect/`.
 */
export async function experimental_serverChannel(channel, storybookOptions) {
  const { options, adapter } = prepare(storybookOptions);
  if (!options.enabled || !adapter) return channel;

  const configDir = storybookOptions.configDir || process.cwd();

  // Re-run discovery + audit + regeneration with the latest manifest, so changes
  // made via the panel (approve, fix-outside, etc.) take effect without a manual
  // Storybook restart. Regenerated story files trigger Storybook to re-index.
  channel.on('auto-detect/rerun', () => {
    try {
      prepared.delete(configDir);
      clearScanCache();
      const fresh = prepare(storybookOptions);
      let regenerated = 0;
      if (fresh.options.outputMode === 'filesystem') {
        regenerated = writeStoryFiles(
          fresh.adapter,
          fresh.getComponents(),
          fresh.options,
          fresh.getContext,
        ).length;
      }
      channel.emit('auto-detect/result', { action: 'rerun', ok: true, regenerated });
    } catch (err) {
      channel.emit('auto-detect/result', { action: 'rerun', ok: false, error: err.message });
    }
  });

  channel.on('auto-detect/approve', ({ component } = {}) => {
    let result;
    try {
      result = approveComponent(component, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'approve', component, ...result });
  });

  channel.on('auto-detect/fix-outside', ({ component, value = true } = {}) => {
    let result;
    try {
      result = flagFixOutside(component, options, { value });
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'fix-outside', component, ...result });
  });

  channel.on('auto-detect/set-prop', ({ component, prop, value } = {}) => {
    let result;
    try {
      result = setManagedProp(component, prop, value, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'set-prop', component, ...result });
  });

  channel.on('auto-detect/open', ({ file, line } = {}) => {
    const result = openInEditor(file, line);
    channel.emit('auto-detect/result', { action: 'open', ...result });
  });

  channel.on('auto-detect/set-color', ({ component, from, to } = {}) => {
    let result;
    try {
      result = setColor(component, from, to, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'set-color', component, ...result });
  });

  channel.on('auto-detect/set-spacing', ({ component, property, from, to } = {}) => {
    let result;
    try {
      result = setSpacing(component, { property, from, to }, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'set-spacing', component, ...result });
  });

  channel.on('auto-detect/tokenize-spacing', ({ component, property, value, token } = {}) => {
    let result;
    try {
      result = tokenizeSpacing(component, { property, value, token }, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'tokenize-spacing', component, ...result });
  });

  channel.on('auto-detect/get-tokens', () => {
    channel.emit('auto-detect/tokens', loadTokens(configDir).colors);
  });

  channel.on('auto-detect/set-token', ({ name, value, remove } = {}) => {
    let result;
    try {
      result = setToken(name, value, options, { remove });
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'set-token', ...result });
  });

  channel.on('auto-detect/set-managed', ({ component, prop, value } = {}) => {
    let result;
    try {
      result = setManaged(component, prop, value, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    channel.emit('auto-detect/result', { action: 'set-managed', component, ...result });
  });

  channel.on('auto-detect/add-variant', ({ component, variant, value, classes, newAxis } = {}) => {
    let result;
    try {
      result = addVariant(component, { variant, value, classes, newAxis }, options);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    // Don't echo the full rewritten source back over the channel.
    const { source, ...rest } = result;
    channel.emit('auto-detect/result', { action: 'add-variant', component, ...rest });
  });

  return channel;
}
