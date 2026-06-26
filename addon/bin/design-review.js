#!/usr/bin/env node
/**
 * Design Review CLI — the "global" review gate.
 *
 * Instead of letting Storybook silently rewrite source, changes flow through a
 * reviewable PR. This command:
 *   1. Summarizes governance status + instance blast-radius into a Markdown
 *      review brief (always — even with no git).
 *   2. If this is a git repo, creates a branch, commits the generated stories +
 *      manifest + brief, and (when `gh` and a remote exist) opens a PR.
 *
 * Run from the project root:
 *   node node_modules/storybook-addon-auto-detect/bin/design-review.js
 *
 * It never throws on missing git/gh — it tells you exactly what's missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateOptions } from '../src/config.js';
import { getAdapter } from '../src/adapters/registry.js';
import { scanComponents } from '../src/scanner.js';
import { scanInstances } from '../src/instances.js';
import { loadManifest, getStatus, componentKey, STATUS_GROUP } from '../src/governance.js';

const args = process.argv.slice(2);
let configDir = path.resolve(process.cwd(), '.storybook');
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--config') {
    configDir = path.resolve(args[i + 1] || '.storybook');
    i += 1;
  }
}
const projectRoot = path.dirname(configDir);

function git(cmd, argv) {
  try {
    const out = execFileSync('git', [cmd, ...argv], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.toString().trim() };
  } catch (err) {
    return { ok: false, out: (err.stderr || err.stdout || err.message || '').toString().trim() };
  }
}

function buildBrief() {
  const { options } = validateOptions({ framework: 'auto' }, { projectRoot });
  options.configDir = configDir;
  const adapter = getAdapter(options.resolvedFramework) || getAdapter('react');
  const components = adapter ? scanComponents(adapter, options) : [];
  const instances = scanInstances(components.map((c) => c.name), options);
  const manifest = loadManifest(configDir);

  const rows = components
    .filter((c) => !c.manualStory)
    .map((c) => {
      const status = getStatus(manifest, componentKey(c, projectRoot));
      const used = (instances[c.name] || []).length;
      return { name: c.name, status, props: c.props.length, instances: used };
    });

  const counts = rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const lines = [];
  lines.push('# Design Review', '');
  lines.push(
    `**Summary:** ${rows.length} auto-detected component(s) — ` +
      ['approved', 'in-review', 'surfaced'].map((s) => `${counts[s] || 0} ${STATUS_GROUP[s]}`).join(', '),
    '',
  );
  lines.push('| Component | Status | Props | Instances |', '| --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| ${r.name} | ${STATUS_GROUP[r.status]} | ${r.props} | ${r.instances} |`);
  }
  lines.push('', '## Instance detail', '');
  for (const r of rows) {
    const list = instances[r.name] || [];
    lines.push(`### ${r.name} (${STATUS_GROUP[r.status]})`);
    if (!list.length) lines.push('_No usages in the codebase._', '');
    else {
      for (const inst of list) lines.push(`- \`${inst.relFile}:${inst.line}\`${inst.props?.length ? ` — ${inst.props.join(', ')}` : ''}`);
      lines.push('');
    }
  }
  return { markdown: lines.join('\n'), rows, counts };
}

function main() {
  const { markdown, rows, counts } = buildBrief();
  const briefPath = path.join(configDir, 'design-review.md');
  fs.writeFileSync(briefPath, `${markdown}\n`, 'utf8');
  console.log(`Wrote review brief: ${path.relative(projectRoot, briefPath)}`);
  console.log(
    `Status: ${['approved', 'in-review', 'surfaced'].map((s) => `${counts[s] || 0} ${s}`).join(', ')}`,
  );

  // --- git / PR (best effort) ---
  const isRepo = git('rev-parse', ['--is-inside-work-tree']).ok;
  if (!isRepo) {
    console.log('\nNot a git repository — skipping branch/PR.');
    console.log('To enable PRs: `git init`, add a remote, authenticate `gh`, then re-run.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branch = `design-review/${stamp}`;
  const created = git('checkout', ['-b', branch]);
  if (!created.ok) {
    console.log(`\nCould not create branch ${branch}: ${created.out}`);
    return;
  }

  // Stage the brief, the manifest, and all generated stories.
  git('add', ['--', briefPath]);
  git('add', ['--', path.join(configDir, 'auto-detect.manifest.json')]);
  execFileSyncSafe('git', ['add', '--', ':(glob)**/*.auto.stories.*']);

  const commit = git('commit', ['-m', `design review: ${rows.length} components (${counts.approved || 0} approved)`]);
  if (!commit.ok) {
    console.log(`\nNothing committed (${commit.out || 'no changes'}).`);
    return;
  }
  console.log(`\nCommitted to branch ${branch}.`);

  const hasRemote = git('remote', []).out;
  if (!hasRemote) {
    console.log('No git remote configured — push manually, or add a remote and re-run.');
    return;
  }
  const push = git('push', ['-u', 'origin', branch]);
  if (!push.ok) {
    console.log(`Push failed: ${push.out}`);
    return;
  }
  try {
    execFileSync('gh', ['pr', 'create', '--fill', '--title', 'Design Review', '--body-file', briefPath], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch {
    console.log('Opened branch + pushed, but `gh pr create` failed (is gh installed/authenticated?).');
  }
}

function execFileSyncSafe(cmd, argv) {
  try {
    execFileSync(cmd, argv, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    /* ignore */
  }
}

main();
