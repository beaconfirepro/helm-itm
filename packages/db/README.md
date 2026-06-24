# @beacon/db

**Prisma** schema + client over **Supabase Postgres**. Tower owns the database; modules
contribute **namespaced slices**. RLS (keyed off the Clerk `org_id` claim) is the tenant-
isolation backstop; app code also filters by `orgId` (sourced only from the Clerk session).

- `prisma/schema.prisma` — first-pass Drizzle→Prisma translation of the lien-collections slice
  (35 models, 25 enums; `@@map` preserves physical names so it binds to the existing DB).
- `prisma/SCHEMA_NOTES.md` — **read before migrating.** Relations are *inferred* (the Drizzle
  source had no foreign keys), so a referential-integrity audit/cleanup is required before
  `prisma migrate`.
