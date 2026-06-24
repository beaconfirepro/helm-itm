# Lien & Collections — Data Model & API

**Module ID:** `lien_collections`
**Module #:** 22
**GitHub Label:** `module/lien_collections`
**Version:** 1.0
**Date:** 2026-06-18
**Status:** Build spec — companion to `lien_collections_SCOPE.md`

> Complete backend implementation spec. Every enum value, every model field, every endpoint. An agent should be able to write the full schema and all route handlers from this document alone.
>
> **Store engine:** Postgres + Prisma, owned by this standalone app (Replit). Not Helm's database.
> **Hard boundary:** No seed scripts here — see `lien_collections_SEED_DATA.md`.
> **Conventions:** Every model has `id String @id @default(cuid())`, `orgId String`, `org Organization @relation(...)`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, and `@@index([orgId])`. All tenant-scoped routes apply `requireSession` and filter by `req.session!.orgId` — never an `orgId` from the request.

---

## Section 0: Integration Ownership Split

Per SCOPE Section 1.4 (DD-06, no-duplication). External systems of record are referenced by ID plus an **ephemeral read cache** of only the fields the engine needs. Link models never store a second authoritative copy.

| Concern | System of Record | Link model | External IDs | Cached fields (refreshed) |
|---------|------------------|------------|--------------|---------------------------|
| Client identity | HubSpot | `LinkedClient` | `hubspotCompanyId`, `hubspotContactId` | name, email, phone, paymentTermsDays, requiresNotarizedWaivers |
| Project, status | HubSpot | `LienProject` | `hubspotProjectId` | projectName, hubspotStatus, jobSiteAddress |
| Parties (owner/GC/hiring) | HubSpot | `ProjectPartyLink` | `hubspotCompanyId` | legalName, mailingAddress |
| Timesheet hours | Connecteam | `TimesheetLink` | `connecteamUserId`, `connecteamTimeRecordId` | hours, workDate, stageTag |
| Invoices/payments | QBO | `InvoiceLink` | `qboInvoiceId`, `qboSupplierInvoiceId` | amount, invoiceDate, dueDate, qboStatus |

**Refresh trigger:** cached fields are refreshed on read when older than the configured TTL, on webhook receipt, and on the 1st-of-month run. `lastSyncedAt` is stamped on every link model. The authoritative value always belongs to the external system; cached fields are display/compute conveniences only.

**Client matching (DD-10):** A `LinkedClient` is keyed to HubSpot (`hubspotCompanyId`). QBO invoices reconcile to a client by a stored cross-reference: on first import, an `InvoiceLink` is matched to a `LinkedClient` by (1) an explicit `qboCustomerId → hubspotCompanyId` map held on `LinkedClient.qboCustomerId`, else (2) exact tax-ID match, else (3) normalized-name + email match, else (4) flagged `unmatched` for coordinator resolution. The map, once confirmed, is authoritative for that pair.

---

## Section 1: Enums

