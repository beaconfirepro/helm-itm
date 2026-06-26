#!/usr/bin/env node
/**
 * Conformance apply CLI — "fix the alignable ones."
 *
 *   node .../bin/apply.js            # fix every alignable instance
 *   node .../bin/apply.js --dry      # preview without writing
 *   node .../bin/apply.js --only LegacyButton   # limit to one variant
 *
 * Repoints selected usages onto the approved canonical (import + JSX tag), as
 * real edits you then review with `git diff`. Reports orphaned variant files
 * (left in place — deleting is your call, not the addon's).
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveCliOptions, runProjectAudit, variantFile } from '../src/audit-runner.js';
import { applyAlignments, buildAgentBrief } from '../src/apply.js';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry');
const toAgents = argv.includes('--to-agents');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;

const { options, configDir, projectRoot } = resolveCliOptions(argv);
const { components, audit, imports } = runProjectAudit(options);

// Dispatch the rework bucket to the agents instead of applying.
if (toAgents) {
  const rework = audit.reworkFindings || [];
  if (!rework.length) {
    console.log('No rework-flagged instances. Mark some via .storybook/conformance.json "rework".');
    process.exit(0);
  }
  const brief = buildAgentBrief(rework, {
    canonicalNote: 'These were used where an approved canonical was wanted, but the swap needs real code changes.',
  });
  const out = path.join(configDir, 'agent-tasks.md');
  fs.writeFileSync(out, `${brief}\n`, 'utf8');
  console.log(`Wrote ${rework.length} agent task(s): ${path.relative(projectRoot, out)}`);
  process.exit(0);
}

let findings = audit.findings.filter((f) => f.alignable);
if (only) findings = findings.filter((f) => f.from === only);

if (!findings.length) {
  console.log('Nothing to apply. Run the audit first, or the codebase already conforms.');
  process.exit(0);
}

const { edits, orphans } = applyAlignments(findings, {
  canonicalImports: imports,
  projectRoot,
  dryRun,
});

console.log(
  `${dryRun ? '[dry run] would fix' : 'Fixed'} ${findings.length} instance(s) ` +
    `across ${edits.length} file(s):`,
);
for (const e of edits) console.log(`  ${e.relFile}  (${e.variants.join(', ')} → canonical)`);

if (orphans.length) {
  console.log('\nNow-orphaned variant component(s) — left in place, remove when ready:');
  for (const name of orphans) {
    const file = variantFile(name, components, projectRoot);
    console.log(`  ${name}${file ? `  (${file})` : ''}`);
  }
}

if (dryRun) console.log('\n(dry run — no files written)');
else console.log('\nReview with: git diff');
