/**
 * Optional Tailwind v4 auto-wiring: the `tailwind` option, the double-wire
 * guard, the graceful no-op when the package is absent, and the generated
 * preview entry (tailwindcss + the token theme).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateOptions, DEFAULT_OPTIONS } from '../src/config.js';
import {
  hasTailwindPlugin,
  loadTailwindPlugin,
  writeTailwindPreview,
  injectTailwind,
} from '../src/tailwind.js';

test('tailwind defaults off and validates as a boolean', () => {
  assert.equal(DEFAULT_OPTIONS.tailwind, false);

  const { options } = validateOptions({}, { projectRoot: process.cwd() });
  assert.equal(options.tailwind, false);

  const bad = validateOptions({ tailwind: 'yes' }, { projectRoot: process.cwd() });
  assert.equal(bad.options.tailwind, false);
  assert.ok(bad.warnings.some((w) => /tailwind/.test(w)));

  const on = validateOptions({ tailwind: true }, { projectRoot: process.cwd() });
  assert.equal(on.options.tailwind, true);
});

test('hasTailwindPlugin detects the @tailwindcss/vite sub-plugins (flattened)', () => {
  assert.equal(hasTailwindPlugin([]), false);
  assert.equal(hasTailwindPlugin([{ name: 'vite:react' }, { name: 'other' }]), false);
  // The real factory returns an array of prefixed sub-plugins.
  assert.equal(
    hasTailwindPlugin([{ name: 'vite:react' }, [{ name: '@tailwindcss/vite:scan' }]]),
    true,
  );
});

test('injectTailwind is a no-op when the option is off', async () => {
  const config = { plugins: [{ name: 'vite:react' }] };
  await injectTailwind(config, { tailwind: false });
  assert.equal(config.plugins.length, 1);
});

test('injectTailwind never double-wires when the host already has Tailwind', async () => {
  const config = { plugins: [{ name: '@tailwindcss/vite:generate:build' }] };
  await injectTailwind(config, { tailwind: true });
  assert.equal(config.plugins.length, 1, 'no second Tailwind plugin added');
});

test('injectTailwind wires Tailwind when available and is idempotent (else no-ops)', async () => {
  // Environment-agnostic: @tailwindcss/vite may or may not resolve depending on
  // the install. Either way injectTailwind must never throw and never double-wire.
  const plugin = await loadTailwindPlugin();
  const config = { plugins: [] };
  await injectTailwind(config, { tailwind: true });

  if (plugin) {
    assert.ok(hasTailwindPlugin(config.plugins), 'plugin injected when available');
    const before = config.plugins.length;
    await injectTailwind(config, { tailwind: true }); // second pass
    assert.equal(config.plugins.length, before, 'idempotent — no double-wire');
  } else {
    assert.equal(config.plugins.length, 0, 'graceful no-op when not installed');
  }
});

test('writeTailwindPreview emits a CSS entry (tailwind + theme) and a JS preview module', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-tw-'));
  try {
    const jsPath = writeTailwindPreview({ projectRoot: root, themeOutput: 'src/auto-theme.css' });
    assert.ok(jsPath && jsPath.endsWith('auto-tailwind-preview.js'));

    const css = fs.readFileSync(path.join(root, 'src/auto-tailwind.css'), 'utf8');
    assert.match(css, /@import "tailwindcss";/);
    assert.match(css, /@import "\.\/auto-theme\.css";/, 'imports the generated token theme by basename');

    const js = fs.readFileSync(jsPath, 'utf8');
    assert.match(js, /import '\.\/auto-tailwind\.css';/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
