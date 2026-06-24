# Lien & Collections — Module Scope

**Module ID:** `lien_collections`
**Module #:** 22
**GitHub Label:** `module/lien_collections`
**Version:** 1.4
**Date:** 2026-06-18
**Status:** Scoped — no open items — full six-document set complete

> **v1.1** conforms this scope to `HOW_TO_CREATE_SCOPE_DOCS.md` v1.2: added the Integration Architecture table (Section 1.4), the ownership-split / no-duplication rule and named reference IDs (Section 6), the responsive + real-design-token UI note (Section 8), and converted Section 13 decisions to `DD-xx` entries with explicit canon supersession (Part 9.4).
> **v1.2** resolves open items: phone/tablet required (DD-08), reference layer owned by this app (DD-09), client identity anchored to HubSpot + invoices to QBO (DD-10), public bond/public out of scope (DD-11). Two open items remain (Helm Core read API; collections epic numbering).

> This document is the master reference for the Lien & Collections app. Read it before writing a single line of code. It provides context, summarizes all technical detail, and points to companion docs for implementation specifics.
>
> **Companion documents** (authored — authoritative for their respective domains):
> - `lien_collections_DATA_MODEL.md` — All Prisma models, enums, API endpoints, integration ownership-split
> - `lien_collections_UI_SPEC.md` — Component layouts, page specs, real design tokens, responsive, file structure
> - `lien_collections_SEED_DATA.md` — Test data specification with enum-state coverage
> - `lien_collections_LAYOUTS.html` — Structural zone wireframes for every page
> - `lien_collections_AGENT_PROMPTS.md` — One self-contained Replit prompt per phase
>
> **Source material:** This scope supersedes the legacy `SCOPE.md` (HELM Lien Rights Module — User Stories, v1.0 Final, Feb 2026) in this directory. The legacy file is retained as the originating requirements record. All statutory logic and user stories in that file are carried forward here and into `lien_collections_DATA_MODEL.md`.

---

## 1. What This Module Does

Lien & Collections is the part of Helm that protects Beacon's money. It does two jobs that share one spine: it runs the **collections** process that recovers overdue invoices through escalating client contact, and it runs the **lien rights** process that preserves and exercises Beacon's statutory security interest when contact alone does not get Beacon paid. Both are driven by the same underlying fact — an invoice that has not cleared — so they are built as one app, not two.

The mental model: every overdue invoice sits somewhere on a single escalation ladder. The soft rungs are collections (reminder, statement, phone call, courtesy heads-up, promise-to-pay, payment plan). The hard rungs are lien rights (statutory pre-lien notice, lien affidavit filing, enforcement, release). Collections buys goodwill and usually resolves the debt. Liens are the legal backstop that makes the soft path credible, and they run on **non-negotiable statutory deadlines** that do not care whether a collections conversation is going well. The app's core value is never letting a recoverable dollar or an enforceable lien right lapse because someone forgot a date.

A typical month: on the 1st, the app identifies every project with a notice deadline in the current month per work stream, confirms overdue and cleared status from QuickBooks, flags supplier-notice risks, and pre-generates draft statutory notices for every confirmed-overdue project. The collections side simultaneously refreshes the AR aging picture and advances each overdue account along its dunning sequence. A project coordinator reviews the monthly lien report on the 2nd or 3rd, sends courtesy heads-ups to affected clients, and works the collections queue. By the 10th/11th the app surfaces a "ready to send" queue of projects still not cleared; the coordinator does a final review, approves, and sends statutory notices through the mailing integration. Waivers are generated against cleared payments; filings and releases are handled on the rare escalation path.

### 1.1 Standalone App — First of the New Pattern

This is the **first Helm capability built as a standalone application that integrates with the rest of Helm, rather than a module compiled into the Helm monorepo.** It is the pilot for Beacon's intended architecture shift: each app stands on its own (own repository, own database schema, own deploy) but speaks to the other apps through defined integration contracts instead of a shared in-process database.

Practical consequences that shape every companion doc:

- **Own datastore.** Lien & Collections owns its own Postgres schema. It does **not** query Helm's database directly. Project, party, stage, timesheet, and invoice data it needs are pulled across an integration boundary and cached/denormalized locally as needed for deadline math and document generation.
- **Integration over import.** Where the legacy doc assumed in-monorepo coupling ("from company pool", "from project module"), this app consumes that data directly from **HubSpot** (projects, parties, status, client identity), **Connecteam** (timesheets), and **QBO** (invoices). Helm Core is a consumer of this app's outputs, not a source of its inputs. See Section 4.
- **Shared identity and look.** The app reuses Helm's design system tokens and authentication/SSO so it feels like one product to the user, even though it deploys independently.
- **Deploy target: Replit.** The app is built and hosted on Replit. Build phases, environment configuration, and the agent prompts assume a Replit project (not the Vercel + Docker-Postgres local flow described in the root `CLAUDE.md`). Section 10 Phase 0 covers Replit project setup and secrets.

> This pattern decision is recorded in Section 13 as DECIDED. It is the reason several sections diverge from the standard in-monorepo module assumptions in `HOW_TO_CREATE_SCOPE_DOCS.md`. Where they conflict, this section governs for this app.

### 1.2 Jurisdiction Strategy — Texas First, Built Multi-State

Beacon operates in Texas, so all v1.0 statutory logic implements **Texas Property Code Chapter 53** (as amended effective Jan 1, 2022). But the deadline math is **not hardcoded to Texas.** Statutory rules — notice deadlines, filing deadlines, retainage rules, post-filing windows, business-day handling — live in a **jurisdiction rule set** that the engine reads as data. Adding a state means adding a rule set and its statutory document templates, not rewriting the engine. Texas is the only rule set seeded for v1.0; the schema and engine are designed so a second state is an additive data exercise.

