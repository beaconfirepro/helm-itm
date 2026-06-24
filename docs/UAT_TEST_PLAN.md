# LiensEasy by HELM — User Acceptance Test (UAT) Plan

This plan walks a tester through verifying every major feature of LiensEasy against
the seeded test data. It is written so a non-technical tester can follow it.

Each feature area is split into two groups:

- **Automated (AI-testable)** — cases an automated UI/API test agent can verify
  without human judgment (page loads, lists rendering seeded data, form
  submissions/validation, API responses, deadline math, state transitions
  visible in the UI, and role-gated controls showing/hiding for the right role).
- **Manual (human-required)** — cases that need a person: real third-party
  effects, legal-content accuracy review, real phone/email outreach, and
  subjective visual/UX judgment.

> **Third-party stubs in this environment:** Shippo (certified mail),
> NotaryLive (notarization), QuickBooks Online (QBO), HubSpot, and Connecteam
> are **stubbed** unless live API keys are present. Any test that depends on a
> *real* external effect (a letter physically delivered, a notary session, a
> live CRM/accounting sync) is therefore in the **Manual** group and is noted as
> stub-backed. The stubs return deterministic fake data, so the *in-app* state
> transitions they drive (e.g. a notice moving to `sent`) **are** automatable.

---

## 1. How to set up

### 1.1 Seed the data

Run these in order from the project root. Each script is idempotent and safe to
re-run.

```bash
# 1) Base seed (org, jurisdiction, rules, projects, streams, invoices,
#    notices, waivers, filing, dunning, holds)
pnpm --filter @workspace/db run seed

# 2) Phase 5 (waivers across approval states + a mailing record)
cd artifacts/api-server && pnpm dlx tsx src/scripts/seed-phase5.ts

# 3) Phase 6 (filed lien + signed release + a lapsed stream)
pnpm dlx tsx src/scripts/seed-phase6.ts

# 4) UAT enrichment (per-role users + every remaining enum state:
#    healthy/approaching/released/filing/closed streams, delivered notice,
#    approved & handed-to-GC & rejected waivers, all collections escalation
#    stages, payment-plan states, and canonical-status restores)
pnpm dlx tsx src/scripts/seed-uat.ts
```

All data is scoped to the single test org `org_beacon_test_001`.

### 1.2 Start the app

- Start the **API Server** workflow and the **web** workflow.
- Open the web app from the preview pane (the **LiensEasy by HELM** artifact,
  served at `/`).
- The API is reachable for direct checks at
  `https://$REPLIT_DEV_DOMAIN/api/...`.

### 1.3 Log in as each role

The app uses Replit Auth. App-managed roles (`admin`, `pm`, `finance`,
`coordinator`) live in the `users.role` column. The seed creates one user per
role:

| Role | User id | Email | Name |
|------|---------|-------|------|
| Tenant Admin | `user_admin` | admin@beacon.test | Avery Admin |
| Project Coordinator | `user_coord` | coordinator@beacon.test | Casey Coordinator |
| Project Manager (PM) | `user_pm` | pm@beacon.test | Pat Project-Manager |
| Finance Manager | `user_finance` | finance@beacon.test | Robin Finance |

**Three ways to test as a role:**

1. **In-app role switcher (recommended — no developer help needed).** When the
   dev login bypass is active (`AUTH_BYPASS=1`, development only), a **role
   picker** appears in the top header (the orange "Tenant Admin ▾" control next
   to the search box). Open it and choose **Tenant Admin**, **Project
   Coordinator**, **Project Manager**, or **Finance Manager**. The app reloads
   signed in as that role's seeded user (Avery/Casey/Pat/Robin), so you can
   exercise every role-gated action — both the *allowed* path (it works) and the
   *blocked* path (you get a 403 / the control is hidden) — without touching the
   database. Switch back to Tenant Admin at any time.
2. **Dev auth bypass default (fastest, admin).** With `AUTH_BYPASS=1` and no
   role chosen in the switcher, every request is treated as an authenticated
   **admin**. Ideal for admin-allowed flows and automated runs, because `admin`
   is a super-role that passes every gate. On its own (without switching) it
   **cannot** verify that a *non-admin* is correctly *blocked*.
