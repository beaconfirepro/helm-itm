# storybook-addon-auto-detect

Automatically detect components in your codebase and generate Storybook stories
for them — no manual `.stories.*` files required.

The addon scans your source directories, extracts prop definitions (TypeScript
types, PropTypes, JSDoc), synthesizes sensible sample values, and produces CSF3
stories with variants. Stories can be injected **in memory** (nothing written
to disk) or written out as **real story files**.

> Status: React is fully supported today. The architecture is adapter-based, so
> Vue / Svelte / Angular / Web Components can be added by implementing one
> adapter module (see [Extending](#extending-to-other-frameworks)).

## Install

```bash
npm install --save-dev storybook-addon-auto-detect
```

## Usage

Register it in `.storybook/main.js`:

```js
const config = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'], // your manual stories
  addons: [
    {
      name: 'storybook-addon-auto-detect',
      options: {
        framework: 'react',          // or 'auto' to detect from package.json
        scanDirs: ['src/components'],
        outputMode: 'memory',        // 'memory' | 'filesystem'
        variantStrategy: 'primary',  // 'primary' | 'combinations'
      },
    },
  ],
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
```

Start Storybook. Discovered components appear under the **Auto/** sidebar group,
each with a `Default` story plus variants, tagged `auto-detected`.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master on/off switch. |
| `framework` | string | `'auto'` | `react` \| `vue` \| `svelte` \| `angular` \| `web-components` \| `auto`. `auto` detects from installed dependencies. |
| `scanDirs` | string[] | `['src/components']` | Directories to scan, relative to project root. |
| `excludeDirs` | string[] | `['node_modules','dist','.next','build','coverage','storybook-static']` | Directory names to skip while walking. |
| `propDefaults` | object | `{}` | Override generated sample values per type, e.g. `{ string: 'Hello', number: 42 }`. |
| `variantStrategy` | string | `'primary'` | `primary` = one story per enum value + boolean toggles. `combinations` = cartesian product (bounded). |
| `outputMode` | string | `'memory'` | `memory` = inject virtual stories; `filesystem` = write `*.auto.stories.*` files. |
| `titlePrefix` | string | `'Auto'` | Sidebar group for generated stories. |
| `optOutComment` | string | `'@storybook-auto-detect: off'` | A file containing this comment is skipped. |
| `maxStoriesPerComponent` | number | `12` | Safety cap on generated stories per component. |
| `debug` | boolean | `false` | Verbose discovery/generation logging. |

## How it works

```
.storybook/main.js (options)
        │
        ▼
   preset.js ──► config validation + framework resolution
        │
        ▼
   scanner ──► walks scanDirs, applies excludes + opt-out comments
        │
        ▼
   adapter.parse (react-docgen) ──► ComponentInfo { props, exports, … }
        │
        ▼
   generator ──► story plan { Default + variants } with sample args
        │
        ├─ memory mode ──► experimental_indexers inject entries
        │                  + Vite virtual module serves generated CSF
        │
        └─ filesystem mode ──► writes *.auto.stories.<ext> next to components
```

### Output modes

- **memory** (default): a Storybook indexer emits index entries that point at
  virtual module ids (`Button.tsx?storybook-auto=Button`); a Vite plugin
  materializes generated CSF for those ids. Nothing is written to your source
  tree.
- **filesystem**: generates `Component.auto.stories.<ext>` next to each
  component. These carry a banner and use the `.auto.stories.` suffix, so they
  never collide with hand-written `.stories.` files and are safe to gitignore.

### Coexistence with manual stories

If a component already has a sibling `Component.stories.*` (or `.story.*`), the
addon leaves it alone in both modes and only auto-generates for components that
lack one. Auto and manual stories live side by side in the sidebar.

### Prop analysis

Backed by [`react-docgen`](https://github.com/reactjs/react-docgen), which reads:

- **TypeScript** interfaces/types — including required vs optional and string/
  number literal unions (turned into enum variants).
- **PropTypes** — including `oneOf([...])` (enum variants) and `isRequired`.
- **JSDoc** — descriptions on props and components.

Sample values are synthesized per type bucket (`string`, `number`, `boolean`,
`enum`, `func`, `array`, `object`, `node`, `unknown`) and can be overridden via
`propDefaults`.

### Edge cases handled

- Components with no props → a single empty `Default` story.
- Complex/union types → falls back to a safe value; required-only props fill
  the `Default` story.
- Circular imports / side-effectful modules → parsing is static (AST only), so
  modules are never executed.
- Parse failures on a single file are logged and skipped; the scan continues.

## Extending to other frameworks

Implement the adapter shape documented in
[`src/adapters/registry.js`](./src/adapters/registry.js) and register it:

```js
import { registerAdapter } from 'storybook-addon-auto-detect';

registerAdapter({
  name: 'vue',
  fileExtensions: ['vue'],
  storyExtension: 'js',
  matches: (deps) => Boolean(deps.vue),
  isComponentFile: (filePath) => filePath.endsWith('.vue'),
  parse: (filePath, source) => [/* ComponentInfo[] */],
  generateStoryCode: (component, ctx) => `/* CSF for Vue */`,
});
```

The scanner, generator, output modes, and preset wiring are all
framework-agnostic and reuse your adapter automatically.

## Programmatic API

```js
import {
  validateOptions, scanComponents, reactAdapter,
  buildStoryPlan, generateComponentStory,
} from 'storybook-addon-auto-detect';
```

Useful for scripts, tests, or custom tooling. See
[`test/pipeline.test.js`](./test/pipeline.test.js) for examples.

## License

MIT
