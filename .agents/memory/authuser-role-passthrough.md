---
name: AuthUser role passthrough
description: Why a new field on the authenticated user must be added to the OpenAPI AuthUser schema, not just the DB/session.
---
The session user (req.user) carries `role`, but GET /api/auth/user runs the
payload through `GetCurrentAuthUserResponse.parse(...)`, which strips any field
not present in the generated zod schema. So the web client never sees a field
unless it is declared on the `AuthUser` schema in `lib/api-spec/openapi.yaml`.

**Why:** role was already on the session but absent from the web `AuthUser`
type; admin-only UI gating needs it client-side.

**How to apply:** to expose any new authenticated-user field to the frontend:
1. add it to `AuthUser` in `lib/api-spec/openapi.yaml`,
2. run `pnpm --filter @workspace/api-spec run codegen`,
3. ensure the auth route includes it in the session user object.
The generated web type lives at `lib/api-zod/src/generated/types/authUser.ts`.
