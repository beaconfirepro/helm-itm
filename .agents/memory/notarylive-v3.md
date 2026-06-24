---
name: NotaryLive v3 integration
description: Real NotaryLive v3 API contract, sandbox behavior, and the no-webhook polling decision.
---

# NotaryLive v3 (RON) integration

Real contract (verified live against sandbox):
- Auth: HTTP Basic (`api_user`:`api_key`). Public sandbox creds: `api_test_user` / `api_test_key`.
- Create: `POST https://notarylive.com/api/v3/order/create` with `{internal_id, participants:[{first_name,last_name,email,type:"signer",preupload_id?}]}` → `{success:1, link_to_order}` (order id is the `oid` in the returned URL).
- Status: `POST https://notarylive.com/api/v3/order/status` with `{order_id:<our internal_id>}` → `{success:1, status, document_urls}`. `status === "notarized"` means done.

**No webhook in v3.** Completion is discovered by polling order/status — there is no inbound callback. Any `/webhooks/notarylive` route is dead and was removed; do not reintroduce a webhook completion path. The poll lives in `waivers.ts` `POST /waivers/:id/notary-refresh` and generic `notary.ts` status endpoint.

**Why:** an earlier stub left an unauthenticated, non-org-scoped `/webhooks/notarylive` mutation handler. With no real v3 webhook it was both misleading and an access-control hole, so polling is the sole completion path.

**How to apply:** real creds come from `NOTARYLIVE_API_USER` / `NOTARYLIVE_API_KEY`; absent those, the client falls back to the documented public sandbox creds and makes REAL calls (no fake stub). Sandbox orders never reach `"notarized"` (payment/notarial session disabled) — they sit at `"paid"`, so the notarized-completion branch can only be exercised with real creds.
