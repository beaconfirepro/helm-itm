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

## Safe usage — it writes to your source

When you use the governance / color / spacing / token / variant controls (or the
`apply` / `approve` CLIs), this addon **edits your source files**. Treat it like
any code-mod tool: **always work on a fresh branch from a clean tree.**

- **Clean tree** — before you start, `git status` shows no uncommitted changes
  (everything matches your last commit). Nothing in flight to get tangled up.
- **Fresh branch** — make a new branch off your base first
  (`git checkout -b design-edits`). Every edit lands there, never on `main`.

That gives you three guarantees: you can **see** exactly what changed
(`git diff`), **undo** anything instantly (`git restore <file>`), and **never
touch `main`** until you review and merge a PR. Every edit becomes a reviewable,
revertible diff — a sandbox with an undo button.

```bash
git checkout -b design-edits     # fresh branch
git status                       # clean tree (verify "nothing to commit")
npm run storybook                # edit in the Instances panel
git diff                         # review what it wrote — every time
git add -p && git commit         # commit deliberately
git push -u origin design-edits  # open a PR; never push to main
```

Gitignore the generated files: `*.auto.stories.*`, `auto-theme.css`,
`auto-tailwind.*`.

Handle the broad actions with extra care (review their diffs closely):
**Approve & align** and `conformance:apply` (repo-wide import codemod),
**managed-prop edits** (rewrite every instance), and **set color** (a global hex
find/replace).

**Working on a repo you don't have locally?** Open it in a **GitHub Codespace**
and run the same loop there — the Codespace has the repo, Node, and a forwarded
port, so the editing works in the cloud and your commits/PRs come straight from it.

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
| `tailwind` | boolean | `false` | Auto-wire Tailwind v4 — inject `@tailwindcss/vite` and load `tailwindcss` + the generated token theme into the preview. See [Zero-config Tailwind](#zero-config-tailwind-optional). |
| `titlePrefix` | string | `'Auto'` | Sidebar group for generated stories. |
| `optOutComment` | string | `'@storybook-auto-detect: off'` | A file containing this comment is skipped. |
| `maxStoriesPerComponent` | number | `12` | Safety cap on generated stories per component. |
| `debug` | boolean | `false` | Verbose discovery/generation logging. |

## Zero-config Tailwind (optional)

The token / color / spacing editors need Tailwind v4. Normally the host repo owns
that wiring (the addon just generates the `@theme` token sheet). To skip the
setup entirely, set `tailwind: true`:

```js
{
  name: 'storybook-addon-auto-detect',
  options: { framework: 'react', scanDirs: ['src/components'], tailwind: true },
}
```

With it on, the addon:

- injects the `@tailwindcss/vite` plugin into Storybook's Vite config, and
- adds a preview entry that imports `tailwindcss` + the generated token theme,

so you don't author any CSS or touch `viteFinal`. Install the (optional) peers
once: `npm i -D tailwindcss @tailwindcss/vite`.

Guarded both ways: if your repo **already** wired Tailwind, the addon detects it
and stays out (never double-injects); if the packages aren't installed it warns
and no-ops instead of breaking the build. It generates two files next to your
theme output — add them to `.gitignore`:

```
auto-tailwind.css
auto-tailwind-preview.js
```

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
