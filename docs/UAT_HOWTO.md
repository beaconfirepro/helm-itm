# LiensEasy by HELM — UAT How-To Guide

This guide teaches a non-technical tester **how to operate every feature** of
LiensEasy by HELM: where to click, what to type, and what should happen. It is
the companion to [`UAT_TEST_PLAN.md`](./UAT_TEST_PLAN.md), which lists the
pass/fail cases. Wherever a walkthrough lets you complete specific test cases,
the case IDs (e.g. `DASH-A1`) are listed so you can move between this guide and
the checklist.

> **How to read this guide.** Each feature area has: **Where to find it** (the
> navigation path), a **numbered procedure** for each key action, **What you
> should see**, the **seeded records** to act on, and **role notes** (who is
> allowed, and what a blocked user sees). Third-party effects that only happen
> with live API keys are flagged.

> **A note on accuracy.** This guide describes the app **as it is built today**.
> In a few places the live UI differs from what `UAT_TEST_PLAN.md` assumes
> (e.g. the write-off admin gate, hand-to-GC, inline claim amount, the Vendor
> Holds page). Those differences are called out in **⚠️ Heads-up** boxes so you
> are not surprised when a case behaves differently than the plan's "expected
> result." Report them as findings if they matter for go-live.

---

## 1. Getting started

### 1.1 Seed the sample data

Run these from the project root, in order. Each is idempotent (safe to re-run).
This is the same sequence documented in `UAT_TEST_PLAN.md` §1.1.

```bash
# 1) Base seed (org, jurisdiction, rules, projects, streams, invoices,
#    notices, waivers, filing, dunning, holds)
pnpm --filter @workspace/db run seed

# 2) Phase 5 (waivers across approval states + a mailing record)
cd artifacts/api-server && pnpm dlx tsx src/scripts/seed-phase5.ts

# 3) Phase 6 (filed lien + signed release + a lapsed stream)
pnpm dlx tsx src/scripts/seed-phase6.ts

# 4) UAT enrichment (per-role users + every remaining enum state)
pnpm dlx tsx src/scripts/seed-uat.ts
```

All data is scoped to the single test org `org_beacon_test_001`.

### 1.2 Start the app

- Start the **API Server** workflow and the **web** workflow.
- Open the web app from the preview pane (the **LiensEasy by HELM** artifact,
  served at `/`).
- For direct API checks, the server is reachable at
  `https://$REPLIT_DEV_DOMAIN/api/...`.

### 1.3 Log in and switch roles

The app uses Replit Auth. App-managed roles live in the `users.role` column. The
seed creates one user per role:

| Role | User id | Email | Name |
|------|---------|-------|------|
| Tenant Admin | `user_admin` | admin@beacon.test | Avery Admin |
| Project Coordinator | `user_coord` | coordinator@beacon.test | Casey Coordinator |
| Project Manager (PM) | `user_pm` | pm@beacon.test | Pat Project-Manager |
| Finance Manager | `user_finance` | finance@beacon.test | Robin Finance |

**Two ways to test as a role** (see `UAT_TEST_PLAN.md` §1.3 for the full
explanation):

1. **Dev auth bypass (fastest, admin only).** With `AUTH_BYPASS=1` set
   (development only), every request is treated as an authenticated **admin**.
   `admin` is a super-role that passes every gate, so this is ideal for walking
   through all the "happy path" steps. It **cannot** show you a non-admin being
   blocked.
2. **Real login per role (for negative / role-gate tests).** Log in via Replit
   Auth, then set that user's `role` to the role under test. Use this to confirm,
   e.g., a PM can approve a PM-gated waiver but a coordinator gets a 403.

> **What a blocked (403) user experiences.** When you try an action your role is
> not allowed to do, the server refuses it with HTTP **403** and a short message
> (e.g. *"Admin access required — this action is restricted to administrators"*
> for config, or *"Insufficient role: PM gate requires role 'pm'…"* for waivers).
> In the UI, the action either fails quietly (the item does not change) or the
> control is not offered for your role. To see the exact message, watch the
> network response or drive the API directly.

### 1.4 Third-party services: live vs. stub

These external services are **stubbed** unless a live API key is present:

