/**
 * Pipeline tests — exercise discovery + prop extraction + generation against
 * the demo components, with no Storybook runtime involved.
 *
 * Run: npm run test --workspace storybook-addon-auto-detect
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOptions } from '../src/config.js';
import { reactAdapter } from '../src/adapters/react.js';
import { scanComponents, clearScanCache } from '../src/scanner.js';
import { scanInstances } from '../src/instances.js';
import { buildStoryPlan, generateComponentStory } from '../src/generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(__dirname, '../../demo');

function setup(overrides = {}) {
  clearScanCache();
  const { options } = validateOptions(
    { framework: 'react', scanDirs: ['src/components'], ...overrides },
    { projectRoot: DEMO_ROOT },
  );
  const components = scanComponents(reactAdapter, options);
  return { options, components };
}

test('discovers all demo components and excludes the util module', () => {
  const { components } = setup();
  const names = components.map((c) => c.name).sort();
  assert.deepEqual(names, [
    'Avatar', 'Badge', 'Button', 'Card', 'LegacyButton', 'RadioToggle', 'Spinner', 'Tag',
  ]);
});

test('does not treat the utils/format module as a component', () => {
  const { components } = setup();
  assert.ok(!components.some((c) => /format/i.test(c.filePath)));
});

test('Spinner is flagged as having a manual story (coexistence)', () => {
  const { components } = setup();
  const spinner = components.find((c) => c.name === 'Spinner');
  assert.equal(spinner.manualStory, true);
});

test('extracts TypeScript props with required/optional + enum values', () => {
  const { components } = setup();
  const button = components.find((c) => c.name === 'Button');
  const byName = Object.fromEntries(button.props.map((p) => [p.name, p]));

  assert.equal(byName.label.required, true);
  assert.equal(byName.label.tsType, 'string');

  assert.equal(byName.variant.required, false);
  assert.equal(byName.variant.tsType, 'enum');
  assert.deepEqual(byName.variant.enumValues, ['primary', 'secondary', 'danger']);

  assert.equal(byName.size.tsType, 'enum');
  assert.deepEqual(byName.size.enumValues, ['sm', 'md', 'lg']);

  assert.equal(byName.disabled.tsType, 'boolean');
  assert.equal(byName.onClick.tsType, 'func');
});

test('extracts PropTypes (Badge) including oneOf enums and named export', () => {
  const { components } = setup();
  const badge = components.find((c) => c.name === 'Badge');
  assert.equal(badge.isDefaultExport, false, 'Badge is a named export');

  const tone = badge.props.find((p) => p.name === 'tone');
  assert.equal(tone.tsType, 'enum');
  assert.deepEqual(tone.enumValues, ['neutral', 'success', 'warning']);

  const label = badge.props.find((p) => p.name === 'label');
  assert.equal(label.required, true);
});

test('builds a Default story with only required props', () => {
  const { options, components } = setup();
  const button = components.find((c) => c.name === 'Button');
  const plan = buildStoryPlan(button, options);

  const def = plan.stories.find((s) => s.name === 'Default');
  assert.ok(def, 'has a Default story');
  assert.deepEqual(Object.keys(def.args), ['label'], 'only required prop in Default');
  // Governance is on by default → grouped under the status, not "Auto/".
  assert.equal(plan.title, 'Surfaced/Button');
});

test('governance status drives the sidebar group', () => {
  const { options, components } = setup();
  const button = components.find((c) => c.name === 'Button');
  assert.equal(buildStoryPlan(button, options, { status: 'approved' }).title, 'Approved/Button');
  assert.equal(buildStoryPlan(button, options, { status: 'in-review' }).title, 'In Review/Button');
});

test('scans component instances (usages) across the codebase', () => {
  const { options, components } = setup();
  const instances = scanInstances(components.map((c) => c.name), options);
  // Button is used in App.tsx and pages/Dashboard.tsx; LegacyButton in 3 files.
  assert.ok(instances.Button.length >= 2, `expected >=2 Button usages, got ${instances.Button.length}`);
  assert.ok(instances.LegacyButton.length >= 5, `expected >=5 LegacyButton usages`);
  assert.ok(instances.Badge.length >= 2);
  // Avatar is never rendered → no instances.
  assert.equal(instances.Avatar.length, 0);
  // Each instance records a file:line and the props set there.
  const withProps = instances.Button.find((i) => i.props.includes('variant'));
  assert.ok(withProps, 'captured props at a Button call site');
  assert.match(withProps.relFile, /\.tsx$/);
});

test('primary strategy creates enum + boolean variants', () => {
  const { options, components } = setup({ variantStrategy: 'primary' });
  const button = components.find((c) => c.name === 'Button');
  const plan = buildStoryPlan(button, options);
  const names = plan.stories.map((s) => s.name);

  assert.ok(names.includes('Variant Primary'));
  assert.ok(names.includes('Size Lg'));
  assert.ok(names.includes('Disabled'));
});

test('combinations strategy stays within the safety cap', () => {
  const { options, components } = setup({ variantStrategy: 'combinations', maxStoriesPerComponent: 8 });
  const button = components.find((c) => c.name === 'Button');
  const plan = buildStoryPlan(button, options);
  assert.ok(plan.stories.length <= 8);
});

test('no-prop component (Avatar) yields a single empty Default story', () => {
  const { options, components } = setup();
  const avatar = components.find((c) => c.name === 'Avatar');
  const plan = buildStoryPlan(avatar, options);
  assert.equal(plan.stories.length, 1);
  assert.deepEqual(plan.stories[0].args, {});
});

test('generated CSF is valid-looking source tagged auto-detected', () => {
  const { options, components } = setup();
  const instances = scanInstances(components.map((c) => c.name), options);
  const button = components.find((c) => c.name === 'Button');
  const code = generateComponentStory(reactAdapter, button, options, {
    importSpecifier: './Button',
    status: 'approved',
    instances: instances.Button,
  });

  assert.match(code, /import Button from '\.\/Button';/);
  assert.match(code, /id: "auto-button"/); // stable, status-independent id
  assert.match(code, /export default meta;/);
  assert.match(code, /"auto-detected"/);
  assert.match(code, /"status:approved"/);
  assert.match(code, /export const Default =/);
  // Instance + governance metadata is embedded for the panel to read.
  assert.match(code, /parameters:/);
  assert.match(code, /autoDetect:/);
  assert.match(code, /"instances":/);
});

test('named-export component generates a named import', () => {
  const { options, components } = setup();
  const badge = components.find((c) => c.name === 'Badge');
  const code = generateComponentStory(reactAdapter, badge, options, {
    importSpecifier: './Badge',
  });
  assert.match(code, /import \{ Badge \} from '\.\/Badge';/);
});
