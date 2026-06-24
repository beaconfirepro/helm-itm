---
name: Auth gate architecture (Replit Auth)
description: How the web login gate is wired and the cleanest way to bypass/short-circuit it.
---

The web app's login gate is driven entirely by the server. The frontend `useAuth` hook (lib/replit-auth-web) sets `isAuthenticated: !!user` from a single fetch to `GET /api/auth/user`; AppShell shows a LoginScreen whenever that is null. There is no client-side token check.

**Consequence (the key lesson):** anything that makes `GET /api/auth/user` return a non-null user makes BOTH the frontend gate pass AND every backend guard pass — no frontend or shared-package changes needed. On the server, `requireSession` / `getSession` / `requireAdmin` all derive from `req.user` (set by `authMiddleware`), and `req.isAuthenticated()` is just `this.user != null`.

**Dev login bypass:** `authMiddleware` injects a synthetic `req.user` when `AUTH_BYPASS === "1"` AND `NODE_ENV !== "production"` AND `!REPLIT_DEPLOYMENT` (triple-guarded). The flag is set as a **development-scoped** env var so it can never reach prod; it also logs a loud `console.warn` at startup when active.

**Dev role switching (bypass only):** the bypass user is no longer hardcoded admin — it is chosen by the `dev_role` cookie (admin|pm|finance|coordinator), each mapped to the matching seeded user (user_admin/user_coord/user_pm/user_finance) so approval attributions are correct; default is admin when no/invalid cookie. `routes/dev.ts` exposes `GET /api/dev/auth` (reports enabled + options + current role) and `POST /api/dev/auth/role` (sets the cookie; 404 when bypass off). The web header has an in-app `RoleSwitcher` (orange control) that only renders when `GET /api/dev/auth` reports enabled, and reloads after switching. This lets non-technical UAT testers verify role gates positively (200) and negatively (403) without editing the DB. **Why:** admin is a super-role that passes every gate, so admin-only bypass couldn't prove a non-admin is correctly *blocked*.

**Why:** real Replit Auth is OIDC/PKCE and can't be primed in the screenshot browser or quick curl tests, so a server-side bypass is the only way to exercise authed pages locally.

**How to remove/restore real login:** delete the `AUTH_BYPASS`/`BYPASS_USERS` bypass block in `artifacts/api-server/src/middlewares/authMiddleware.ts`, drop `routes/dev.ts` (+ its mount in app.ts) and the `RoleSwitcher` header component, and delete the development `AUTH_BYPASS` env var.

**FK safety:** no table references `usersTable` (only sessions), so a bypass user id need not exist in the DB to satisfy foreign keys. (The role-switch bypass users use the seeded ids user_admin/user_coord/user_pm/user_finance, which do exist after seed-uat — keeping approval attributions clean.)
