# Lien & Collections — Agent Prompts (Replit)

**Module ID:** `lien_collections`
**Module #:** 22
**Version:** 1.0
**Date:** 2026-06-18
**Status:** Build spec — companion to `lien_collections_SCOPE.md`

> **Build platform: Replit.** This app is built and hosted on Replit, so prompts are **one self-contained Replit prompt per phase** — not a Claude/Cursor/Copilot multi-agent split (per `HOW_TO_CREATE_SCOPE_DOCS.md` v1.2, Part 9.2). Paste one prompt per phase into the Replit Agent. Each is standalone: it names the stack, the integration contract, the files to read, the task, exit criteria, and file ownership.

---

## App Stack (every phase)

- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui. Design tokens copied verbatim from Helm (`tailwind.config.js`, `index.css` `:root`/`.dark`, `designSystem.js`) so it is visually identical to Helm.
- **Backend:** Node + Express + Prisma, **Postgres** (Replit-hosted). TypeScript.
- **Auth:** Helm SSO/session; every tenant-scoped route uses `requireSession` and `orgId = req.session!.orgId`.
- **Responsive primitives (mandatory):** `useResponsive()`, `<Screen>`, `<Grid>` — phone (<768px) single column, tablet (768–1024px) 2-col, desktop (≥1024px) 3-col, capped `max-w-[1440px]`. Bottom tab bar on phone.

## Integration Contract (every phase — shared system-of-record IDs)

This app owns its own datastore and references external systems by ID + ephemeral cache (no duplication). Build and the eventual Helm integration code against this one interface:

| System of record | What | IDs |
|------------------|------|-----|
| **HubSpot** | Projects, parties (owner/GC/hiring), status/stage membership, client identity | `hubspotProjectId`, `hubspotCompanyId`, `hubspotContactId` |
| **Connecteam** | Timesheet hours by stage | `connecteamUserId`, `connecteamTimeRecordId` |
| **QBO** | Invoices/payments/supplier invoices | `qboInvoiceId`, `qboSupplierInvoiceId`, `qboCustomerId` |
| **Helm Core** | *Consumer* of this app | reads `external/reference` + `external/holds` (service-key) |

Test org: `org_beacon_test_001`.

## Architecture Rules (non-negotiable, every phase)

1. `orgId` only from `req.session!.orgId` — never from query/body/params.
2. Every Prisma query filters by `orgId`; every model has `orgId`, `org`, `createdAt`, `updatedAt`, `@@index([orgId])`.
3. No-duplication: store external IDs + cached fields + `lastSyncedAt`; the external system stays authoritative.
4. One correct path, fail fast (throw on precondition violations), no silent fallbacks.
5. Don't start the next phase until exit criteria pass.

---

## Phase 0 — Standalone Foundation

**Read first:** `lien_collections_SCOPE.md` (full), `lien_collections_DATA_MODEL.md` Sections 0–2.

**Task:**
1. Create the Replit project; configure Secrets: `DATABASE_URL`, HubSpot, Connecteam, QBO, Shippo, NotaryLive keys, Helm SSO config, `SERVICE_KEY` (for Helm Core to read our `external/*`).
2. Express + Prisma + Postgres; base models with `orgId` scoping (see DATA_MODEL Section 2 — at minimum `Organization` back-relations, link models).
3. Wire Helm SSO/session auth (`requireSession`) and copy Helm design tokens into `tailwind.config.js` + `index.css`.
4. Build the integration client layer (`HubSpotClient`, `ConnecteamClient`, `QboClient`) behind interfaces with **fixture-backed stubs**; stub the `external/*` read API this app exposes.
5. Add `useResponsive`/`Screen`/`Grid` and a `/health` endpoint.

**Exit Criteria:** app boots on Replit; `GET /health` green; SSO round-trips; stub clients return fixtures; design tokens render; zero console errors; build passes.

**File Ownership:** YOU OWN the whole repo scaffold. Commit: `feat: phase 0 — standalone foundation`.

---

## Phase 1 — Tenant Configuration & Jurisdiction Rules

**Read first:** SCOPE Section 10 (Phase 1), DATA_MODEL Sections 1, 2.2, 2.3, 3.1; UI_SPEC P10; SEED_DATA Section 2 (jurisdiction + reference tree); LAYOUTS P10.

