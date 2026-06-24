# LienGuard (Lien & Collections)

A standalone web app that protects Beacon's money on construction projects. It does two
jobs over the same data (an invoice that hasn't cleared): runs the **collections** process
(escalating client contact to recover overdue invoices) and the **lien rights** process
(preserving and exercising Beacon's statutory security interest under **Texas Property Code
Chapter 53**, built so other jurisdictions are additive data, not code). Its core promise:
never let a recoverable dollar or an enforceable lien right lapse because someone forgot a
statutory date.

This is the first of Beacon's "standalone-but-integrated" apps: it owns its own Postgres
schema and deploys independently, and reaches HubSpot (clients/projects/parties), QBO
(invoices), and Connecteam (timesheets) across integration boundaries rather than sharing a
database. Helm Core is a *consumer* of this app (reference layer + hold flags), not a source.

> Product spec is authoritative and lives in `attached_assets/lien_collections_*.md`
> (SCOPE, DATA_MODEL, SEED_DATA, AGENT_PROMPTS). Read SCOPE before non-trivial changes.
> Note: those docs describe the model in **Prisma**; the actual implementation uses
> **Drizzle** (see Architecture decisions).

> **⚠ Architecture re-founding in progress (2026-06-24).** LienGuard is being re-founded from a
> "standalone app" into the first **module** on the **Tower** platform. The target architecture
> and locked stack (Prisma · Supabase/RLS · Clerk · one design system in Storybook · pnpm
> monorepo) are canon in **`docs/ARCHITECTURE.md`**; decisions in `docs/DECISIONS.md` (ED-08…ED-13,
> superseding DD-01/06); sequence in `docs/MIGRATION_PLAN.md`. **The Stack / Architecture-decisions
> sections below describe the CURRENT code (pre-migration) and are accurate until each migration
> phase changes them.**

## Run & Operate

- `pnpm install` — install (enforces a 1-day `minimumReleaseAge` on npm packages; see `pnpm-workspace.yaml`)
- `pnpm --filter @workspace/api-server run dev` — API server (port 8080, all routes under `/api`)
- `pnpm --filter @workspace/lien-collections run dev` — web app (Vite, port 19800; proxies `/api` → 8080)
- `pnpm --filter @workspace/mockup-sandbox run dev` — component preview canvas (design tool, not shipped)
- `pnpm run typecheck` — full typecheck across all packages **(currently RED — see Gotchas)**
- `pnpm run build` — `typecheck` then build all packages
- `pnpm --filter @workspace/api-server run test` — Vitest suite (needs `DATABASE_URL`)
- `pnpm --filter @workspace/api-server run seed:uat` — seed DB + phase5/phase6/UAT fixtures
- `pnpm --filter @workspace/api-server run test:uat` — seed then run the e2e UAT harness
- `pnpm --filter @workspace/db run push` — push Drizzle schema to the DB (dev only)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate Zod + React-Query hooks from `openapi.yaml`
- Required env: `DATABASE_URL` (Postgres). Dev sets `AUTH_BYPASS=1` (see Gotchas).

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9. Build/host target is **Replit**.
- **API:** Express 5, Pino logging. Bundled to a single CJS file with esbuild (`build.mjs`).
- **DB:** PostgreSQL + Drizzle ORM (`drizzle-kit` for migrations).
- **Validation/contracts:** OpenAPI (`lib/api-spec/openapi.yaml`) → Orval codegen → Zod schemas
  (`lib/api-zod`) + TanStack Query hooks (`lib/api-client-react`).
- **Web:** Vite 7, React 19, wouter (routing), Radix UI + shadcn-style components, Tailwind 4.
- **Auth:** Backend = Replit OIDC (`openid-client`) + DB-backed session cookies. Frontend =
  Clerk (`@clerk/react`). See the auth caveat in Architecture decisions.
- **Integrations:** HubSpot, QBO, Connecteam (read syncs), Shippo (certified mail), NotaryLive
  (remote notarization), Texas Easy Lien (county filing handoff).

## Where things live

```
artifacts/api-server      Express 5 API. src/routes/* (one file per domain), src/lib/* (engines & clients)
artifacts/lien-collections React web app. src/pages/* (screens), src/components/nav/AppShell.tsx (shell)
artifacts/mockup-sandbox   UI prototyping canvas — NOT production
lib/db                     Drizzle schema (source of truth) + migrations + seed
lib/api-spec               openapi.yaml (API contract source of truth) + orval config
lib/api-zod                GENERATED Zod schemas (do not hand-edit src/generated)
lib/api-client-react       GENERATED React-Query hooks + custom-fetch.ts (hand-written transport)
lib/replit-auth-web        Frontend useAuth() hook bridging Clerk ↔ /api/auth/user
docs/                      UAT_HOWTO.md, UAT_TEST_PLAN.md
attached_assets/           Product spec (SCOPE / DATA_MODEL / SEED_DATA / AGENT_PROMPTS)
.agents/memory/            Hard-won gotchas from prior sessions — read MEMORY.md first
```

Source-of-truth files:
- **DB schema:** `lib/db/src/schema/{tables,enums,auth}.ts`
- **API contract:** `lib/api-spec/openapi.yaml` (regenerate clients with `codegen` after edits)
- **Statutory deadline engine:** `artifacts/api-server/src/lib/deadlineEngine.ts`
- **Risk scoring:** `artifacts/api-server/src/lib/riskScore.ts`
- **Hold computation:** `artifacts/api-server/src/lib/holdEngine.ts`
- **Document/PDF templates:** `artifacts/api-server/src/lib/documentTemplates.ts`, `pdfRichText.ts`

## Architecture decisions

- **Standalone, integration-first (DD-01/06).** Owns its own Postgres. External systems are
  the system of record; link models store an external ID + an ephemeral read cache, never a
  second authoritative copy.
- **Drizzle, not Prisma (despite the spec).** All schema/queries use Drizzle ORM. The spec's
  Prisma models map 1:1 to Drizzle tables in `lib/db`.
- **Texas-first, built multi-state (DD-03).** Statutory rules are *data* (`jurisdictions` →
  `lien_rule_sets` → `lien_rules`) read by a generic engine. A second state is added data, not
  code. Rule sets carry a `legalReviewed` gate that must be true before production use (DD-04).
- **Lien "streams" were renamed to "Schedule of Values" (SOV).** The DB table is
  `lien_schedule_of_values`; FKs are `lienScheduleOfValuesId`. UI/code still say "stream" in
  places. **This rename is incomplete and currently breaks the build — see Gotchas.**
- **Single-tenant for now.** `orgId` comes from a constant `DEFAULT_ORG_ID` (`src/lib/session.ts`),
  not from the session/user, even though the schema and spec are multi-tenant. Revisit before
  onboarding a second org.
- **Dual auth — a known risk.** The backend uses Replit OIDC + session cookies; the frontend
  uses Clerk. These are two different identity systems stitched together via `/api/auth/user`.
  Several recent commits fixed login-redirect loops here. Treat auth changes carefully and
  verify end-to-end.

## Product

Roles: Tenant Admin (config), Project Coordinator (primary lien user), Collections/AR
Coordinator, PM & Finance (waiver/collections approvals), Manager (oversight). Main screens:
Dashboard, Monthly Lien Report / Send Queue, Projects + Project Lien Detail, Notice Editor,
Waiver Workspace, Filing Workspace, Collections Pipeline, Account Detail, Vendor Holds,
Company Settings. Workflow spans: configure reference tables & jurisdiction rules → set up lien
projects over HubSpot data → engine derives work months & statutory deadlines → monthly run
pre-generates draft notices → review/approve/send (certified mail) → waivers (with approval +
notarization gates) → filing/release on escalation → collections dunning ladder in parallel.

## Gotchas

- **The build is GREEN** as of Phase A (PR #10): the `LienStream → ScheduleOfValues` rename is
  finished and `pnpm run typecheck` + `pnpm run build` pass across the workspace (verified
  2026-06-24). Note that `stream`/`sov`/`streamMap`/`workStream` still appear as *legitimate*
  local names and a real schema column — do **not** blanket-rename them. Vite/esbuild still skip
  type-checking, so **always run `pnpm run typecheck` before relying on a build.**
- **No CI.** The only GitHub workflow auto-assigns issues to Copilot; nothing gates
  typecheck/build/test/lint on PRs. Add this before trusting green.
- **Read `.agents/memory/MEMORY.md`** — it indexes ~25 specific gotchas (Replit proxy keeps the
  `/api` prefix so all routes need it; Express 5 strict param typing; route-order collisions in
  `waivers`; `tsx` not on PATH → use `pnpm dlx tsx`; build `lib/db` & `lib/api-zod` before
  typechecking api-server; etc.). It is the fastest way to avoid known traps.
- **Generated code:** never hand-edit `lib/api-zod/src/generated` or
  `lib/api-client-react/src/generated` — change `openapi.yaml` and rerun `codegen`.
- **Integrations stub when keys are absent.** HubSpot/Connecteam/QBO/Shippo fall back to
  fixtures/no-ops without credentials; none are verified against live APIs. The filing affidavit
  PDF is a `generated://` stub. NotaryLive uses a public sandbox by default.
- **AUTH_BYPASS:** dev/test treat every request as an authenticated user (role via `dev_role`
  cookie). Triple-guarded off in production, but it means local behavior ≠ real auth behavior.

## Decisions & canonical knowledge

Durable decisions live **in this repo** (a Claude cowork project is not visible to coding
sessions). When a decision is made, record it so every session works off the same canon:
- **`docs/DECISIONS.md`** — engineering & process decision log (`ED-xx`); complements the
  product decisions (`DD-xx`) in `attached_assets/lien_collections_SCOPE.md`.
- **`docs/PRODUCTION_PLAN.md`** — the phased plan (A–E) with live status.
- **`docs/TEXAS_RULE_SET_LEGAL_REVIEW.md`** — seeded statutory rules ↔ code mapping for
  counsel; note the `legalReviewed` gate (DD-04) and the seed-flag caveat.
- **`.agents/memory/`** — hard-won technical gotchas.
- Behavioral/operational rules that should bind every session belong in **this file**.

## Pointers

- See the `pnpm-workspace` skill for workspace/TypeScript-project-reference details.
- `docs/CODE_REVIEW_AND_PRODUCTION_PLAN.md` — current-state assessment and the phased plan to
  reach production.