```prisma
enum LienWorkflowType {
  residential_sub   // Residential — Beacon is sub; GC has direct agreement with owner-occupant
  commercial_sub    // Commercial — Beacon is sub (primary Beacon case)
  public_bond       // Public/bond project — handled outside system
  none              // Lien tracking not applicable
}

enum ContractorTier {
  first_tier        // Contracted directly with the GC
  second_tier       // Contracted with a sub; original contractor is GC at top of chain
}

enum LienClockTrigger {
  none
  design_start
  field_work_start
}

enum WorkStream {
  construction
  design
}

enum LienStreamStatus {
  open              // Stream opened, monitoring
  at_risk           // ≥1 overdue work month with an approaching deadline
  notice_active     // ≥1 statutory notice sent, rights preserved
  filing            // Escalated to filing
  filed             // Affidavit recorded
  released          // Filed lien released
  closed            // Resolved/paid, no action outstanding
  lapsed            // A statutory deadline was missed; rights forfeited
}

enum RuleKind {
  notice
  filing
  retainage
  post_filing_notice
  enforcement
  release
}

enum BusinessDayHandling {
  next_business_day // Roll to next business day if weekend/holiday (§ 53.003(e))
  exact
}

enum NoticeType {
  early_warning     // commercial_sub 2nd-month courtesy (Beacon practice)
  statutory_claim   // § 53.056 Notice of Claim for Unpaid Labor or Materials
  retainage_claim   // § 53.057 Notice of Claim for Unpaid Retainage
}

enum NoticeStatus {
  draft
  approved
  sent
  delivered
}

enum NoticeRecipientType {
  owner
  original_contractor
}

enum WaiverType {
  conditional_progress     // § 53.284(b)
  unconditional_progress   // § 53.284(c)
  conditional_final        // § 53.284(d)
  unconditional_final      // § 53.284(e)
}

enum WaiverApprovalStatus {
  not_required
  pending_pm               // unconditional progress
  pending_pm_finance       // unconditional final (both required)
  approved
  rejected
}

enum FilingStatus {
  not_filed
  compliance_check         // verifying all notices sent on time
  affidavit_draft
  exported                 // handed to Texas Easy Lien
  filed
  post_filing_notice_sent
}

enum ReleaseStatus {
  not_required
  requested
  generated
  signed
  filed
}

enum PartyRelationType {
  owner
  original_contractor
  hiring_party
}

enum HoldType {
  schedule_hold            // any invoice past due per terms
  material_hold            // client overdue past threshold
}

enum SupplierNoticeRiskStatus {
  none
  flagged                  // supplier deadline falls before Beacon's for same month
  cleared
}

enum CollectionStatus {
  current
  overdue
  in_collections
  promised
  payment_plan
  escalated
  written_off
  resolved
}

enum EscalationStage {
  none
  soft_collections
  pre_lien_notice
  lien_filing
  agency_attorney
  write_off
}

enum DunningStepType {
  reminder
  statement
  call
  final_demand
}

enum PromiseStatus {
  open
  kept
  broken
  cancelled
}

enum PaymentPlanStatus {
  active
  completed
  defaulted
  cancelled
}

enum CollectionActivityMethod {
  email
  phone
  letter
  sms
  portal
  in_person
}

enum IntegrationSource {
  hubspot
  connecteam
  qbo
}

enum SyncStatus {
  pending
  synced
  error
}
```

---

## Section 2: Models

### 2.1 Integration / Link Models

```prisma
model LinkedClient {
  id                      String   @id @default(cuid())
  orgId                   String
  org                     Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  hubspotCompanyId        String                 // system of record (HubSpot)
  hubspotContactId        String?
  qboCustomerId           String?                // confirmed cross-ref for invoice matching (DD-10)
  cachedName              String
  cachedEmail             String?
  cachedPhone             String?
  paymentTermsDays        Int      @default(30)  // cached from HubSpot client flag
  requiresNotarizedWaivers Boolean @default(false)
  matchState              String   @default("matched") // matched | unmatched | needs_review
  lastSyncedAt            DateTime?
  collectionAccount       CollectionAccount?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  @@unique([orgId, hubspotCompanyId])
  @@index([orgId])
}

model TimesheetLink {
  id                   String   @id @default(cuid())
  orgId                String
  org                  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienProjectId        String
  lienProject          LienProject @relation(fields: [lienProjectId], references: [id], onDelete: Cascade)
  connecteamUserId     String
  connecteamTimeRecordId String
  stageTag             String                  // maps to LienClockTrigger source stage
  workStream           WorkStream
  hours                Decimal  @db.Decimal(6,2)
  workDate             DateTime
  lastSyncedAt         DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  @@unique([orgId, connecteamTimeRecordId])
  @@index([orgId])
  @@index([lienProjectId])
}

model InvoiceLink {
  id                 String   @id @default(cuid())
  orgId              String
  org                Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienProjectId      String?
  lienProject        LienProject? @relation(fields: [lienProjectId], references: [id])
  linkedClientId     String?
  linkedClient       LinkedClient? @relation(fields: [linkedClientId], references: [id])
  qboInvoiceId       String?                 // Beacon receivable
  qboSupplierInvoiceId String?               // supplier payable (for supplier-notice risk)
  isSupplierInvoice  Boolean  @default(false)
  amount             Decimal  @db.Decimal(12,2)
  invoiceDate        DateTime
  dueDate            DateTime
  qboStatus          String                  // cached QBO status
  clearedFlag        Boolean  @default(false) // coordinator-confirmed (not QBO-derived)
  clearedAt          DateTime?
  clearedByUserId    String?
  lastSyncedAt       DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([orgId])
  @@index([lienProjectId])
}

model SyncJob {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  source        IntegrationSource
  entity        String                       // "invoice" | "timesheet" | "project" | ...
  status        SyncStatus @default(pending)
  startedAt     DateTime?
  finishedAt    DateTime?
  error         String?
  payload       Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
}
```

