---
name: Drizzle over Prisma
description: Workspace uses Drizzle ORM (drizzle-orm/node-postgres), not Prisma. Never switch ORM.
---

The spec mentions Prisma but the workspace was scaffolded with Drizzle ORM. All schema, migrations, and query code uses Drizzle. Do not introduce Prisma.

**Why:** The lib/db package was bootstrapped with drizzle-orm/node-postgres, drizzle-kit, and a drizzle.config.ts before this project started. Switching would require rewriting all schema and throwing away the push workflow.

**How to apply:** Any time a spec or prompt says "Prisma", translate to Drizzle equivalents (drizzle-kit push instead of prisma db push, db.select/insert/update/delete instead of prisma.model.findMany, etc.).