| Service | Used for | Key | Stub behavior |
|---------|----------|-----|---------------|
| Shippo | Certified-mail send/tracking | `SHIPPO_API_KEY` | Returns a deterministic fake tracking number; the notice still moves to `sent` |
| NotaryLive | Waiver notarization (RON) | `NOTARYLIVE_API_KEY` | Returns a sandbox signing session; completion is polled, not delivered |
| HubSpot | CRM project/company data + activity write-back | `HUBSPOT_API_KEY` | Reads canned fixtures; activity write-back returns a stub id `hs_act_stub_…` |
| QuickBooks Online | Invoice/aging sync | `QBO_*` secrets | Serves cached `invoice_links` data; no live pull |

The **in-app** state changes these drive (a notice moving to `sent`, an account
showing an activity) work in stub mode. The **real external effect** (a letter
mailed, a note appearing in HubSpot) only happens in live mode. Tests that need
the real effect are the **Manual** cases in `UAT_TEST_PLAN.md`.

### 1.5 Seeded records quick reference

Use these by name so you always have concrete data to act on. (Full table in
`UAT_TEST_PLAN.md` §1.4.)

- **Projects:** `proj_comm` Travis Office Retrofit (at-risk + design),
  `proj_2nd` Oak Ave Apartments (filed, 2nd tier), `proj_res` Cedar Custom Home
  (notice active + lapsed), `proj_healthy` Riverside Data Center (healthy),
  `proj_approaching` Lakeline Medical Plaza (deadline 2026-06-26),
  `proj_released` Hill Country Warehouse (released), `proj_extra` Greenline
  Transit Hub (filing + closed).
- **Notices:** `not_statutory` (sent, tracking `9400…0001`), `not_early`
  (draft), `not_retainage` (approved/queued), `not_delivered` (delivered, proof).
- **Waivers:** `wv_uncond_prog` (pending_pm), `wv_uncond_final`
  (pending_pm_finance), `wv_approved` (approved), `wv_gc` (approved + handed to
  GC), `wv_rejected` (rejected), `wv_cond_prog` / `wv_cond_final` (not_required).
- **Collection accounts:** `acct_good`, `acct_late`, `acct_soft`, `acct_filing`,
  `acct_agency`, `acct_writeoff`, `acct_promised`, `acct_plan`, `acct_resolved`.
- **Holds:** `hold_sched`, `hold_mat`, `hold_cleared`.
- **Filings:** `fil_1` + `rel_1`; `fil_released` + `rel_released`;
  `fil_inprogress`.

### 1.6 Navigation map

The left sidebar is the main navigation. Exact menu labels and paths:

| Sidebar label | Path | Page |
|---------------|------|------|
| Dashboard | `/` | Dashboard |
| Projects | `/liens` | Liens / Projects list |
| Filings | `/filing` | Filing workspace list |
| Waivers | `/waivers` | Waivers |
| Collections | `/collections` | Collections pipeline |
| Vendor Holds | `/holds` | Vendor Holds |
| Company Settings (sidebar footer) | `/settings` | Settings / Config |

Other paths you reach by clicking into a record: `/projects/:id` (project
detail), `/collections/:accountId` (account detail), `/filing/:streamId` (filing
workspace), `/send-queue` (Send Queue — opened from the Liens workspace).

---

## 2. Dashboard

**Where to find it:** Sidebar → **Dashboard** (path `/`). This is the landing
page after login.

**What you should see:** a KPI strip of six cards — **Active Streams**, **At
Risk · This Month**, **Rights Lapsed**, **In Collections**, **AR Overdue**,
**Active Holds** — followed by **Liens Snapshot** (active projects with a
deadline countdown), **Accounts receivable aging** (total + bar chart), **Top
Accounts by Risk**, **Overdue Pipeline by Stage**, and **Due This Month**.

**Procedure:**
1. Open `/`. Confirm every KPI card shows a number (non-zero where seed data
   exists). → completes **DASH-A1**.
2. Find the at-risk / lapsed indicators. At least one at-risk stream
   (Travis Office Retrofit / `str_comm_con`) and one lapsed stream
   (`str_lapsed_con`) should be reflected. → completes **DASH-A2**.
3. Look at the upcoming/approaching deadlines (Liens Snapshot / Due This Month).
   The **Lakeline Medical Plaza** notice deadline **2026-06-26** should appear.
   → completes **DASH-A3**.
4. Read the AR / collections exposure total. It should reflect the sum of overdue
   accounts, including the agency-stage account `acct_agency` ($95,000). →
   completes **DASH-A4**.
