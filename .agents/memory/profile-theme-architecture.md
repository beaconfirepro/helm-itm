---
name: Profile & theme architecture (LiensEasy web)
description: How user profile, avatar separation, and theme persistence are wired across DB/session/API/frontend.
---

The LiensEasy Profile feature (display name, avatar, theme/language/currency) has three non-obvious design decisions worth keeping consistent.

## Avatar is SEPARATE from the synced profile image
`usersTable.avatarUrl` (user-uploaded object-storage path) is a DISTINCT column from `profileImageUrl` (Replit-OIDC-synced). The login upsert only ever writes `profileImageUrl`, so it can never clobber a user's uploaded photo. The API's `buildAuthUserResponse` computes an *effective* `avatarUrl` = `avatarUrl ? /api/storage<path> : profileImageUrl`, plus a `hasCustomAvatar` boolean.
**Why:** requirement was that re-login must not wipe the uploaded avatar.
**How to apply:** never merge these two columns; never write `avatarUrl` from the OIDC callback.

## Session carries only an identity snapshot — preferences are read fresh
`AuthedUser` / `Express.User` were deliberately decoupled from the generated `AuthUser` type and kept as an explicit minimal shape `{id,email,firstName,lastName,profileImageUrl,role}`. The new preference/avatar fields live ONLY in the freshly-built `GET /api/auth/user` response (which re-reads the DB row via `ensureUserRow` + `buildAuthUserResponse`), NOT in the session token.
**Why:** avoids threading new fields through the session and the AUTH_BYPASS synthetic user, and means profile edits take effect without re-issuing a session.
**How to apply:** read preferences from the DB on each `/auth/user`; don't stuff them into `SessionData`. `ensureUserRow` lazily creates a row for session-only identities (e.g. AUTH_BYPASS `dev-bypass-user`).

## Theme: server is source of truth, localStorage is a no-flash cache
- Inline script in `index.html` (runs before paint) reads `localStorage["liengeasy-theme"]` and toggles `.dark` on `<html>` — prevents the flash. The `.dark` class lives on `documentElement`, not `<body>` (body class was removed).
- `src/lib/theme.tsx` `ThemeProvider` holds the preference, applies `.dark`, listens to `matchMedia` when in `system` mode, and on `setTheme` writes localStorage + best-effort `PATCH /api/profile`.
- AppShell adopts the server value once via `syncFromServer(user.theme)` on first user load (a `useRef` guards single-run), so theme follows the account across devices/re-login.
- Header toggle and the Profile page both drive the same `useTheme()` context, so they stay in sync.
**Why:** previously theme was local React state defaulting to dark → reset on every refresh.
**How to apply:** the header toggle persists to the server too (not just local), otherwise toggles wouldn't survive re-login.

## Cross-component auth refresh
`@workspace/replit-auth-web` exposes `refreshAuth()` (fires a `auth:refresh` window event) and `useAuth().refetch`. Profile mutations call `refreshAuth()` so the AppShell header avatar/name update live without a full reload.
