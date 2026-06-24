---
name: Seed runner
description: How to execute TypeScript seed scripts in this workspace.
---

`tsx` is not installed globally in the Replit container. The correct way to run a TypeScript seed script is:

```bash
cd lib/db && pnpm dlx tsx src/seed.ts
```

`pnpm dlx` downloads and runs tsx on-demand without a global install. The seed script in lib/db/package.json uses this same command.

**Why:** `npx tsx` and bare `tsx` both fail with "command not found" in this environment.

**How to apply:** Whenever you need to run any TypeScript file directly (seed, one-off migration, CLI tool), use `pnpm dlx tsx <file>` from the package directory.
