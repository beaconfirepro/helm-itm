# HANDOFF — storybook-addon-auto-detect

A Storybook addon that turns Storybook into a **design-system control plane**:
auto-detects components, governs them (surfaced → approved), audits the codebase
against approved canonicals, and edits components/tokens **from the Storybook UI**
(writing back to source). `outliner/` is an npm workspace: `addon/` (the addon) +
`demo/` (React 19 + Storybook 10 + Tailwind v4 demo that exercises everything).

> The addon is a **layer on top** of the team's own Storybook setup — it doesn't
> author their stories. Auto-detect runs continuously to catch components.

## Run / test

```bash
# from repo root
npm install
npm run test:addon                 # 53 unit tests (node --test)
cd demo && npm run storybook       # http://localhost:6107  (user often runs this themselves)

# CLIs (from demo/)
npm run conformance:audit          # delta vs approved canonicals
npm run conformance:apply          # align the alignable (repoint imports)
npm run governance approve <C>     # promote a component
npm run design-review              # review brief (+ PR in a git repo)
```

## Two tools in this repo

1. **`addon/`** — `storybook-addon-auto-detect`: the governance/conformance/
   token-editing Storybook addon (everything below). Best fit for inline-style
   component libraries; on a Tailwind/shadcn system most of its visual editors
   don't apply (no inline values), though the **DTCG token source** (`tokensFile`)
   wires its token editor to a team's style-dictionary tokens.
2. **`tools/workbench/`** — a standalone **visual editor** (no Storybook addon,
   no governance). One window: the team's **real Storybook in an iframe** (left)
   + a **code editor** (right) whose **Save** writes back to source; Storybook
   hot-reloads. Tiny Vite app + a `/__list`/`/__file`/`/__save` middleware
   (path-confined). See `tools/workbench/README.md`. This is where the
   beacon-platform work landed (see below) — it renders shadcn components
   correctly because Storybook composes them, which the addon's standalone
   render couldn't.

## beacon-platform (real-world consumer — private repo)

`beaconfirepro/beacon-platform`, pnpm monorepo, `packages/design-system`
(`@beacon/design-system`, shadcn + Radix + Tailwind v4 + style-dictionary tokens
in `src/tokens/helm.tokens.json` → `src/generated/tokens.css`). Storybook 10.
The **workbench** is the tool used there. Usage doc shipped as
[beacon-platform#357](https://github.com/beaconfirepro/beacon-platform/pull/357)
(`packages/design-system/WORKBENCH.md`). Run = two terminals (`pnpm storybook`
on 6006 set Public + `npx vite --config workbench/vite.config.mjs --port 6007`),
paste the forwarded Storybook URL into the workbench, edit + Save → Storybook
reloads. The addon's DTCG token adapter (`tokensFile: src/tokens/helm.tokens.json`,
`tokensCss: src/generated/tokens.css`, `tokensCssPrefix: --ds-`) also works there
but the workbench is the chosen path.

## Architecture (adapter pattern, like the original auto-detect)

- **`addon/preset.js`** — Storybook wiring: `viteFinal` (filesystem generation +
  token stylesheet + tokens story), `experimental_indexers` (manual-story
  re-grouping + memory-mode injection), `stories`, **`experimental_serverChannel`**
  (the manager→Node bridge — all UI actions), `managerEntries` is via the
  package `./manager` export.
- **`addon/manager.jsx`** — the **Instances panel** (per story) + a toolbar
  **↻ Auto-detect** rerun tool. Sections: Conformance, action buttons, Colors,
  Design tokens, Managed properties, Properties (mark managed), Variants
  (cva/tv), Instances (click → open in editor).
- **`addon/src/`** — `scanner` (react-docgen), `adapters/react`, `generator`,
  `filesystem`/`virtual` (output modes), `governance` (manifest + statuses +
  drift), `conformance` (audit), `apply` (codemod), `actions` (all server-side
  bridge actions), `variant-config` (cva/tv read/write via Babel), `colors`
  (hardcoded hex), `tokens` (tokens.json → `@theme` CSS + the Tokens story),
  `naming` (`stableMetaId`), `manual-indexer`, `audit-runner`.
- **`addon/bin/`** — `governance`, `audit`, `apply`, `design-review` CLIs.

## Capabilities (all built + verified)

1. **Discovery + auto-stories** — filesystem mode (default) writes
   `*.auto.stories.*`; memory mode injects virtual stories. Stable ids
   (`auto-<component>`) so status changes never break URLs.
2. **Governance** — `.storybook/auto-detect.manifest.json`; statuses
   Surfaced / In Review / Approved; **drift** → "Needs Re-review" when an
   approved component's source changes. Sidebar groups by status (title).
