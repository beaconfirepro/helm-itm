---
name: Authenticated screenshots (Replit Auth, no dev priming)
description: Why data-filled screenshots of the Lien & Collections app can no longer be primed; what the auth setup is.
---

The Lien & Collections web app now uses real Replit Auth (OIDC/PKCE). The old dev-only `GET /api/dev/session` route and `lc_session` stub cookie were removed.

**Screenshot limitation (real OIDC):** real OIDC login can't be completed headlessly, so without a bypass `app_preview` screenshots show the **login gate** (a centered "Log in" card in `AppShell.tsx`). Verify authed UI via the API directly (curl `https://$REPLIT_DEV_DOMAIN/api/...`) or a real browser login.

**Bypass exception:** when the dev login bypass is active (`AUTH_BYPASS=1`, see auth-gate-architecture.md), `GET /api/auth/user` returns a synthetic admin so the gate passes and screenshots DO render data pages. (Screenshot tool itself may still intermittently fail with infra `CANCEL` errors unrelated to auth — fall back to curl.)

**Auth contract (verified):** `GET /api/auth/user` → `{"user":null}` when logged out; protected `/api/*` routes → 401; `GET /api/login` → 302 to `replit.com/oidc/auth`. M2M `/api/external/*` routes are unaffected.

**Roles:** app-managed roles (admin/pm/finance/coordinator) live in `users.role` (nullable) in DB, loaded onto `req.user`. Set roles directly in the DB — there is no role-management UI. Login upsert must never overwrite an existing role.

**Single-tenant orgId:** Replit Auth has no org concept; `lib/session.ts` `getSession()` shim returns a fixed default orgId (`org_beacon_test_001`) so the ~60 existing `getSession` callsites keep working unchanged.
