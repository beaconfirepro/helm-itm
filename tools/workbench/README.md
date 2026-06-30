# Workbench — see your components and edit their code in one window

A tiny, dependency-light tool that puts **your real Storybook** (rendering every
component correctly) next to a **code editor** that writes straight back to your
source files. Edit a component or a token, hit **Save**, and the Storybook frame
hot-reloads. Then commit / open a PR like any code change.

It does **not** replace Storybook — it *uses* Storybook for rendering (so
composition is always right) and adds the edit-and-save loop beside it.

```
┌──────────────────────────┬───────────────────────┐
│  your Storybook (iframe) │  code editor          │
│  — renders components     │  — pick a file        │
│    correctly, with        │  — edit               │
│    controls/docs          │  — Save → file write  │
│                           │    → Storybook reloads │
└──────────────────────────┴───────────────────────┘
```

## Prerequisites

- The package you point it at already has **Storybook on Vite** (e.g.
  `@beacon/design-system`).
- Node + your package manager (pnpm/npm).

## Install (per checkout)

From the package that owns the components (e.g. `packages/design-system`):

```bash
git clone https://github.com/beaconfirepro/outliner /tmp/wb-src
cp -r /tmp/wb-src/tools/workbench ./workbench
npm i -D @vitejs/plugin-react      # or: pnpm add -D @vitejs/plugin-react
```

> Don't commit the `workbench/` folder — it's tooling, not product code.
> Gitignore it if you like.

## Run (two terminals)

**1 — Storybook:**
```bash
npm run storybook                  # http://localhost:6006
```
In a Codespace: Ports tab → set port **6006** to **Public** so the workbench can
embed it in the frame.

**2 — the workbench:**
```bash
npx vite --config workbench/vite.config.mjs --port 6007
```
Open port **6007**. In the **Storybook** field, paste your forwarded 6006 URL
(Codespace) or use `http://localhost:6006` (local), click **Load**.

## Use

1. Browse to a component in the Storybook frame (left).
2. Pick its file in the editor (right) — components, tokens, CSS, whatever.
3. Edit → **Save** (or Ctrl/Cmd+S).
4. The Storybook frame hot-reloads with your change.
5. `git diff`, commit, open a PR.

## How it works

- The workbench is a small Vite app. A dev-server middleware exposes three
  endpoints — `/__list`, `/__file`, `/__save` — that read/write files **confined
  to the package directory** (it can't touch anything outside it).
- The left frame is an `<iframe>` of your running Storybook; it renders the real
  components from the real source.
- **Save** writes the file on disk. Storybook's own dev server is already
  watching those files, so it hot-reloads — exactly as if you'd edited in your
  editor.
- No lock-in, no generated artifacts: it edits your real `.tsx` / token files.

## Options

`vite.config.mjs` reads:
- positional arg / default scan is the **package root** (parent of `workbench/`).
- `--port <n>` — the workbench port (default 6007; or `PORT` env).

## Safety

- Work on a **branch** from a **clean tree** — every change is then a reviewable,
  revertible diff. The workbench writes real source files.
- Writes are **path-confined** to the package.
- Review `git diff` before committing.

## Tokens

If your tokens live in a style-dictionary source (e.g.
`src/tokens/helm.tokens.json` → `src/generated/tokens.css`), edit the source file
in the workbench, then run your token build (`npm run tokens`) to regenerate the
CSS; the Storybook frame reflects the new values.
