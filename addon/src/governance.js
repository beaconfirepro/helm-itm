/**
 * Governance: a surfaced -> in-review -> approved lifecycle for auto-generated
 * stories, persisted to a committed JSON manifest next to the Storybook config.
 *
 * The manifest is the source of truth for each story's status. Newly discovered
 * components start as "surfaced". Status drives the sidebar group a story lands
 * in, and (optionally) which stories get pruned.
 */

import fs from 'node:fs';
import path from 'node:path';

export const STATUSES = ['surfaced', 'in-review', 'approved'];

export const STATUS_GROUP = {
  surfaced: 'Surfaced',
  'in-review': 'In Review',
  approved: 'Approved',
};

// Sidebar group for an approved component that has changed since sign-off.
export const NEEDS_REVIEW_GROUP = 'Needs Re-review';

/**
 * Reconcile drift: if an approved component's current source no longer matches
 * the snapshot taken at approval, flag it as drifted (it needs re-review).
 * Returns true if the entry changed.
 */
export function reconcileDrift(entry, currentSourceHash) {
  const wasDrifted = Boolean(entry.drifted);
  const drifted =
    entry.status === 'approved' &&
    Boolean(entry.signedHash) &&
    entry.signedHash !== currentSourceHash;
  entry.drifted = drifted;
  return drifted !== wasDrifted;
}

/** Sidebar group label, accounting for drift (approved-but-changed → re-review). */
export function effectiveGroup(entry) {
  if (entry.status === 'approved' && entry.drifted) return NEEDS_REVIEW_GROUP;
  return STATUS_GROUP[entry.status] || STATUS_GROUP.surfaced;
}

const MANIFEST_NAME = 'auto-detect.manifest.json';

export function manifestPath(configDir) {
  return path.join(configDir, MANIFEST_NAME);
}

/** Stable identity for a component across runs: relative file + export name. */
export function componentKey(component, projectRoot) {
  const rel = path.relative(projectRoot, component.filePath).split(path.sep).join('/');
  return `${rel}::${component.name}`;
}

export function loadManifest(configDir) {
  const p = manifestPath(configDir);
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.components) data.components = {};
    return data;
  } catch {
    return { version: 1, components: {} };
  }
}

export function saveManifest(configDir, manifest) {
  const p = manifestPath(configDir);
  fs.writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** Read status, defaulting to "surfaced" for components not seen before. */
export function getStatus(manifest, key) {
  return manifest.components[key]?.status ?? 'surfaced';
}

/**
 * Ensure an entry exists for a key, returning it. New entries are surfaced.
 */
export function ensureEntry(manifest, key) {
  if (!manifest.components[key]) {
    manifest.components[key] = { status: 'surfaced', generatedHash: null, edited: false };
  }
  return manifest.components[key];
}

export function setStatus(manifest, key, status, { sourceHash } = {}) {
  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Use one of: ${STATUSES.join(', ')}`);
  }
  const entry = ensureEntry(manifest, key);
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  // Approving snapshots the current source so future edits re-trigger review.
  if (status === 'approved' && sourceHash) {
    entry.signedHash = sourceHash;
    entry.drifted = false;
  }
  return entry;
}
