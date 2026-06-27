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

## Using it on a repo you don't have locally — GitHub Codespaces

A Codespace is a cloud dev environment: the repo is checked out, Node runs, and
ports forward to your browser. That's everything the write-back needs, so this is
model 1 (local) — just in the cloud. Perfect for repos you don't clone locally.

**One-time:** publish the addon so install is a one-liner everywhere:
```bash
cd addon && npm publish --access public
```
(Otherwise you'd have to copy the `npm pack` tarball into each Codespace.)

**Prerequisite:** the target repo must already have **Storybook on Vite**. If it
doesn't, adding Storybook is a separate, bigger step.

### Safe per-repo runbook (copy/paste, in order)

```bash
# 1. Open the repo in a Codespace: GitHub → the repo → Code ▸ Codespaces ▸ Create.

# 2. ALWAYS start on a fresh branch — never edit on main.
git checkout -b design-edits

# 3. Confirm a clean starting point (must say "working tree clean").
git status

# 4. Install the addon (dev dependency only).
npm i -D storybook-addon-auto-detect

# 5. Register it in .storybook/main.js (add the addon block); optionally tailwind: true.

# 6. Keep generated files out of git — append to .gitignore:
printf '\n*.auto.stories.*\nauto-theme.css\nauto-tailwind.*\nstorybook-static/\n' >> .gitignore

# 7. Commit the SETUP on its own, so it's isolated from any design edits.
git add .storybook/main.js package.json package-lock.json .gitignore
git commit -m "chore: add storybook-addon-auto-detect"

# 8. Run it. Codespaces auto-forwards the port — click "Open in Browser".
npm run storybook         # or: npx storybook dev -p 6107

# 9. Edit in the Instances panel. After each change, REVIEW what it wrote:
git diff

# 10. Commit deliberately, reviewing hunks as you go.
git add -p
git commit -m "design: <what you changed>"

# 11. Push the branch and open a PR — never push to main.
git push -u origin design-edits
#    → open the PR, review the full diff, merge when satisfied.
```

### Guardrails — how to not overwrite something you shouldn't

- **Branch + clean tree before editing** (steps 2–3). This is the whole safety
  model: every write becomes an isolated, revertible diff on a throwaway branch.
- **Review `git diff` after each edit.** The addon writes real source files.
- **Undo is free:** `git restore <file>` (or `git checkout -- .`) throws away any
  uncommitted edit. Because your branch started clean, this can never lose work.
- **Handle the broad actions with care** — review their diffs especially closely:
  - *Approve & align* and `npm run conformance:apply` → repo-wide import codemod.
  - *Managed-prop edit* → rewrites every instance of that prop across the repo.
  - *Set color* → a blunt global hex find/replace in the component file.
- **Don't aim `scanDirs` at routed dirs** (Next.js `pages/` or `app/`) in
  filesystem mode, or use `outputMode: 'memory'` to write no generated files.
- **The Codespace is disposable.** Worst case, delete it — your other repos and
  `main` are untouched. Nothing here can affect a repo you didn't open.

## Safety (any model that writes)
Run write-back against a **clean git working tree** so every change is a
reviewable, revertible diff, and gitignore the generated files
(`*.auto.stories.*`, `auto-theme.css`, `auto-tailwind.*`). See HANDOFF.md →
"Constraints / gotchas" and the addon README.
