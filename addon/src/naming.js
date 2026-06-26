/**
 * Naming helpers shared between story rendering and indexing. The indexer must
 * predict the exact export names the adapter emits, so this logic lives in one
 * place.
 */

/**
 * A stable, status-independent meta id for a component's generated story.
 * The sidebar still groups by the (status-prefixed) title, but the story URL id
 * derives from this id — so promoting Surfaced→Approved never changes the URL.
 * e.g. "LegacyButton" -> "auto-legacy-button".
 */
export function stableMetaId(componentName) {
  const kebab = String(componentName)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
  return `auto-${kebab}`;
}

/** Convert a human story name ("Size Sm") into a valid CSF export ("SizeSm"). */
export function toStoryExport(name) {
  const cleaned = String(name).replace(/[^A-Za-z0-9]+/g, ' ').trim();
  const pascal = cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  if (!pascal) return 'Story';
  return /^[0-9]/.test(pascal) ? `Story${pascal}` : pascal;
}