5. (Optional) Click a project in **Liens Snapshot** or **Due This Month** to jump
   to Project Detail; click a row in **Top Accounts** to open Account Detail;
   click a stage in **Overdue Pipeline** to open a filtered Collections list.

**Manual / subjective:** judge layout, spacing, and HELM dark-theme branding
(**DASH-M1**).

---

## 3. Liens / Projects list

**Where to find it:** Sidebar → **Projects** (path `/liens`).

**What you should see:** all 7 seeded projects with names, counties, and a
risk/status badge, plus a search box and a risk filter.

**Procedure:**
1. Open `/liens`. Confirm all **7** projects render with names and counties. →
   completes **LIEN-A1**.
2. Read each project's risk badge. **Riverside Data Center** = healthy/low,
   **Travis Office Retrofit** = high (at-risk), **Hill Country Warehouse** =
   released/ok. → completes **LIEN-A2**.
3. Filter by **high** risk. Only high-risk projects (at_risk / lapsed / filing
   streams) remain. → completes **LIEN-A3**.
4. Type **Oak** in the search box. **Oak Ave Apartments** is found. → completes
   **LIEN-A4**.
5. Click any project row. You navigate to `/projects/:id`. → completes
   **LIEN-A5**.

**Manual / subjective:** judge whether the risk color coding reads intuitively
(**LIEN-M1**).

---

## 4. Project Detail

**Where to find it:** From **Projects** (`/liens`), click a project row → path
`/projects/:id`. Use `/projects/proj_comm` as the main example.

**What you should see:** a setup/clearance banner at the top, a header,
**Parties** (Owner, GC, hiring party), and **Streams** (collapsible cards). Click
a stream card to expand its **Work Months & Deadlines**.

### 4.1 View parties, streams, and the completion checklist
1. Open `/projects/proj_comm`. Confirm the header, parties (owner + GC), and both
   streams (construction = at_risk, design = open) render. → **PROJ-A1**.
2. Open `/projects/proj_2nd`. The clearance/setup banner shows it is
   **incomplete** and lists the missing 2nd-tier requirements (amber
   "Setup incomplete — N items remaining"). → **PROJ-A2**.
3. Back on `/projects/proj_comm`, expand the **construction** stream. The
   **March** work month shows **overdue**, with notice deadline **2026-06-15**
   and filing deadline **2026-07-15** listed. → **PROJ-A3**.
4. Open `/projects/proj_approaching`. The approaching stream shows notice
   deadline **2026-06-26** and retainage deadline **2026-07-01**. → **PROJ-A4**.

### 4.2 Recompute deadlines
1. Expand an open stream (e.g. on `/projects/proj_approaching`).
2. In the **Work Months & Deadlines** panel, click **Recompute** (circular-arrow
   icon) at the top right.
3. A toast **"Deadlines recomputed"** appears and the dates persist; recomputed
   dates follow the Texas business-day rules. → **PROJ-A5** (role: Coordinator).

> This calls `POST /api/streams/:streamId/recompute`. It is available to any
> authenticated user (no special role gate).

### 4.3 Create a notice inline
1. Expand a stream and find a work month row.
2. Click **Create Notice** (small outlined button with a + icon) in that row.
3. In the **Create Notice** dialog, choose a **Notice type** (Early Warning /
   Statutory Claim / Retainage Claim).
4. Click **Create Notice**. The notice is created in **draft**. → **PROJ-A6**.

> **⚠️ Heads-up — claim amount.** The inline dialog currently captures **only
> the notice type**; there is **no claim-amount field** in it yet. The test plan
> case PROJ-A6 says "setting a claim amount," but in today's build you set the
> claim amount **afterward** in the **Send Queue** (open the draft notice → click
> **Edit** → enter the amount → save). Record this gap as a finding; it matches
> the pending enhancement "Let coordinators set the claim amount when creating a
> notice inline."

**Manual / subjective:** read the generated notice for legal accuracy
(**PROJ-M1**); confirm HubSpot project linkage against the real CRM
(**PROJ-M2** — HubSpot is stubbed here).

---

## 5. Send Queue

**Where to find it:** path `/send-queue` (reached from the Liens workspace).
Notices appear here once they exist as drafts/approved.

**What you should see:** a **Send Queue** list (right panel) grouped by status,
a strip of notice "chips" across the top, and a preview card with project name,
claim amount, month listed, recipients, and the statutory notice body. KPI cards
show draft/approved counts and total claim.

