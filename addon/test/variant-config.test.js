/**
 * Anti-component variant-config reader/writer tests (shadcn cva / Untitled UI tv).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVariantConfig, addVariantValue, addVariantAxis } from '../src/variant-config.js';

const CVA = `
import { cva } from 'class-variance-authority';
const tagVariants = cva('base', {
  variants: {
    tone: { neutral: 'bg-gray-100', success: 'bg-green-100' },
    size: { sm: 'text-xs', md: 'text-sm' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});
`;

const TV = `
import { tv } from 'tailwind-variants';
const button = tv({
  base: 'btn',
  variants: { color: { primary: 'bg-blue-500', secondary: 'bg-gray-500' } },
});
`;

test('reads a cva config (variants + values)', () => {
  const cfg = readVariantConfig(CVA);
  assert.equal(cfg.found, true);
  assert.equal(cfg.library, 'cva');
  assert.deepEqual(cfg.variants.tone, ['neutral', 'success']);
  assert.deepEqual(cfg.variants.size, ['sm', 'md']);
});

test('reads a tailwind-variants (tv) config — same model', () => {
  const cfg = readVariantConfig(TV);
  assert.equal(cfg.found, true);
  assert.equal(cfg.library, 'tv');
  assert.deepEqual(cfg.variants.color, ['primary', 'secondary']);
});

test('adds a new value to an existing variant axis', () => {
  const res = addVariantValue(CVA, 'tone', 'warning', 'bg-amber-100');
  assert.equal(res.ok, true);
  assert.match(res.source, /warning: 'bg-amber-100'/);
  // The new value is parseable and shows up on re-read.
  assert.deepEqual(readVariantConfig(res.source).variants.tone, ['warning', 'neutral', 'success']);
});

test('refuses to add a duplicate value', () => {
  const res = addVariantValue(CVA, 'tone', 'neutral', 'x');
  assert.equal(res.ok, false);
  assert.match(res.error, /already exists/);
});

test('adds a brand-new variant axis (a new property)', () => {
  const res = addVariantAxis(CVA, 'shape', 'pill', 'rounded-full');
  assert.equal(res.ok, true);
  const reread = readVariantConfig(res.source);
  assert.ok(reread.variants.shape, 'new axis present');
  assert.deepEqual(reread.variants.shape, ['pill']);
});

test('returns not-found for a component without a variant config', () => {
  assert.equal(readVariantConfig('export const x = 1;').found, false);
});
