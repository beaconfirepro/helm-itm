# Running / deploying storybook-addon-auto-detect

This addon turns Storybook into a design-system **control plane that edits your
source** (colors, spacing, tokens, variants, governance — written back to files).
That write-back is the whole point, and it dictates how you "deploy" it.

## The one fact that decides everything

Write-back works through a Storybook **manager → Node bridge**
(`experimental_serverChannel`). That bridge only exists while a **Node process is
running** (`storybook dev`) with your **repo checked out on disk**.

| You run… | Editing / write-back | Use it for |
| --- | --- | --- |
| `storybook dev` (live server) | ✅ works | actually using the tool |
| `storybook build` → static (Vercel, GitHub Pages) | ❌ read-only — buttons render but silently no-op (no server, no filesystem) | a shareable catalog |

**This is a tool you RUN, not a static site you ship — like ESLint, not like a
marketing site.** A static deploy can never do the editing.

## Three operating models — pick by *who needs to edit*

### 1. Local — the default; works today
Each developer runs it against their own checkout:
```bash
npm i -D storybook-addon-auto-detect
npm run storybook          # http://localhost:6107
```
Edit in the **Instances** panel → changes write to your working tree → commit /
open a PR like any code change. Nothing to host. This is where editing happens.

### 2. Published read-only catalog — optional
```bash
npm run build-storybook    # static output, e.g. demo/storybook-static
```
Deploy that to **Vercel / GitHub Pages**. A shareable window into components,
statuses, and conformance for the team to *browse*. **No editing.** (This is what
the Vercel deploy is — and all it can be.)

### 3. Hosted editable control plane — a shared URL where editing works
The only way to let people edit **without** a local checkout. It needs:
- a host that runs a **persistent Node process** — Render / Railway / Fly / a VM
  / a Codespace — **not** Vercel static;
- the addon in **PR write-back mode**: edits commit to a branch and open a PR, so
  writes survive restarts and are reviewable (a container's filesystem is
  ephemeral, so writes *must* go to git);
- a git token for that bot.

```
container runs `storybook dev` against a fresh clone
        → user edits in the browser
        → addon commits to a branch + opens a PR
```

## Recommendation

- **Use it locally (model 1)** day to day — that's where the write-back actually
  runs. It already works.
- **Keep Vercel as the read-only catalog (model 2)** for sharing. Just know it's a
  window, not the workshop.
- **Build model 3 only if non-developers need to edit from a URL.** It's a real
  but well-scoped addition (PR-write-back mode + a Node host + a Dockerfile).

## Safety (any model that writes)
Run write-back against a **clean git working tree** so every change is a
reviewable, revertible diff, and gitignore the generated files
(`*.auto.stories.*`, `auto-theme.css`, `auto-tailwind.*`). See HANDOFF.md →
"Constraints / gotchas" and the addon README.
