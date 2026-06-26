/**
 * Server-action tests — the Node logic the panel buttons trigger over the
 * bridge. Approve runs in dry-run so it doesn't mutate the demo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOptions } from '../src/config.js';
import { clearScanCache } from '../src/scanner.js';
import { extractColors } from '../src/colors.js';
import {
  approveComponent,
  flagFixOutside,
  setManagedProp,
  setManaged,
  openInEditor,
  addVariant,
  setColor,
} from '../src/actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(__dirname, '../../demo');

function opts() {
  clearScanCache();
  const { options } = validateOptions(
    { framework: 'react', scanDirs: ['src/components'] },
    { projectRoot: DEMO_ROOT },
  );
  options.configDir = path.join(DEMO_ROOT, '.storybook');
  return options;
}

// Isolated manifest (empty) so approval state from the shared demo manifest
// can't influence these assertions.
function isolatedOpts() {
  const options = opts();
  options.configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-manifest-'));
  return options;
}

test('approveComponent (dry run) approves a canonical and would align its variants', () => {
  const r = approveComponent('Button', isolatedOpts(), { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.approved, 'Button');
  assert.equal(r.aligned, 5, '5 LegacyButton usages align to Button');
  assert.equal(r.files, 3);
  assert.ok(r.orphans.includes('LegacyButton'));
});

test('approveComponent dry run mutates no source files', () => {
  const appPath = path.join(DEMO_ROOT, 'src/App.tsx');
  const before = fs.readFileSync(appPath, 'utf8');
  approveComponent('Button', isolatedOpts(), { dryRun: true });
  assert.equal(fs.readFileSync(appPath, 'utf8'), before, 'App.tsx untouched');
  assert.match(before, /LegacyButton/, 'rogue usage still present');
});

test('approveComponent reports a clear error for an unknown component', () => {
  const r = approveComponent('DoesNotExist', opts(), { dryRun: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});

function managedOpts() {
  const o = opts();
  o.conformance = { ...o.conformance, managed: { Button: ['variant', 'size'], Card: ['elevated'] } };
  return o;
}

test('setManagedProp (dry run) updates the library default and propagates to instances', () => {
  const appPath = path.join(DEMO_ROOT, 'src/App.tsx');
  const before = fs.readFileSync(appPath, 'utf8');

  const r = setManagedProp('Button', 'variant', 'secondary', managedOpts(), { dryRun: true });
  assert.equal(r.ok, true);
  assert.ok(typeof r.from === 'string', 'reports the current default'); // not hard-coded
  assert.equal(r.to, 'secondary');
  assert.equal(r.libraryUpdated, true);
  // App.tsx renders <Button variant={current}> — a propagation target.
  assert.ok(r.files.includes('src/App.tsx'), `expected App.tsx in ${JSON.stringify(r.files)}`);

  assert.equal(fs.readFileSync(appPath, 'utf8'), before, 'dry run wrote nothing');
});

test('setManagedProp handles a boolean managed prop (library default)', () => {
  const cardPath = path.join(DEMO_ROOT, 'src/components/Card.tsx');
  const before = fs.readFileSync(cardPath, 'utf8');

  const r = setManagedProp('Card', 'elevated', 'true', managedOpts(), { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.from, 'false'); // Card's default elevated
  assert.equal(r.to, 'true');
  assert.equal(r.libraryUpdated, true);

  assert.equal(fs.readFileSync(cardPath, 'utf8'), before, 'dry run wrote nothing');
});

test('setManagedProp rejects a non-managed property', () => {
  const r = setManagedProp('Button', 'label', 'x', managedOpts(), { dryRun: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /not a managed property/);
});

test('addVariant (dry run) extends a cva component and writes nothing', () => {
  const tagPath = path.join(DEMO_ROOT, 'src/components/Tag.tsx');
  const before = fs.readFileSync(tagPath, 'utf8');

  const add = addVariant('Tag', { variant: 'tone', value: 'info', classes: 'bg-blue-100 text-blue-800' }, opts(), { dryRun: true });
  assert.equal(add.ok, true);
  assert.equal(add.newAxis, false);
  assert.match(add.source, /info: 'bg-blue-100 text-blue-800'/);

  const newAxis = addVariant('Tag', { variant: 'shape', value: 'pill', classes: 'rounded-full', newAxis: true }, opts(), { dryRun: true });
  assert.equal(newAxis.ok, true);
  assert.match(newAxis.source, /shape: \{/);

  assert.equal(fs.readFileSync(tagPath, 'utf8'), before, 'dry run wrote nothing');
});

test('addVariant rejects a component with no variant config', () => {
  const r = addVariant('Avatar', { variant: 'x', value: 'y' }, opts(), { dryRun: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /no cva\/tv variant config/);
});

test('setManaged adds and removes a prop in conformance.json', () => {
  const o = isolatedOpts();
  const file = path.join(o.configDir, 'conformance.json');

  assert.equal(setManaged('Button', 'variant', true, o).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).managed.Button, ['variant']);

  setManaged('Button', 'variant', false, o);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).managed.Button, []);
});

test('setColor (dry run) rewrites a hardcoded hex in the component source', () => {
  const btnPath = path.join(DEMO_ROOT, 'src/components/Button.tsx');
  const before = fs.readFileSync(btnPath, 'utf8');
  const colors = extractColors(before);
  assert.ok(colors.length > 0, 'Button hardcodes some hex colors');

  const r = setColor('Button', colors[0], '#00ff00', opts(), { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.equal(fs.readFileSync(btnPath, 'utf8'), before, 'dry run wrote nothing');
});

test('openInEditor returns a result without throwing', () => {
  // Uses a no-op editor so the test never launches anything real.
  process.env.AUTO_DETECT_EDITOR = 'cmd /c rem';
  const r = openInEditor(path.join(DEMO_ROOT, 'src/App.tsx'), 14);
  delete process.env.AUTO_DETECT_EDITOR;
  assert.equal(r.ok, true);
  assert.equal(r.line, 14);
});

test('flagFixOutside sets and clears the manifest flag', () => {
  const o = opts();
  const set = flagFixOutside('RadioToggle', o, { value: true });
  assert.equal(set.ok, true);
  assert.equal(set.fixOutside, true);

  const clear = flagFixOutside('RadioToggle', o, { value: false });
  assert.equal(clear.fixOutside, false);
});
