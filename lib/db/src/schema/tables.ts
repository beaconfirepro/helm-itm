import { randomUUID } from "crypto";
import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  lienWorkflowTypeEnum,
  contractorTierEnum,
  lienClockTriggerEnum,
  workStreamEnum,
  lienScheduleOfValuesStatusEnum,
  ruleKindEnum,
  businessDayHandlingEnum,
  noticeTypeEnum,
  noticeStatusEnum,
  noticeRecipientTypeEnum,
  waiverTypeEnum,
  waiverApprovalStatusEnum,
  filingStatusEnum,
  releaseStatusEnum,
  partyRelationTypeEnum,
  holdTypeEnum,
  supplierNoticeRiskStatusEnum,
  collectionStatusEnum,
  escalationStageEnum,
  dunningStepTypeEnum,
  promiseStatusEnum,
  paymentPlanStatusEnum,
  collectionActivityMethodEnum,
  integrationSourceEnum,
  syncStatusEnum,
} from "./enums";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const orgId = () => text("org_id").notNull();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Organization (platform root — minimal; back-relations live here)
// ---------------------------------------------------------------------------
export const organizationsTable = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

// ---------------------------------------------------------------------------
// 2.1 Integration / Link Models
// ---------------------------------------------------------------------------

export const linkedClientsTable = pgTable(
  "linked_clients",
  {
    id: id(),
    orgId: orgId(),
    hubspotCompanyId: text("hubspot_company_id").notNull(),
    hubspotContactId: text("hubspot_contact_id"),
    qboCustomerId: text("qbo_customer_id"),
    cachedName: text("cached_name").notNull(),
    cachedEmail: text("cached_email"),
    cachedPhone: text("cached_phone"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    requiresNotarizedWaivers: boolean("requires_notarized_waivers").notNull().default(false),
    matchState: text("match_state").notNull().default("matched"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("linked_clients_org_hubspot_idx").on(t.orgId, t.hubspotCompanyId),
    index("linked_clients_org_id_idx").on(t.orgId),
  ],
);

export const syncJobsTable = pgTable(
  "sync_jobs",
  {
    id: id(),
    orgId: orgId(),
    source: integrationSourceEnum("source").notNull(),
    entity: text("entity").notNull(),
    status: syncStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    payload: jsonb("payload"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sync_jobs_org_id_idx").on(t.orgId)],
);

// ---------------------------------------------------------------------------
// 2.2 Reference Models
// ---------------------------------------------------------------------------

export const departmentsTable = pgTable(
  "departments",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("departments_org_id_idx").on(t.orgId)],
);

export const systemTypesTable = pgTable(
  "system_types",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    departmentId: text("department_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("system_types_org_id_idx").on(t.orgId),
    index("system_types_department_id_idx").on(t.departmentId),
  ],
);

export const subSystemTypesTable = pgTable(
  "sub_system_types",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    systemTypeId: text("system_type_id").notNull(),
    lienWorkflowType: lienWorkflowTypeEnum("lien_workflow_type").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sub_system_types_org_id_idx").on(t.orgId),
    index("sub_system_types_system_type_id_idx").on(t.systemTypeId),
  ],
);

export const stageTriggerConfigsTable = pgTable(
  "stage_trigger_configs",
  {
    id: id(),
    orgId: orgId(),
    hubspotStageKey: text("hubspot_stage_key").notNull(),
    label: text("label").notNull(),
    lienClockTrigger: lienClockTriggerEnum("lien_clock_trigger").notNull().default("none"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stage_triggers_org_stage_key_idx").on(t.orgId, t.hubspotStageKey),
    index("stage_triggers_org_id_idx").on(t.orgId),
  ],
);

// ---------------------------------------------------------------------------
// 2.3 Jurisdiction Rules Engine
// ---------------------------------------------------------------------------

export const jurisdictionsTable = pgTable(
  "jurisdictions",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("jurisdictions_org_code_idx").on(t.orgId, t.code),
    index("jurisdictions_org_id_idx").on(t.orgId),
  ],
);

export const lienRuleSetsTable = pgTable(
  "lien_rule_sets",
  {
    id: id(),
    orgId: orgId(),
    jurisdictionId: text("jurisdiction_id").notNull(),
    version: text("version").notNull(),
    effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
    statuteRef: text("statute_ref").notNull(),
    legalReviewed: boolean("legal_reviewed").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lien_rule_sets_org_id_idx").on(t.orgId),
    index("lien_rule_sets_jurisdiction_id_idx").on(t.jurisdictionId),
  ],
);

export const lienRulesTable = pgTable(
  "lien_rules",
  {
    id: id(),
    orgId: orgId(),
    ruleSetId: text("rule_set_id").notNull(),
    lienWorkflowType: lienWorkflowTypeEnum("lien_workflow_type").notNull(),
    workStream: workStreamEnum("work_stream").notNull(),
    ruleKind: ruleKindEnum("rule_kind").notNull(),
    anchor: text("anchor").notNull(),
    offsetMonths: integer("offset_months"),
    offsetDayOfMonth: integer("offset_day_of_month"),
    offsetDays: integer("offset_days"),
    offsetIsBusinessDays: boolean("offset_is_business_days").notNull().default(false),
    businessDayHandling: businessDayHandlingEnum("business_day_handling").notNull().default("next_business_day"),
    statuteCitation: text("statute_citation").notNull(),
    description: text("description").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lien_rules_org_id_idx").on(t.orgId),
    index("lien_rules_rule_set_id_idx").on(t.ruleSetId),
  ],
);

// ---------------------------------------------------------------------------
// 2.4 Lien Tracking Models
// ---------------------------------------------------------------------------

export const lienProjectsTable = pgTable(
  "lien_projects",
  {
    id: id(),
    orgId: orgId(),
    hubspotProjectId: text("hubspot_project_id").notNull(),
    jurisdictionId: text("jurisdiction_id").notNull(),
    subSystemTypeId: text("sub_system_type_id").notNull(),
    lienWorkflowType: lienWorkflowTypeEnum("lien_workflow_type").notNull(),
    contractorTier: contractorTierEnum("contractor_tier").notNull().default("first_tier"),
    legalPropertyAddress: text("legal_property_address"),
    county: text("county"),
    contractStartDate: timestamp("contract_start_date", { withTimezone: true }),
    completionDate: timestamp("completion_date", { withTimezone: true }),
    cachedProjectName: text("cached_project_name"),
    cachedHubspotStatus: text("cached_hubspot_status"),
    completionChecklistComplete: boolean("completion_checklist_complete").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("lien_projects_org_hubspot_idx").on(t.orgId, t.hubspotProjectId),
    index("lien_projects_org_id_idx").on(t.orgId),
  ],
);

export const invoiceLinksTable = pgTable(
  "invoice_links",
  {
    id: id(),
    orgId: orgId(),
    lienProjectId: text("lien_project_id"),
    linkedClientId: text("linked_client_id"),
    qboInvoiceId: text("qbo_invoice_id"),
    qboSupplierInvoiceId: text("qbo_supplier_invoice_id"),
    isSupplierInvoice: boolean("is_supplier_invoice").notNull().default(false),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    qboStatus: text("qbo_status").notNull(),
    clearedFlag: boolean("cleared_flag").notNull().default(false),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    clearedByUserId: text("cleared_by_user_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("invoice_links_org_id_idx").on(t.orgId),
    index("invoice_links_lien_project_id_idx").on(t.lienProjectId),
  ],
);

export const timesheetLinksTable = pgTable(
  "timesheet_links",
  {
    id: id(),
    orgId: orgId(),
    lienProjectId: text("lien_project_id").notNull(),
    connecteamUserId: text("connecteam_user_id").notNull(),
    connecteamTimeRecordId: text("connecteam_time_record_id").notNull(),
    displayName: text("display_name"),
    stageTag: text("stage_tag").notNull(),
    workStream: workStreamEnum("work_stream").notNull(),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    workDate: timestamp("work_date", { withTimezone: true }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("timesheet_links_org_record_idx").on(t.orgId, t.connecteamTimeRecordId),
    index("timesheet_links_org_id_idx").on(t.orgId),
    index("timesheet_links_lien_project_id_idx").on(t.lienProjectId),
  ],
);

export const projectPartyLinksTable = pgTable(
  "project_party_links",
  {
    id: id(),
    orgId: orgId(),
    lienProjectId: text("lien_project_id").notNull(),
    partyRelationType: partyRelationTypeEnum("party_relation_type").notNull(),
    hubspotCompanyId: text("hubspot_company_id").notNull(),
    cachedLegalName: text("cached_legal_name").notNull(),
    cachedMailingAddress: text("cached_mailing_address"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_party_links_org_id_idx").on(t.orgId),
    index("project_party_links_lien_project_id_idx").on(t.lienProjectId),
  ],
);

export const lienScheduleOfValuesTable = pgTable(
  "lien_schedule_of_values",
  {
    id: id(),
    orgId: orgId(),
    lienProjectId: text("lien_project_id").notNull(),
    workStream: workStreamEnum("work_stream").notNull(),
    status: lienScheduleOfValuesStatusEnum("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lien_schedule_of_values_org_id_idx").on(t.orgId),
    index("lien_schedule_of_values_lien_project_id_idx").on(t.lienProjectId),
  ],
);

export const workMonthsTable = pgTable(
  "work_months",
  {
    id: id(),
    orgId: orgId(),
    lienScheduleOfValuesId: text("lien_schedule_of_values_id").notNull(),
    month: timestamp("month", { withTimezone: true }).notNull(),
    derivedOverdue: boolean("derived_overdue").notNull().default(false),
    clearedFlag: boolean("cleared_flag").notNull().default(false),
    invoiceLinkId: text("invoice_link_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("work_months_org_schedule_of_values_month_idx").on(t.orgId, t.lienScheduleOfValuesId, t.month),
    index("work_months_lien_schedule_of_values_id_idx").on(t.lienScheduleOfValuesId),
  ],
);

export const lienDeadlinesTable = pgTable(
  "lien_deadlines",
  {
    id: id(),
    orgId: orgId(),
    workMonthId: text("work_month_id").notNull(),
    ruleId: text("rule_id").notNull(),
    ruleKind: ruleKindEnum("rule_kind").notNull(),
    computedDate: timestamp("computed_date", { withTimezone: true }).notNull(),
    adjustedDate: timestamp("adjusted_date", { withTimezone: true }).notNull(),
    sourceData: jsonb("source_data").notNull(),
    satisfiedAt: timestamp("satisfied_at", { withTimezone: true }),
    // Manual override: when isOverridden is true, overrideDate is the authoritative
    // deadline and recompute must NOT overwrite this row's dates.
    isOverridden: boolean("is_overridden").notNull().default(false),
    overrideDate: timestamp("override_date", { withTimezone: true }),
    overrideByUserId: text("override_by_user_id"),
    overrideAt: timestamp("override_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lien_deadlines_org_id_idx").on(t.orgId),
    index("lien_deadlines_work_month_id_idx").on(t.workMonthId),
  ],
);

export const noticesTable = pgTable(
  "notices",
  {
    id: id(),
    orgId: orgId(),
    lienScheduleOfValuesId: text("lien_schedule_of_values_id").notNull(),
    workMonthId: text("work_month_id"),
    noticeType: noticeTypeEnum("notice_type").notNull(),
    status: noticeStatusEnum("status").notNull().default("draft"),
    claimAmount: numeric("claim_amount", { precision: 12, scale: 2 }).notNull(),
    workDescription: text("work_description"),
    monthListed: timestamp("month_listed", { withTimezone: true }).notNull(),
    generatedDocUrl: text("generated_doc_url"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notices_org_id_idx").on(t.orgId),
    index("notices_lien_schedule_of_values_id_idx").on(t.lienScheduleOfValuesId),
  ],
);

export const noticeRecipientsTable = pgTable(
  "notice_recipients",
  {
    id: id(),
    orgId: orgId(),
    noticeId: text("notice_id").notNull(),
    recipientType: noticeRecipientTypeEnum("recipient_type").notNull(),
    legalName: text("legal_name").notNull(),
    mailingAddress: text("mailing_address").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notice_recipients_org_id_idx").on(t.orgId),
    index("notice_recipients_notice_id_idx").on(t.noticeId),
  ],
);

export const lienFilingsTable = pgTable(
  "lien_filings",
  {
    id: id(),
    orgId: orgId(),
    lienScheduleOfValuesId: text("lien_schedule_of_values_id").notNull().unique(),
    status: filingStatusEnum("status").notNull().default("not_filed"),
    affidavitDocUrl: text("affidavit_doc_url"),
    county: text("county"),
    filingDate: timestamp("filing_date", { withTimezone: true }),
    recordingRef: text("recording_ref"),
    filingFee: numeric("filing_fee", { precision: 10, scale: 2 }),
    postFilingNoticeDeadline: timestamp("post_filing_notice_deadline", { withTimezone: true }),
    enforcementDeadline: timestamp("enforcement_deadline", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lien_filings_org_id_idx").on(t.orgId)],
);

export const mailingRecordsTable = pgTable(
  "mailing_records",
  {
    id: id(),
    orgId: orgId(),
    noticeId: text("notice_id").unique(),
    filingId: text("filing_id").unique(),
    provider: text("provider").notNull().default("shippo"),
    trackingNumber: text("tracking_number"),
    labelUrl: text("label_url"),
    sentDate: timestamp("sent_date", { withTimezone: true }),
    proofUrl: text("proof_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("mailing_records_org_id_idx").on(t.orgId)],
);

export const lienReleasesTable = pgTable(
  "lien_releases",
  {
    id: id(),
    orgId: orgId(),
    filingId: text("filing_id").notNull().unique(),
    status: releaseStatusEnum("status").notNull().default("not_required"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    generatedDocUrl: text("generated_doc_url"),
    signedDate: timestamp("signed_date", { withTimezone: true }),
    filingConfirmation: text("filing_confirmation"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lien_releases_org_id_idx").on(t.orgId)],
);

export const waiversTable = pgTable(
  "waivers",
  {
    id: id(),
    orgId: orgId(),
    lienProjectId: text("lien_project_id").notNull(),
    workStream: workStreamEnum("work_stream").notNull(),
    waiverType: waiverTypeEnum("waiver_type").notNull(),
    paymentAmount: numeric("payment_amount", { precision: 12, scale: 2 }).notNull(),
    approvalStatus: waiverApprovalStatusEnum("approval_status").notNull().default("not_required"),
    pmApprovedByUserId: text("pm_approved_by_user_id"),
    pmApprovedAt: timestamp("pm_approved_at", { withTimezone: true }),
    financeApprovedByUserId: text("finance_approved_by_user_id"),
    financeApprovedAt: timestamp("finance_approved_at", { withTimezone: true }),
    notarized: boolean("notarized").notNull().default(false),
    notaryLiveRef: text("notary_live_ref"),
    signedDate: timestamp("signed_date", { withTimezone: true }),
    invoiceLinkId: text("invoice_link_id"),
    generatedDocUrl: text("generated_doc_url"),
    providedToGc: boolean("provided_to_gc").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("waivers_org_id_idx").on(t.orgId),
    index("waivers_lien_project_id_idx").on(t.lienProjectId),
  ],
);

export const supplierNoticeRisksTable = pgTable(
  "supplier_notice_risks",
  {
    id: id(),
    orgId: orgId(),
    lienProjectId: text("lien_project_id").notNull(),
    invoiceLinkId: text("invoice_link_id").notNull(),
    status: supplierNoticeRiskStatusEnum("status").notNull().default("none"),
    supplierDeadline: timestamp("supplier_deadline", { withTimezone: true }).notNull(),
    beaconDeadline: timestamp("beacon_deadline", { withTimezone: true }).notNull(),
    monthAffected: timestamp("month_affected", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("supplier_notice_risks_org_id_idx").on(t.orgId),
    index("supplier_notice_risks_lien_project_id_idx").on(t.lienProjectId),
  ],
);

// ---------------------------------------------------------------------------
// 2.5 Collections Models
// ---------------------------------------------------------------------------

export const dunningSequencesTable = pgTable(
  "dunning_sequences",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dunning_sequences_org_id_idx").on(t.orgId)],
);

export const dunningStepsTable = pgTable(
  "dunning_steps",
  {
    id: id(),
    orgId: orgId(),
    sequenceId: text("sequence_id").notNull(),
    stepType: dunningStepTypeEnum("step_type").notNull(),
    daysOverdue: integer("days_overdue").notNull(),
    order: integer("order").notNull(),
    templateRef: text("template_ref"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dunning_steps_org_id_idx").on(t.orgId),
    index("dunning_steps_sequence_id_idx").on(t.sequenceId),
  ],
);

export const collectionAccountsTable = pgTable(
  "collection_accounts",
  {
    id: id(),
    orgId: orgId(),
    linkedClientId: text("linked_client_id").notNull().unique(),
    status: collectionStatusEnum("status").notNull().default("current"),
    escalationStage: escalationStageEnum("escalation_stage").notNull().default("none"),
    totalOverdue: numeric("total_overdue", { precision: 12, scale: 2 }).notNull().default("0"),
    oldestOverdueDays: integer("oldest_overdue_days").notNull().default(0),
    riskScore: integer("risk_score"),
    dunningSequenceId: text("dunning_sequence_id"),
    currentDunningStepId: text("current_dunning_step_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("collection_accounts_org_id_idx").on(t.orgId)],
);

// Per-organization risk-scoring configuration. The actual band/threshold/point
// structure is validated + typed in the api-server shared calculator
// (lib/riskScore.ts); stored here as jsonb so the model can evolve without a
// migration. When no row exists for an org, the calculator falls back to the
// hardcoded defaults, preserving original behavior.
export const riskScoreConfigsTable = pgTable(
  "risk_score_configs",
  {
    id: id(),
    orgId: orgId(),
    config: jsonb("config").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("risk_score_configs_org_id_idx").on(t.orgId)],
);

export const collectionActivitiesTable = pgTable(
  "collection_activities",
  {
    id: id(),
    orgId: orgId(),
    accountId: text("account_id").notNull(),
    method: collectionActivityMethodEnum("method").notNull(),
    activityDate: timestamp("activity_date", { withTimezone: true }).notNull(),
    notes: text("notes"),
    hubspotActivityId: text("hubspot_activity_id"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("collection_activities_org_id_idx").on(t.orgId),
    index("collection_activities_account_id_idx").on(t.accountId),
  ],
);

export const promisesToPayTable = pgTable(
  "promises_to_pay",
  {
    id: id(),
    orgId: orgId(),
    accountId: text("account_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    promisedDate: timestamp("promised_date", { withTimezone: true }).notNull(),
    status: promiseStatusEnum("status").notNull().default("open"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("promises_to_pay_org_id_idx").on(t.orgId),
    index("promises_to_pay_account_id_idx").on(t.accountId),
  ],
);

export const paymentPlansTable = pgTable(
  "payment_plans",
  {
    id: id(),
    orgId: orgId(),
    accountId: text("account_id").notNull(),
    status: paymentPlanStatusEnum("status").notNull().default("active"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payment_plans_org_id_idx").on(t.orgId),
    index("payment_plans_account_id_idx").on(t.accountId),
  ],
);

export const paymentPlanInstallmentsTable = pgTable(
  "payment_plan_installments",
  {
    id: id(),
    orgId: orgId(),
    planId: text("plan_id").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paid: boolean("paid").notNull().default(false),
    paidDate: timestamp("paid_date", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payment_plan_installments_org_id_idx").on(t.orgId),
    index("payment_plan_installments_plan_id_idx").on(t.planId),
  ],
);

// ---------------------------------------------------------------------------
// 2.5b Document Templates (client-facing document customization)
// ---------------------------------------------------------------------------

// Admin-customizable branding/intro/closing/signature/footer regions for each
// client-facing document type (statutory notices, lien waivers, lien affidavit).
// Statutory body text is NOT stored here — it is locked in code. A null region
// column means "use the hard-coded default" so that an org with no saved template
// renders exactly as before (no regression).
export const documentTemplatesTable = pgTable(
  "document_templates",
  {
    id: id(),
    orgId: orgId(),
    documentType: text("document_type").notNull(),
    branding: text("branding"),
    intro: text("intro"),
    closing: text("closing"),
    signature: text("signature"),
    footer: text("footer"),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("document_templates_org_id_idx").on(t.orgId),
    uniqueIndex("document_templates_org_type_uq").on(t.orgId, t.documentType),
  ],
);

// ---------------------------------------------------------------------------
// 2.6 Cross-Cutting Models
// ---------------------------------------------------------------------------

export const holdsTable = pgTable(
  "holds",
  {
    id: id(),
    orgId: orgId(),
    holdType: holdTypeEnum("hold_type").notNull(),
    lienProjectId: text("lien_project_id"),
    linkedClientId: text("linked_client_id"),
    // The specific vendor bill (supplier invoice) this hold withholds payment on.
    // Null = legacy/manual project- or client-wide hold. Bill-based holds set this
    // so the connection is on the vendor bill reference (qboSupplierInvoiceId).
    supplierInvoiceId: text("supplier_invoice_id"),
    reason: text("reason").notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("holds_org_id_idx").on(t.orgId),
    index("holds_supplier_invoice_id_idx").on(t.supplierInvoiceId),
  ],
);

// Append-only audit trail of statutory & financial actions (D3). Every
// legally-significant mutation (notice approve/send, waiver approvals, filing
// export/record/release, invoice clear, deadline override, ...) records who did
// what, when, with before/after snapshots. `details` is a flexible bag so
// additional fields counsel may require (IP, request id, document content hash)
// can be added without a schema change; promote them to columns later if needed.
// There are no update/delete routes — entries are immutable.
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: id(),
    orgId: orgId(),
    actorUserId: text("actor_user_id"), // null = system/automated action
    actorRole: text("actor_role"),
    action: text("action").notNull(), // e.g. "notice.send", "filing.record"
    entityType: text("entity_type").notNull(), // e.g. "notice", "waiver", "filing"
    entityId: text("entity_id"),
    summary: text("summary").notNull(), // human-readable one-liner
    before: jsonb("before"), // salient fields before the change (null on create)
    after: jsonb("after"), // salient fields after the change
    details: jsonb("details"), // extensible context bag (legal must-haves TBD)
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_org_id_idx").on(t.orgId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);
