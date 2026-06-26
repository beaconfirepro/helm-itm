/**
 * Applier — the part that actually *fixes* non-conforming instances.
 *
 * Given findings the architect selected, it repoints each usage onto the
 * approved canonical: rename the JSX tag and fix the import. This is mechanical
 * execution of an approval (a codemod), not authoring — it invents nothing.
 *
 * Findings that aren't mechanically alignable don't come here; they go to
 * `writeAgentBrief`, which hands the agents a precise task list instead.
 *
 * NOTE: this first pass is a careful regex codemod, which is reliable for
 * ordinary import + JSX usage. AST-based rewriting is the production hardening.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {object[]} findings  Selected findings ({ file, from, to, ... }).
 * @param {object} ctx  { canonicalImports, projectRoot }
 * @returns {{ edits: object[], orphans: string[] }}
 */
export function applyAlignments(findings, { canonicalImports, projectRoot, dryRun = false }) {
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  const edits = [];
  const touchedVariants = new Set();

  for (const [file, fileFindings] of byFile) {
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const before = src;

    const variants = [...new Set(fileFindings.map((f) => f.from))];
    for (const variant of variants) {
      const canon = fileFindings.find((f) => f.from === variant).to;
      const imp = canonicalImports[canon];
      if (!imp) continue;
      src = rewriteVariant(src, variant, canon, imp, file);
      touchedVariants.add(variant);
    }

    if (src !== before) {
      if (!dryRun) fs.writeFileSync(file, src, 'utf8');
      edits.push({
        file,
        relFile: path.relative(projectRoot, file).split(path.sep).join('/'),
        variants,
      });
    }
  }

  const orphans = findOrphans([...touchedVariants], findings, projectRoot);
  return { edits, orphans };
}

function rewriteVariant(src, variant, canon, imp, file) {
  // 1) JSX tags: <Variant ...> / <Variant/> / </Variant>
  src = src.replace(new RegExp(`<${escapeRe(variant)}(?=[\\s/>])`, 'g'), `<${canon}`);
  src = src.replace(new RegExp(`</${escapeRe(variant)}>`, 'g'), `</${canon}>`);

  // 2) Import: replace the variant's import with the canonical's (or drop it if
  //    the canonical is already imported in this file).
  const spec = importSpecifierFor(file, imp.file);
  const canonStmt = imp.default
    ? `import ${canon} from '${spec}';`
    : `import { ${canon} } from '${spec}';`;

  const alreadyHasCanon = new RegExp(
    `import\\s+(?:${canon}\\b|\\{[^}]*\\b${canon}\\b[^}]*\\})\\s+from`,
  ).test(src);

  const variantImportRe = new RegExp(
    `^[ \\t]*import\\s+(?:${escapeRe(variant)}\\b|\\{[^}]*\\b${escapeRe(variant)}\\b[^}]*\\})\\s+from\\s+['"][^'"]+['"];?[ \\t]*\\r?\\n?`,
    'm',
  );

  src = alreadyHasCanon
    ? src.replace(variantImportRe, '')
    : src.replace(variantImportRe, `${canonStmt}\n`);

  return src;
}

function importSpecifierFor(fromFile, canonFile) {
  let rel = path.relative(path.dirname(fromFile), canonFile).split(path.sep).join('/');
  rel = rel.replace(/\.(t|j)sx?$/, '');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

/** After repointing, a variant component file nobody imports anymore is orphaned. */
function findOrphans(variants, findings, projectRoot) {
  const orphans = [];
  for (const variant of variants) {
    const finding = findings.find((f) => f.from === variant);
    // We can't always know the variant's own source path from a finding, so we
    // only report orphans the caller can resolve; the CLI augments this with the
    // component registry. Here we just surface the variant names.
    if (finding) orphans.push(variant);
  }
  return orphans;
}

const ESC = /[.*+?^${}()|[\]\\]/g;
function escapeRe(s) {
  return s.replace(ESC, '\\$&');
}

/**
 * Write a Markdown brief for findings that need real rework (radio→checkbox
 * style) — the ones dispatched to coding agents rather than auto-aligned.
 */
export function buildAgentBrief(items, { canonicalNote = '' } = {}) {
  const lines = ['# Conformance — agent tasks', ''];
  if (canonicalNote) lines.push(canonicalNote, '');
  lines.push(
    `${items.length} place(s) need code changes that aren't a mechanical alignment.`,
    '',
  );
  const byTo = {};
  for (const it of items) (byTo[it.to || it.note || 'review'] ||= []).push(it);
  for (const [target, list] of Object.entries(byTo)) {
    lines.push(`## Should become: ${target}`, '');
    for (const it of list) {
      lines.push(
        `- \`${it.relFile}:${it.line}\` — currently \`${it.from}\`${
          it.props?.length ? ` (props: ${it.props.join(', ')})` : ''
        }`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