### 2.2 Reference Models (owned here, DD-09; surfaced via read API)

```prisma
model Department {
  id          String   @id @default(cuid())
  orgId       String
  org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name        String
  systemTypes SystemType[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([orgId])
}

model SystemType {
  id             String   @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name           String
  departmentId   String
  department     Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  subSystemTypes SubSystemType[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([orgId])
  @@index([departmentId])
}

model SubSystemType {
  id               String   @id @default(cuid())
  orgId            String
  org              Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name             String
  systemTypeId     String
  systemType       SystemType @relation(fields: [systemTypeId], references: [id], onDelete: Cascade)
  lienWorkflowType LienWorkflowType            // REQUIRED before use on a project (L05)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([orgId])
  @@index([systemTypeId])
}

model StageTriggerConfig {
  id               String   @id @default(cuid())
  orgId            String
  org              Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  hubspotStageKey  String                      // maps to a HubSpot status/stage value
  label            String
  lienClockTrigger LienClockTrigger @default(none)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([orgId, hubspotStageKey])
  @@index([orgId])
}
```

### 2.3 Jurisdiction Rules Engine (multi-state core, Texas seeded)

```prisma
model Jurisdiction {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  code      String                              // e.g. "US-TX"
  name      String
  active    Boolean  @default(true)
  ruleSets  LienRuleSet[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([orgId, code])
  @@index([orgId])
}

model LienRuleSet {
  id             String   @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  jurisdictionId String
  jurisdiction   Jurisdiction @relation(fields: [jurisdictionId], references: [id], onDelete: Cascade)
  version        String                          // e.g. "TX-2022.01"
  effectiveDate  DateTime
  statuteRef     String                          // e.g. "Tex. Prop. Code Ch. 53"
  legalReviewed  Boolean  @default(false)        // gate before production use
  rules          LienRule[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([orgId])
  @@index([jurisdictionId])
}

model LienRule {
  id                  String   @id @default(cuid())
  orgId               String
  org                 Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  ruleSetId           String
  ruleSet             LienRuleSet @relation(fields: [ruleSetId], references: [id], onDelete: Cascade)
  lienWorkflowType    LienWorkflowType
  workStream          WorkStream
  ruleKind            RuleKind
  // Deadline expression: anchor + offset, interpreted by the engine.
  anchor              String   // "work_month" | "completion" | "filing_date" | "request_date"
  offsetMonths        Int?     // e.g. 3 (15th of 3rd month)
  offsetDayOfMonth    Int?     // e.g. 15
  offsetDays          Int?     // e.g. 30 (30 days after completion), or 5 business days
  offsetIsBusinessDays Boolean @default(false)
  businessDayHandling BusinessDayHandling @default(next_business_day)
  statuteCitation     String   // e.g. "§ 53.056(a-1)(1)"
  description         String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@index([orgId])
  @@index([ruleSetId])
}
```

