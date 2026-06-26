import crypto from 'node:crypto';

/** Short stable content hash, used to detect hand-edits to generated files. */
export function contentHash(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 12);
}
