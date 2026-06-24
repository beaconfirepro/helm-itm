---
name: Shippo stub fallback
description: Shippo certified-mail client uses a stub fallback when its env var is absent. (NotaryLive no longer stubs — see notarylive-v3.md.)
---

**Rule:** `lib/shippo.ts` checks for `SHIPPO_API_KEY`. If absent, it returns deterministic fake data so the full certified-mail flow can run in dev without a real account.

**Why:** Paid third-party service. Dev/test environments should not require live credentials. The stub returns realistic tracking numbers that let the backend state machine advance normally.

**How to apply:**
- Set `SHIPPO_API_KEY` in production env secrets to activate real certified-mail labels.
- For webhook testing in dev, use `SHIPPO_WEBHOOK_SECRET` to enable signature validation.

**NotaryLive changed:** `lib/notarylive.ts` no longer uses a fake stub. It now always makes REAL v3 calls, falling back to public sandbox creds when `NOTARYLIVE_API_USER`/`NOTARYLIVE_API_KEY` are unset. There is no NotaryLive webhook (completion is polled). See `notarylive-v3.md`.