### 2.4 Lien Tracking Models

```prisma
model LienProject {
  id                  String   @id @default(cuid())
  orgId               String
  org                 Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  hubspotProjectId    String                          // system of record (HubSpot)
  jurisdictionId      String
  jurisdiction        Jurisdiction @relation(fields: [jurisdictionId], references: [id])
  subSystemTypeId     String
  subSystemType       SubSystemType @relation(fields: [subSystemTypeId], references: [id])
  lienWorkflowType    LienWorkflowType                // resolved from subSystemType
  contractorTier      ContractorTier @default(first_tier)
  // Lien-specific fields owned here (Phase 2 setup), not in HubSpot:
  legalPropertyAddress String?
  county              String?
  contractStartDate   DateTime?
  cachedProjectName   String?
  cachedHubspotStatus String?
  completionChecklistComplete Boolean @default(false)
  parties             ProjectPartyLink[]
  streams             LienStream[]
  invoices            InvoiceLink[]
  timesheets          TimesheetLink[]
  holds               Hold[]
  supplierRisks       SupplierNoticeRisk[]
  lastSyncedAt        DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@unique([orgId, hubspotProjectId])
  @@index([orgId])
}

model ProjectPartyLink {
  id                String   @id @default(cuid())
  orgId             String
  org               Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienProjectId     String
  lienProject       LienProject @relation(fields: [lienProjectId], references: [id], onDelete: Cascade)
  partyRelationType PartyRelationType
  hubspotCompanyId  String
  cachedLegalName   String
  cachedMailingAddress String?
  lastSyncedAt      DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([orgId])
  @@index([lienProjectId])
}

model LienStream {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienProjectId String
  lienProject   LienProject @relation(fields: [lienProjectId], references: [id], onDelete: Cascade)
  workStream    WorkStream
  status        LienStreamStatus @default(open)
  openedAt      DateTime
  workMonths    WorkMonth[]
  notices       Notice[]
  filing        LienFiling?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([lienProjectId])
}

model WorkMonth {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienScheduleOfValuesId  String
  lienStream    LienStream @relation(fields: [lienScheduleOfValuesId], references: [id], onDelete: Cascade)
  month         DateTime                       // first day of the work month
  derivedOverdue Boolean @default(false)
  clearedFlag   Boolean  @default(false)
  invoiceLinkId String?
  invoiceLink   InvoiceLink? @relation(fields: [invoiceLinkId], references: [id])
  deadlines     LienDeadline[]
  notices       Notice[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([orgId, lienScheduleOfValuesId, month])
  @@index([orgId])
  @@index([lienScheduleOfValuesId])
}

model LienDeadline {
  id           String   @id @default(cuid())
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  workMonthId  String
  workMonth    WorkMonth @relation(fields: [workMonthId], references: [id], onDelete: Cascade)
  ruleId       String
  rule         LienRule @relation(fields: [ruleId], references: [id])
  ruleKind     RuleKind
  computedDate DateTime                        // before business-day adjustment
  adjustedDate DateTime                        // after § 53.003(e) roll-forward
  sourceData   Json                            // snapshot of inputs for traceability (L13)
  satisfiedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([orgId])
  @@index([workMonthId])
}

model Notice {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienScheduleOfValuesId  String
  lienStream    LienStream @relation(fields: [lienScheduleOfValuesId], references: [id], onDelete: Cascade)
  workMonthId   String?
  workMonth     WorkMonth? @relation(fields: [workMonthId], references: [id])
  noticeType    NoticeType
  status        NoticeStatus @default(draft)
  claimAmount   Decimal  @db.Decimal(12,2)
  workDescription String?
  monthListed   DateTime
  generatedDocUrl String?
  recipients    NoticeRecipient[]
  mailing       MailingRecord?
  approvedByUserId String?
  approvedAt    DateTime?
  sentAt        DateTime?
  deliveredAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([lienScheduleOfValuesId])
}

model NoticeRecipient {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  noticeId      String
  notice        Notice @relation(fields: [noticeId], references: [id], onDelete: Cascade)
  recipientType NoticeRecipientType
  legalName     String
  mailingAddress String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([noticeId])
}

model MailingRecord {
  id             String   @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  noticeId       String?  @unique
  notice         Notice?  @relation(fields: [noticeId], references: [id])
  filingId       String?  @unique
  filing         LienFiling? @relation(fields: [filingId], references: [id])
  provider       String   @default("shippo")
  trackingNumber String?
  labelUrl       String?
  sentDate       DateTime?
  proofUrl       String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([orgId])
}

model Waiver {
  id              String   @id @default(cuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienProjectId   String
  lienProject     LienProject @relation(fields: [lienProjectId], references: [id], onDelete: Cascade)
  workStream      WorkStream
  waiverType      WaiverType
  paymentAmount   Decimal  @db.Decimal(12,2)
  approvalStatus  WaiverApprovalStatus @default(not_required)
  pmApprovedByUserId String?
  pmApprovedAt    DateTime?
  financeApprovedByUserId String?
  financeApprovedAt DateTime?
  notarized       Boolean  @default(false)
  notaryLiveRef   String?
  signedDate      DateTime?
  invoiceLinkId   String?
  invoiceLink     InvoiceLink? @relation(fields: [invoiceLinkId], references: [id])
  generatedDocUrl String?
  providedToGc    Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([orgId])
  @@index([lienProjectId])
}

model LienFiling {
  id               String   @id @default(cuid())
  orgId            String
  org              Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienScheduleOfValuesId     String   @unique
  lienStream       LienStream @relation(fields: [lienScheduleOfValuesId], references: [id], onDelete: Cascade)
  status           FilingStatus @default(not_filed)
  affidavitDocUrl  String?
  county           String?
  filingDate       DateTime?
  recordingRef     String?
  filingFee        Decimal? @db.Decimal(10,2)
  postFilingNoticeDeadline DateTime?  // 5 business days (§ 53.055)
  enforcementDeadline DateTime?       // 1 year (§ 53.158)
  release          LienRelease?
  mailing          MailingRecord?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([orgId])
}

model LienRelease {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  filingId      String   @unique
  filing        LienFiling @relation(fields: [filingId], references: [id], onDelete: Cascade)
  status        ReleaseStatus @default(not_required)
  requestedAt   DateTime?
  generatedDocUrl String?
  signedDate    DateTime?
  filingConfirmation String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
}

model SupplierNoticeRisk {
  id             String   @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  lienProjectId  String
  lienProject    LienProject @relation(fields: [lienProjectId], references: [id], onDelete: Cascade)
  invoiceLinkId  String                          // the supplier invoice
  status         SupplierNoticeRiskStatus @default(none)
  supplierDeadline DateTime
  beaconDeadline DateTime
  monthAffected  DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([orgId])
  @@index([lienProjectId])
}
```