3. **Real login per role.** Log in via Replit Auth, then set that signed-in
   user's `role` to the role under test (the seeded users above show the intended
   role values). Equivalent to option 1 but requires DB access.

> **How the switcher works:** it calls `GET /api/dev/auth` to learn the
> available roles and `POST /api/dev/auth/role` to assume one (sets the
> `dev_role` cookie). Both endpoints are **only** available while the dev bypass
> is active and return 404 / report disabled in any deployed environment, so the
> switcher never appears in production.

> **Automated role-gate testing:** an automated agent verifies role gates by
> driving the API with a session whose role is set to the value under test
> (POST `/api/dev/auth/role` with `{ "role": "pm" }`, then reuse the returned
> `dev_role` cookie), asserting `200` for the allowed role and `403` for a
> disallowed one. The expected role for each gated action is listed in the test
> case.

### 1.4 Seed data quick reference

**Projects (Liens list)**

| Project | Name | Scenario | Streams |
|---------|------|----------|---------|
| `proj_comm` | Travis Office Retrofit | At-risk + design | `str_comm_con` (at_risk), `str_comm_des` (design, open) |
| `proj_2nd` | Oak Ave Apartments | Filed (2nd tier) | `str_2nd_con` (filed) |
| `proj_res` | Cedar Custom Home | Notice active + lapsed | `str_res_con` (notice_active), `str_lapsed_con` (lapsed) |
| `proj_healthy` | Riverside Data Center | Healthy | `str_healthy_con` (open) |
| `proj_approaching` | Lakeline Medical Plaza | Deadline approaching | `str_approaching_con` (open, deadline 2026-06-26) |
| `proj_released` | Hill Country Warehouse | Released | `str_released_con` (released) |
| `proj_extra` | Greenline Transit Hub | Filing + closed | `str_filing_con` (filing), `str_closed_con` (closed) |

**Notices:** `not_statutory` (sent, tracking `9400…0001`), `not_early` (draft),
`not_retainage` (approved / queued), `not_delivered` (delivered, with proof).

**Waivers:** `wv_uncond_prog` (pending_pm), `wv_uncond_final`
(pending_pm_finance), `wv_approved` (approved), `wv_gc` (approved + handed to
GC), `wv_rejected` (rejected), `wv_cond_prog` / `wv_cond_final` (not_required).

**Collection accounts:** `acct_good` (current/none), `acct_late`
(in_collections/pre_lien_notice — has dunning history, open/kept/broken/cancelled
promises, active plan), `acct_soft` (overdue/soft_collections), `acct_filing`
(escalated/lien_filing — defaulted plan), `acct_agency`
(escalated/agency_attorney), `acct_writeoff` (written_off/write_off),
`acct_promised` (promised/soft_collections — open promise suppresses alerts),
`acct_plan` (payment_plan — active plan), `acct_resolved` (resolved — completed
plan).

**Invoices (AR — drive collections):** Collections figures (overdue total,
oldest-overdue age, risk score) are **derived from live AR invoices**
(`invoice_links`, non-supplier, non-cleared) for each account's client on every
recompute — they are **not** static. Each non-trivial account is backed by
invoices that aggregate to its scenario, spread across aging buckets:
`cli_soft` (acct_soft) → ~8,200 overdue, oldest ~35d; `cli_filing` (acct_filing)
→ ~62,000, oldest ~120d; `cli_agency` (acct_agency) → ~95,000, oldest ~210d;
`cli_writeoff` (acct_writeoff) → ~15,000, oldest ~400d; `cli_promised`
(acct_promised) → ~20,000, oldest ~28d; `cli_plan` (acct_plan) → ~30,000, oldest
~60d; `cli_late` (acct_late) → 48,250 overdue (`inv_overdue`). `cli_good`
(acct_good) and `cli_resolved` (acct_resolved) have only cleared/paid invoices,
so they recompute to $0. Invoice due dates are anchored to the seed "today"
(2026-06-19), so figures are approximate (±a few days as real time passes).

**Holds:** `hold_sched` (schedule hold, active, `proj_comm`), `hold_mat`
(material hold, active, client `cli_late`), `hold_cleared` (schedule hold,
cleared, `proj_res`).

**Filings:** `fil_1` (filed, Dallas) + `rel_1` (signed release); `fil_released`
(filed) + `rel_released` (filed release); `fil_inprogress` (affidavit draft).

