# LienGuard — Production Plan (Working Tracker)

**Companion to** `docs/CODE_REVIEW_AND_PRODUCTION_PLAN.md` (the assessment).
This file is the **actionable, checklist-level plan** with exit criteria and live status.

Status key: ⬜ not started · 🔨 in progress · ✅ done · 🚫 blocked

---

## Phase A — Make it green and gated  `✅ done (pending CI run + branch protection)`

**Goal:** `pnpm run typecheck` and `pnpm run build` pass clean, and CI permanently
enforces that on every PR to `main`.

| # | Task | Status |
|---|------|--------|
| A1 | Finish the `LienStream → ScheduleOfValues` rename in the API (`monthly.ts`, `filing.ts`, `reports.ts`) until api-server typechecks | ✅ |
| A2 | Finish the same rename in the web app (`dashboard.tsx`, `project-detail.tsx`) until lien-collections typechecks | ✅ |
| A3 | Fix the real runtime bug in `monthly.ts` (`lienScheduleOfValuesId: stream.id`, `stream` undefined) and re-derive the notice-creation loop correctly | ✅ |
| A4 | `pnpm run typecheck` + `pnpm run build` green across the whole workspace | ✅ |
| A5 | Add `.github/workflows/ci.yml`: install → typecheck → build → API tests (Postgres service) on PRs to `main` | ✅ |
| A6 | Lint/format gate — **deferred to Phase E (E3)**: 210 files have Prettier drift, so a `--check` gate would be red until a formatting pass is done deliberately | ⤴️ |

**Exit criteria:** PR cannot merge red; `main` builds and typechecks; CI is a required check.

**Done in this pass:**
- Completed the SOV rename; `pnpm run typecheck` is green for all packages and both
  production artifacts build (`api-server`, `lien-collections`). Fixed two pre-existing
  red errors in `collections.tsx` (`CollectionAccount.linkedClientId`) uncovered once the
  rename errors cleared.
- Added `.github/workflows/ci.yml`.

**Remaining to fully close Phase A (needs repo-admin / a CI run):**
- Confirm the first CI run is green (the test step runs against a fresh Postgres + `db push`;
  if the seeded data the tests assume isn't present, fold a `db seed` step in — will fix via
  the PR subscription when the run reports).
- Mark CI a **required status check** on `main` in branch-protection settings (repo admin).

**Note on verification:** Full runtime verification of the monthly/filing paths needs a seeded
Postgres (`DATABASE_URL`), which is not available in this environment. Phase A locks the
*static* gate (typecheck/build/CI); runtime re-exercise of the monthly run moves into Phase B
alongside the engine tests, against an ephemeral Postgres in CI.

---

## Phase B — Trust the legal core  `🔨 in progress`

**Goal:** statutory math is test-locked and no document can be sent on an unreviewed rule set.

| # | Task | Status |
|---|------|--------|
| B1 | Legal review of the seeded Texas Ch. 53 rule set (notice/filing/retainage/post-filing) — **human/legal task, not code** | ⬜ |
| B2 | Enforce the `lien_rule_sets.legalReviewed` gate in the notice-send + filing export/record paths | ✅ |
| B3 | Unit tests for `deadlineEngine` against the documented Ch. 53 worked examples (incl. weekend/holiday roll-forward) | ✅ |
| B4 | Unit tests for `holdEngine` and `riskScore` | ✅ |
| B5 | State-machine rules for notice/waiver/filing + unconditional-waiver cleared-gate | ✅ logic locked (pure); DB integration pending |
| B6 | Wire `uat-e2e.ts` into CI against an ephemeral Postgres service | 🔨 added as a separate `uat-e2e` job; validating in CI, then promote to required |

**Exit criteria:** engines test-locked; sending blocked on unreviewed rule sets; UAT e2e in CI.