Beacon owns the rule data in-house (DECIDED, Section 13). That means Beacon also owns the legal accuracy of that data: every rule carries a statute citation and an effective date, and the app surfaces the source data behind every calculated deadline so a coordinator can verify it. A legal review gate precedes any production use of a jurisdiction rule set.

### 1.3 The Two Halves — Collections and Liens

| Half | Purpose | Cadence | Primary user | Backstop |
|------|---------|---------|--------------|----------|
| **Collections** | Recover overdue invoices through escalating contact | Continuous / daily | AR / collections coordinator | Hands off to lien process when statutory clock nears |
| **Liens** | Preserve and exercise statutory security interest | Monthly statutory cycle | Project coordinator | Filing → enforcement → release |

Collections and liens are different workflows over the **same overdue-invoice data**. An account can be active in collections while its lien clock runs in parallel; the app keeps both views consistent and makes the lien deadline visible inside the collections workspace so contact effort is timed against the legal cliff.

### 1.4 Integration Architecture (System of Record)

This is an **integration-first app**: external products are the system of record for the data they already own, and this app owns only what they do not model — the lien rights logic, statutory documents, deadlines, holds, and collections workflow. The rule is **no duplication**: store the external record's ID plus an ephemeral read cache for the fields the engine needs, never a second authoritative copy that can drift.

| Concern | System of Record | This App's Role |
|---------|------------------|-----------------|
| Client company/contact identity | **HubSpot** | Read client records; write collections activities, promise-to-pay, escalation status back as HubSpot activities/properties |
| Projects, parties (owner / GC / hiring party), status & stage membership | **HubSpot** | Read project, party-relationship, and status data to drive lien setup, deadline math, and document population |
| Timesheet hours (field & design, by stage) | **Connecteam** | Read hours tagged by stage to derive per-stream work months |
| Invoices, payments, supplier invoices | **QuickBooks Online** | Read amounts, dates, due dates, status; "cleared" is confirmed in-app by a coordinator, not inferred from QBO alone |
| Lien streams, deadlines, notices, waivers, filings, releases | **This app** | Owns the full lien lifecycle and statutory documents — no external system models these |
| Collections accounts, dunning, plans, escalation | **This app** | Owns the workflow over HubSpot/QBO/Connecteam data — no vendor models Beacon's collections ladder |
| Reference layer (Dept → System Type → Sub System Type, `lien_workflow_type`, stage triggers) | **This app** | Owns and exposes via read API (DD-09); Helm Core and other modules read it back |
| Hold flags (Schedule Hold, Material Hold) | **This app** | Computes and exposes flags; Helm Core Scheduling/Purchasing consume them |
| Certified mailing, notarization, county filing | **Shippo / NotaryLive / Texas Easy Lien** | Build the connectors and handoffs; the vendors run their own workflow — this app does not rebuild their UIs |

We build the connectors, sync, and handoffs. We do not rebuild a vendor's editor or portal. **Helm Core is a consumer here, not a provider** — it reads this app's reference layer and hold flags; the operational data this app needs comes from HubSpot, Connecteam, and QBO.

---

## 2. The Problem Today

Beacon tracks lien deadlines and overdue accounts by hand. Statutory notice and filing dates are calculated manually off invoice and timesheet dates against Texas Property Code Chapter 53 — error-prone work where a single missed 15th-of-the-month deadline can render a lien right unenforceable and forfeit Beacon's security on the debt. Overdue invoices live in QuickBooks with no structured follow-up: dunning is ad hoc, courtesy heads-ups are inconsistent, promise-to-pay commitments are remembered rather than recorded, and there is no single place that shows an account's full history of contact, notices, waivers, and holds. Waiver forms are produced in Word against statutory language, with approval gates enforced by memory. Supplier-notice risk — where a supplier's own lien clock against Beacon's job runs ahead of Beacon's — is detected, if at all, by someone happening to notice. Material Hold and Schedule Hold decisions are made informally rather than driven off invoice status. The work is real, the stakes are legal and financial, and today it depends on one or two people not forgetting.

---

## 3. Users & Permissions

| Role | Access Level | What They Do |
|------|-------------|-------------|
| Tenant Admin | Full | Configure reference tables (Department → System Type → Sub System Type), map Sub System Types to `lien_workflow_type`, set stage lien-clock triggers, manage jurisdiction rule sets, configure dunning sequences and collections policy |
| Project Coordinator | Operational | Primary lien user. Complete project lien setup, review monthly lien report, generate/edit/send notices, generate waivers, log courtesy heads-ups, work the collections queue, log filing/release actions |
| Collections / AR Coordinator | Operational | Primary collections user. Work AR aging and dunning queues, log contact, record promise-to-pay and payment plans, trigger escalation, mark payments cleared |
| Project Manager (PM) | Approval | Approves unconditional progress waivers; co-approves unconditional final waivers |
| Finance Manager | Approval | Co-approves unconditional final waivers; sets/clears collections write-off and agency-handoff decisions |
| Manager | Oversight | View lien exposure and collections dashboards, escalate a stream to filing, view lapsed-rights and at-risk reports |

---

## 4. Module Dependencies

> Because this is a standalone app (Section 1.1), "consumes from" means *reads across an integration boundary*, not *imports from a sibling folder*. Each row names the contract.

### Consumes From