---

## 2. Dashboard (`/`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| DASH-A1 | Admin | Seed loaded | 1. Open `/`. | Dashboard renders without errors; summary widgets (at-risk count, upcoming deadlines, collections exposure) show non-zero numbers reflecting the seed. |
| DASH-A2 | Admin | `str_comm_con` at_risk, `str_lapsed_con` lapsed | 1. Open `/`. 2. Find the at-risk / lapsed summary. | At least one at-risk and one lapsed item are surfaced. |
| DASH-A3 | Admin | `dl_approaching_notice` due 2026-06-26 | 1. Open `/`. 2. Inspect the upcoming-deadlines widget. | The Lakeline Medical Plaza notice deadline (2026-06-26) appears in the upcoming/approaching list. |
| DASH-A4 | Admin | `acct_agency` exposure 95,000 | 1. Open `/`. | Collections exposure total reflects the sum of overdue accounts including the agency-stage account. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| DASH-M1 | Admin | Review the dashboard layout, spacing, and dark-theme branding. | Visual hierarchy, HELM branding, and readability are acceptable for go-live (subjective). |

---

## 3. Liens / Projects list (`/liens`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| LIEN-A1 | Admin | 7 seeded projects | 1. Open `/liens`. | All 7 projects render in the list with their names and counties. |
| LIEN-A2 | Admin | Mixed stream statuses | 1. Open `/liens`. 2. Read each project's risk/status badge. | Riverside Data Center shows healthy/low risk; Travis Office Retrofit shows high risk (at-risk); Hill Country Warehouse shows released/ok. |
| LIEN-A3 | Admin | Risk filter exists | 1. Filter the list by "high" risk. | Only high-risk projects remain (at_risk/lapsed/filing streams). |
| LIEN-A4 | Admin | Global record set | 1. Use the list search to search "Oak". | Oak Ave Apartments is found. |
| LIEN-A5 | Admin | — | 1. Click a project row. | Navigates to that project's detail page (`/projects/:id`). |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| LIEN-M1 | Admin | Judge whether the risk color coding reads intuitively at a glance. | Colors/labels communicate urgency clearly (subjective). |

---

## 4. Project Detail (`/projects/:id`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| PROJ-A1 | Admin | `proj_comm` | 1. Open `/projects/proj_comm`. | Project header, parties (owner + GC), and both streams (construction at_risk, design open) render. |
| PROJ-A2 | Admin | `proj_2nd` 2nd-tier, checklist incomplete | 1. Open `/projects/proj_2nd`. | Completion checklist shows it is incomplete and lists the missing 2nd-tier requirements. |
| PROJ-A3 | Admin | `proj_comm` `wm_mar` overdue + deadlines | 1. Open `/projects/proj_comm`. 2. View the construction stream timeline. | March work month shows overdue; notice (2026-06-15) and filing (2026-07-15) deadlines are listed. |
| PROJ-A4 | Admin | `proj_approaching` | 1. Open `/projects/proj_approaching`. | Notice deadline 2026-06-26 and retainage deadline 2026-07-01 are shown for the approaching stream. |
| PROJ-A5 | Coordinator | An open stream with an uncovered month | 1. Trigger "recompute deadlines" on a stream. | Deadlines recompute and persist without error; recomputed dates follow the Texas business-day rules. |
| PROJ-A6 | Coordinator | `proj_approaching` construction stream | 1. Create a notice inline from the stream, setting a claim amount. | Notice is created in `draft` with the claim amount saved. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| PROJ-M1 | Coordinator | Open the generated notice/affidavit and read it. | Legal content, statute citations, party names, and amounts are accurate and appropriate (legal review). |
| PROJ-M2 | Admin | Confirm HubSpot project linkage data is correct against the real CRM. | Cached project/party data matches the live HubSpot record (HubSpot is stubbed here — requires a real account). |

---