**Procedure:**
1. Open `/send-queue`. Confirm notices render across statuses: a **draft**
   (`not_early`), an **approved/queued** item (`not_retainage`), a **sent** item
   (`not_statutory`), and a **delivered** item (`not_delivered`). → **SEND-A1**.
2. Select the draft (`not_early`). To edit it, click **Edit**, change the
   **claim amount** / description, and save.
3. Click **Approve**. Status moves **draft → approved** and an approver +
   timestamp is recorded. → **SEND-A2** (role: Coordinator). (API:
   `POST /api/notices/:id/approve`.)
4. Select the approved notice (`not_retainage`) and click **Send certified**
   (paper-plane icon). Status moves to **sent**; a mailing record with a
   (stubbed Shippo) tracking number is created and a confirmation banner appears.
   → **SEND-A3** (role: Coordinator). (API: `POST /api/notices/:id/send`.)
5. Open the sent notice (`not_statutory`). Tracking number
   **9400100000000000000001** is shown. → **SEND-A4**.
6. Open the delivered notice (`not_delivered`). Status **delivered**, a delivered
   timestamp, and a proof-of-delivery reference are shown. → **SEND-A5**.

**Manual / subjective:** confirm a real certified-mail piece is produced
(**SEND-M1** — Shippo stubbed); read the outbound document and recipient
addresses (**SEND-M2**).

---

## 6. Waivers

**Where to find it:** Sidebar → **Waivers** (path `/waivers`).

**What you should see:** waiver cards listing waiver type, project, stream,
amount, and a status badge. A **New Waiver** panel on the left has four create
buttons; an approval queue is on the right. **Action buttons appear only when you
click a waiver card to select it.**

### 6.1 Review the seeded waivers
1. Open `/waivers`. Confirm waivers render across statuses: not_required,
   pending_pm, pending_pm_finance, approved, approved + handed-to-GC, rejected.
   → **WAIV-A1**.

### 6.2 Create a waiver
1. In the **New Waiver** panel (left), click a type: **Conditional Progress**,
   **Unconditional Progress**, **Conditional Final**, or **Unconditional Final**.
2. In the dialog, choose the **Project**, enter the **payment amount**, and pick
   an **Invoice link**. (For *unconditional* waivers the invoice link is
   **required and must be a cleared invoice** — a warning explains this.)
3. Click **Create waiver**. The new waiver appears in the list/approval queue.

### 6.3 PM approval
1. Click the `wv_uncond_prog` card (status **pending_pm**) to select it.
2. Click **Approve (PM)**.
3. As a **PM** (or admin): status advances out of pending_pm and the PM approver
   + timestamp are recorded. → **WAIV-A2** (role: PM).
