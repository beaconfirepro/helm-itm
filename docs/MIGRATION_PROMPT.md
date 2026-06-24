# LienGuard → Tower-Module Migration Prompt

> Paste the block below into a fresh agent session inside the LienGuard repo.
> Run it once to get the docs PR + Phase 0 plan, review, then let it proceed one phase per PR.

---

```
You are re-founding LienGuard. It stops being a "standalone app that owns its own database"
and becomes the FIRST MODULE on Beacon's "Tower" platform. Your job is to migrate this repo
to the new architecture — PLAN-FIRST and in PHASES, never big-bang.

═══ LOCKED ARCHITECTURE (this is canon; do not relitigate) ═══

• Tower model. A product = Tower + a set of modules + ONE design system. Tower is a separate
  platform (owns auth, the single design system, ONE multi-tenant Postgres, and module gating).
  Tower does not exist yet — structure this repo so the lien/collections code becomes a
  Tower-ready MODULE plus a thin product shell. "LienGuard" = Tower + the lien-collections
  module + the brand. There is ONE design system and ONE front door; products only change which
  modules appear.

• Foundation stack (replaces the current one):
    - ORM:   Prisma (migrate OFF Drizzle).
    - Data:  Supabase Postgres, with Row-Level Security available for tenant isolation.
    - Auth:  Clerk, with Clerk ORGANIZATIONS as the tenant layer (Clerk org id == orgId).
             Integrate Clerk↔Supabase via Supabase Third-Party Auth so RLS can read Clerk claims.
    - Clerk END-TO-END: the backend verifies the Clerk token. REMOVE Replit OIDC entirely.
      (The old dual-auth pain was a frontend/backend IdP split — do not recreate it.)

• API contract: KEEP the existing OpenAPI-first + Orval + Zod pipeline. The spec is the contract;
  clients stay generated, never hand-written.

• Design system: extract into its OWN package, hosted in Storybook 8 with Chromatic visual-
  regression. Tokens are single-source and feed Tailwind. Two-level navigation: Tower owns the
  VERTICAL primary nav (switch between modules); each MODULE owns its HORIZONTAL secondary nav
  (sections within it). No hardcoded colors — tokens only.

• Repo: pnpm workspaces monorepo (this repo already is one). Reshape into the module/package
  layout below. Do NOT add a task runner yet — run tasks via `pnpm -r` / `--filter`. A runner
  (Nx is the current lean, for its generators + module-boundary linting) is DEFERRED until the
  package count justifies it (~8+ packages); flag when we cross that line.

• Multi-tenancy: orgId comes ONLY from the Clerk session/org claim — NEVER from request body,
  query, or params. REMOVE the DEFAULT_ORG_ID hardcode.

• Retire DD-01/DD-06 (the "own your own Postgres / integrate across a boundary" founding law).
  External SaaS (QuickBooks, HubSpot, Connecteam) remain the source of truth for their own
  records and stay behind adapter-backed PORTS; the module owns only the EXTENSION data and the
  lien/collections workflow.

═══ DO NOT BREAK / PRESERVE ═══

• The domain engines are the crown jewels and are ORM-agnostic pure functions. Port persistence
  AROUND them; do not rewrite their logic or weaken their tests:
  deadlineEngine.ts, riskScore.ts, holdEngine.ts, documentTemplates.ts, pdfRichText.ts.
• Statutory correctness and the legalReviewed gate (DD-04).
• The OpenAPI contract and generated clients.

═══ MANDATORY APPROACH ═══

1. READ first: attached_assets/lien_collections_SCOPE*.md, docs/DECISIONS.md,
   docs/PRODUCTION_PLAN.md, docs/CODE_REVIEW_AND_PRODUCTION_PLAN.md, and
   .agents/memory/MEMORY.md.

2. WRITE THE NEW CANON before any migration code:
   - docs/ARCHITECTURE.md capturing everything above.
   - New ED-xx entries in docs/DECISIONS.md that explicitly SUPERSEDE DD-01 and DD-06.
   - docs/MIGRATION_PLAN.md: a phased plan with a green-typecheck checkpoint and ONE PR per phase.
   Open these as a single docs PR and STOP for my approval before writing migration code.

3. RECOMMENDED PHASE ORDER (refine in your plan, but justify any change):
   - Phase 0 — GREEN BASELINE on the CURRENT stack first: finish the LienStream→ScheduleOfValues
     rename, fix the monthly.ts runtime bug (undefined `stream`), get `pnpm typecheck` + build +
     tests green, and add a CI workflow that gates typecheck/build/test on PRs. (A verified-working
     baseline BEFORE swapping foundations is non-negotiable.)
   - Phase 1 — Reshape into the canonical layout below using pnpm workspaces only (no task
     runner yet). Wire CI to run typecheck/build/test via `pnpm -r`. Proposed layout (refine):
        packages/design        (design system + Storybook + tokens)
        packages/contracts     (openapi.yaml + generated zod/react-query)
        packages/tower-stub    (minimal Tower: auth + shell + DB wiring, for standalone runs)
        modules/lien-collections (the module: domain + routes + screens + module.config.ts)
        apps/lienguard         (thin product shell = tower-stub + lien module + brand)
   - Phase 2 — Foundation: Drizzle → Prisma on Supabase. Author the schema as a NAMESPACED module
     slice (so it can later live in Tower's shared DB). Provide a data-migration path.
   - Phase 3 — Auth: remove Replit OIDC; Clerk end-to-end + Supabase Third-Party Auth; orgId from
     Clerk org; delete DEFAULT_ORG_ID; keep a triple-guarded dev bypass only.
   - Phase 4 — Design system extraction + Storybook + Chromatic; implement the two-level nav;
     convert screens to consume the design package; enforce tokens-only via lint.
   - Phase 5 — Module contract: module.config.ts manifest (vertical-nav entry, horizontal
     sections, gating key, declared data ports); convert QBO/HubSpot/Connecteam clients into the
     declared ports; verify the module runs standalone on packages/tower-stub.

4. EXECUTE one phase per PR. After each phase: `pnpm typecheck` green, tests pass, update
   docs/PRODUCTION_PLAN.md status, then STOP and report at the phase boundary for review.

═══ GUARDRAILS ═══
• Plan before code. Small PRs. Never leave the build red across a merge.
• Keep generated code generated (never hand-edit lib/api-zod or api-client-react generated dirs).
• Respect pnpm minimumReleaseAge (1 day). Use `pnpm dlx tsx`. Build the schema package before
  typechecking the api-server.
• ASK ME before any destructive data migration or irreversible auth cutover.

FIRST ACTION: produce the docs PR (ARCHITECTURE.md + superseding ED entries + MIGRATION_PLAN.md)
and the Phase 0 scope as a written proposal. Wait for my approval before writing migration code.
```

---

## Locked decisions (reference)

| Layer | Decision |
|---|---|
| API contract | OpenAPI + Orval (spec-first, generated clients) |
| Design system | Storybook 8 + Chromatic (visual-regression gate) |
| Repo | pnpm workspaces monorepo; task runner deferred (Nx-leaning) until ~8+ packages |
| Foundation | Prisma · Supabase Postgres/RLS · Clerk (Orgs = tenant), via Supabase Third-Party Auth |
| Module gen + boundary rules | revisit with Nx at the ~8+ package threshold |

## Notes
- This prompt migrates **LienGuard only**. Tower itself and Helm's migration are separate efforts.
  `packages/tower-stub` is a placeholder so the module can run/test before real Tower exists.
- Open judgment call baked in: get the current Drizzle build GREEN first (Phase 0) before the
  Prisma swap. Change that line if you'd rather skip straight to Prisma.
