---
name: Dev bypass role is read from seeded DB users
description: Why editing/role gates can silently break after a rebase or post-merge DB schema sync, and how to restore them.
---

# Dev bypass role comes from the DB, not a synthetic in-memory role

The AUTH_BYPASS dev login maps each bypass role to a **real seeded DB user**
(ids `user_admin` / `user_pm` / `user_finance` / `user_coord`). The
`/api/auth/user` route returns `role: dbUser.role` — it reads the role column
from the database, NOT the `role` baked into BYPASS_USERS. The auth upsert
deliberately omits `role` from its payload, so an existing row keeps whatever
role it already has (or null).

**Why:** A post-merge DB schema sync (`drizzle push/pull` in
`scripts/post-merge.sh`) reconciles the schema but does not reseed data. After
a rebase that introduces or changes the seeded-user→bypass mapping, the users
table can have `role = null`, so the admin bypass returns `role: null`,
`canEdit` (admin/pm) is false, and the UI looks read-only / "can't edit".

**How to apply:** If dev bypass editing or role gates break after a rebase or
post-merge setup, check `select id, role from users;`. If roles are null,
re-run the UAT seed which sets them via onConflictDoUpdate:
`cd artifacts/api-server && pnpm dlx tsx src/scripts/seed-uat.ts`
(tsx is not on PATH; use `pnpm dlx tsx`).
