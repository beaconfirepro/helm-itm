---
name: Seed drift vs runtime recompute
description: Why UAT/base seeds must re-assert canonical collection/stream states with explicit UPDATEs
---

Rule: Collection account `status`/`escalationStage` and lien-stream `status` are
derived fields the app recalculates from invoice + promise data whenever a
recompute action runs. The base seed inserts with `onConflictDoNothing`, so once
a row has drifted it can never be reset by re-running the base seed.

**Why:** During UAT enrichment, `str_comm_con` (canonical at_risk example) and
`acct_late` (canonical pre_lien_notice example) had drifted to `filing` /
`lien_filing`, which silently removed the only `pre_lien_notice` example from the
seeded baseline — breaking the "every enum state represented" guarantee.

**How to apply:** In the enrichment seed (seed-uat.ts) add idempotent explicit
`UPDATE ... WHERE id+orgId` steps that re-assert canonical derived states after
the base seed runs. Verify the full enum spread via the API after seeding, not
just by checking row counts.
