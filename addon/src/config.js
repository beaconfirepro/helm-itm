/**
 * Configuration: defaults, validation, normalization, and framework
 * auto-detection. The addon options object (from `.storybook/main.js`) is
 * merged over these defaults and sanity-checked here so the rest of the addon
 * can trust the shape it receives.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger, setDebug } from './logger.js';

export const DEFAULT_OPTIONS = {
  enabled: true,
  framework: 'auto', // 'react' | 'vue' | 'svelte' | 'angular' | 'web-components' | 'auto'
  scanDirs: ['src/components'],
  instanceScanDirs: ['src'], // where to look for component *usages* (the Instances tab)
  excludeDirs: ['node_modules', 'dist', '.next', 'build', 'coverage', 'storybook-static'],
  propDefaults: {}, // override generated defaults per type, e.g. { string: 'Hello' }
  variantStrategy: 'primary', // 'primary' | 'combinations'
  outputMode: 'filesystem', // 'memory' | 'filesystem'
  governanceEnabled: true, // group stories by surfaced/in-review/approved status
  // Conformance: how the audit maps rogue/variant components onto approved
  // canonicals. `aliases` is an explicit map { Canonical: ['Variant', ...] };
  // `deny` excludes names from the name-similarity auto-mapper.
  // `aliases`/`deny` tune the alignable (auto-fixable) mapping. `rework` lists
  // variants that need real code changes, not a repoint — { Variant: 'Intended' }
  // — which go to the agent brief instead of being applied.
  conformance: { aliases: {}, deny: [], rework: {} },
  // Design tokens: the generated Tailwind `@theme` stylesheet is written here
  // (relative to project root). The team @imports it; the addon keeps it current.
  themeOutput: 'src/auto-theme.css',
  titlePrefix: 'Auto', // sidebar group when governance is disabled
  optOutComment: '@storybook-auto-detect: off',
  optInComment: '@storybook-auto-detect: on',
  maxStoriesPerComponent: 12, // safety cap, mostly relevant for 'combinations'
  debug: false,
};

const VALID_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular', 'web-components', 'auto'];
const VALID_STRATEGIES = ['primary', 'combinations'];
const VALID_OUTPUT_MODES = ['memory', 'filesystem'];
const KNOWN_KEYS = new Set(Object.keys(DEFAULT_OPTIONS));

/**
 * Detect the framework from the host project's installed dependencies.
 * Used when `framework: 'auto'`.
 */
export function detectFramework(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  let deps = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  } catch {
    logger.debug('detectFramework: could not read', pkgPath);
  }

  // Order matters: check the more specific signals first.
  if (deps['@angular/core']) return 'angular';
  if (deps.svelte) return 'svelte';
  if (deps.vue) return 'vue';
  if (deps.react) return 'react';
  if (deps.lit || deps['@webcomponents/webcomponentsjs']) return 'web-components';
  return null;
}

/**
 * Validate raw user options, returning a normalized config plus a list of
 * human-readable warnings. Invalid values fall back to defaults rather than
 * throwing — a misconfigured addon should degrade, not break the build.
 */
export function validateOptions(rawOptions = {}, { projectRoot = process.cwd() } = {}) {
  const warnings = [];
  const options = { ...DEFAULT_OPTIONS };

  for (const [key, value] of Object.entries(rawOptions)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown option "${key}" — ignored.`);
      continue;
    }
    options[key] = value;
  }

  if (typeof options.enabled !== 'boolean') {
    warnings.push(`"enabled" must be a boolean; got ${typeof options.enabled}. Using true.`);
    options.enabled = true;
  }

  if (!VALID_FRAMEWORKS.includes(options.framework)) {
    warnings.push(
      `"framework" must be one of ${VALID_FRAMEWORKS.join(', ')}; got "${options.framework}". Using "auto".`,
    );
    options.framework = 'auto';
  }

  if (!VALID_STRATEGIES.includes(options.variantStrategy)) {
    warnings.push(
      `"variantStrategy" must be one of ${VALID_STRATEGIES.join(', ')}; got "${options.variantStrategy}". Using "primary".`,
    );
    options.variantStrategy = 'primary';
  }

  if (!VALID_OUTPUT_MODES.includes(options.outputMode)) {
    warnings.push(
      `"outputMode" must be one of ${VALID_OUTPUT_MODES.join(', ')}; got "${options.outputMode}". Using "filesystem".`,
    );
    options.outputMode = 'filesystem';
  }

  if (typeof options.governanceEnabled !== 'boolean') {
    warnings.push('"governanceEnabled" must be a boolean. Using true.');
    options.governanceEnabled = true;
  }

  if (!Array.isArray(options.instanceScanDirs) || options.instanceScanDirs.length === 0) {
    warnings.push('"instanceScanDirs" must be a non-empty array. Using default.');
    options.instanceScanDirs = [...DEFAULT_OPTIONS.instanceScanDirs];
  }

  if (!Array.isArray(options.scanDirs) || options.scanDirs.length === 0) {
    warnings.push('"scanDirs" must be a non-empty array. Using default.');
    options.scanDirs = [...DEFAULT_OPTIONS.scanDirs];
  }

  if (!Array.isArray(options.excludeDirs)) {
    warnings.push('"excludeDirs" must be an array. Using default.');
    options.excludeDirs = [...DEFAULT_OPTIONS.excludeDirs];
  }

  if (options.framework === 'auto') {
    const detected = detectFramework(projectRoot);
    if (detected) {
      logger.debug(`framework: auto-detected "${detected}"`);
      options.resolvedFramework = detected;
    } else {
      warnings.push('Could not auto-detect a framework from dependencies. Defaulting to "react".');
      options.resolvedFramework = 'react';
    }
  } else {
    options.resolvedFramework = options.framework;
  }

  // Resolve scan/exclude dirs to absolute paths against the project root.
  options.projectRoot = projectRoot;
  options.absoluteScanDirs = options.scanDirs.map((d) => path.resolve(projectRoot, d));

  setDebug(options.debug);

  return { options, warnings };
}
