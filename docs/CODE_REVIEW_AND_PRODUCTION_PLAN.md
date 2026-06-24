# LienGuard — Code Review & Production Readiness Plan

**Author:** Development Manager (incoming)
**Date:** 2026-06-22
**Branch reviewed:** `claude/great-hypatia-90x1zg` (identical to `main`)
**Scope:** Full repository review — backend, frontend, shared libs, infra, and process.

---

## 1. Executive summary

LienGuard is **far more built than its own spec suggests** (the SCOPE doc still marks every
phase "Not Started"). In reality, all eight build phases are substantially implemented:

- **Backend:** ~9,500 lines across 20+ route files covering config, projects, streams/SOVs,
  deadlines, invoices, holds, monthly workflow, notices, waivers, notarization, filing, reports,
  collections, users, and a service-key external API. A real Texas §53.003(e) deadline engine
  (business-day + holiday math), risk scoring, hold computation, PDF generation, and live-or-stub
  clients for HubSpot/QBO/Connecteam/Shippo/NotaryLive.
- **Frontend:** All 10 spec screens exist and are wired to live endpoints with a polished,
  responsive, themeable app shell.
- **Foundations:** 35 Drizzle tables / 27 enums matching the data model; OpenAPI→Orval codegen
  pipeline; a documented UAT plan and an e2e harness.

This is a strong, coherent codebase built by a competent (largely AI-driven) effort. **It is not,
however, production-ready** — and the single most important reason is that **it does not currently
compile.**

### The headline problem

A `LienStream → ScheduleOfValues (SOV)` rename was started but never finished. It leaves the
**entire workspace failing `pnpm run typecheck`** (13 errors in the API, 11+ in the web app) and,
worse, at least one **runtime** defect:

- `api-server/src/routes/monthly.ts:204` inserts `lienScheduleOfValuesId: stream.id` where
  `stream` is undefined in that scope → the monthly notice-generation loop throws at runtime.
- `monthly.ts` also references undefined `streamIds`, `sovMap`, `streamMap`, `sov`.
- `filing.ts` reads `.stream` off an object that only has `.sov`.
- `reports.ts` references undefined `streams`.
- Web `dashboard.tsx` / `project-detail.tsx` read `.streams` off responses that now expose SOVs,
  silently rendering empty/incorrect data.

This shipped because **Vite and esbuild strip types without checking them**, and **there is no CI
gate**. The app bundles and "runs," masking broken code paths. Fixing the rename and standing up
CI are P0.

### Production-readiness verdict

| Dimension | State |
|---|---|
| Feature breadth | 🟢 Excellent — all phases present |
| Compiles / type-safe | 🔴 Red — does not typecheck; latent runtime bugs |
| Automated quality gates (CI) | 🔴 None |
| Test coverage | 🟡 Thin — 3 unit/integration files + 1 e2e script for legally-critical logic |
| Auth | 🟡 Works but architecturally risky (Clerk frontend ↔ OIDC backend) |
| Multi-tenancy | 🟡 Single-tenant shortcut (`DEFAULT_ORG_ID`) vs multi-tenant schema |
| Integrations | 🟡 Real-or-stub; none verified against live vendor APIs |
| Legal correctness gate | 🔴 `legalReviewed` rule-set gate not satisfied; no documented legal sign-off |
| Secrets / config / observability | 🟡 Basic; needs hardening before production |

**Bottom line:** ~2–4 focused weeks of engineering + a legal review pass stand between this and a
credible production launch for a single tenant (Beacon). The work is mostly *hardening and
verification*, not *new feature building*.

---

## 2. What's strong (keep building on this)

1. **Clean domain modeling.** The Drizzle schema faithfully implements the data model: link
   models with ephemeral caches, jurisdiction rules as data, full lien lifecycle, collections
   ladder, holds, document-template customization.
