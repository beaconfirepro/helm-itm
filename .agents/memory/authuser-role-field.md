---
name: User role is DB-authoritative, not session-cached
description: Where the app's role comes from for auth decisions and UI gating, and why it must be read from the DB.
---

The app-managed role (admin/pm/finance/coordinator, nullable) is **authoritative in
`users.role` and must be resolved from the DB per authenticated request** — never trusted
from the session snapshot alone.

**Why:** the OIDC session stores a copy of the user (including role) taken at login. If auth
decisions read that cached copy, a role change (grant/revoke/demote) would not take effect
until the user re-logs in — a real security gap, especially for revocation where stale
privileged access persists. So the request auth path re-reads role from the DB and overrides
the session copy before any guard runs.

**How to apply:**
- Any new privilege check must derive role from the per-request user (which is DB-fresh), not
  from a separately cached value.
- The client also needs role for UI gating: role rides on the OpenAPI `AuthUser` schema, so
  editing that schema requires rerunning the api-spec codegen or the response parse silently
  drops it. Server-side guards remain the real boundary; client role only shows/hides UI.
- `role === null` is the "logged in but no access granted yet" state.