| Source | What | How |
|--------|------|-----|
| HubSpot | Projects, party relationships (owner / GC / hiring party), status & stage membership, client identity, client flags (`requires_notarized_waivers`, default payment terms) | HubSpot API (read; ID + ephemeral cache). Lien-specific fields (contractor tier, legal property address if it differs from job site, completion checklist) are captured locally on `LienProject` in Phase 2 |
| Connecteam | Field-work and design hours tagged by stage → derive work months per stream | Connecteam API (read) |
| QuickBooks Online | Invoice amounts, dates, due dates, payment status; supplier invoice dates and payment status | QBO API (read); cleared status confirmed by coordinator, not QBO alone |

### Provides To

| Consumer | What | How |
|----------|------|-----|
| Helm Core & other modules | **Reference layer** — Dept → System Type → Sub System Type, `lien_workflow_type` mapping, stage triggers (DD-09) | This app's read API |
| Helm Core: Scheduling | **Schedule Hold** flag — any project with ≥1 invoice past due per terms | Flag exposed on this app's API for Scheduling to consume |
| Helm Core: Purchasing/Inventory | **Material Hold** flag — client overdue past threshold | Flag exposed on this app's API for Purchasing to consume |
| Helm Core / Reporting | Lien exposure, collections status, lapsed-rights data | Read API for cross-app dashboards |
| HubSpot | Logged collections activities, promise-to-pay, escalation status | Written back as HubSpot activities/properties |

### External Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| HubSpot | Bidirectional | System of record for projects, parties, status, and client identity (read); collections activity logging and status sync (write) |
| Connecteam | Read | System of record for timesheet hours by stage → derive work months |
| QuickBooks Online | Read (+ confirm) | Invoice and supplier-invoice amounts, dates, due dates, payment status |
| Mailing abstraction (Shippo first) | Outbound | Generate certified-mail label, capture tracking number, confirm send |
| NotaryLive | Outbound + Webhook | Digital notarization for clients flagged `requires_notarized_waivers`; webhook on completion, document pull |
| Texas Easy Lien | Handoff | County-clerk affidavit filing; affidavit export out, filing confirmation logged back |
| Helm Core | Outbound (we expose) | Consumes this app's reference-layer read API and hold flags; SSO/identity and design tokens shared |

---

## 5. Feature Registry

