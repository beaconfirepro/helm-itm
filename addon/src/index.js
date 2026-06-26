/**
 * Public/programmatic API for storybook-addon-auto-detect.
 *
 * The addon is normally consumed through its Storybook preset
 * (`storybook-addon-auto-detect/preset`), but these exports let you run the
 * pipeline directly — useful for tests, scripts, or custom tooling.
 */

export { DEFAULT_OPTIONS, validateOptions, detectFramework } from './config.js';
export { scanComponents, clearScanCache } from './scanner.js';
export { buildStoryPlan, generateComponentStory } from './generator.js';
export { getAdapter, registerAdapter, listAdapters } from './adapters/registry.js';
export { reactAdapter } from './adapters/react.js';
export { toStoryExport } from './naming.js';
