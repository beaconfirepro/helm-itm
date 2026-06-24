---
name: zod not available directly in api-server
description: api-server has no direct zod dependency; validation libs must be added or hand-rolled
---

api-server (`artifacts/api-server`) does NOT list `zod` in its package.json. It
depends on `@workspace/api-zod`, but that package only re-exports its generated
api/types (`./generated/api`, `./generated/types`) — it does NOT re-export `z`.

So `import { z } from "zod"` inside api-server fails typecheck with
`Cannot find module 'zod'`.

**Why:** the workspace keeps zod as an internal dependency of api-zod only;
api-server validates request bodies with plain manual checks.

**How to apply:** when adding request validation in api-server, either hand-roll
the validation (return `{ success, data } | { success, issues }`) or add `zod`
(`catalog:`) to api-server's package.json first. The configurable risk-scoring
calculator chose hand-rolled validation to avoid the dependency.