2. **The deadline engine is real and well-scoped.** Texas holiday set, §53.003(e) next-business-day
   roll-forward, anchor/offset rule interpretation, and a `sourceData` provenance snapshot per
   computed deadline for traceability. This is the legal heart of the product and it's taken
   seriously.
3. **Contract-first API tooling.** OpenAPI → Orval → Zod + React-Query is the right backbone for
   keeping client and server in sync (even though the app pages currently hand-roll `fetch`).
4. **Security-conscious instincts already present:** `minimumReleaseAge` supply-chain guard,
   triple-guarded `AUTH_BYPASS`, per-request role rehydration from the DB (so demotions take effect
   immediately), service-key auth for the external surface, object ACLs.
5. **Institutional memory is captured.** `.agents/memory/` is an unusually good record of sharp
   edges — preserve and keep adding to it.

---

## 3. Findings by severity

### P0 — Blockers for any production use

- **P0-1 Build is red / incomplete SOV rename.** Finish the `stream → sov` rename across
  `monthly.ts`, `filing.ts`, `reports.ts` (API) and `dashboard.tsx`, `project-detail.tsx` (web)
  until `pnpm run typecheck` is clean. Treat `monthly.ts` as a functional bug (the monthly run is a
  core workflow), and re-run the monthly path end-to-end after the fix.
- **P0-2 No CI.** Add a GitHub Actions workflow that runs `pnpm install --frozen-lockfile`,
  `pnpm run typecheck`, `pnpm run build`, and the API test suite on every PR to `main`. Make it
  required. Without this, red builds will keep shipping.
- **P0-3 Legal correctness unproven.** No documented legal review of the Texas rule set, and the
  `lien_rule_sets.legalReviewed` production gate is not enforced/satisfied. A missed statutory
  deadline is the product's worst-case failure. Require: a lawyer-reviewed rule set, the
  `legalReviewed` gate enforced before any notice/affidavit can be sent in production, and a test
  suite asserting the documented Ch. 53 worked examples.

### P1 — Required before launch

- **P1-1 Test coverage for statutory & money logic.** The deadline engine, hold engine, risk
  scoring, waiver approval gates, and the notice/filing state machines are the things that must not
  be wrong. Add focused unit tests (engines) + integration tests (state-machine transitions, the
  cleared-gate on unconditional waivers, escalation ladder). Wire the existing `uat-e2e.ts` into CI
  against an ephemeral Postgres.
- **P1-2 Resolve the auth architecture.** Decide on one model. Either (a) Clerk as the IdP with the
  backend verifying Clerk sessions/JWTs, or (b) Replit OIDC end-to-end. The current split caused
  the login-loop bugs already in history and is a long-term maintenance and security liability.
  Document the chosen flow and add an auth integration test.
- **P1-3 Multi-tenancy decision.** Either commit to single-tenant for the Beacon pilot (and
  document/lock `DEFAULT_ORG_ID`, removing request-derived orgId paths entirely) or finish deriving
  `orgId` from the authenticated user. Do not ship the ambiguous middle state.
- **P1-4 Integration verification.** Run each connector (HubSpot, QBO, Connecteam, Shippo,
  NotaryLive, Texas Easy Lien) against real sandbox/live credentials at least once, with documented
  results. Replace the affidavit `generated://` PDF stub with real generation + object-storage
  persistence before filing is exercised in production.
- **P1-5 Secrets & environment.** Document every required env var (DB, all integration keys,
  OIDC/Clerk, service key, object storage). Ensure production refuses to boot with `AUTH_BYPASS`
  active (it does today) and add a startup self-check that fails fast on missing critical config.

### P2 — Strongly recommended

- **P2-1 Adopt the generated API client in the web app.** Pages hand-roll `fetch` while a
  type-safe Orval client exists. Migrating eliminates a whole class of contract-drift bugs (exactly
  the kind the SOV rename caused on the frontend). Also: expand `openapi.yaml` (currently ~13
  operations) to cover the real surface so the contract is meaningful.