3. **Conformance audit** runs **on Storybook startup** (and via CLI): maps
   variant components → approved canonicals (name-similarity + `aliases`),
   lists non-conforming instances; `rework` bucket → agent brief.
4. **Apply from the UI** — **Approve & align** (proliferate to all instances),
   **Fix outside Storybook** (badge → agents), all over the bridge.
5. **Managed properties** — mark via the Properties toggle (writes
   `conformance.json`); edit enum **and boolean** values → updates the library
   default + propagates to instances (scoped to the component's own tags).
6. **Anti-component (shadcn cva / Untitled UI tv)** — read the variant config;
   **add a value or a whole new property** from the UI (the prop + type come
   free from `VariantProps`/`tv`).
7. **Colors** — per-component editor for **hardcoded hex** (Button's `#2563eb`);
   edits rewrite the source, recolor live.
8. **Design tokens** — `.storybook/tokens.json` → generated Tailwind v4
   `@theme` (`src/auto-theme.css`); a **Design System/Tokens** story is a full
   editor (swatches, color pickers, add/remove); `get-tokens` keeps it live;
   edits recolor via Tailwind HMR.
9. **Rerun** (toolbar + panel) — re-scan/re-audit/regenerate + reload, so
   approve→regroup etc. show without a manual restart.
10. **Spacing/layout** — per-component editor for **hardcoded spacing** in style
    objects (`padding`, `margin`+sides, `gap`/`rowGap`/`columnGap`,
    `borderRadius`, `fontSize`). Detection is **property-scoped via Babel**
    (`addon/src/spacing.js`) — `padding: 16` is caught, a bare `16` or
    `maxWidth: 320` is not. Edit a value (rewrites every occurrence of that
    property/value) or **Tokenize** it: the value is promoted into
    `tokens.json` under `spacing`, the `--spacing-*` `@theme` sheet regenerates,
    and the source is repointed at `var(--spacing-…)` — off-scale literal →
    governed token. v1 scope = style-object property keys; size-keyed record
    maps (Button's `PADDING = { sm: '4px 10px' }`) are deferred.

## Bridge events (`auto-detect/*` on the Storybook channel → Node handlers in preset)

`approve`, `fix-outside`, `set-prop`, `set-managed`, `add-variant`, `set-color`,
`set-spacing`, `tokenize-spacing`, `set-token`, `get-tokens`, `open`, `rerun` →
reply on `auto-detect/result` (and `auto-detect/tokens` for get-tokens). Verified
live by emitting on `window.__STORYBOOK_ADDONS_CHANNEL__` and checking files /
computed styles.

## Demo's current state (USER experiments — intentional, do NOT revert)

- `tokens.json`: brand-600 `#7c3aed`, brand-100 `#ede9fe`, **`uglier` `#57871d`**.
- `conformance.json` managed: Button [variant,size], Card [elevated], **Badge [tone]**.
- **Badge is approved** (so it's under `Approved/Badge`, id `auto-badge--*`) and its
  warning tone color was edited to `#a75716`.

## Constraints / gotchas

- **Headless preview = 0×0 viewport.** Can't screenshot or truly click. Verify via
  unit tests, channel round-trips, `getComputedStyle`, and generated-file checks —
  then hand the user a **manual-test list** for the visual/interactive bits.
- **freeze-on-edit removed** — generated stories always regenerate (the hash freeze
  kept misfiring). Don't reintroduce.
- Manager-side changes need a **browser reload**; story/source changes are HMR.
  The manual Spinner story's stable id needs a **server restart** (server-side indexer).
- Tailwind is wired in the demo only (team-owned setup); the addon just generates
  the `@theme` token sheet.

## Open threads / next steps (in priority order)

1. ✅ **DONE — Spacing/layout parameterization + "tokenize this" (spacing).**
   `addon/src/spacing.js` (Babel, property-scoped) + `setSpacing`/`tokenizeSpacing`
   actions + panel "Spacing & layout" / "Spacing tokens" sections + `set-spacing` /
   `tokenize-spacing` bridge events. Spacing tokens land in `tokens.json`'s
   `spacing` map → `--spacing-*` in the `@theme` sheet. (Capability #10.)
   Still open: **tokenize hardcoded hex** (promote a Colors value into a color
   token) — the spacing half is done, the color half isn't yet. And the
   audit-driven "this value is off-scale → tokenize" suggestion (currently the
   panel offers tokenize for *every* detected value, not just flagged ones).
2. **Global conformance dashboard** — a page summarizing all non-conformance, not
   just per-story.
3. Optional: swatch rendering for enum color variants; MUI/CSS-var token adapters
   (currently Tailwind v4 only); size-keyed record maps in spacing detection
   (Button's `PADDING = { sm: '4px 10px' }`).