## 5. Send Queue (`/send-queue`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| SEND-A1 | Admin | `not_early` draft, `not_retainage` approved, `not_statutory` sent, `not_delivered` delivered | 1. Open `/send-queue`. | Notices render grouped by status: a draft, an approved/queued item, a sent item, and a delivered item. |
| SEND-A2 | Coordinator | `not_early` draft | 1. Approve the draft notice. | Status moves draft → approved and an approver/timestamp is recorded. |
| SEND-A3 | Coordinator | `not_retainage` approved | 1. Click "Send" on the approved notice. | Status moves to `sent`; a mailing record with a (stubbed Shippo) tracking number is created. |
| SEND-A4 | Admin | `not_statutory` sent with `mail_1` | 1. Open the sent notice. | Tracking number `9400100000000000000001` is shown. |
| SEND-A5 | Admin | `not_delivered` delivered with `mail_delivered` | 1. Open the delivered notice. | Status `delivered`, a delivered timestamp, and a proof-of-delivery reference are shown. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| SEND-M1 | Coordinator | Send a notice and confirm a real certified-mail piece is produced and delivered. | A physical/certified mail item is actually generated and tracked (Shippo is stubbed here — requires a live key). |
| SEND-M2 | Coordinator | Read the outbound notice document before sending. | Notice wording and recipient addresses are correct for mailing (content review). |

---

## 6. Waivers (`/waivers`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| WAIV-A1 | Admin | 8 seeded waivers | 1. Open `/waivers`. | Waivers render across statuses: not_required, pending_pm, pending_pm_finance, approved, approved+handed-to-GC, rejected. |
| WAIV-A2 | PM | `wv_uncond_prog` (pending_pm) | 1. Approve as PM (`POST /api/waivers/wv_uncond_prog/approve-pm`). | `200`; status advances out of pending_pm; PM approver + timestamp recorded. |
| WAIV-A3 | Coordinator | `wv_uncond_prog` (pending_pm) | 1. Attempt PM approval. | `403` — PM gate requires role `pm` (or `admin`); the PM-approve control is hidden/blocked for a coordinator. |
| WAIV-A4 | Finance | `wv_uncond_final` (pending_pm_finance, PM step done) | 1. Approve as Finance (`POST /api/waivers/wv_uncond_final/approve-finance`). | `200`; status advances; Finance approver + timestamp recorded. |
| WAIV-A5 | PM | `wv_uncond_final` finance step | 1. Attempt finance approval as PM. | `403` — Finance gate requires role `finance` (or `admin`). |
| WAIV-A6 | Admin | `wv_gc` (approved) | 1. Open `/waivers`. 2. Find `wv_gc`. | Shows "provided to GC" / handed-to-GC indicator set to true. |
| WAIV-A7 | Coordinator | `wv_approved` (approved, not yet handed over) | 1. Mark the waiver as handed to the GC. | The provided-to-GC flag flips to true and persists. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| WAIV-M1 | Coordinator | Send `wv_cond_prog` (requires notarized) for notarization. | A real notary session is initiated/completed (NotaryLive is stubbed here — requires a live key). |
| WAIV-M2 | PM | Read a generated waiver document. | Waiver type, conditional/unconditional language, and amounts are legally correct (content review). |

---

## 7. Collections (`/collections` and `/collections/:accountId`)

