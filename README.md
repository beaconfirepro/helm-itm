# Storybook Auto-Detect — workspace

A working prototype of **`storybook-addon-auto-detect`** plus a **React demo
app** that shows it auto-generating Storybook stories from components, with no
manual `.stories.*` files.

```
outliner/
├── addon/   storybook-addon-auto-detect — the addon (preset, scanner,
│            prop extractor, generator, both output modes, tests)
└── demo/    React + Vite + Storybook 10 app whose components are auto-detected
```

## Quick start

```bash
npm install            # install both workspaces
npm run storybook      # launch the demo Storybook on :6006
```

Open http://localhost:6006. You'll see an **Auto/** sidebar group populated
entirely by the addon (Button, Badge, Card, Avatar), alongside a hand-written
**Components/Spinner** story to prove auto + manual coexist.

Other scripts:

```bash
npm run build-storybook   # headless build (also a good smoke test)
npm run test:addon        # fast pipeline unit tests (no Storybook needed)
```

## What the demo demonstrates

| Component | Exercises |
| --- | --- |
| `Button.tsx` | TypeScript props, required vs optional, **string-literal union enums** (`variant`, `size`), boolean, function prop. |
| `Badge.tsx` | **PropTypes** extraction incl. `oneOf` enums; **named export** → named import. |
| `Card.tsx` | JSDoc descriptions; `children` (**node**) handling; boolean variant. |
| `Avatar.tsx` | **No-props** edge case → single empty `Default` story. |
| `Spinner.tsx` + `Spinner.stories.tsx` | **Coexistence**: a manual story exists, so the addon skips it. |
| `utils/format.ts` | **Exclusion**: a non-component module yields nothing. |

Verified built index (memory mode, `variantStrategy: 'primary'`):

```
Auto/Avatar    Default
Auto/Badge     Default, Tone Neutral, Tone Success, Tone Warning
Auto/Button    Default, Variant Primary/Secondary/Danger, Size Sm/Md/Lg, Disabled
Auto/Card      Default, Elevated
Components/Spinner  Small, Large        (hand-written, untouched)
```

## Configuration

All addon options live in [`demo/.storybook/main.js`](demo/.storybook/main.js).
Switch `outputMode` to `'filesystem'` to write `*.auto.stories.*` files instead
of injecting them, or `variantStrategy` to `'combinations'` for cartesian
variants. Full reference: [`addon/README.md`](addon/README.md).

## Design notes

- **Adapter architecture** — everything framework-specific lives behind an
  adapter interface (`addon/src/adapters/`). React is implemented; Vue/Svelte/
  Angular/Web Components are a matter of adding one adapter each.
- **Two output modes** — in-memory injection via a Storybook indexer + a Vite
  virtual-module plugin, or on-disk generation. Both are exercised and tested.
- **Static parsing** — prop extraction uses `react-docgen` (AST only, never
  executes modules), so circular deps and side effects are safe.
- **Non-destructive** — auto stories never overwrite hand-written ones;
  components that already have a story are skipped.
