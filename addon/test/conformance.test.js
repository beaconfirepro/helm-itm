/**
 * Conformance engine + applier tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOptions } from '../src/config.js';
import { reactAdapter } from '../src/adapters/react.js';
import { scanComponents, clearScanCache } from '../src/scanner.js';
import { scanInstances } from '../src/instances.js';
import {
  deriveMappings,
  auditConformance,
  canonicalImports,
  summarizeByComponent,
} from '../src/conformance.js';
import { applyAlignments, buildAgentBrief } from '../src/apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(__dirname, '../../demo');

function demoAudit() {
  clearScanCache();
  const { options } = validateOptions(
    { framework: 'react', scanDirs: ['src/components'] },
    { projectRoot: DEMO_ROOT },
  );
  const components = scanComponents(reactAdapter, options);
  const instances = scanInstances(components.map((c) => c.name), options);
  const audit = auditConformance({
    canonicalNames: ['Button'],
    components,
    instances,
    conformance: options.conformance,
  });
  return { options, components, instances, audit };
}

test('name similarity maps LegacyButton onto the approved Button', () => {
  const { components } = demoAudit();
  const mapping = deriveMappings(['Button'], components, {});
  assert.equal(mapping.get('LegacyButton'), 'Button');
  // Approved canonical itself is never a variant of itself.
  assert.ok(!mapping.has('Button'));
});

test('audit finds every LegacyButton instance as non-conforming', () => {
  const { audit } = demoAudit();
  // App (1) + Dashboard (2) + Settings (2) = 5 usages.
  assert.equal(audit.summary.instances, 5);
  assert.equal(audit.summary.files, 3);
  assert.ok(audit.findings.every((f) => f.from === 'LegacyButton' && f.to === 'Button' && f.alignable));
});

test('rework bucket: flagged variants go to findings-for-agents, not alignable', () => {
  const { components, instances } = demoAudit();
  const audit = auditConformance({
    canonicalNames: ['Button'],
    components,
    instances,
    conformance: { rework: { RadioToggle: 'Checkbox' } },
  });
  // RadioToggle is used twice in pages/Form.tsx.
  assert.equal(audit.reworkFindings.length, 2);
  assert.ok(audit.reworkFindings.every((f) => f.alignable === false && f.to === 'Checkbox'));
  // Rework items never leak into the alignable findings.
  assert.ok(!audit.findings.some((f) => f.from === 'RadioToggle'));
});

test('agent brief lists rework instances grouped by target', () => {
  const { components, instances } = demoAudit();
  const { reworkFindings } = auditConformance({
    canonicalNames: ['Button'],
    components,
    instances,
    conformance: { rework: { RadioToggle: 'Checkbox' } },
  });
  const brief = buildAgentBrief(reworkFindings);
  assert.match(brief, /Should become: Checkbox/);
  assert.match(brief, /RadioToggle/);
  assert.match(brief, /Form\.tsx:\d+/);
});

test('summarizeByComponent rolls the audit into per-component roles', () => {
  const { components, instances } = demoAudit();
  const audit = auditConformance({
    canonicalNames: ['Button'],
    components,
    instances,
    conformance: { rework: { RadioToggle: 'Checkbox' } },
  });
  const byComp = summarizeByComponent(audit);

  assert.equal(byComp.Button.role, 'canonical');
  assert.equal(byComp.Button.totalNonConforming, 5);
  assert.equal(byComp.LegacyButton.role, 'variant');
  assert.equal(byComp.LegacyButton.alignsTo, 'Button');
  assert.equal(byComp.LegacyButton.instances, 5);
  assert.equal(byComp.RadioToggle.role, 'rework');
  assert.equal(byComp.RadioToggle.target, 'Checkbox');
});

test('explicit deny list suppresses a name-similarity mapping', () => {
  const { components } = demoAudit();
  const mapping = deriveMappings(['Button'], components, { deny: ['LegacyButton'] });
  assert.ok(!mapping.has('LegacyButton'));
});

test('dry-run apply reports edits without touching files', () => {
  const { audit, components } = demoAudit();
  const imports = canonicalImports(['Button'], components);
  const before = fs.readFileSync(path.join(DEMO_ROOT, 'src/pages/Settings.tsx'), 'utf8');

  const { edits } = applyAlignments(audit.findings, {
    canonicalImports: imports,
    projectRoot: DEMO_ROOT,
    dryRun: true,
  });

  assert.equal(edits.length, 3, 'three files would change');
  const after = fs.readFileSync(path.join(DEMO_ROOT, 'src/pages/Settings.tsx'), 'utf8');
  assert.equal(before, after, 'dry run wrote nothing');
});

test('apply repoints a file that uses ONLY the variant (import swapped)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  try {
    const buttonFile = path.join(dir, 'Button.tsx');
    fs.writeFileSync(buttonFile, 'export default function Button() { return null; }');
    const usage = path.join(dir, 'Only.tsx');
    fs.writeFileSync(
      usage,
      [
        "import LegacyButton from './LegacyButton';",
        'export const X = () => <LegacyButton label="Save" size="lg" />;',
      ].join('\n'),
    );

    const findings = [{ from: 'LegacyButton', to: 'Button', file: usage }];
    applyAlignments(findings, {
      canonicalImports: { Button: { file: buttonFile, default: true, name: 'Button' } },
      projectRoot: dir,
    });

    const out = fs.readFileSync(usage, 'utf8');
    assert.match(out, /import Button from '\.\/Button';/);
    assert.doesNotMatch(out, /LegacyButton/);
    assert.match(out, /<Button label="Save" size="lg" \/>/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('apply drops the duplicate import when the canonical is already imported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  try {
    const buttonFile = path.join(dir, 'Button.tsx');
    fs.writeFileSync(buttonFile, 'export default function Button() { return null; }');
    const usage = path.join(dir, 'Dup.tsx');
    fs.writeFileSync(
      usage,
      [
        "import Button from './Button';",
        "import LegacyButton from './LegacyButton';",
        'export const X = () => (<><Button label="A" /><LegacyButton label="B" /></>);',
      ].join('\n'),
    );

    const findings = [{ from: 'LegacyButton', to: 'Button', file: usage }];
    applyAlignments(findings, {
      canonicalImports: { Button: { file: buttonFile, default: true, name: 'Button' } },
      projectRoot: dir,
    });

    const out = fs.readFileSync(usage, 'utf8');
    assert.equal((out.match(/import Button from/g) || []).length, 1, 'no duplicate Button import');
    assert.doesNotMatch(out, /LegacyButton/);
    assert.match(out, /<Button label="A" \/><Button label="B" \/>/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