**Task:** Build the reference tree (Department → SystemType → SubSystemType), `lien_workflow_type` mapping with plain-language explanations (L04), stage-trigger config, jurisdiction rule-set admin (Texas, read-only rule list with citations + `legalReviewed` gate), dunning-sequence config. Build `config/routes` (3.1). Implement the **`external/reference`** read endpoint Helm Core consumes (DD-09).

**Exit Criteria:** SubSystemType cannot be saved without `lien_workflow_type` (L05 → 400); Texas rule set seeded and readable; `external/reference` returns the tree to a service-key caller; build passes; zero console 401/404s.

**File Ownership:** YOU OWN `config/*`, `external/reference`, config UI (P10). Commit: `feat: phase 1 — tenant config + jurisdiction rules`.

---

## Phase 2 — Project Lien Setup

**Read first:** SCOPE Section 10 (Phase 2), DATA_MODEL 2.1, 2.4, 3.2; UI_SPEC P4/P5 (setup parts); LAYOUTS P4; SEED_DATA projects + parties.

**Task:** Build `LienProject` setup over HubSpot data — create from `hubspotProjectId`, resolve `lienWorkflowType` from SubSystemType, capture lien-specific fields (contractor tier, legal address, county, contract start), party relationships (owner/GC/hiring — both required when 2nd tier), and the completion checklist (non-blocking warning). Build `projects/routes` (3.2) and the HubSpot read client (replace fixtures).

**Exit Criteria:** 2nd-tier projects capture both hiring party and original contractor; checklist surfaces missing fields without blocking; project data pulls from HubSpot; build passes.

**File Ownership:** YOU OWN `projects/*`, HubSpot client, P4 setup UI. DO NOT modify `config/*` schema. Commit: `feat: phase 2 — project lien setup`.

---

## Phase 3 — Deadline Engine & Hold Flags

**Read first:** SCOPE Section 10 (Phase 3), DATA_MODEL 2.3, 2.4, 2.6, 3.3, 3.9; SEED_DATA work months + deadlines; the Texas constraints in the legacy `SCOPE.md`.

**Task:** Build the jurisdiction rule **engine**: derive work months from Connecteam timesheets + QBO invoice due dates cross-checked against coordinator-cleared payments; compute every deadline from `LienRule` (anchor + offset), apply `next_business_day` roll-forward (§ 53.003(e)); store `computedDate`, `adjustedDate`, and the `sourceData` snapshot (L13). Compute Schedule/Material holds and expose via `external/holds`. Build `deadlines/routes` (3.3) and `holds/routes` (3.9); wire the Connecteam + QBO read clients.

**Exit Criteria:** deadlines match the Texas Ch. 53 worked examples in SEED_DATA; weekend/holiday roll-forward correct; every deadline shows its `sourceData`; holds exposed on `external/holds` to a service-key caller; build passes.

**File Ownership:** YOU OWN `deadlines/*`, `holds/*`, the rule engine, Connecteam + QBO clients. This is the highest-risk logic — keep it single-owner. Commit: `feat: phase 3 — deadline engine + holds`.

---

## Phase 4 — Monthly Workflow & Notice Generation

**Read first:** SCOPE Section 10 (Phase 4), DATA_MODEL 2.4, 3.4, 3.5; UI_SPEC P2/P3/P5; LAYOUTS P2/P3/P5; SEED_DATA notices.

**Task:** Build the 1st-of-month run (`POST /monthly/run`): select projects with a notice deadline this month, confirm overdue/cleared, flag supplier-notice risk, pre-generate draft notices. Build the monthly report (P2), the 10th/11th ready-to-send queue (P3), courtesy heads-up logging, and statutory notice generation as print-ready PDFs (§ 53.056 early-warning + statutory, § 53.057 retainage). Build `monthly/routes` (3.4) and `notices/routes` generation parts (3.5).

**Exit Criteria:** monthly run selects the correct at-risk projects; drafts auto-populate from project/party/QBO; PDFs match the statutory form; report + send-queue render responsively (390px phone OK); build passes.

**File Ownership:** YOU OWN `monthly/*`, `notices/*` (generation), P2/P3/P5 UI. DO NOT modify the rule engine internals from Phase 3 (call it). Commit: `feat: phase 4 — monthly workflow + notices`.

---

## Phase 5 — Sending, Waivers & Notarization

**Read first:** SCOPE Section 10 (Phase 5), DATA_MODEL 3.5 (send), 3.6; UI_SPEC P6; LAYOUTS P6; SEED_DATA waivers.

