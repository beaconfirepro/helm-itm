/**
 * Story generation (framework-agnostic).
 *
 * Turns a ComponentInfo into a "story plan" — a list of { name, args } — by
 * synthesizing sample prop values and expanding variants per the configured
 * strategy. The adapter then renders the plan into framework-specific source.
 */

import { logger } from './logger.js';
import { STATUS_GROUP } from './governance.js';
import { stableMetaId } from './naming.js';

/**
 * Produce the full story source for one component.
 * @param {import('./adapters/registry.js').Adapter} adapter
 * @param {import('./adapters/registry.js').ComponentInfo} component
 * @param {object} options  Validated addon options.
 * @param {{ importSpecifier: string, status?: string, group?: string, drifted?: boolean, instances?: any[] }} ctx
 */
export function generateComponentStory(adapter, component, options, ctx) {
  const status = ctx.status || 'surfaced';
  const plan = buildStoryPlan(component, options, { group: ctx.group, status });
  const tags = ['auto-detected', 'autodocs', `status:${status}`];
  if (ctx.drifted) tags.push('drifted');
  const code = adapter.generateStoryCode(component, {
    importSpecifier: ctx.importSpecifier,
    title: plan.title,
    metaId: stableMetaId(component.name),
    tags,
    stories: plan.stories,
    parameters: {
      autoDetect: {
        status,
        drifted: Boolean(ctx.drifted),
        component: component.name,
        file: component.filePath,
        propCount: component.props.length,
        instances: ctx.instances || [],
        conformance: ctx.conformance || { role: 'clean' },
        fixOutside: Boolean(ctx.fixOutside),
        managed: ctx.managed || [],
        allProps: ctx.allProps || [],
        variantConfig: ctx.variantConfig || null,
        colors: ctx.colors || [],
        spacing: ctx.spacing || [],
        tokens: ctx.tokens || {},
        spacingTokens: ctx.spacingTokens || {},
      },
    },
  });
  logger.debug(`generated ${plan.stories.length} story(ies) for <${component.name}>`);
  return code;
}

export function buildStoryPlan(component, options, ctx = {}) {
  const status = ctx.status || 'surfaced';
  // `group` is the resolved sidebar label (accounts for drift); fall back to
  // the raw status mapping when not provided.
  const group = ctx.group || STATUS_GROUP[status] || STATUS_GROUP.surfaced;
  const title = options.governanceEnabled
    ? `${group}/${component.name}`
    : `${options.titlePrefix}/${component.name}`;
  const required = component.props.filter((p) => p.required);
  const baseArgs = argsFromProps(required, options);

  const stories = [{ name: 'Default', args: baseArgs }];

  if (options.variantStrategy === 'combinations') {
    addCombinationStories(stories, component, baseArgs, options);
  } else {
    addPrimaryStories(stories, component, baseArgs, options);
  }

  // Enforce the safety cap (Default always survives).
  if (stories.length > options.maxStoriesPerComponent) {
    stories.length = options.maxStoriesPerComponent;
  }
  return { title, stories };
}

// ---------------------------------------------------------------------------
// Variant strategies
// ---------------------------------------------------------------------------

function addPrimaryStories(stories, component, baseArgs, options) {
  // One story per enum value, and a "toggled-on" story per boolean prop.
  for (const prop of component.props) {
    if (prop.tsType === 'enum' && prop.enumValues?.length) {
      for (const value of prop.enumValues) {
        stories.push({
          name: `${capitalize(prop.name)} ${capitalize(String(value))}`,
          args: { ...baseArgs, [prop.name]: value },
        });
      }
    } else if (prop.tsType === 'boolean') {
      stories.push({
        name: capitalize(prop.name),
        args: { ...baseArgs, [prop.name]: true },
      });
    }
  }
}

function addCombinationStories(stories, component, baseArgs, options) {
  // Cartesian product across enumerable props (enums + booleans).
  const axes = component.props
    .map((prop) => {
      if (prop.tsType === 'enum' && prop.enumValues?.length) {
        return { prop, values: prop.enumValues };
      }
      if (prop.tsType === 'boolean') {
        return { prop, values: [false, true] };
      }
      return null;
    })
    .filter(Boolean);

  if (!axes.length) return;

  let combos = [{}];
  for (const axis of axes) {
    const next = [];
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push({ ...combo, [axis.prop.name]: value });
      }
    }
    combos = next;
    if (combos.length > options.maxStoriesPerComponent) break;
  }

  for (const combo of combos) {
    const label = Object.entries(combo)
      .map(([k, v]) => `${capitalize(k)}${capitalize(String(v))}`)
      .join('');
    stories.push({ name: label || 'Variant', args: { ...baseArgs, ...combo } });
  }
}

// ---------------------------------------------------------------------------
// Sample value synthesis
// ---------------------------------------------------------------------------

function argsFromProps(props, options) {
  const args = {};
  for (const prop of props) {
    const value = sampleValue(prop, options);
    if (value !== undefined) args[prop.name] = value;
  }
  return args;
}

function sampleValue(prop, options) {
  const overrides = options.propDefaults || {};

  switch (prop.tsType) {
    case 'string':
      return overrides.string ?? humanize(prop.name);
    case 'number':
      return overrides.number ?? 1;
    case 'boolean':
      return overrides.boolean ?? false;
    case 'enum':
      return prop.enumValues?.[0];
    case 'func':
      return { __fn: true }; // rendered as () => {}
    case 'array':
      return overrides.array ?? [];
    case 'object':
      return overrides.object ?? {};
    case 'node':
      return overrides.node ?? nodeContent(prop.name);
    default:
      // Unknown/complex types: only fill when required, with a safe string.
      return prop.required ? (overrides.string ?? humanize(prop.name)) : undefined;
  }
}

function nodeContent(name) {
  if (/children/i.test(name)) return 'Content';
  return humanize(name);
}

/** Turn a prop name into a readable sample string, e.g. "buttonLabel" -> "Button Label". */
function humanize(name) {
  const words = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Text';
}

function capitalize(value) {
  const str = String(value);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
