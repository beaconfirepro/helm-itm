/**
 * External DTCG / style-dictionary token adapter — read a team's token source
 * (the shape used by beacon-platform's helm.tokens.json), edit a value, and
 * patch the generated CSS var for a live recolor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { flattenDtcg, loadDtcgTokens, setDtcgToken } from '../src/tokens-dtcg.js';

const SAMPLE = {
  color: {
    accent: { default: { $value: '#f59e0b', $type: 'color' } },
    status: {
      info: { $value: '#2563eb', $type: 'color' },
      danger: { $value: '#dc2626', $type: 'color' },
    },
  },
  space: { md: { $value: '1rem', $type: 'dimension' } },
};

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-dtcg-'));
  const file = path.join(dir, 'helm.tokens.json');
  fs.writeFileSync(file, `${JSON.stringify(SAMPLE, null, 2)}\n`);
  return { dir, file };
}

test('flattenDtcg flattens nested $value leaves to dash-joined names', () => {
  const flat = flattenDtcg(SAMPLE);
  assert.equal(flat['color-accent-default'].value, '#f59e0b');
  assert.equal(flat['color-accent-default'].type, 'color');
  assert.equal(flat['color-status-danger'].value, '#dc2626');
  assert.deepEqual(flat['space-md'].path, ['space', 'md']);
});

test('loadDtcgTokens splits colors from dimensions', () => {
  const { file } = tmp();
  const { colors, dimensions } = loadDtcgTokens(file);
  assert.equal(colors['color-accent-default'], '#f59e0b');
  assert.equal(colors['color-status-info'], '#2563eb');
  assert.equal(dimensions['space-md'], '1rem');
  assert.equal(colors['space-md'], undefined, 'dimensions are not colors');
});

test('setDtcgToken updates the $value in the source and preserves $type + siblings', () => {
  const { file } = tmp();
  const r = setDtcgToken(file, 'color-accent-default', '#ff0000');
  assert.equal(r.ok, true);

  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(json.color.accent.default.$value, '#ff0000');
  assert.equal(json.color.accent.default.$type, 'color', '$type preserved');
  assert.equal(json.color.status.info.$value, '#2563eb', 'siblings untouched');
});

test('setDtcgToken patches the matching generated CSS var for a live recolor', () => {
  const { dir, file } = tmp();
  const css = path.join(dir, 'tokens.css');
  fs.writeFileSync(
    css,
    ':root {\n  --ds-color-accent-default: #f59e0b;\n  --ds-color-status-info: #2563eb;\n}\n',
  );

  const r = setDtcgToken(file, 'color-accent-default', '#00ff00', {
    cssFile: css,
    cssPrefix: '--ds-',
  });
  assert.equal(r.ok, true);
  assert.equal(r.cssPatched, true);

  const out = fs.readFileSync(css, 'utf8');
  assert.match(out, /--ds-color-accent-default:\s*#00ff00;/);
  assert.match(out, /--ds-color-status-info:\s*#2563eb;/, 'other vars untouched');
});

test('setDtcgToken reports a clear error for an unknown token', () => {
  const { file } = tmp();
  const r = setDtcgToken(file, 'color-nope-nope', '#000');
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});