**Task:** Send approved notices via the Shippo mailing abstraction (capture tracking + delivery webhook). Build waivers (§ 53.284 all four types) with hard approval gates — unconditional progress needs PM, unconditional final needs PM + finance — blocked unless payment is coordinator-cleared (L33 → 409). Route `requiresNotarizedWaivers` clients through NotaryLive (webhook on completion) before invoice send. Attach waivers to invoices. Build `waivers/routes` (3.6), notice send + mailing webhook (3.5), `waivers/exposure`.

**Exit Criteria:** certified-mail tracking captured; unconditional waivers blocked until cleared; PM/finance gates enforced; notarization completes before send; build passes.

**File Ownership:** YOU OWN `waivers/*`, notice send + mailing/notary webhooks, P6 UI. Commit: `feat: phase 5 — sending, waivers, notarization`.

---

## Phase 6 — Filing, Release & Lien Reporting

**Read first:** SCOPE Section 10 (Phase 6), DATA_MODEL 2.4 (filing/release), 3.7, 3.12; UI_SPEC P7; LAYOUTS P7; SEED_DATA filing + release.

**Task:** Build filing escalation with a compliance check (all notices sent on time), the consolidated affidavit package (§ 53.054, all overdue months per stream), Texas Easy Lien export + filing record, post-filing deadline computation (5 business days § 53.055; 1 year § 53.158), filed-copy mailing, and release (§ 53.152, 10-day). Build the exposure dashboard, per-project lien timeline, and lapsed-rights report. Build `filing/routes` (3.7), `reports/routes` (3.12), and `external/exposure`.

**Exit Criteria:** affidavit consolidates all overdue months; post-filing deadlines computed on filing; lapsed-rights report accurate; build passes.

**File Ownership:** YOU OWN `filing/*`, `reports/*`, `external/exposure`, P7 UI. Commit: `feat: phase 6 — filing, release, reporting`.

---

## Phase 7 — Collections Pipeline

**Read first:** SCOPE Section 10 (Phase 7) + Section 5.1, DATA_MODEL 2.5, 3.8; UI_SPEC P1/P8/P9; LAYOUTS P1/P8/P9; SEED_DATA collections.

**Task:** Build AR aging reconciled to QBO, the overdue-account pipeline grouped by `EscalationStage`, dunning-sequence advancement by days-overdue, contact logging that writes back to HubSpot, promise-to-pay (suppress dunning while open), payment plans + installments, account risk scoring, and the escalation ladder that surfaces the lien backstop deadline (SCOPE 1.3). Build the shared Dashboard (P1). Build `collections/routes` (3.8).

**Exit Criteria:** aging reconciles to QBO; dunning advances by days-overdue; activities post to HubSpot; open promises suppress dunning; escalation shows the lien backstop date; Dashboard renders responsively; build passes.

**File Ownership:** YOU OWN `collections/*`, P1/P8/P9 UI. Commit: `feat: phase 7 — collections pipeline`.

---

## Quick Reference

| Phase | Description | Builder | Prompt |
|-------|-------------|---------|--------|
| 0 | Standalone Foundation | Replit Agent | Phase 0 |
| 1 | Tenant Config & Jurisdiction Rules | Replit Agent | Phase 1 |
| 2 | Project Lien Setup | Replit Agent | Phase 2 |
| 3 | Deadline Engine & Hold Flags | Replit Agent | Phase 3 |
| 4 | Monthly Workflow & Notice Generation | Replit Agent | Phase 4 |
| 5 | Sending, Waivers & Notarization | Replit Agent | Phase 5 |
| 6 | Filing, Release & Lien Reporting | Replit Agent | Phase 6 |
| 7 | Collections Pipeline | Replit Agent | Phase 7 |

> **Note on agent model:** Because the build platform is Replit (a single agent builder), each phase is one self-contained prompt — there is no parallel two-agent split. This supersedes the "Backend + Frontend (parallel)" suggestion in SCOPE Section 12 for phases 4, 5, and 7; sequence them as single Replit prompts.

---

## Revision Log

| Date | Author | What Changed |
|------|--------|--------------|
| 2026-06-18 | Deb (with AI Support) | Initial Replit agent prompts — one self-contained prompt per phase (0–7), each with stack, integration contract (HubSpot/Connecteam/QBO IDs + Helm Core expose), responsive primitives, file ownership, and exit criteria. Notes the Replit single-builder model supersedes the parallel-split suggestion in SCOPE Section 12. |
