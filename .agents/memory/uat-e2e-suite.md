---
name: UAT e2e suite
description: How the api-server UAT end-to-end suite is structured and the gotchas that shaped it
---

# UAT e2e regression suite (api-server)

`pnpm --filter @workspace/api-server run test:uat` re-seeds (base+phase5+phase6+uat)
then runs `src/scripts/uat-e2e.ts`; `test:uat:only` runs the assertions against
already-seeded data. The harness boots the real app on `app.listen(0)` and drives
HTTP with `Authorization: Bearer <sid>`.

## Auth in tests
- Must `delete process.env.AUTH_BYPASS` BEFORE importing app (authMiddleware reads
  it at module load → dynamic `import("../app")`). Without this, every request is
  forced to admin and the 401/403 role gates can't be exercised.
- Create one real DB session per role via `createSession({user:{...,role}, access_token})`
  — omit `expires_at` so authMiddleware skips OIDC refresh. Pass the returned sid as Bearer.

## Idempotency rule (the thing that bites)
Mutation cases drain the canonical seed states that earlier list-render cases read
(e.g. write-off consumes the only agency_attorney account; clearing a hold removes
the only active schedule_hold; PM/finance approvals drain the pending waivers). The
seed uses onConflictDoNothing so re-seeding can't reset that drift.
**Fix pattern:** every test that depends on a specific record state re-asserts that
state with an explicit `db.update(...)` precondition at its own start — both the
mutation tests AND the list-render tests that read those states. This makes the
suite pass on any order and on repeated `test:uat:only` runs without re-seeding.

## Runtime-derived statuses — don't assert the stored value
Several statuses are recomputed at read time, not the stored seed value:
- Lien filing status is derived from filing dates: a "filed" lien whose
  post-filing deadline has passed surfaces as `post_filing_notice_sent`. Assert
  "filed-or-beyond", not literal `filed`.
- Project `completionChecklistComplete` is recomputed live; proj_2nd is stored
  `false` but computes complete (it has address/county/start + all 2nd-tier
  parties), so UAT_TEST_PLAN's "PROJ-A2 incomplete" expectation no longer holds —
  assert the checklist invariant (complete === missing.length===0) instead.

## Endpoint path gotcha
Collection account detail is `GET /api/collections/accounts/:id` (NOT
`/api/collections/:id`). `GET /api/auth/user` returns `{user}` without a `role`
field (response zod schema strips it) — assert id/email, not role.