### 2.5 Collections Models (Feature 22.10)

```prisma
model CollectionAccount {
  id              String   @id @default(cuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  linkedClientId  String   @unique
  linkedClient    LinkedClient @relation(fields: [linkedClientId], references: [id], onDelete: Cascade)
  status          CollectionStatus @default(current)
  escalationStage EscalationStage @default(none)
  totalOverdue    Decimal  @db.Decimal(12,2) @default(0)
  oldestOverdueDays Int    @default(0)
  riskScore       Int?     // 0-100 (22.10.5)
  dunningSequenceId String?
  dunningSequence DunningSequence? @relation(fields: [dunningSequenceId], references: [id])
  currentDunningStepId String?
  activities      CollectionActivity[]
  promises        PromiseToPay[]
  paymentPlans    PaymentPlan[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([orgId])
}

model DunningSequence {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  active    Boolean  @default(true)
  steps     DunningStep[]
  accounts  CollectionAccount[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([orgId])
}

model DunningStep {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  sequenceId    String
  sequence      DunningSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  stepType      DunningStepType
  daysOverdue   Int                            // trigger threshold
  order         Int
  templateRef   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([sequenceId])
}

model CollectionActivity {
  id             String   @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  accountId      String
  account        CollectionAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  method         CollectionActivityMethod
  activityDate   DateTime
  notes          String?
  hubspotActivityId String?                     // written back to HubSpot
  createdByUserId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([orgId])
  @@index([accountId])
}

model PromiseToPay {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  accountId     String
  account       CollectionAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  amount        Decimal  @db.Decimal(12,2)
  promisedDate  DateTime
  status        PromiseStatus @default(open)
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([accountId])
}

model PaymentPlan {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  accountId     String
  account       CollectionAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  status        PaymentPlanStatus @default(active)
  totalAmount   Decimal  @db.Decimal(12,2)
  installments  PaymentPlanInstallment[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([accountId])
}

model PaymentPlanInstallment {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  planId        String
  plan          PaymentPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  dueDate       DateTime
  amount        Decimal  @db.Decimal(12,2)
  paid          Boolean  @default(false)
  paidDate      DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
  @@index([planId])
}
```

