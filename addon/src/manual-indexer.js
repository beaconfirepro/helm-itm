/**
 * Re-group hand-written stories under their governance status — WITHOUT editing
 * the team's files.
 *
 * A manually-authored `Spinner.stories.tsx` titled "Components/Spinner" should
 * still flow through Surfaced → Approved like everything else. We can't rewrite
 * the file (that would be authoring), but we CAN override how Storybook indexes
 * it: parse it with Storybook's own CSF loader, then rewrite only the `title` to
 * the component's status group. Everything else (exports, tags, docs) is exactly
 * what Storybook would have produced.
 *
 * Guarded throughout: if anything about the retitle fails, the story is indexed
 * unchanged — a manual story can never disappear because of this.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadCsf } from 'storybook/internal/csf-tools';
import { stableMetaId } from './naming.js';
import { logger } from './logger.js';

// Manual stories only — never our own *.auto.stories.* (those bake the title in).
const MANUAL_STORY = /(?<!\.auto)\.stories\.(jsx|tsx|js|ts)$/;

export function createManualStoryIndexer(getComponents, options, getContext) {
  return {
    test: MANUAL_STORY,
    createIndex: async (fileName, { makeTitle } = {}) => {
      const abs = path.isAbsolute(fileName)
        ? fileName
        : path.resolve(options.projectRoot, fileName);
      const csf = loadCsf(fs.readFileSync(abs, 'utf8'), { fileName: abs, makeTitle }).parse();
      const inputs = csf.indexInputs.map((i) => ({ ...i, importPath: i.importPath || fileName }));

      try {
        const base = path.basename(abs).replace(MANUAL_STORY, '');
        const comp = getComponents().find(
          (c) => path.basename(c.filePath, path.extname(c.filePath)) === base,
        );
        if (comp && options.governanceEnabled) {
          const { group } = getContext(comp);
          if (group) {
            logger.debug(`re-grouping manual story <${comp.name}> under "${group}"`);
            const metaId = stableMetaId(comp.name);
            return inputs.map((i) => ({ ...i, title: `${group}/${comp.name}`, metaId }));
          }
        }
      } catch (err) {
        logger.debug(`manual re-group skipped for ${fileName}: ${err.message}`);
      }
      return inputs;
    },
  };
}
