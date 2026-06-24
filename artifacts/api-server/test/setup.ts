import { afterAll } from "vitest";
import { pool } from "@workspace/db";

// Service-key guard reads SERVICE_KEY at request time, so setting it here (before
// any test runs) is enough for the /api/external/* suites to authenticate.
export const TEST_SERVICE_KEY = "test-service-key";
process.env.SERVICE_KEY = process.env.SERVICE_KEY ?? TEST_SERVICE_KEY;

// Vitest sets NODE_ENV=test automatically, which flips AUTH_BYPASS on so
// session-protected routes resolve to the seeded admin user without a real
// OIDC login. Belt-and-suspenders in case a runner overrode it.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

// The app imports @workspace/db at module load, which opens a pg pool that keeps
// the process alive. Files are isolated, so each gets its own pool to close.
afterAll(async () => {
  await pool.end();
});