### 2.6 Cross-Cutting Models

```prisma
model Hold {
  id            String   @id @default(cuid())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  holdType      HoldType
  lienProjectId String?
  lienProject   LienProject? @relation(fields: [lienProjectId], references: [id])
  linkedClientId String?
  reason        String
  setAt         DateTime @default(now())
  clearedAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orgId])
}
```

> **Organization** is the tenant root (shared platform model). Only the back-relations used by this app's models are added; its own fields are owned by the platform. Test org: `org_beacon_test_001`.

---

## Section 3: API Endpoints

All routes are mounted under the app root. All tenant-scoped routes use `requireSession` and `orgId = req.session!.orgId`. Request/response bodies are JSON. Standard errors: `400` validation, `401` no session, `403` wrong org/role, `404` not found, `409` state-machine violation, `422` integration/precondition failure.

### 3.1 `config/routes` — Tenant Configuration (Feature 22.1)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| GET | `/config/departments` | session | — | Department tree |
| POST | `/config/departments` | admin | `{ name }` | Department |
| POST | `/config/system-types` | admin | `{ name, departmentId }` | SystemType |
| POST | `/config/sub-system-types` | admin | `{ name, systemTypeId, lienWorkflowType }` — `lienWorkflowType` REQUIRED (L05); 400 if missing | SubSystemType |
| PATCH | `/config/sub-system-types/:id` | admin | partial | SubSystemType |
| GET | `/config/stage-triggers` | session | — | StageTriggerConfig[] |
| POST | `/config/stage-triggers` | admin | `{ hubspotStageKey, label, lienClockTrigger }` | StageTriggerConfig |
| GET | `/config/jurisdictions` | session | — | Jurisdiction[] with rule sets |
| POST | `/config/jurisdictions` | admin | `{ code, name }` | Jurisdiction |
| POST | `/config/rule-sets` | admin | `{ jurisdictionId, version, effectiveDate, statuteRef }` | LienRuleSet |
| POST | `/config/rules` | admin | full `LienRule` body | LienRule |
| PATCH | `/config/rule-sets/:id/review` | admin | `{ legalReviewed: true }` — production gate | LienRuleSet |

### 3.2 `projects/routes` — Project Lien Setup (Feature 22.2)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| GET | `/projects` | session | filter by status/risk | LienProject[] with checklist state |
| POST | `/projects` | session | `{ hubspotProjectId, subSystemTypeId }` — resolves `lienWorkflowType`, pulls HubSpot data | LienProject |
| GET | `/projects/:id` | session | — | LienProject full (parties, streams, checklist) |
| PATCH | `/projects/:id` | session | `{ contractorTier, legalPropertyAddress, county, contractStartDate }` | LienProject |
| GET | `/projects/:id/checklist` | session | — | completion checklist (missing fields) |
| POST | `/projects/:id/parties` | session | `{ partyRelationType, hubspotCompanyId }` — both hiring+original required if 2nd tier | ProjectPartyLink |
| DELETE | `/projects/:id/parties/:partyId` | session | — | 204 |

