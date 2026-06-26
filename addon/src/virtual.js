/**
 * In-memory output mode.
 *
 * Two cooperating pieces:
 *  1. A Storybook indexer that, for each discovered component, emits index
 *     entries pointing at a virtual module id (`<file>?storybook-auto=<Name>`).
 *  2. A Vite plugin that serves generated CSF source for those virtual ids.
 *
 * No files touch the user's source tree — stories exist only in the dev server.
 */

import path from 'node:path';
import { buildStoryPlan, generateComponentStory } from './generator.js';
import { toStoryExport, stableMetaId } from './naming.js';
import { logger } from './logger.js';

const QUERY = 'storybook-auto';
const SUFFIX_RE = /[?&]storybook-auto=([^&]+)/;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** Build a stable, importable module specifier for a component. */
function importPathFor(component, options) {
  const rel = toPosix(path.relative(options.projectRoot, component.filePath));
  return `./${rel}?${QUERY}=${encodeURIComponent(component.name)}`;
}

/**
 * Storybook `experimental_indexers` entry. Matches component files (but not
 * manual stories) and expands each into its generated story exports.
 */
export function createIndexer(getComponents, options, getContext = () => ({})) {
  // Match the configured extensions, excluding *.stories.* / *.story.*.
  const test = /(?<!\.stories|\.story)\.(jsx|tsx|js|ts)$/;

  return {
    test,
    createIndex: async (fileName, { makeTitle } = {}) => {
      const abs = path.resolve(options.projectRoot, fileName);
      const components = getComponents().filter(
        (c) => path.resolve(c.filePath) === abs && !c.manualStory,
      );
      if (!components.length) return [];

      const entries = [];
      for (const component of components) {
        const { status = 'surfaced', group } = getContext(component);
        const plan = buildStoryPlan(component, options, { status, group });
        const importPath = importPathFor(component, options);
        const metaId = stableMetaId(component.name);
        for (const story of plan.stories) {
          entries.push({
            type: 'story',
            importPath,
            exportName: toStoryExport(story.name),
            name: story.name,
            title: plan.title,
            metaId,
            tags: ['auto-detected', 'autodocs', `status:${status}`],
          });
        }
        logger.debug(`indexed <${component.name}> -> ${plan.stories.length} stories [${status}]`);
      }
      return entries;
    },
  };
}

/**
 * Vite plugin that materializes the virtual story modules referenced by the
 * indexer.
 */
export function createVitePlugin(getComponents, adapter, options, getContext = () => ({})) {
  return {
    name: 'storybook-addon-auto-detect',
    enforce: 'pre',

    async resolveId(source, importer) {
      const match = source.match(SUFFIX_RE);
      if (!match) return null;
      const base = source.replace(SUFFIX_RE, '').replace(/[?&]$/, '');
      const resolved = await this.resolve(base, importer, { skipSelf: true });
      const target = resolved ? resolved.id : path.resolve(path.dirname(importer || options.projectRoot), base);
      return `${target}?${QUERY}=${match[1]}`;
    },

    load(id) {
      const match = id.match(SUFFIX_RE);
      if (!match) return null;
      const name = decodeURIComponent(match[1]);
      const base = id.replace(SUFFIX_RE, '');
      const component = getComponents().find(
        (c) => path.resolve(c.filePath) === path.resolve(base) && c.name === name,
      );
      if (!component) {
        logger.warn(`virtual module requested for unknown component: ${name} (${base})`);
        return 'export default {};';
      }
      // Import the real component from a sibling specifier (same directory as
      // the virtual module), preserving the original file extension.
      const importSpecifier = `./${path.basename(component.filePath)}`;
      const ctx = getContext(component);
      return generateComponentStory(adapter, component, options, { importSpecifier, ...ctx });
    },
  };
}
