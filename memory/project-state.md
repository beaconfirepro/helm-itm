---
name: project-state
description: What the outliner/ project is and where it stands — the storybook-addon-auto-detect build
metadata:
  type: project
---

`outliner/` is an npm-workspace with `addon/` (**storybook-addon-auto-detect**) + `demo/` (React 19 + Storybook 10 + Tailwind v4). The addon is a **governance / conformance / design-token layer on top of Storybook** — it does NOT replace the team's story authoring; auto-detect runs to catch components and surface them.

**Full handoff lives in `HANDOFF.md` at the repo root** — read it first next session. It has the architecture, file map, what's built/verified, the demo's current (intentional) experiment state, and the open next-steps (spacing/layout parameterization + "tokenize this").

**Now two tools:** `addon/` (the governance addon) **and** `tools/workbench/` — a standalone visual editor (real Storybook in an iframe + a code editor that writes back; tiny Vite app + `/__save` middleware). The workbench is what got used on **beaconfirepro/beacon-platform** (private pnpm monorepo, `packages/design-system` = shadcn + Tailwind v4 + style-dictionary tokens, Storybook 10). Pushed to GitHub at **beaconfirepro/outliner** (public). beacon-platform usage doc = PR #357 (`packages/design-system/WORKBENCH.md`). Key lesson: the addon's standalone render can't compose shadcn components (most are compositional pieces) — Storybook (via stories) is what renders them right, so the workbench embeds real Storybook. Repo also has a GitHub Actions CI (tests) + Vercel config (static demo catalog).

Durable facts that bite if forgotten:
- **Headless preview reports a 0×0 viewport** — can't screenshot or truly click. Verify via `npm run test:addon` (53 tests), channel round-trips (`window.__STORYBOOK_ADDONS_CHANNEL__`), computed styles, and generated-file inspection. Always end with a manual-test list per [[workflow-preferences]].
- **freeze-on-edit was removed** — generated `.auto.stories.*` always regenerate (the hash freeze kept misfiring during dev churn). Don't reintroduce it.
- Generated + gitignored: `*.auto.stories.*`, `auto-theme.css`, `tokens.auto.stories.jsx`.
- Story ids are **stable** (`auto-<component>`) so status changes don't break URLs; the sidebar group comes from the title.
- Run: `cd demo && npm run storybook` (port 6107). The user often runs their own server — don't fight it for port 6107.