### 3.3 `deadlines/routes` — Deadline Tracking (Feature 22.3)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/streams/open` | session | `{ lienProjectId, workStream }` — opens stream when stage triggers | LienStream |
| PATCH | `/streams/:id/status` | session | `{ status }` — validated against state machine | LienStream |
| GET | `/streams/:id/work-months` | session | — | WorkMonth[] derived |
| POST | `/streams/:id/recompute` | session | recompute work months + deadlines | { workMonths, deadlines } |
| GET | `/deadlines/:workMonthId` | session | — | LienDeadline[] with `sourceData` (L13) |
| POST | `/invoices/:id/clear` | session | `{ clearedFlag: true }` — coordinator confirm | InvoiceLink |

### 3.4 `monthly/routes` — Monthly Workflow (Feature 22.4)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/monthly/run` | system/admin | 1st-of-month: select at-risk, confirm status, flag supplier risk, pre-generate drafts | summary |
| GET | `/monthly/report` | session | `?month=` | monthly lien report rows |
| GET | `/monthly/send-queue` | session | 10th/11th ready-to-send | Notice[] (draft/approved) |
| POST | `/monthly/heads-up` | session | `{ lienProjectId, method, notes, date }` — courtesy log | CollectionActivity |

### 3.5 `notices/routes` — Notice Generation & Sending (Features 22.5)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/notices` | session | `{ lienScheduleOfValuesId, workMonthId, noticeType }` — auto-populate from project/party/QBO | Notice (draft) |
| PATCH | `/notices/:id` | session | edit claimAmount, workDescription, monthListed, recipients | Notice |
| POST | `/notices/:id/approve` | session | — | Notice (approved) |
| GET | `/notices/:id/pdf` | session | print-ready statutory PDF | PDF |
| POST | `/notices/:id/send` | session | sends via mailing; captures tracking (22.5.2) | Notice (sent) + MailingRecord |
| POST | `/notices/:id/proof` | session | `{ proofUrl }` | MailingRecord |
| POST | `/webhooks/mailing` | signed | provider delivery callback → status `delivered` | 200 |

### 3.6 `waivers/routes` — Lien Waivers (Feature 22.6)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/waivers` | session | `{ lienProjectId, workStream, waiverType, paymentAmount, invoiceLinkId }`; unconditional requires `clearedFlag` (L33) → 409 if not cleared | Waiver |
| POST | `/waivers/:id/approve-pm` | pm | — | Waiver |
| POST | `/waivers/:id/approve-finance` | finance | — (final waivers need both) | Waiver |
| POST | `/waivers/:id/notarize` | session | triggers NotaryLive | Waiver (pending notarization) |
| POST | `/webhooks/notarylive` | signed | completion → attach doc, mark notarized | 200 |
| GET | `/waivers/:id/pdf` | session | statutory § 53.284 form | PDF |
| GET | `/waivers/exposure` | manager | remaining lien exposure per stream (L34) | summary |

### 3.7 `filing/routes` — Filing & Release (Feature 22.7)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/filing/:streamId/escalate` | manager | runs compliance check (all notices on time) | { ok, gaps } |
| POST | `/filing/:streamId/affidavit` | manager | consolidate all overdue months → § 53.054 package | LienFiling (affidavit_draft) |
| POST | `/filing/:id/export` | manager | hand off to Texas Easy Lien | LienFiling (exported) |
| POST | `/filing/:id/record` | manager | `{ county, filingDate, recordingRef, filingFee }` → computes post-filing deadlines | LienFiling (filed) |
| POST | `/filing/:id/post-notice` | session | send filed copies to owner+GC via mailing | MailingRecord |
| POST | `/filing/:id/release` | session | `{ status, signedDate, filingConfirmation }` (§ 53.152, 10-day) | LienRelease |