4. As a **Coordinator**: the approval is refused with **403** ("Insufficient
   role: PM gate requires role 'pm'"). → **WAIV-A3** (negative case).
   (API: `POST /api/waivers/:id/approve-pm`.)

### 6.4 Finance approval
1. Click the `wv_uncond_final` card (status **pending_pm_finance**, PM step done).
2. Click **Approve (Finance)** (shown only for unconditional-final waivers whose
   PM step is complete).
3. As **Finance** (or admin): status advances; Finance approver + timestamp
   recorded. → **WAIV-A4** (role: Finance).
4. As a **PM**: refused with **403** ("Finance gate requires role 'finance'").
   → **WAIV-A5** (negative case). (API: `POST /api/waivers/:id/approve-finance`.)

### 6.5 Notarize a waiver
1. Select a waiver that is not yet notarized and click **Notarize**.
2. A NotaryLive signing session opens in a new tab (sandbox in stub mode).
3. After signing, click **Check notary status** to poll for completion; when
   complete the waiver is marked notarized with the signed document. → supports
   **WAIV-M1** (Manual — real notary requires a live NotaryLive key).
   (APIs: `POST /api/waivers/:id/notarize`, then
   `POST /api/waivers/:id/notary-refresh`.)

### 6.6 Handed-to-GC
1. Open `/waivers` and find `wv_gc` (approved). Its card shows the
   **handed-to-GC / provided-to-GC** indicator set to true. → **WAIV-A6**
   (view-only).

> **⚠️ Heads-up — no "hand to GC" button yet.** The current Waivers UI **does
> not have a dedicated control** to mark an approved waiver as handed to the GC,
> and there is no API endpoint for it; the `wv_gc` flag is set by the seed.
> Test plan case **WAIV-A7** ("mark the waiver as handed to the GC") therefore
> **cannot be completed through the UI today**. Record it as a gap; it matches
> the pending task "Let the team track which waivers have been handed to the GC."

**Manual / subjective:** read a generated waiver for correct conditional/
unconditional language and amounts (**WAIV-M2**).

---

## 7. Collections

**Where to find it:** Sidebar → **Collections** (path `/collections`). Click an
account to open detail at `/collections/:accountId`.

### 7.1 Collections list
**What you should see:** a **Call List** (ranked by risk), accounts grouped by
escalation stage, a **Status** filter and a **Stage** filter, and a
**Pipeline Stages** quick-filter panel on the left. Each row has quick actions:
**Log call** (phone icon), **Record promise** (+ icon), **Advance dunning**
(chevron), and **Add to call list**.

1. Open `/collections`. Confirm all **9** accounts render with status and
   escalation stage. → **COLL-A1**.
2. Use the **Stage** filter to scan each stage. Every stage should be
   represented: none, soft_collections, pre_lien_notice, lien_filing,
   agency_attorney, write_off. → **COLL-A2**.

### 7.2 Account detail — history
1. Open `/collections/acct_late`. Confirm dunning history (activity), promises
   (open / kept / broken / cancelled), and the active payment plan all show. →
   **COLL-A3**.
2. Open `/collections/acct_promised`. The open promise-to-pay shows and a banner
   says dunning is **suppressed** by the promise. → **COLL-A4**.
3. Open `/collections/acct_plan`. The active payment plan and its installments
   (one paid, two pending) render. → **COLL-A5**.

### 7.3 Log a collection activity — and the HubSpot round trip

This is the most important Collections walkthrough because logging an activity is
a **full HubSpot round trip**, not just an in-app save.

**Prerequisite:** the account's linked client must have a **HubSpot company id**.
All seeded accounts' clients (e.g. `acct_soft` → `cli_soft` →
`hubspotCompanyId: hs_co_400`) satisfy this. If a client has no company id, the
write-back is skipped (the in-app activity still saves).

**Procedure:**
1. Open `/collections/acct_soft` (or use the **Log call** quick action from the
   list).
2. Click **Log activity**. In the form, pick a **Method** (phone, email, letter,
   sms, portal, in_person), type **Notes**, and click **Save**.
3. **In-app timeline updates:** the new activity appears at the top of the
   account's history/timeline. → **COLL-A6** (role: Coordinator).

**What happens behind the scenes (the round trip):**
4. The server (`POST /api/collections/accounts/:id/activity`) resolves the
   account → linked client → `hubspotCompanyId`.
5. It writes a **Note engagement** to HubSpot
   (`POST /crm/v3/objects/notes`), **associated to that company** (association
   type id 190 = note → company), with your notes as the body and the activity
   date as the timestamp.
6. The **returned HubSpot id is stored locally** on the activity record
   (`collection_activities.hubspotActivityId`).

**Live vs. stub — how to tell which mode you're in:**
- **Live mode** (real `HUBSPOT_API_KEY` set): the stored id is a real HubSpot
  note id, and the note actually appears in HubSpot.
- **Stub mode** (no key, or the live call fails): the stored id is a
  deterministic stub like **`hs_act_stub_1701234567890`** and **no real note is
  written**. If you see the `hs_act_stub_` prefix, you are in stub mode.

**Final external verification (Manual, live mode only):** open the linked
company in HubSpot and confirm the note appears on the **right company** with the
**correct body and timestamp**. → **COLL-M2** (the true external write-back can
only be confirmed in live mode against a real HubSpot account).

### 7.4 Promise-to-pay
1. On `/collections/acct_promised`, click **Promise-to-pay**, enter **Amount**,
   **Date**, optional **Notes**, and click **Save**. The promise is created
   **open**.
2. Later, use the open-promise banner buttons **Kept** or **Broken** to update
   its status; the change persists. → **COLL-A7** (role: Coordinator).

### 7.5 Payment plan
1. Click **Payment plan**, add one or more **Due date** + **Amount** installment
   rows, and click **Create plan · $total**. The plan and installments render;
   use the per-installment toggle to mark paid/unpaid.