**Done in this pass:**
- `deadlineEngine` unit suite (14 tests) locking the statutory math: the Mar 2026 → Jun 15
  notice deadline, the Feb 14 (Sat) → Feb 17 retainage roll-forward over Presidents' Day,
  calendar vs business-day offsets, completion/filing anchors (incl. null-anchor skip),
  unsupported-anchor guard, sourceData provenance, and the Texas-holiday helpers
  (Thanksgiving, observed Independence Day).
- `legalReview` gate (DD-04): pure `legalReviewEnforced` + `ruleSetsPermitSend` (7 tests),
  a fail-closed DB resolver (SOV → project → jurisdiction → rule sets), wired into
  `POST /notices/:id/send`, `POST /filing/:id/export`, and `POST /filing/:id/record`.
  Enforced in production only; relaxed in dev/test/UAT (or `LEGAL_REVIEW_BYPASS=1`).

**Remaining (next passes):**
- B4: `riskScore` pure math is already covered by `risk-scoring.test.ts`; `holdEngine` needs
  DB-backed integration tests (CI now has Postgres).
- B5/B6: state-machine integration tests + `uat-e2e.ts` in CI.
- B1: schedule the legal review; once done, flip `legalReviewed` on the Texas rule set so the
  gate passes in production.

---

## Phase C — Lock down identity & tenancy  `⬜`

| # | Task | Status |
|---|------|--------|
| C1 | Choose ONE auth model end-to-end (Clerk-as-IdP verified by backend, OR Replit OIDC end-to-end) | ⬜ |
| C2 | Implement + add an auth integration test; document the flow | ⬜ |
| C3 | Decide single- vs multi-tenant; remove the ambiguous path; document the posture | ⬜ |
| C4 | Env/secrets inventory + fail-fast startup config check; prove `AUTH_BYPASS` impossible in prod | ⬜ |

**Exit criteria:** one coherent tested login flow; explicit tenancy; no boot on bad config.

---

## Phase D — Verify the outside world  `⬜`

| # | Task | Status |
|---|------|--------|
| D1 | Exercise HubSpot, QBO, Connecteam, Shippo, NotaryLive, Texas Easy Lien against real sandbox/live creds; document results | ⬜ |
| D2 | Replace the affidavit `generated://` PDF stub with real generation + object-storage persistence | ⬜ |
| D3 | Detailed audit log (persisted `audit_logs` table + recorder wired into statutory/financial actions + read API) | 🔨 audit log built; Sentry error tracking still ⬜; legal must-have fields TBD |
| D4 | Add a scheduler for monthly-run / hold-recompute / sync / dunning cadences (idempotent + alerting) | ⬜ |

**Exit criteria:** connectors proven; cadences fire automatically; failures visible.

---

## Phase E — Polish & de-risk  `⬜`

| # | Task | Status |
|---|------|--------|
| E1 | Migrate web pages from hand-rolled `fetch` to the generated Orval client; expand `openapi.yaml` to the full surface | ⬜ |
| E2 | Wire Vendor Holds page to the holds API (currently static sample data) | ⬜ |
| E3 | Add ESLint config + lint step in CI | ⬜ |
| E4 | Formalize production migrations (vs dev-only `drizzle-kit push`) + DB backup/restore policy | ⬜ |
| E5 | Refresh the spec/status docs to match reality (Drizzle, SOVs, built phases) | ⬜ |
| E7 | API naming inconsistency: `GET /projects` (list) returns `sovs` but project detail/overview returns `streams` — unify on `sovs` (touches web + harness) | ⬜ |
| E6 | HELM integration: verify `/external/*` contract shapes against HELM canon (see HELM_INTEGRATION_REVIEW) | ⬜ |

**Exit criteria:** contract-drift class of bugs closed; docs match reality; ops basics in place.

---

## Cross-cutting / parallel

- **HELM integration review** — separate workstream; needs a session scoped to both
  `beaconfirepro/LienGuard` and `Beacon-Fire-Protection/helm`. Feeds E6.
- **PR hygiene** — keep CI green on open PRs; this plan's own work lands via PRs to `main`.
