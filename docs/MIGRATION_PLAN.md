# LienGuard Migration Plan — to the Tower Platform Model (Horizon H1)

**Target architecture:** `docs/ARCHITECTURE.md`. **Decisions:** `docs/DECISIONS.md`
(ED-08…ED-13). **Scope authorized:** Horizon **H1** — move LienGuard onto the new foundation,
lifted into a new `beacon-platform` monorepo, against a **Tower stub**. Real Tower extraction
from Helm is a later horizon.

## Operating rules

- **Plan/docs before code.** This plan + `ARCHITECTURE.md` land before any migration code.
- **One PR per phase.** Small, reviewable. Never leave the build red across a merge.
- **Green checkpoint every phase:** `pnpm typecheck` + build + tests pass before the next phase.
- **Stop at each phase boundary** and report for review.
- **Preserve the crown jewels:** `deadlineEngine`, `riskScore`, `holdEngine`,
  `documentTemplates`, `pdfRichText` — port persistence around them; do not rewrite logic.
- **Ask before** any destructive data migration or irreversible auth cutover.

## Phases

| Phase | Goal | Credentials? | Sign-off | Definition of done |
|-------|------|--------------|----------|--------------------|
| **P0a** | Canon: `ARCHITECTURE.md` + ED-08…ED-13 + this plan | No | Review docs | ✅ **Done** (2026-06-24) |
| **P0b** | **Green baseline** on the *current* stack | No | — | ✅ **Already satisfied by Phase A** (PR #10): SOV rename finished, `pnpm typecheck` + build green, `ci.yml` present. Verified green 2026-06-24. No work needed. |
| **P1** | Lift into `beacon-platform` monorepo | No | PR review + repo creation | New pnpm-workspaces repo; LienGuard relocated into `modules/lien-collections`, `apps/lienguard`, `packages/{design,contracts,tower-stub}`; `pnpm -r typecheck` green; CI ported |
| **P2** | Foundation swap | **GATE: Clerk + Supabase** | Keys + cutover sign-off | Drizzle→Prisma (schema as namespaced module slice); Clerk end-to-end + Supabase Third-Party Auth; remove Replit OIDC; `orgId` from Clerk org; delete `DEFAULT_ORG_ID`; data-migration path; green |
| **P3** | Design system + nav | Chromatic token | PR review | Extract design system → `packages/design` in Storybook 8 + Chromatic; single-source tokens; two-level nav (Tower vertical / module horizontal); screens consume the package; tokens-only lint; green |
| **P4** | Module contract | No | PR review | `module.config.ts` (vertical entry + horizontal sections + gating key + declared ports); QBO/HubSpot/Connecteam clients become ports; module runs standalone on `packages/tower-stub`; green |

## Credential gate (before P2)

Provision and hand over: a **Clerk** application with **Organizations** enabled (frontend +
backend keys); a **Supabase** project (keys + Third-Party-Auth-for-Clerk configured); a
**Chromatic** project token (needed at P3). Owner: Deb.

## Out of scope for H1 (later horizons)

Real Tower extraction from Helm; migrating Helm's own features to modules; the combined
"buy a second module" demonstration; the reference-layer / hold-flag surface to Tower.

## Status

- **2026-06-24** — P0a complete (canon written). **P0b already satisfied** — build verified
  green (typecheck + build pass, `ci.yml` present), Phase A having finished the SOV rename.
  Next actionable step is **P1** (create `beacon-platform` monorepo + lift LienGuard in),
  which needs the new repo created.