> **Collections figures are invoice-derived, not static.** Each account's overdue
> total, oldest-overdue age, and risk score are recomputed from its client's live
> AR invoices (`invoice_links`, non-supplier, non-cleared) on every recompute —
> a recompute happens automatically whenever the account detail page
> (`GET /api/collections/accounts/:id`) is opened, and again whenever an invoice
> is cleared. `status` and `escalationStage` are seeded scenario state and are
> **not** changed by a recompute (except: clearing the last overdue invoice moves
> a non-written-off account to `current`). See seed reference 1.4 → Invoices.

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| COLL-A1 | Admin | 9 seeded accounts | 1. Open `/collections`. | All 9 accounts render with their status and escalation stage. |
| COLL-A2 | Admin | Every escalation stage seeded | 1. Filter/scan by escalation stage. | Each stage is represented: none, soft_collections, pre_lien_notice, lien_filing, agency_attorney, write_off. |
| COLL-A3 | Admin | `acct_late` | 1. Open `/collections/acct_late`. | Dunning history (activity), promises (open/kept/broken/cancelled), and the active payment plan are all shown. |
| COLL-A4 | Admin | `acct_promised` open promise (future date) | 1. Open `/collections/acct_promised`. | The open promise-to-pay is shown and the account indicates alerts are suppressed by the promise. |
| COLL-A5 | Admin | `acct_plan` active plan + installments | 1. Open `/collections/acct_plan`. | The active payment plan and its installments (one paid, two pending) render. |
| COLL-A6 | Coordinator | `acct_soft` | 1. Record a new collection activity (e.g. a phone call note). | Activity is saved and appears at the top of the history. |
| COLL-A7 | Coordinator | `acct_promised` | 1. Add a new promise-to-pay; later 2. update its status to kept/broken. | Promise is created `open`; status update persists. |
| COLL-A8 | Admin | `acct_agency` escalated | 1. Perform the admin-only write-off action. | `200`; account moves to written_off / write_off stage. |
| COLL-A9 | Coordinator | `acct_agency` | 1. Attempt the admin-only write-off action. | `403` — "Admin role required"; the write-off control is hidden/blocked for a coordinator. |
| COLL-A10 | Admin | AR invoices seeded (1.4) | 1. Trigger a recompute by opening the account detail page (`GET /api/collections/accounts/:id`) for each backed account. | The recomputed `totalOverdue` / `oldestOverdueDays` match the seeded scenario from invoices (within a few days for age), e.g. `acct_agency` ≈ 95,000 / ~210d, `acct_filing` ≈ 62,000 / ~120d, `acct_soft` ≈ 8,200 / ~35d; `acct_good` and `acct_resolved` stay at $0. Status/stage are unchanged by the recompute. |
| COLL-A11 | Coordinator | `acct_soft` backed by `inv_soft_1` (5,000) + `inv_soft_2` (3,200) | 1. Note `acct_soft` overdue (~8,200). 2. Clear one invoice (`POST /api/invoices/inv_soft_1/clear` with `{clearedFlag:true}`). 3. Re-open `acct_soft`. | After the clear, `acct_soft` overdue drops by the cleared amount (~8,200 → ~3,200) on the next recompute; clearing all overdue invoices would move the account to `current`. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| COLL-M1 | Coordinator | Work the call queue: actually phone/email the customer on `acct_late`. | Real outreach is performed and logged (human action). |
| COLL-M2 | Admin | Confirm the HubSpot note write-back lands on the real company record. | A note is written back to HubSpot (stubbed here — requires a real account). |
| COLL-M3 | Finance | Confirm overdue amounts reconcile with QuickBooks. | Account balances match live QBO data (QBO is stubbed here). |

---

## 8. Holds / Vendor Holds (`/holds`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| HOLD-A1 | Admin | `hold_sched`, `hold_mat`, `hold_cleared` | 1. Open `/holds`. | A schedule hold and a material hold render as active; the cleared hold shows a cleared date (or is filtered out of "active"). |
| HOLD-A2 | Admin | Hold engine | 1. Trigger "recompute holds" (`POST /api/holds/recompute`). | Recompute returns success; holds reflect current overdue/threshold state. |
| HOLD-A3 | Admin | `hold_sched` on `proj_comm` | 1. Clear the active schedule hold. | Hold gains a cleared timestamp and drops out of the active list. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| HOLD-M1 | Admin | Confirm a placed hold actually prevents scheduling/material release in the real operational process. | The hold has the intended real-world effect (process check). |

---

## 9. Filing workspace (`/filing` and `/filing/:streamId`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| FILE-A1 | Admin | `fil_1`, `fil_released`, `fil_inprogress` | 1. Open `/filing`. | Filings render across statuses: filed (×2) and affidavit_draft (in progress). |
| FILE-A2 | Admin | `str_2nd_con` filed via `fil_1` | 1. Open `/filing/str_2nd_con`. | Filing detail shows Dallas county, recording ref `2026-DAL-00123`, filing/post-filing/enforcement dates, and the signed release `rel_1`. |
| FILE-A3 | Admin | `str_released_con` | 1. Open `/filing/str_released_con`. | Shows the filed lien `fil_released` and the filed release `rel_released`. |
| FILE-A4 | Admin | `str_filing_con` affidavit_draft | 1. Open `/filing/str_filing_con`. | Filing is in the affidavit-draft stage with the draft document reference. |
| FILE-A5 | Coordinator | A filed lien | 1. Download/generate the lien affidavit PDF. | A PDF is produced and downloadable. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| FILE-M1 | Admin | Hand a filing off to Texas Easy Lien (county recording). | The lien is actually recorded with the county (external filing handoff — stub/manual here). |
| FILE-M2 | Coordinator | Read the generated affidavit before recording. | Legal accuracy of the affidavit (parties, legal description, amount, statute) is verified (legal review). |