### 3.8 `collections/routes` — Collections Pipeline (Feature 22.10)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| GET | `/collections/aging` | session | AR aging buckets reconciled to QBO | aging summary |
| GET | `/collections/accounts` | session | filter by status/stage | CollectionAccount[] |
| GET | `/collections/accounts/:id` | session | — | account full history |
| POST | `/collections/accounts/:id/activity` | session | `{ method, activityDate, notes }` → writes to HubSpot | CollectionActivity |
| POST | `/collections/accounts/:id/advance` | system/session | advance dunning step by daysOverdue | CollectionAccount |
| POST | `/collections/accounts/:id/promise` | session | `{ amount, promisedDate, notes }` — suppresses dunning while open | PromiseToPay |
| PATCH | `/collections/promises/:id` | session | `{ status }` kept/broken/cancelled | PromiseToPay |
| POST | `/collections/accounts/:id/plan` | session | `{ totalAmount, installments[] }` | PaymentPlan |
| PATCH | `/collections/plans/:id/installments/:iid` | session | `{ paid, paidDate }` | PaymentPlanInstallment |
| POST | `/collections/accounts/:id/escalate` | session | `{ escalationStage }` — validated against ladder | CollectionAccount |
| GET | `/collections/sequences` | session | — | DunningSequence[] |
| POST | `/collections/sequences` | admin | `{ name, steps[] }` | DunningSequence |

### 3.9 `holds/routes` — Cross-Module Flags (Feature 22.8)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/holds/recompute` | system | recompute Schedule/Material holds | summary |
| GET | `/holds` | session | filter by type/project/client | Hold[] |
| GET | `/external/holds` | service-key | **Helm Core consumes** schedule/material holds | Hold[] (active) |

### 3.10 `external/routes` — Reference & Integration Surface (DD-09, exposed to Helm Core)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| GET | `/external/reference` | service-key | Helm Core reads Dept→SystemType→SubSystemType + `lien_workflow_type` + stage triggers | reference tree |
| GET | `/external/exposure` | service-key | lien exposure + collections status for cross-app dashboards | summary |

### 3.11 `integrations/routes` — Connectors & Webhooks

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| POST | `/integrations/hubspot/sync` | admin | pull projects/parties/status/clients | SyncJob |
| POST | `/integrations/connecteam/sync` | admin | pull timesheets by stage | SyncJob |
| POST | `/integrations/qbo/sync` | admin | pull invoices/payments/supplier invoices | SyncJob |
| POST | `/webhooks/hubspot` | signed | record/status change → refresh cache | 200 |
| POST | `/webhooks/qbo` | signed | invoice/payment change → refresh cache | 200 |
| GET | `/integrations/status` | session | last sync per source, errors | status |

### 3.12 `reports/routes` — Lien Reporting (Feature 22.9)

| Method | Path | Auth | Body / Notes | Returns |
|--------|------|------|--------------|---------|
| GET | `/reports/exposure` | manager | all projects with open lien exposure both streams | rows |
| GET | `/reports/timeline/:projectId` | session | full lien timeline (L43) | timeline |
| GET | `/reports/lapsed` | manager | lapsed lien rights (L44) | rows |

---

## Section 4: Revision Log

| Date | Author | What Changed |
|------|--------|--------------|
| 2026-06-18 | Deb (with AI Support) | Initial data model + API. Enums, models (integration/link, reference, jurisdiction-rules, lien, collections, cross-cutting), and 12 route files. Implements SCOPE v1.3 decisions: HubSpot/Connecteam/QBO ownership split with no-duplication link models (DD-06, DD-10), reference layer owned here and exposed via `external/routes` (DD-09), multi-state jurisdiction rules engine (DD-03/04), collections epics 22.10.1–22.10.5 (DD-13). |
