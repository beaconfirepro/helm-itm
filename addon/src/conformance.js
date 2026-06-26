/**
 * Conformance engine — the "delta vs. spec" brain.
 *
 * The approved canonical components ARE the spec. This module diffs the repo
 * against that spec: it maps rogue/variant components (e.g. a hand-rolled
 * `LegacyButton`) onto the approved canonical they should be (`Button`), then
 * lists every instance (usage site) that therefore doesn't conform.
 *
 * It makes no code changes — it only produces findings. The applier acts on
 * them; agents handle the ones that aren't mechanically alignable.
 */

/**
 * Decide which non-canonical components are *variants* of an approved canonical.
 *
 * Two sources, explicit wins:
 *  - explicit `aliases` map: { Canonical: ['Variant1', ...] }
 *  - name similarity: a component whose name contains a canonical's name
 *    (LegacyButton, PrimaryButton, ButtonOld → Button), minus a `deny` list.
 *
 * @returns {Map<string,string>} variantName -> canonicalName
 */
export function deriveMappings(canonicalNames, components, { aliases = {}, deny = [] } = {}) {
  const canonSet = new Set(canonicalNames);
  const mapping = new Map();

  for (const [canon, variants] of Object.entries(aliases)) {
    for (const v of variants) if (v !== canon) mapping.set(v, canon);
  }

  for (const comp of components) {
    const name = comp.name;
    if (canonSet.has(name) || mapping.has(name) || deny.includes(name)) continue;
    for (const canon of canonicalNames) {
      if (name !== canon && name.toLowerCase().includes(canon.toLowerCase())) {
        mapping.set(name, canon);
        break;
      }
    }
  }
  return mapping;
}

/**
 * @param {object} args
 * @param {string[]} args.canonicalNames  Approved canonical component names (the spec).
 * @param {object[]} args.components       All discovered components (ComponentInfo[]).
 * @param {Record<string, any[]>} args.instances  scanInstances() output, keyed by component name.
 * @param {object} [args.conformance]      { aliases, deny }
 * @returns {{ mappings: Record<string,string>, findings: object[], summary: object }}
 */
export function auditConformance({ canonicalNames, components, instances, conformance = {} }) {
  const rework = conformance.rework || {};
  const reworkNames = Object.keys(rework);

  // Alignable = mechanical repoint. Exclude anything explicitly marked rework.
  const mapping = deriveMappings(canonicalNames, components, {
    aliases: conformance.aliases,
    deny: [...(conformance.deny || []), ...reworkNames],
  });

  const usagesOf = (variant, to, alignable) =>
    (instances[variant] || []).map((u) => ({
      from: variant,
      to,
      file: u.file,
      relFile: u.relFile,
      line: u.line,
      props: u.props,
      alignable,
    }));

  const findings = [];
  for (const [variant, canon] of mapping) findings.push(...usagesOf(variant, canon, true));

  // Rework = the architect says these need real changes, not a repoint.
  const reworkFindings = [];
  for (const [variant, target] of Object.entries(rework)) {
    reworkFindings.push(...usagesOf(variant, target, false));
  }

  return {
    mappings: Object.fromEntries(mapping),
    findings,
    reworkFindings,
    summary: {
      variants: mapping.size,
      instances: findings.length,
      files: new Set(findings.map((f) => f.relFile)).size,
      rework: reworkFindings.length,
    },
  };
}

/**
 * Roll an audit up into a per-component summary the panel can read off each
 * story's parameters. Each component gets a role:
 *   - 'canonical' : approved, and other components should align to it.
 *   - 'variant'   : non-conforming, should align to a canonical.
 *   - 'rework'    : flagged for real code changes (agent bucket).
 *   - 'clean'     : (default, omitted here) conforms / nothing to do.
 *
 * @returns {Record<string, object>} componentName -> summary
 */
export function summarizeByComponent(audit) {
  const byComp = {};
  const counts = (arr) =>
    (arr || []).reduce((m, f) => ((m[f.from] = (m[f.from] || 0) + 1), m), {});

  const variantCounts = counts(audit.findings);
  for (const [variant, canon] of Object.entries(audit.mappings || {})) {
    byComp[variant] = { role: 'variant', alignsTo: canon, instances: variantCounts[variant] || 0 };
    if (!byComp[canon] || byComp[canon].role !== 'canonical') {
      byComp[canon] = { role: 'canonical', alignsFrom: [], totalNonConforming: 0 };
    }
    byComp[canon].alignsFrom.push({ variant, instances: variantCounts[variant] || 0 });
    byComp[canon].totalNonConforming += variantCounts[variant] || 0;
  }

  const reworkCounts = counts(audit.reworkFindings);
  for (const variant of Object.keys(reworkCounts)) {
    const target = (audit.reworkFindings.find((f) => f.from === variant) || {}).to;
    byComp[variant] = { role: 'rework', target, instances: reworkCounts[variant] };
  }

  return byComp;
}

/**
 * Build the import descriptor for each canonical so the applier knows how to
 * write `import X from '...'`.
 * @returns {Record<string,{file:string, default:boolean, name:string}>}
 */
export function canonicalImports(canonicalNames, components) {
  const out = {};
  for (const name of canonicalNames) {
    const comp = components.find((c) => c.name === name);
    if (comp) out[name] = { file: comp.filePath, default: comp.isDefaultExport, name };
  }
  return out;
}