---

## 10. Settings / Config (`/settings`)

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| CONF-A1 | Admin | Reference tree seeded | 1. Open `/settings`. | Departments, system types, sub-system types, jurisdictions, rule sets, rules, and stage triggers render. |
| CONF-A2 | Admin | `rs_tx_2022` Texas rule set | 1. View the Texas rule set and its rules. | All seeded rules (notice/filing/retainage/post-filing/enforcement/design) are listed with their statute citations. |
| CONF-A3 | Admin | — | 1. Create a new department (`POST /api/departments`). | `200`; department is created and appears in the list. |
| CONF-A4 | Coordinator | — | 1. Attempt to create/edit any config entity. | `403` — config mutations require `admin`; the add/edit controls are hidden/blocked for non-admins. |
| CONF-A5 | Admin | A rule set | 1. Toggle "legal reviewed" on a rule set (`PATCH /api/rule-sets/:id/review`). | `200`; the reviewed flag updates. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| CONF-M1 | Admin | Review the seeded Texas statute citations and offsets. | Rule offsets and citations are legally correct for Texas Ch. 53 (legal review). |
| CONF-M2 | Admin | If a document/template editor is present, customize a client document with merge fields. | Subjective check that the rendered template/merge output reads correctly. |

---

## 11. User access & roles

### Automated (AI-testable)

| # | Role | Precondition | Steps | Expected result |
|---|------|--------------|-------|-----------------|
| USER-A1 | Any | Seeded roles | 1. Call `GET /api/auth/user` while logged in. | Returns the current authenticated user (`id`, `email`, name, avatar). Role is not part of this response payload — it is enforced server-side and verified by the role-gate cases (e.g. WAIV-A3/A5, COLL-A9, CONF-A4, USER-A3). |
| USER-A2 | Logged out | — | 1. Call a protected `/api/*` route with no session. | `401` (or redirect to login); the app shows the login gate. |
| USER-A3 | Admin vs others | Role gates above | 1. Re-run WAIV-A2/A3, WAIV-A4/A5, COLL-A8/A9, CONF-A3/A4 across roles. | Allowed role → `200`; disallowed role → `403`; `admin` passes all as the super-role. |

### Manual (human-required)

| # | Role | Steps | Expected result |
|---|------|-------|-----------------|
| USER-M1 | New invitee | Log in as a brand-new user with no role assigned. | A friendly "no access yet" screen is shown (human verifies the message/tone). |
| USER-M2 | Admin | If a user-management screen exists, change another user's role. | The role change takes effect and is reflected in that user's permissions. |

---

## 12. Enum-state coverage checklist

The seed (base + phase5 + phase6 + UAT) covers at least one record for every
state below. Use this to confirm filters have something to show.

- **LienStreamStatus:** open, at_risk, notice_active, filing, filed, released, closed, lapsed
- **NoticeStatus:** draft, approved, sent, delivered
- **WaiverApprovalStatus:** not_required, pending_pm, pending_pm_finance, approved, rejected (+ handed-to-GC flag)
- **FilingStatus:** affidavit_draft, filed
- **ReleaseStatus:** signed, filed
- **CollectionStatus:** current, overdue, in_collections, promised, payment_plan, escalated, written_off, resolved *(status is seeded scenario state; the overdue total / oldest-age / risk score shown alongside it are derived from live AR invoices on recompute — see 1.4 → Invoices and section 7)*
- **EscalationStage:** none, soft_collections, pre_lien_notice, lien_filing, agency_attorney, write_off
- **PromiseStatus:** open, kept, broken, cancelled
- **PaymentPlanStatus:** active, defaulted, completed, cancelled
- **CollectionActivityMethod:** email, phone, letter, sms, portal, in_person
- **HoldType:** schedule_hold, material_hold (+ cleared)
- **SupplierNoticeRiskStatus:** flagged, cleared
- **User roles:** admin, pm, finance, coordinator
