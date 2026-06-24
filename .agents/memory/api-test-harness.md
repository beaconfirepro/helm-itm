---
name: API server test harness
description: How automated tests are wired in artifacts/api-server (Vitest + Supertest)
---
- Tests live in `artifacts/api-server/test/*.test.ts`, run with `pnpm --filter @workspace/api-server run test` (`vitest run`).
- `vitest.config.ts` keeps tests out of `src` so the esbuild bundle and `tsc` build typecheck (include: src only) never pick them up.
- `test/setup.ts` sets SERVICE_KEY (read at request time by requireServiceKey) and closes the pg `pool` in afterAll.

**Why:** importing `src/app` opens a pg pool (DATABASE_URL) that keeps the process alive; with vitest isolate:true each file gets its own pool, so close it per-file, not globally.

**How to apply:** AUTH_BYPASS now activates when `NODE_ENV === "test"` (in addition to AUTH_BYPASS=1), so session-protected routes resolve to the seeded admin without OIDC. Still guarded against production/REPLIT_DEPLOYMENT. Tests run against the live dev DB + seed fixtures, so health/external assertions depend on seeded data.
