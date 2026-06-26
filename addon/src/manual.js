/**
 * Detect whether a component already has a hand-written story sitting next to
 * it. When one exists we leave that component alone in both output modes, so
 * auto-generation fills gaps rather than competing with authored stories.
 */

import fs from 'node:fs';
import path from 'node:path';

const STORY_EXTS = ['jsx', 'tsx', 'js', 'ts', 'mdx'];

export function hasManualStory(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  for (const ext of STORY_EXTS) {
    if (fs.existsSync(path.join(dir, `${base}.stories.${ext}`))) return true;
    if (fs.existsSync(path.join(dir, `${base}.story.${ext}`))) return true;
  }
  return false;
}
