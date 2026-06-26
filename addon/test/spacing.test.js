/**
 * Spacing/layout tests — property-scoped extraction (Babel), surgical rewrite,
 * and the "tokenize this" promotion into tokens.json + the @theme stylesheet.
 * Demo-facing checks run dry so the demo source is never mutated; the real
 * tokenize round-trip runs against a throwaway temp project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOptions } from '../src/config.js';
import { clearScanCache } from '../src/scanner.js';
import { extractSpacing, rewriteSpacing, spacingLiteralText } from '../src/spacing.js';
import { loadTokens } from '../src/tokens.js';
import { setSpacing, tokenizeSpacing } from '../src/actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(__dirname, '../../demo');

const CARD = fs.readFileSync(path.join(DEMO_ROOT, 'src/components/Card.tsx'), 'utf8');

test('extractSpacing is property-scoped — catches style props, ignores others', () => {
  const found = extractSpacing(CARD);
  const byProp = (p) => found.filter((s) => s.property === p).map((s) => s.value);

  assert.deepEqual(byProp('padding'), [16], 'padding: 16 caught');
  assert.deepEqual(byProp('borderRadius'), [8], 'borderRadius: 8 caught');
  assert.deepEqual(byProp('margin'), ['0 0 8px'], "margin: '0 0 8px' caught (string literal)");
  // maxWidth: 320 is NOT a spacing prop — must be excluded (the whole point).
  assert.equal(found.some((s) => s.value === 320), false, 'maxWidth: 320 excluded');
  assert.equal(found.some((s) => s.property === 'maxWidth'), false);
});

test('extractSpacing ignores bare numbers and non-length strings', () => {
  const src = `const x = 16; const s = { color: '#fff', fontSize: 'inherit', padding: 16 };`;
  const found = extractSpacing(src);
  assert.equal(found.length, 1, 'only padding: 16');
  assert.equal(found[0].property, 'padding');
  assert.equal(found[0].value, 16);
});

test('extractSpacing dedupes repeated property/value pairs', () => {
  const src = `const a = { padding: 12 }; const b = { padding: 12 }; const c = { padding: 20 };`;
  const found = extractSpacing(src).filter((s) => s.property === 'padding');
  assert.deepEqual(found.map((s) => s.value), [12, 20]);
});

test('rewriteSpacing changes only the targeted property, every occurrence', () => {
  const src = `const a = { padding: 16, margin: 16 }; const b = { padding: 16 };`;
  const r = rewriteSpacing(src, 'padding', 16, spacingLiteralText(24));
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.equal(r.count, 2, 'both padding: 16 rewritten');
  assert.match(r.source, /padding: 24, margin: 16/, 'margin: 16 untouched');
  assert.match(r.source, /b = \{ padding: 24 \}/);
});

test('rewriteSpacing supports string values and reports no-match cleanly', () => {
  const src = `const a = { margin: '0 0 8px' };`;
  const hit = rewriteSpacing(src, 'margin', '0 0 8px', spacingLiteralText('0 0 12px'));
  assert.equal(hit.changed, true);
  assert.match(hit.source, /margin: '0 0 12px'/);

  const miss = rewriteSpacing(src, 'padding', 99, '1');
  assert.equal(miss.ok, true);
  assert.equal(miss.changed, false);
  assert.equal(miss.count, 0);
});

function demoOpts() {
  clearScanCache();
  const { options } = validateOptions(
    { framework: 'react', scanDirs: ['src/components'] },
    { projectRoot: DEMO_ROOT },
  );
  options.configDir = path.join(DEMO_ROOT, '.storybook');
  return options;
}

test('setSpacing (dry run) rewrites a spacing prop and writes nothing', () => {
  const cardPath = path.join(DEMO_ROOT, 'src/components/Card.tsx');
  const before = fs.readFileSync(cardPath, 'utf8');

  const r = setSpacing('Card', { property: 'padding', from: 16, to: 24 }, demoOpts(), { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.equal(r.count, 1);
  assert.equal(fs.readFileSync(cardPath, 'utf8'), before, 'dry run wrote nothing');
});

test('setSpacing rejects a non-spacing property', () => {
  const r = setSpacing('Card', { property: 'maxWidth', from: 320, to: 400 }, demoOpts(), { dryRun: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /not a spacing property/);
});

test('tokenizeSpacing (dry run) reports the promotion and writes nothing', () => {
  const cardPath = path.join(DEMO_ROOT, 'src/components/Card.tsx');
  const before = fs.readFileSync(cardPath, 'utf8');

  const r = tokenizeSpacing('Card', { property: 'padding', value: 16, token: 'space-16' }, demoOpts(), { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.token, 'space-16');
  assert.equal(r.count, 1);
  assert.equal(fs.readFileSync(cardPath, 'utf8'), before, 'dry run wrote nothing');
});

// Real round-trip in a throwaway project: tokenize must edit source + tokens.json
// + the generated @theme stylesheet together.
test('tokenizeSpacing promotes a value into tokens.json, @theme, and the source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-spacing-'));
  try {
    fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(root, '.storybook'), { recursive: true });
    const compPath = path.join(root, 'src/components/Box.tsx');
    fs.writeFileSync(
      compPath,
      `import React from 'react';\n` +
        `export default function Box() {\n` +
        `  return <div style={{ padding: 24, color: '#fff' }}>x</div>;\n` +
        `}\n`,
      'utf8',
    );

    clearScanCache();
    const { options } = validateOptions(
      { framework: 'react', scanDirs: ['src/components'] },
      { projectRoot: root },
    );
    options.configDir = path.join(root, '.storybook');

    const r = tokenizeSpacing('Box', { property: 'padding', value: 24, token: 'space-24' }, options);
    assert.equal(r.ok, true);

    // 1) source repointed at the token
    assert.match(fs.readFileSync(compPath, 'utf8'), /padding: 'var\(--spacing-space-24\)'/);
    // color untouched — property-scoped
    assert.match(fs.readFileSync(compPath, 'utf8'), /color: '#fff'/);
    // 2) tokens.json gained the spacing entry
    assert.equal(loadTokens(options.configDir).spacing['space-24'], 24);
    // 3) @theme stylesheet regenerated with the px-normalized value
    assert.match(fs.readFileSync(path.join(root, 'src/auto-theme.css'), 'utf8'), /--spacing-space-24: 24px;/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