Feature numbers match `FEATURE_REFERENCE.md` and `PRODUCT_ARCHITECTURE.md` (Module #22). Status key: ⬜ Not Started · 📋 Scoped · 🔨 In Progress · ✅ Complete · 🚫 Blocked · 🔮 Future.

> **Module # note:** The `HOW_TO_CREATE_SCOPE_DOCS.md` legacy quick-reference table lists this module as #23. The canonical Consolidated Registry in `PRODUCT_ARCHITECTURE.md` and `FEATURE_REFERENCE.md` both assign **#22** (features 22.1–22.10). Per Part 4 of the guide, `PRODUCT_ARCHITECTURE.md` is canonical for numbering, so this scope uses #22. The guide's quick-reference table should be corrected in a future update.

| # | Feature | Phase | Status | Agent | Notes |
|---|---------|-------|--------|-------|-------|
| 22.1 | Tenant Configuration | 1 | 📋 Scoped | — | Reference tables (Dept → System Type → Sub System Type), `lien_workflow_type` mapping, stage clock triggers, jurisdiction rule set admin |
| 22.2 | Project Lien Setup | 2 | 📋 Scoped | — | Contractor tier, party relationships, lien completion checklist (surfaced over HubSpot project/party data) |
| 22.3 | Deadline Tracking | 3 | 📋 Scoped | — | Automated per-month, per-stream deadline derivation off timesheets + QBO; jurisdiction rule engine |
| 22.4 | Monthly Workflow | 4 | 📋 Scoped | — | 1st-of-month run, monthly lien report, ready-to-send queue, courtesy heads-up logging |
| 22.5 | Notice Generation & Sending | 4, 5 | 📋 Scoped | — | Statutory notice documents (§ 53.056 / § 53.057), mailing integration, status lifecycle |
| 22.6 | Lien Waivers | 5 | 📋 Scoped | — | Conditional/unconditional progress & final (§ 53.284), approval gates, NotaryLive, invoice attachment |
| 22.7 | Lien Filing & Release | 6 | 📋 Scoped | — | Affidavit package (§ 53.054), Texas Easy Lien handoff, post-filing deadlines, release (§ 53.152) |
| 22.8 | Cross-Module Flags | 3 | 📋 Scoped | — | Schedule Hold (any past-due invoice) + Material Hold (overdue past threshold), exposed to Helm Core |
| 22.9 | Lien Reporting | 6 | 📋 Scoped | — | Exposure dashboard, per-project lien timeline, lapsed-rights report |
| 22.10 | Collections Pipeline | 7 | 📋 Scoped | — | AR aging, dunning sequences, contact logging, promise-to-pay, payment plans, escalation ladder, risk scoring. **Built out below.** |

### 5.1 Collections Pipeline — Build-Out (Feature 22.10)

The registry defines Feature 22.10 with one epic (22.10.1 Collections Tracking: pipeline view + communication logging). This app treats collections as a first-class half (Section 1.3), so 22.10 is expanded. The existing epic number is preserved; epics 22.10.2–22.10.5 are **confirmed** (DD-13) and will be written into `FEATURE_REFERENCE.md` once this documentation set is complete.

| Epic | Name | Status | Scope |
|------|------|--------|-------|
| 22.10.1 | Collections Tracking | 📋 Scoped | AR aging view, overdue-account pipeline, per-effort communication logging |
| 22.10.2 | Dunning Sequences | 📋 Scoped | Tenant-configured reminder cadences (reminder → statement → call → final demand) advanced automatically by days-overdue |
| 22.10.3 | Promise-to-Pay & Payment Plans | 📋 Scoped | Record commitments and installment plans; track kept/broken; suppress dunning while a promise is open and current |
| 22.10.4 | Escalation Ladder & Handoff | 📋 Scoped | Rules for moving an account from collections to lien-notice to filing to write-off / agency handoff, with the lien statutory deadline as the hard backstop |
| 22.10.5 | Account Risk Scoring | 📋 Scoped | Score clients on payment history and exposure; drive Material Hold threshold and prioritize the call queue |

---

## 6. Data Model (Summary Only)

> **See `lien_collections_DATA_MODEL.md` for complete field specifications, enum values, relationships, indexes, and migration annotations.** Every model includes `orgId`, `org` relation, `createdAt`, `updatedAt`, and `@@index([orgId])`.

**Local store engine:** Postgres + Prisma, owned by this app (not Helm's database). The app reaches Helm Core, HubSpot, and QBO across integration boundaries.

**Ownership split & no-duplication rule (v1.2):** External system-of-record data (Section 1.4) is never copied as a second authoritative record. Each local "link" model stores the **external reference ID plus an ephemeral read cache** of only the fields the engine needs, refreshed from source — it does not own that data. Named reference IDs:

| Link model | External ID stored | Source of record |
|------------|--------------------|------------------|
| `LinkedClient` (on `CollectionAccount`) | `hubspotCompanyId`, `hubspotContactId` | HubSpot |
| `LienProject` | `hubspotProjectId` | HubSpot |
| `ProjectPartyLink` | `hubspotCompanyId` (per `partyRelationType`) | HubSpot |
| `TimesheetLink` | `connecteamUserId`, `connecteamTimeRecordId` | Connecteam |
| `InvoiceLink` | `qboInvoiceId`, `qboSupplierInvoiceId` | QBO |

DATA_MODEL.md Section 2 specifies, per link model, exactly which cached fields are stored and the refresh trigger; full field definitions and the integration API surface live there. Because this app owns its own datastore, the lien/collections entities below are the only fully-authoritative local models.

### 6.1 Enums (summary)

`LienWorkflowType` (`residential_sub`, `commercial_sub`, `public_bond`, `none`), `ContractorTier` (`first_tier`, `second_tier`), `LienClockTrigger` (`none`, `design_start`, `field_work_start`), `WorkStream` (`construction`, `design`), `LienStreamStatus`, `NoticeType` (early warning, statutory claim, retainage), `NoticeStatus` (`draft`, `approved`, `sent`, `delivered`), `WaiverType` (conditional/unconditional × progress/final), `WaiverApprovalStatus`, `FilingStatus`, `ReleaseStatus`, `PartyRelationType` (`owner`, `original_contractor`, `hiring_party`), `HoldType` (`schedule_hold`, `material_hold`), `SupplierNoticeRiskStatus`, `DunningStepType`, `CollectionStatus`, `PromiseStatus`, `PaymentPlanStatus`, `EscalationStage`. (Full value lists in DATA_MODEL.)

### 6.2 Models (key fields only)

**Reference / configuration (shared platform reference layer — see note):**
- `Department` (name)
- `SystemType` (name, departmentId)
- `SubSystemType` (name, systemTypeId, `lienWorkflowType`)
- `StageTriggerConfig` carrying `lienClockTrigger`, owned here and keyed to HubSpot status/stage (`hubspotStageKey`)

**Jurisdiction rules engine (multi-state core):**
- `Jurisdiction` (code e.g. `US-TX`, name, active)
- `LienRuleSet` (jurisdictionId, version, effectiveDate, statuteRef)
- `LienRule` (ruleSetId, `lienWorkflowType`, `workStream`, ruleKind e.g. notice/filing/retainage/post-filing, deadline expression, statuteCitation, businessDayHandling)

**Lien tracking:**
- `LienProject` (links HubSpot project via `hubspotProjectId`; legal address, county, `contractorTier`, `lienWorkflowType`, completion-checklist state)
- `ProjectPartyLink` (lienProjectId, `partyRelationType`, external company ID + denormalized legal name/address)
- `LienStream` (lienProjectId, `workStream`, status, openedAt)
- `WorkMonth` (lienScheduleOfValuesId, month, derived overdue/cleared state, source invoice link)
- `LienDeadline` (workMonthId, ruleId, kind, computedDate, adjustedDate, sourceData snapshot)
- `Notice` (lienScheduleOfValuesId/workMonthId, `noticeType`, `noticeStatus`, recipients, claim amount, generated doc, mailing record)
- `Waiver` (lienProjectId, `waiverType`, stream, paymentAmount, signedDate, notarizedFlag, approval chain, invoice link)
- `LienFiling` (lienScheduleOfValuesId, county, filingDate, recordingRef, fee, post-filing deadlines)
- `LienRelease` (lienFilingId, signedDate, filingConfirmation)
- `SupplierNoticeRisk` (lienProjectId, supplier invoice link, computed risk window)

**Collections:**
- `CollectionAccount` (client link, aggregate overdue, `collectionStatus`, `escalationStage`, riskScore)
- `DunningSequence` / `DunningStep` (tenant-configured cadence)
- `CollectionActivity` (accountId, method, date, notes, HubSpot activity link)
- `PromiseToPay` (accountId, amount, promisedDate, `promiseStatus`)
- `PaymentPlan` / `PaymentPlanInstallment` (accountId, schedule, `paymentPlanStatus`)

**Cross-cutting:**
- `Hold` (`holdType`, projectId/clientId, reason, setAt, clearedAt) — source of truth for flags exposed to Helm Core
- `InvoiceLink` (external QBO invoice ID, amount, date, dueDate, status, clearedFlag, clearedBy)

> **Reference-layer note (DD-09):** `Department`/`SystemType`/`SubSystemType` and the `lien_workflow_type` mapping (plus the per-stage `lienClockTrigger` config) are **owned by this app** and surfaced via a read API that Helm Core can consume. This diverges from the legacy doc's framing of a centrally-owned "shared platform reference layer"; in the standalone-app architecture the reference layer lives here and other modules read it back. DATA_MODEL.md Section 3 specifies the read endpoints Helm Core calls. Project, party, and status/stage-membership data come from **HubSpot**; timesheets from **Connecteam** (Section 4).

---

## 7. API Endpoints (Summary Only)

> **See `lien_collections_DATA_MODEL.md` Section 3 for full request/response specs, validation, side effects, and error handling.** All tenant-scoped routes apply session auth and filter by `orgId` from the session — never from the request.

| Route file | Responsibility | Approx. endpoints |
|------------|----------------|-------------------|
| `config/routes` | Reference tables, `lien_workflow_type` mapping, stage triggers, jurisdiction rule sets | 10–14 |
| `projects/routes` | Lien project setup, party relationships, completion checklist | 8–10 |
| `deadlines/routes` | Stream open/close, work-month derivation, deadline calculation + source trace | 8–10 |
| `monthly/routes` | 1st-of-month run, monthly report, ready-to-send queue, heads-up logging | 6–8 |
| `notices/routes` | Generate/edit/approve/send notices, mailing callbacks, status lifecycle | 10–12 |
| `waivers/routes` | Waiver generation, approval queues, NotaryLive callbacks, invoice attachment | 10–12 |
| `filing/routes` | Affidavit package, Texas Easy Lien handoff, post-filing deadlines, release | 8–10 |
| `collections/routes` | AR aging, dunning advancement, activity logging, promise-to-pay, payment plans, escalation | 14–18 |
| `holds/routes` | Schedule Hold / Material Hold compute + expose | 4–6 |
| `integrations/routes` | HubSpot, Connecteam, QBO sync orchestration + webhooks; Helm Core reference/hold-flag expose | 10–14 |
| `reports/routes` | Exposure dashboard, lien timeline, lapsed rights, collections dashboards | 6–8 |

---

## 8. UI Specifications (Summary Only)

> **See `lien_collections_UI_SPEC.md` for component specs and `lien_collections_LAYOUTS.html` for zone wireframes.** All pages use the Helm app-shell grid (Main Nav · Left Panel · Content · Right Panel) and Helm design-system tokens so the standalone app matches the rest of the product.

**Real design tokens, never invented (v1.2):** UI_SPEC must pull exact colors, typography, spacing, and radii from the deployed Helm codebase — `tailwind.config.js`, `src/shared/config/designSystem.js`, and the global `:root` / `.dark` CSS variables — and reuse them in the standalone app's theme. No substitute palette or font.

**Responsive (v1.2):** Pages are responsive — single column on phone, multi-column grid on tablet/desktop, capped centered content width on large screens, adaptive navigation (bottom tabs on phone, side rail on tablet). The primary surface is **desktop/laptop** (coordinators at workstations), but **phone and tablet are required, fully-supported surfaces** (DD-08) — the app must be genuinely usable on a phone, not merely non-broken. Acceptance criterion carried into UI_SPEC: fits a 390px-wide phone with no horizontal scroll and no wrapping/overlapping labels, and uses the extra width on a 1024px+ tablet.

### 8.1 Page Inventory

| Page | Layout | Purpose |
|------|--------|---------|
| Lien & Collections Dashboard | Full grid | Combined exposure + collections snapshot; "what's due this month / who's overdue" |
| Monthly Lien Report | Full grid + queue | At-risk projects, notice types, deadlines, supplier-risk flags, status |
| Ready-to-Send Queue | Full grid + queue | 10th/11th send queue; review, edit, approve, send drafts |
| Project Lien Detail | Full grid | Per-project lien timeline: streams, work months, notices, waivers, filings, holds |
| Notice Editor | Modal/page | Review and edit a generated statutory notice before finalizing; print-ready PDF |
| Waiver Workspace | Full grid | Generate waivers, approval queues, notarization status, invoice attachment |
| Filing Workspace | Full grid | Affidavit package, Texas Easy Lien export, post-filing deadlines, release |
| Collections Pipeline | Full grid + queue | AR aging, overdue-account pipeline, dunning stage, call queue |
| Account Detail | Full grid | Per-client collections history: activities, promises, plans, holds, lien linkage |
| Tenant Config | Full grid | Reference tables, workflow-type mapping, stage triggers, jurisdiction rules, dunning setup |

Navigation: top-level app entry "Lien & Collections" with two primary sections (Liens, Collections) plus Config. Right Panel carries the action/send queues; Left Panel carries status filters and navigation.

---

## 9. Seed Data (Summary Only)

> **See `lien_collections_SEED_DATA.md` for seed scripts.** Seed against test org `org_beacon_test_001`.

Seed must include: the Texas jurisdiction with a complete `LienRuleSet` (notice, filing, retainage, post-filing rules for `residential_sub` and `commercial_sub`); a Department → System Type → Sub System Type tree mapped across all `lien_workflow_type` values; projects exercising 1st- and 2nd-tier, both work streams, and every `LienStreamStatus`; work months in overdue, cleared, and at-risk states; at least one of each `NoticeType`/`NoticeStatus`, each `WaiverType` and approval state, a filed lien with post-filing deadlines, and a release; a supplier-notice-risk case; collections accounts across each `CollectionStatus`/`EscalationStage`, an open and a broken promise-to-pay, an active payment plan, and both hold types set and cleared. At least one record per enum state.

---

## 10. Build Phases

> Each phase leaves the Replit app in a deployable, testable state. Do not start the next phase until the current one passes its exit criteria. Exit criteria below are abbreviated; full criteria are per-phase in this section.

### Phase 0: Standalone Foundation (Replit + Datastore + Integration Stubs)

**Status:** ⬜ Not Started · **Agent:** — · **Branch:** — · **PR:** —

**Goal:** A running Replit app with its own Postgres schema, auth wired to Helm SSO, design-system tokens loaded, and read-only stub clients for HubSpot, Connecteam, and QBO returning fixture data.

**Builds features:** foundation for all.

**Tasks:**
1. Create Replit project; configure secrets (DB URL, HubSpot, Connecteam, QBO, Shippo, NotaryLive; Helm SSO + reference/hold-flag exposure).
2. Stand up Postgres schema + Prisma; base models with `orgId` scoping.
3. Wire Helm SSO/session auth and design-system tokens.
4. Build integration client layer (HubSpot, Connecteam, QBO) behind interfaces with fixture-backed stubs; stub the Helm Core read API this app exposes.

**Exit Criteria:** App boots on Replit; `/health` green; auth round-trips; stub clients return fixtures; zero console errors; build passes.

### Phase 1: Tenant Configuration & Jurisdiction Rules (Feature 22.1)

**Goal:** Admin can configure the reference tree, map Sub System Types to `lien_workflow_type`, set stage triggers, and view the Texas jurisdiction rule set.

**Builds features:** 22.1.

**Exit Criteria:** Every Sub System Type requires a `lien_workflow_type` before save; Texas `LienRuleSet` seeded and readable; plain-language workflow-type explanations shown.

### Phase 2: Project Lien Setup (Feature 22.2)

**Goal:** Coordinator completes lien setup on a project — tier, party relationships, completion checklist — over project/party data sourced from HubSpot.

**Builds features:** 22.2.

**Exit Criteria:** 2nd-tier projects capture both hiring party and original contractor; completion checklist surfaces missing fields; no hard block on incomplete data.

### Phase 3: Deadline Engine & Hold Flags (Features 22.3, 22.8)

**Goal:** For each active stream the engine derives work months and computes all statutory deadlines from the jurisdiction rule set, with full source-data traceability; Schedule/Material Hold flags computed and exposed.

**Builds features:** 22.3, 22.8.

**Exit Criteria:** Deadlines match Texas Ch. 53 worked examples; weekend/holiday roll-forward correct; every deadline shows its source data; holds exposed on the API.

### Phase 4: Monthly Workflow & Notice Generation (Features 22.4, 22.5)

**Goal:** The 1st-of-month run produces the monthly report and pre-generated draft notices; coordinator reviews, the ready-to-send queue surfaces on the 10th/11th, notices generate as statutory PDFs.

**Builds features:** 22.4, 22.5.1.

**Exit Criteria:** Monthly run identifies correct at-risk projects; draft notices auto-populate from project/party/QBO data; print-ready PDFs match statutory form.

### Phase 5: Sending, Waivers & Notarization (Features 22.5, 22.6)

**Goal:** Approved notices send via mailing integration with tracking; waivers generate with approval gates and NotaryLive routing and attach to invoices.

**Builds features:** 22.5.2, 22.6.

**Exit Criteria:** Certified-mail tracking captured; unconditional waivers blocked until payment marked cleared; PM/finance approval gates enforced; notarization completes before invoice send.

### Phase 6: Filing, Release & Lien Reporting (Features 22.7, 22.9)

**Goal:** Escalate a stream to filing with a compliance check, generate the consolidated affidavit package, log filing/release, compute post-filing deadlines, and surface the exposure/timeline/lapsed-rights reports.

**Builds features:** 22.7, 22.9.

**Exit Criteria:** Affidavit consolidates all overdue months per stream; post-filing 5-business-day and 1-year deadlines computed on filing; lapsed-rights report accurate.

### Phase 7: Collections Pipeline (Feature 22.10)

**Goal:** AR aging and overdue-account pipeline with dunning advancement, contact logging synced to HubSpot, promise-to-pay and payment-plan tracking, and the escalation ladder tied to lien deadlines.

**Builds features:** 22.10.1 (+ proposed 22.10.2–22.10.5 as confirmed).

**Exit Criteria:** Aging reconciles to QBO; dunning steps advance by days-overdue; activities post to HubSpot; open promises suppress dunning; escalation surfaces the lien backstop date.

---

## 11. Testing Checklist

- **Phase 0:** Replit boot, `/health`, auth round-trip, stub fixtures, zero console errors, build passes.
- **Phase 1:** `lien_workflow_type` required-before-save enforced; Texas rule set readable; mapping explanations present.
- **Phase 2:** 2nd-tier dual-party capture; completion checklist correctness; no hard block.
- **Phase 3:** Deadline correctness vs Ch. 53 worked examples; business-day roll-forward; source-data trace; hold exposure.
- **Phase 4:** Monthly run selection accuracy; draft auto-population; statutory PDF fidelity.
- **Phase 5:** Mailing tracking capture; cleared-gate on unconditional waivers; approval gates; notarization-before-send.
- **Phase 6:** Affidavit consolidation; post-filing deadline math; release within 10-day window; lapsed-rights accuracy.
- **Phase 7:** Aging reconciliation; dunning advancement; HubSpot activity sync; promise suppression; escalation backstop.
- **Cross-cutting:** every tenant-scoped query filters by session `orgId`; no console 401/404s; no unhandled server rejections.

---

## 12. Agent Assignment

> The build platform is **Replit** (a single agent builder), so each phase is **one self-contained Replit prompt** — not a parallel two-agent split. Where this scope refers to that work, it is the **AI Support** for the build. Prompts live in `lien_collections_AGENT_PROMPTS.md`.

| Phase | Builder | Rationale |
|-------|---------|-----------|
| 0 | Replit Agent | Infra, schema, integration scaffolding |
| 1 | Replit Agent | Config UI + rule-set data |
| 2 | Replit Agent | Setup forms over HubSpot reads |
| 3 | Replit Agent | Deadline engine is the highest-risk logic; build and review carefully |
| 4 | Replit Agent | Monthly run/logic + report/queue UI |
| 5 | Replit Agent | Integrations/approval logic + waiver/notice UI |
| 6 | Replit Agent | Filing/release low-volume but high-fidelity |
| 7 | Replit Agent | Collections engine/sync + pipeline UI |

> **Standalone build target (v1.2):** The module-first file paths used throughout this scope (`src/modules/lien_collections/`, `api/src/modules/lien_collections/`) describe the **eventual Helm integration target**. The standalone Replit build re-casts them into its own app structure. Every agent prompt in `lien_collections_AGENT_PROMPTS.md` must state the **integration contract** — the shared external system-of-record IDs and APIs from Section 1.4 (`hubspotProjectId`, `hubspotCompanyId`, `connecteamTimeRecordId`, `qboInvoiceId`, plus the Helm Core expose endpoints) — so the standalone app and the future Helm integration code against one interface.

---

## 13. Open Questions & Decisions

**DECIDED** (canon-divergence entries per guide Part 9.4 are flagged ⚠ SUPERSEDES CANON)

- **DD-01 — Standalone app, integrated with Helm.** ⚠ **SUPERSEDES CANON.** `PRODUCT_ARCHITECTURE.md` lists `lien_collections` (#22) as a "Module" type, i.e. compiled into the Helm monorepo. This app is instead built **standalone** — own repo, own Postgres datastore, integration contracts rather than shared DB — as the first of Beacon's standalone-but-integrated app pattern. This supersedes the architecture/type assumption for the Module #22 registry entry. Product owner (Deb) is updating `PRODUCT_ARCHITECTURE.md` accordingly; agents do not silently deviate from canon — this decision is the authorization. (Section 1.1)
- **DD-02 — Deploy target: Replit.** Build and host on Replit; Phase 0 covers project + secrets. This replaces the Vercel + Docker-Postgres flow in the root `CLAUDE.md` for this app only. (Section 1.1, Phase 0)
- **DD-03 — Texas first, built multi-state.** Statutory logic implemented for Texas Property Code Ch. 53 but expressed as jurisdiction rule-set data (`Jurisdiction` / `LienRuleSet` / `LienRule`) so additional states are additive data, not code. (Section 1.2)
- **DD-04 — Jurisdiction rule data owned in-house.** Beacon owns the rule data and its legal accuracy; every rule carries statute citation + effective date and is shown as the source behind each deadline; a legal-review gate precedes production use of any rule set. (Section 1.2)
- **DD-05 — HubSpot is the CRM system of record; QBO is the financial system of record.** ⚠ **SUPERSEDES CANON.** `PRODUCT_ARCHITECTURE.md` models CRM as the Helm-native Tower component `crm` (the shared company/contact pool). For this app, **HubSpot** is authoritative for client identity and the collections-logging surface, and **QBO** is authoritative for invoices/payments. This supersedes the assumption that client records are read from Helm-native `crm`. Product owner is updating canon accordingly. (Section 1.4, Section 4)
- **DD-06 — Integration-first, no-duplication.** External data is referenced by ID + ephemeral read cache, never copied as a second authoritative record. (Section 1.4, Section 6)
- **DD-07 — Collections is a first-class half, not an afterthought.** Feature 22.10 is built out (Section 5.1) and gets its own phase (Phase 7).
- **DD-08 — Desktop-first, but phone and tablet are required surfaces.** Primary surface is desktop/laptop; the app must be genuinely usable on a phone and tablet, not desktop-only. UI_SPEC defines full phone, tablet, and desktop behavior. (Section 8)
- **DD-09 — Reference layer is owned by this app.** `Department`/`SystemType`/`SubSystemType`, the `lien_workflow_type` mapping, and per-stage `lienClockTrigger` config live in this app and are surfaced via a read API for Helm Core. Diverges from the legacy "shared platform reference layer" framing. (Section 6.2)
- **DD-10 — HubSpot is the system of record for projects, parties, status, and client identity; QBO for invoices.** ⚠ **SUPERSEDES CANON.** Beyond CRM (DD-05), HubSpot also holds **projects, party relationships (owner/GC/hiring party), and status/stage membership** — superseding the canon assumption that these come from Helm-native Jobs/Projects. QBO is the source of truth for invoice/payment data. A local `CollectionAccount` is keyed to the HubSpot company; QBO invoices reconcile to that client via a stored cross-reference (matching mechanism specified in DATA_MODEL.md). Lien-specific fields (contractor tier, legal property address, completion checklist) are captured locally on `LienProject`. (Section 1.4, Section 4)
- **DD-11 — Public bond / public projects out of scope.** Carried as `lien_workflow_type: none` and handled outside the system. No in-app workflow. (Constraints table)
- **DD-12 — Timesheets come from Connecteam.** ⚠ **SUPERSEDES CANON.** Field and design hours, tagged by stage, are read from **Connecteam** to derive per-stream work months — superseding the canon assumption of a Helm-native Field/Timesheets source. (Section 1.4, Section 4)
- **DD-13 — Collections epics 22.10.2–22.10.5 confirmed.** Dunning Sequences, Promise-to-Pay & Payment Plans, Escalation Ladder, and Account Risk Scoring are confirmed as real epics under Feature 22.10. `FEATURE_REFERENCE.md` is to be updated to add them **once this documentation set is complete** (per product owner). (Section 5.1)

**OPEN**

_None. All open items resolved as of v1.3._

**Deferred actions (not blockers):**
- Update `FEATURE_REFERENCE.md` to add epics 22.10.2–22.10.5 (per DD-13), and update `PRODUCT_ARCHITECTURE.md` for the canon supersessions (DD-01, DD-05, DD-10, DD-12) — both done by the product owner in a separate pass once the doc set is complete.
- Specify the HubSpot↔QBO client matching mechanism in `DATA_MODEL.md` (DD-10).

**PARKED**
- Exposing the mailing layer and lien data as an external platform API for Beacon's own clients (future productization, per legacy doc).
- Multi-state expansion beyond Texas (second rule set) — design-ready, not in v1.0.

---

## 14. Revision Log

| Date | Author | What Changed |
|------|--------|--------------|
| 2026-06-18 | Deb (with AI Support) | Initial master scope created from legacy `SCOPE.md` (Lien Rights User Stories v1.0). Reframed as standalone Replit app (first of the new pattern); added jurisdiction rules-engine design for Texas-first/multi-state; built out Collections (Feature 22.10) as a first-class half; defined HubSpot + QBO + Helm Core integration contracts. |
| 2026-06-18 | Deb (with AI Support) | v1.4 — authored the five companion docs (DATA_MODEL, SEED_DATA, UI_SPEC, LAYOUTS.html, AGENT_PROMPTS) and aligned them to this scope. Agent prompts geared to Replit (one self-contained prompt per phase); updated Section 12/15 from a parallel-agent model to the Replit single-builder model; fixed Phase 2 rationale (HubSpot, not Helm Core). |
| 2026-06-18 | Deb (with AI Support) | v1.3 — corrected data sources: HubSpot is system of record for projects, parties, and status/stage membership (DD-10, ⚠ supersedes canon); Connecteam for timesheets (DD-12, ⚠ supersedes canon). Repointed Integration Architecture (1.4), dependencies (4), reference IDs (6), and Phases 0/2 from Helm Core to HubSpot/Connecteam. Helm Core recast as a consumer (reference layer + hold flags), not a source. Collections epics 22.10.2–22.10.5 confirmed (DD-13). All open items resolved; FEATURE_REFERENCE / PRODUCT_ARCHITECTURE updates deferred to a product-owner pass. |
| 2026-06-18 | Deb (with AI Support) | v1.2 — resolved open items from review: DD-08 phone + tablet required surfaces; DD-09 reference layer owned by this app and surfaced via read API to Helm Core (corrected the prior Helm-Core-owned note in Section 6.2); DD-10 client identity anchored to HubSpot, invoices to QBO; DD-11 public bond/public out of scope. Remaining OPEN: Helm Core read API surface; collections epic numbering in FEATURE_REFERENCE.md. |
| 2026-06-18 | Deb (with AI Support) | v1.1 — conformed to `HOW_TO_CREATE_SCOPE_DOCS.md` v1.2. Added Integration Architecture table (1.4); ownership-split / no-duplication rule with named reference IDs (Section 6); real-design-token + responsive UI note (Section 8); standalone build-target note (Section 12); Module # discrepancy note (Section 5). Converted Section 13 decisions to `DD-01…DD-07`; recorded **DD-01** (standalone app) and **DD-05** (HubSpot/QBO as systems of record) as canon supersessions of `PRODUCT_ARCHITECTURE.md` per Part 9.4 — product owner updating canon accordingly. |

---

## 15. Agent Prompts

> Per-phase build prompts live in the companion doc **`lien_collections_AGENT_PROMPTS.md`**. Section 15 is a pointer, not an inline prompt.
>
> Per guide v1.2, those prompts name the **build platform (Replit)** with one self-contained prompt per phase, name the app stack and the responsive primitives from UI_SPEC, and state the **integration contract** (the shared system-of-record IDs and APIs from Section 1.4) so the standalone build and the eventual Helm integration code against one interface.

| Phase | Description | Builder | Prompt ID |
|-------|-------------|---------|-----------|
| 0 | Standalone Foundation | Replit Agent | Phase 0 |
| 1 | Tenant Config & Jurisdiction Rules | Replit Agent | Phase 1 |
| 2 | Project Lien Setup | Replit Agent | Phase 2 |
| 3 | Deadline Engine & Hold Flags | Replit Agent | Phase 3 |
| 4 | Monthly Workflow & Notice Generation | Replit Agent | Phase 4 |
| 5 | Sending, Waivers & Notarization | Replit Agent | Phase 5 |
| 6 | Filing, Release & Lien Reporting | Replit Agent | Phase 6 |
| 7 | Collections Pipeline | Replit Agent | Phase 7 |