- **P2-2 Observability.** Pino is in place; add error tracking (Sentry is available), request
  metrics, and structured audit logging for statutory actions (who approved/sent/filed what, when).
- **P2-3 Background jobs.** The monthly run, hold recompute, sync jobs, and dunning advancement are
  triggered by HTTP POST today. Add a scheduler so the "1st-of-month" and "10th/11th" cadences
  actually fire, with idempotency and failure alerting.
- **P2-4 Linting/formatting gate.** Prettier is a dep but there's no ESLint config or lint step in
  CI. Add one.
- **P2-5 Data lifecycle.** Define backup/restore for the Postgres instance and a migration policy
  (`drizzle-kit push` is dev-only; production needs versioned migrations — the `drizzle/` migration
  exists, formalize the apply path).

### P3 — Cleanup / debt

- Reconcile the spec (Prisma, "streams," "Not Started" statuses) with reality (Drizzle, SOVs,
  built) so the docs stop misleading new contributors. This file + the updated `CLAUDE.md` are a
  start; the SCOPE feature-registry statuses should be refreshed.
- Vendor Holds page uses static sample data — wire it to the holds API.
- Remove/relocate `mockup-sandbox` from production build paths (it's a design tool).
- Pin/verify Node 24 in CI to match the Replit runtime (local is on 22).

---

## 4. Phased plan to production

Each phase ends in a demonstrably better, verifiable state.

### Phase A — Make it green and gated (P0). ~3–5 days
1. Finish the SOV rename; `pnpm run typecheck` and `pnpm run build` pass clean.
2. Manually exercise the monthly run, filing, and dashboard paths touched by the rename.
3. Add CI (install + typecheck + build + API tests) and make it a required check on `main`.
4. Add ESLint + Prettier check to CI.
**Exit:** PRs cannot merge red; main builds and typechecks.

### Phase B — Trust the legal core (P0-3, P1-1). ~4–6 days
1. Legal review of the Texas Ch. 53 rule set; enforce the `legalReviewed` gate in production paths.
2. Unit tests for `deadlineEngine`, `holdEngine`, `riskScore` against documented worked examples.
3. Integration tests for the notice/waiver/filing state machines and the unconditional-waiver
   cleared-gate. Wire `uat-e2e.ts` into CI with an ephemeral Postgres service.
**Exit:** statutory math is test-locked; no notice/affidavit sendable on an unreviewed rule set.

### Phase C — Lock down identity & tenancy (P1-2, P1-3, P1-5). ~3–5 days
1. Choose and implement a single auth model end-to-end; add an auth integration test.
2. Decide single- vs multi-tenant; remove the ambiguous path; document it.
3. Env/secrets inventory + fail-fast startup config check; confirm `AUTH_BYPASS` is impossible in prod.
**Exit:** one coherent, tested login flow; explicit tenancy posture; no boot on bad config.

### Phase D — Verify the outside world (P1-4, P2-2, P2-3). ~4–6 days
1. Exercise every integration against real sandbox/live creds; document results; replace the
   affidavit PDF stub.
2. Add error tracking + statutory audit logging.
3. Add a scheduler for monthly/hold/sync/dunning cadences with idempotency + alerting.
**Exit:** connectors proven; cadences fire automatically; failures are visible.

### Phase E — Polish & de-risk (P2/P3). Ongoing / ~3–5 days
1. Migrate web pages to the generated API client; expand `openapi.yaml` to the full surface.
2. Wire Vendor Holds to the API; refresh spec/status docs; formalize migrations & backups.
**Exit:** contract-drift class of bugs closed; docs match reality; ops basics in place.

---

## 5. Suggested immediate next step

Start **Phase A** — finish the SOV rename to get the tree green, then land the CI workflow in the
same PR so the green state is permanently enforced. That single PR converts the project from
"bundles but is quietly broken" to "provably compiles, gated against regression," which is the
foundation everything else depends on.

I can take that on next on request.
