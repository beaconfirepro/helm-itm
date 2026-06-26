#!/usr/bin/env node
/**
 * Conformance audit CLI — "show me the delta vs. my approved spec."
 *
 *   node node_modules/storybook-addon-auto-detect/bin/audit.js
 *
 * Prints every instance in the repo that doesn't conform to an approved
 * canonical, and writes a machine-readable report the `apply` step consumes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveCliOptions, runProjectAudit } from '../src/audit-runner.js';

const { options, configDir, projectRoot } = resolveCliOptions(process.argv.slice(2));
const { canonicalNames, audit } = runProjectAudit(options);

if (!canonicalNames.length) {
  console.log('No approved canonicals yet. Approve some first:');
  console.log('  node .../bin/governance.js approve <Component>');
  process.exit(0);
}

console.log(`Spec: ${canonicalNames.length} approved canonical(s) — ${canonicalNames.join(', ')}`);

const { mappings, findings, summary } = audit;
if (!findings.length) {
  console.log('\n✓ Codebase conforms. Nothing to align.');
} else {
  console.log(
    `\n${summary.instances} non-conforming instance(s) across ${summary.files} file(s), ` +
      `from ${summary.variants} variant component(s):`,
  );
  for (const [variant, canon] of Object.entries(mappings)) {
    const list = findings.filter((f) => f.from === variant);
    if (!list.length) continue;
    console.log(`\n  ${variant} → ${canon}  (${list.length} instance${list.length === 1 ? '' : 's'})`);
    for (const f of list) console.log(`    ${f.relFile}:${f.line}`);
  }
  console.log('\nAll of the above are mechanically alignable. Apply them with:');
  console.log('  npm run conformance:apply        (or apply.js --dry to preview)');
}

const rework = audit.reworkFindings || [];
if (rework.length) {
  console.log(`\n${rework.length} instance(s) flagged for rework (need real code changes, not a repoint):`);
  for (const f of rework) console.log(`    ${f.relFile}:${f.line}  ${f.from} → ${f.to}`);
  console.log('\nHand these to the agents with:  apply.js --to-agents');
}

const reportPath = path.join(configDir, 'conformance-report.json');
fs.writeFileSync(
  reportPath,
  `${JSON.stringify({ canonicalNames, mappings, findings, summary }, null, 2)}\n`,
  'utf8',
);
console.log(`\nReport: ${path.relative(projectRoot, reportPath)}`);