### 7.6 Advance dunning
- From the list, click the **Advance dunning** (chevron) quick action to move an
  account forward in its dunning sequence. (API:
  `POST /api/collections/accounts/:id/advance`.) Accounts with an open promise
  show this suppressed.

### 7.7 Write-off / escalation
1. On an account's detail page (e.g. `/collections/acct_agency`), use the
   **Escalation ladder**: click **Escalate** next to the next stage to advance
   it, up to **Write-Off**. → relates to **COLL-A8**.

> **⚠️ Heads-up — write-off is not admin-gated today.** Test plan cases
> **COLL-A8 / COLL-A9** expect write-off to be **admin-only** (coordinator gets
> 403). In the current build, advancing escalation (including to `write_off`)
> goes through `POST /api/collections/accounts/:id/escalate`, which only requires
> a valid session — **any authenticated role can do it**, so a coordinator will
> **not** receive a 403 here. Record this as a finding if an admin gate is
> required for go-live. (The escalate endpoint does block *de-escalation* with a
> 409.)

**Manual / subjective:** real phone/email outreach (**COLL-M1**); reconcile
balances with QuickBooks (**COLL-M3** — QBO stubbed).

---

## 8. Vendor Holds

**Where to find it:** Sidebar → **Vendor Holds** (path `/holds`).

**What you should see:** KPI cards (**Open A/P**, **On Hold**, **Recommended**),
an **Open vendor bills** table with **HOLD ADVISED** flags, and per-row
**Place hold** / **Release** buttons. Filters: **All bills**, **Hold advised**,
**Open**, **On hold**, plus an **Unpaid by vendor** panel.

**Procedure:**
1. Open `/holds`. Confirm bills render, recommended (client-overdue) bills are
   flagged **HOLD ADVISED**, and you can filter by status and vendor.
2. Click **Place hold** on an open bill → it flips to **on hold** and the button
   becomes **Release**. Click **Release** to flip it back.

> **⚠️ Heads-up — the Vendor Holds page is a static demo.** This page renders a
> **fixed sample list of vendor bills** and the **Place hold / Release** toggle
> is **client-side only** — it does **not** call the API and does **not** show
> the seeded holds (`hold_sched`, `hold_mat`, `hold_cleared`). The **real**
> holds engine lives elsewhere:
> - **Recompute holds:** on a **Project Detail** page (`/projects/:id`), in the
>   **AP / holds** panel, click **Recompute Holds** (calls
>   `POST /api/holds/recompute`). A toast "Holds recomputed" appears. →
>   supports **HOLD-A2**.
> - **View / clear seeded holds:** the seeded hold records are served by the API
>   (`GET /api/holds`, with `includeCleared=true` to see cleared ones) and
>   surface in project/collections context, not on this demo page.
>
> Because of this, test plan cases **HOLD-A1** and **HOLD-A3** (which assume the
> seeded holds and an in-list clear action appear on `/holds`) should be checked
> against the API / project-detail panel rather than this page. Record the gap.

**Manual / subjective:** confirm a placed hold has the intended real-world effect
(**HOLD-M1**).

---

## 9. Filing workspace

**Where to find it:** Sidebar → **Filings** (path `/filing`). Click a row to open
a stream's workspace at `/filing/:streamId`.

**What you should see (list):** summary KPIs (Total Filings, At Risk, Filed) and
a table of streams with project/client, work stream, opened date, and status
badge. **What you should see (workspace):** a 6-step progression — 1. Compliance
Check, 2. Affidavit Package, 3. Export, 4. Record with County, 5. Post-Notice
Mailing, 6. Release.

**Procedure:**
1. Open `/filing`. Confirm filings render across statuses: **filed** (×2) and
   **affidavit_draft** (in progress). → **FILE-A1**.
2. Open `/filing/str_2nd_con`. The detail shows **Dallas** county, recording ref
   **2026-DAL-00123**, filing / post-filing / enforcement dates, and the signed
   release `rel_1`. → **FILE-A2**.
3. Open `/filing/str_released_con`. Shows the filed lien `fil_released` and the
   filed release `rel_released`. → **FILE-A3**.
4. Open `/filing/str_filing_con`. The stream is in the **affidavit-draft** stage
   with the draft document reference. → **FILE-A4**.

