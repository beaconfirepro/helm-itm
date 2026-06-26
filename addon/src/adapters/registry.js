/**
 * Framework adapter registry.
 *
 * An adapter encapsulates everything framework-specific. Adding Vue/Svelte/
 * Angular/Web Components support means implementing one more object with this
 * shape and registering it here — nothing else in the addon needs to change.
 *
 * @typedef {Object} PropInfo
 * @property {string}   name
 * @property {boolean}  required
 * @property {string}   tsType        Coarse type bucket: 'string' | 'number' |
 *                                     'boolean' | 'enum' | 'func' | 'array' |
 *                                     'object' | 'node' | 'unknown'
 * @property {string=}  rawType       Original type string, for reference.
 * @property {string=}  description
 * @property {string|number|boolean=} defaultValue  Declared default, if any.
 * @property {Array<string|number>=}  enumValues    Literal options (for 'enum').
 *
 * @typedef {Object} ComponentInfo
 * @property {string}      name         Display name of the component.
 * @property {string}      exportName   Export to import ('default' or named).
 * @property {boolean}     isDefaultExport
 * @property {string}      filePath     Absolute path to the source file.
 * @property {PropInfo[]}  props
 * @property {string=}     description
 *
 * @typedef {Object} Adapter
 * @property {string}   name
 * @property {(deps: Record<string,string>) => boolean} matches  For auto-detect.
 * @property {string[]} fileExtensions   e.g. ['jsx','tsx'] (no dot).
 * @property {string}   storyExtension   Extension for generated story files.
 * @property {(filePath: string, source: string) => boolean} isComponentFile
 * @property {(filePath: string, source: string, options: object) => ComponentInfo[]} parse
 * @property {(component: ComponentInfo, ctx: object) => string} generateStoryCode
 */

import { reactAdapter } from './react.js';

const REGISTRY = new Map();

export function registerAdapter(adapter) {
  REGISTRY.set(adapter.name, adapter);
}

registerAdapter(reactAdapter);

export function getAdapter(framework) {
  return REGISTRY.get(framework) ?? null;
}

export function listAdapters() {
  return [...REGISTRY.keys()];
}
