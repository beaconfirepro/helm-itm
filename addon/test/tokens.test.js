/**
 * Design-token tests: tokens.json -> generated Tailwind @theme stylesheet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadTokens, generateThemeCss, generateTokensStory } from '../src/tokens.js';
import { setToken } from '../src/actions.js';

test('generateThemeCss renders a Tailwind @theme block', () => {
  const css = generateThemeCss({ colors: { 'brand-600': '#7c3aed', 'brand-100': '#ede9fe' } });
  assert.match(css, /@theme \{/);
  assert.match(css, /--color-brand-600: #7c3aed;/);
  assert.match(css, /--color-brand-100: #ede9fe;/);
});

test('generateThemeCss emits --spacing-* with px for bare numbers, verbatim for strings', () => {
  const css = generateThemeCss({ colors: {}, spacing: { 4: 16, sm: '0.5rem', gutter: '0 0 8px' } });
  assert.match(css, /--spacing-4: 16px;/);
  assert.match(css, /--spacing-sm: 0\.5rem;/);
  assert.match(css, /--spacing-gutter: 0 0 8px;/);
});

test('generateTokensStory produces a Design System/Tokens editor story', () => {
  const code = generateTokensStory({ colors: { 'brand-600': '#7c3aed' } });
  assert.match(code, /title: 'Design System\/Tokens'/);
  assert.match(code, /auto-detect\/set-token/);
  assert.match(code, /brand-600/);
  assert.match(code, /export const Tokens/);
});

test('setToken updates tokens.json and regenerates the stylesheet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-tok-'));
  const options = { configDir: dir, projectRoot: dir, themeOutput: 'auto-theme.css' };
  try {
    const r = setToken('brand-600', '#ff0000', options);
    assert.equal(r.ok, true);
    assert.equal(loadTokens(dir).colors['brand-600'], '#ff0000');
    assert.match(fs.readFileSync(path.join(dir, 'auto-theme.css'), 'utf8'), /--color-brand-600: #ff0000;/);

    setToken('brand-600', null, options, { remove: true });
    assert.equal(loadTokens(dir).colors['brand-600'], undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
