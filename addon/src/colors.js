/**
 * Extract the raw hex colors a component hardcodes (e.g. inline styles or a
 * color map). These are the colors that *aren't* token-driven — exactly what
 * the per-component Colors editor lets you change, and what a future "tokenize
 * this" audit would flag.
 */

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

/** @returns {string[]} unique lowercase hex colors, in source order. */
export function extractColors(source) {
  const seen = new Set();
  for (const m of source.matchAll(HEX)) seen.add(m[0].toLowerCase());
  return [...seen];
}
