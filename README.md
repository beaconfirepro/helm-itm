# beacon-platform

The Beacon platform monorepo. **Products** (LiensEasy, Helm) are built from **Tower** (the
shared platform — auth, one design system, one multi-tenant Postgres, module gating) plus a set
of **modules**. See **`docs/ARCHITECTURE.md`** for the canonical model and locked stack.

## Layout

```
packages/
  design/       One design system + Storybook 8 + tokens (the single front-door look). [P3]
  contracts/    OpenAPI-first API contracts → generated Zod + TanStack Query clients.
  tower-stub/    Minimal Tower (auth + shell + DB wiring) so a module runs standalone. [grows into real Tower]
  db/           Prisma schema + client (Tower DB; modules contribute namespaced slices).
modules/
  lien-collections/   The lien & collections module (domain engines, routes, screens, module.config.ts).
apps/
  lienseasy/    Thin product shell: Tower + lien-collections module + brand.
docs/           ARCHITECTURE.md (canon) · MIGRATION_PLAN.md · MIGRATION_PROMPT.md
```

## Stack (locked — see docs/ARCHITECTURE.md)

Prisma · Supabase Postgres + RLS · Clerk (Organizations = tenant) via Supabase Third-Party Auth ·
OpenAPI + Orval · one design system in Storybook 8 (+ Chromatic later) · pnpm-workspaces monorepo.

## Status

🔨 **Scaffolding (P1).** This is the monorepo skeleton. The LienGuard codebase is being lifted
in module-by-module per `docs/MIGRATION_PLAN.md`; the original `beaconfirepro/lienguard` repo is
preserved as the source/fallback. `packages/db/prisma/schema.prisma` is the first-pass Drizzle→
Prisma translation (see `SCHEMA_NOTES.md` — relations are inferred; needs a referential-integrity
pass before `prisma migrate`).