### 9.1 Affidavit PDF
1. In the workspace, go to **Step 2 — Affidavit Package**.
2. Click **Generate Affidavit** if no draft exists (API:
   `POST /api/filing/:streamId/affidavit`), then **View Affidavit** /
   **Download PDF** to open the document.
3. A PDF is produced and downloadable. The PDF endpoint
   (`GET /api/filing/:id/affidavit`) generates a statutory § 53.054 affidavit. →
   **FILE-A5** (role: Coordinator).

> The other workspace steps map to: Step 1 **Run Check**
> (`POST /api/filing/:streamId/escalate`), Step 3 **Export to Texas Easy Lien**
> (`POST /api/filing/:id/export`), Step 4 **Record Filing** with County / Date /
> Recording Ref / Fee (`POST /api/filing/:id/record`).

**Manual / subjective:** county recording handoff (**FILE-M1**); legal review of
the affidavit (**FILE-M2**).

---

## 10. Settings / Config

**Where to find it:** Sidebar footer → **Company Settings** (path `/settings`).
The left panel has these sections: **Reference Tree**, **Stage Triggers**,
**Jurisdiction Rules**, **Document Templates**, **Integrations**.

> **Role gating across all of Settings.** **Creating or editing any config
> entity requires the `admin` role.** A non-admin sees **read-only** content:
> form inputs and **Save** buttons are disabled, a **lock** icon appears, and a
> banner explains read-only access (e.g. *"You have read-only access. Only
> administrators can edit document templates."*). Behind the scenes, config
> writes go to `POST/PATCH /api/config/*` and return **403** for non-admins
> (*"Admin access required…"*). This covers **CONF-A4** (Coordinator attempts an
> edit → blocked / 403).

### 10.1 Reference Tree — Departments
1. Open **Settings → Reference Tree**. You see the tree
   **Department → System Type → Sub-System Type**.
2. **Create:** in the input at the bottom of the Departments area, type a name
   and click **Add Department**. The new department appears. → **CONF-A3**
   (admin; API `POST /api/config/departments`).
3. **Rename:** click the **pencil** icon next to a department, edit the **Name**,
   click **Save** (or **Cancel**).

### 10.2 Reference Tree — System Types
1. Expand a department. In its **System Types** area, type a name and click
   **Add System Type**.
2. **Rename:** click the **pencil** icon, edit **Name**, click **Save**.

### 10.3 Reference Tree — Sub-System Types
1. Expand a system type. In its **Sub-System Types** area, enter a
   **Sub-system Name** and pick a **Lien Workflow** (Commercial Sub /
   Residential Sub / Public / Bond / No Lien Tracking), then click
   **Add Sub-Type**. (Lien workflow is **required** for every sub-system type.)
2. **Rename / change workflow:** edit the row and **Save**; you can change the
   lien workflow type here.

### 10.4 Stage Triggers
1. Open **Settings → Stage Triggers**. Existing mappings (HubSpot stage → lien
   clock) are listed.
2. **Create:** enter **HubSpot Stage Key** (e.g. `install`), a **Display
   Label**, and a **Lien Clock Trigger** (None / Design Start / Field Work
   Start), then click **Add Trigger**. → supports **CONF-A1** (the section
   renders) and admin create.

### 10.5 Jurisdiction Rules
This section is **read-only by design** for rules; rule sets have a one-way
production gate.
1. Open **Settings → Jurisdiction Rules**. Rules are grouped by **Jurisdiction**
   (e.g. **Texas**).
2. **Jurisdictions:** view each jurisdiction and whether it is active/inactive.
   (Create via admin API `POST /api/config/jurisdictions`.)
3. **Rule Sets:** open the **Texas** rule set (`rs_tx_2022`) and view version,
   effective date, and statute reference, plus all its rules (notice / filing /
   retainage / post-filing / enforcement / design). → **CONF-A2**.
4. **Mark legally reviewed:** click **Mark Reviewed** on a rule set to set the
   reviewed flag. → **CONF-A5** (admin; API
   `PATCH /api/rule-sets/:id/review`). **This is a one-way production gate** —
   once a rule set is marked reviewed it is treated as production-ready.
5. **Rules:** view each rule's anchors, offsets, business-day handling, and
   statute citations. **Rules are read-only after creation** — you can view but
   not edit them.

### 10.6 Document Templates
**Where:** **Settings → Document Templates**. Pick a template from the
**"Select a template to modify:"** dropdown. Templates are grouped into
**Statutory Notices**, **Lien Waivers**, and **Lien Affidavit**, and cover the
types: Early Warning, Statutory Claim, Retainage Claim, Conditional/Unconditional
Progress, Conditional/Unconditional Final, and Lien Affidavit. A **Custom** badge
marks templates you've already modified.

For **each** template type, do the following:
1. Select the template type from the dropdown.
2. Open the **Customize content** section. Edit the **five regions** in turn —
   **Branding, Intro, Closing, Signature, Footer** — using the **B / I / U**
   rich-text buttons. The **Statutory body (locked)** section shows the fixed
   legal wording you cannot change.
3. **Insert merge tokens:** click **Insert merge field**, pick a field (e.g.
   *Project Name*, *Unpaid Balance*) — it drops in as a colored, non-editable
   chip.
4. **Preview with sample data:** click **Update preview** (eye icon) to render
   the template with placeholder values.
5. **Preview with project data:** in **"Preview with a real project (search by
   name)…"**, search and select a real project to merge live data; click
   **use sample data** to revert.
6. **Save** your edits (admin only). → supports **CONF-M2** (subjective check
   that the rendered merge output reads correctly).

> **Non-admin:** the editor is read-only — inputs and **Save** are disabled with
> the read-only banner and lock icon described above.

### 10.7 Integrations
**Where:** **Settings → Integrations**. This panel is **read-only** — credentials
live in Replit Secrets, not here.
1. Open the section. You see three sub-panels: **QuickBooks Online (QBO)**,
   **HubSpot CRM**, and **NotaryLive**.
2. Each shows a connection status badge — **Connected** (green) when the relevant
   secret is present, or **Not connected** (amber) — and instructions to add the
   secret (e.g. `HUBSPOT_API_KEY`, `QBO_CLIENT_ID`) in the Replit sidebar.
3. There are no editable fields here; this is status/visibility only.

**Manual / subjective:** legal review of seeded Texas citations and offsets
(**CONF-M1**).

---

## 11. User access & roles

**Where to find it:** Roles are read through the auth API; the four seeded users
(see §1.3) carry the roles. There is currently **no dedicated admin screen** to
change another user's role in the UI (this is the pending task "Give admins a
screen to manage who can access the app and their role").

**Procedure:**
1. While logged in, call `GET /api/auth/user`. It returns the current user with
   the expected **role**. → **USER-A1**.
2. Logged out, call any protected `/api/*` route. You get **401** (or a redirect
   to login) and the app shows the **login gate**. → **USER-A2**.
3. Re-run the role-gate pairs across roles to confirm allowed → 200 and
   disallowed → 403, with `admin` passing all as the super-role:
   - **WAIV-A2 / WAIV-A3** (PM approve), **WAIV-A4 / WAIV-A5** (Finance approve)
     — these gates **are** enforced.
   - **CONF-A3 / CONF-A4** (config create) — enforced (admin-only).
   - **COLL-A8 / COLL-A9** (write-off) — see the **⚠️ Heads-up** in §7.7: this
     gate is **not** enforced today, so the coordinator case will **not** return
     403. → **USER-A3** (note the divergence).

**Manual / subjective:** the "no access yet" screen for a brand-new user with no
role (**USER-M1** — also the pending task "Show a friendly 'no access yet'
screen"); changing another user's role (**USER-M2** — needs the not-yet-built
user-management screen).

---

## 12. Quick gap summary (live UI vs. test plan)

These are the places where today's build differs from `UAT_TEST_PLAN.md`'s stated
expectations. Treat them as findings, not tester error:

| Area | Test case | Difference in the live build |
|------|-----------|------------------------------|
| Project Detail | PROJ-A6 | Inline notice dialog has no claim-amount field; set the amount later in Send Queue → Edit. |
| Waivers | WAIV-A7 | No "hand to GC" control or endpoint; the flag is seed-set and view-only. |
| Collections | COLL-A8 / A9 | Write-off (escalate) is not admin-gated; a coordinator is **not** blocked. |
| Vendor Holds | HOLD-A1 / A3 | `/holds` is a static demo; seeded holds + clear action live via the API / Project-Detail AP panel, not this page. |
| User access | USER-M2 | No admin user-management screen yet. |

For everything else, the walkthroughs above let a tester complete the
corresponding automated cases in `UAT_TEST_PLAN.md`.
