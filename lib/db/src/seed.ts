/**
 * Seed script for Lien & Collections (Phase 0).
 * Ported from the Prisma seed spec in lien_collections_SEED_DATA.md.
 * Run: pnpm --filter @workspace/db run seed
 */
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  organizationsTable,
  jurisdictionsTable,
  lienRuleSetsTable,
  lienRulesTable,
  departmentsTable,
  systemTypesTable,
  subSystemTypesTable,
  stageTriggerConfigsTable,
  linkedClientsTable,
  collectionAccountsTable,
  lienProjectsTable,
  invoiceLinksTable,
  timesheetLinksTable,
  projectPartyLinksTable,
  lienScheduleOfValuesTable,
  workMonthsTable,
  lienDeadlinesTable,
  noticesTable,
  noticeRecipientsTable,
  mailingRecordsTable,
  waiversTable,
  lienFilingsTable,
  lienReleasesTable,
  supplierNoticeRisksTable,
  dunningSequencesTable,
  dunningStepsTable,
  collectionActivitiesTable,
  promisesToPayTable,
  paymentPlansTable,
  paymentPlanInstallmentsTable,
  holdsTable,
  riskScoreConfigsTable,
} from "./schema";

const ORG = "org_beacon_test_001";

// Default collection risk-scoring bands, mirroring DEFAULT_RISK_CONFIG in the
// api-server shared calculator (artifacts/api-server/src/lib/riskScore.ts).
// Seeding this row preserves today's scoring while making it editable in
// Company Settings. The calculator falls back to these same defaults when the
// row is absent, so behavior is identical with or without the seed.
const DEFAULT_RISK_CONFIG = {
  age: [
    { threshold: 90, points: 40, inclusive: false },
    { threshold: 60, points: 33, inclusive: false },
    { threshold: 30, points: 22, inclusive: false },
    { threshold: 0, points: 10, inclusive: false },
  ],
  ratio: [
    { threshold: 0.75, points: 30, inclusive: true },
    { threshold: 0.5, points: 22, inclusive: true },
    { threshold: 0.25, points: 15, inclusive: true },
    { threshold: 0, points: 7, inclusive: false },
  ],
  brokenPromises: [
    { threshold: 3, points: 20, inclusive: true },
    { threshold: 2, points: 16, inclusive: true },
    { threshold: 1, points: 10, inclusive: true },
  ],
  exposure: [
    { threshold: 50000, points: 10, inclusive: true },
    { threshold: 25000, points: 8, inclusive: true },
    { threshold: 10000, points: 6, inclusive: true },
    { threshold: 2500, points: 3, inclusive: true },
  ],
};
const d = (s: string) => new Date(s);

async function main() {
  console.log("🌱 Seeding Lien & Collections database…");

  // ── Org ─────────────────────────────────────────────────────────────────
  await db
    .insert(organizationsTable)
    .values({ id: ORG, name: "Beacon Fire Protection (Test)" })
    .onConflictDoNothing();

  // ── Risk-scoring config (defaults) ───────────────────────────────────────
  await db
    .insert(riskScoreConfigsTable)
    .values({ orgId: ORG, config: DEFAULT_RISK_CONFIG })
    .onConflictDoNothing();

  // ── Jurisdiction + Rule Set (Texas) ─────────────────────────────────────
  await db
    .insert(jurisdictionsTable)
    .values({ id: "jur_tx", orgId: ORG, code: "US-TX", name: "Texas", active: true })
    .onConflictDoNothing();

  await db
    .insert(lienRuleSetsTable)
    .values({
      id: "rs_tx_2022",
      orgId: ORG,
      jurisdictionId: "jur_tx",
      version: "TX-2022.01",
      effectiveDate: d("2022-01-01"),
      statuteRef: "Tex. Prop. Code Ch. 53",
      // DD-04 gate ships LOCKED. Counsel must review the rule set
      // (docs/TEXAS_RULE_SET_LEGAL_REVIEW.md) and flip this to true via the admin
      // review endpoint before these rules are used in production. The gate is
      // enforced in production only, so dev/test/UAT are unaffected.
      legalReviewed: false,
    })
    .onConflictDoNothing();

  await db
    .insert(lienRulesTable)
    .values([
      {
        id: "rule_cs_notice",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "commercial_sub",
        workStream: "construction",
        ruleKind: "notice",
        anchor: "work_month",
        offsetMonths: 3,
        offsetDayOfMonth: 15,
        businessDayHandling: "next_business_day",
        statuteCitation: "§ 53.056(a-1)(1)",
        description: "Pre-lien notice, commercial sub",
      },
      {
        id: "rule_cs_filing",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "commercial_sub",
        workStream: "construction",
        ruleKind: "filing",
        anchor: "work_month",
        offsetMonths: 4,
        offsetDayOfMonth: 15,
        statuteCitation: "§ 53.052(b)",
        description: "Lien filing, commercial sub",
      },
      {
        id: "rule_rs_notice",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "residential_sub",
        workStream: "construction",
        ruleKind: "notice",
        anchor: "work_month",
        offsetMonths: 2,
        offsetDayOfMonth: 15,
        statuteCitation: "§ 53.056(a-1)(2)",
        description: "Pre-lien notice, residential sub",
      },
      {
        id: "rule_rs_filing",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "residential_sub",
        workStream: "construction",
        ruleKind: "filing",
        anchor: "work_month",
        offsetMonths: 3,
        offsetDayOfMonth: 15,
        statuteCitation: "§ 53.052(c)",
        description: "Lien filing, residential sub",
      },
      {
        id: "rule_retainage",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "commercial_sub",
        workStream: "construction",
        ruleKind: "retainage",
        anchor: "completion",
        offsetDays: 30,
        statuteCitation: "§ 53.057(a-1)",
        description: "Retainage notice",
      },
      {
        id: "rule_postfile",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "commercial_sub",
        workStream: "construction",
        ruleKind: "post_filing_notice",
        anchor: "filing_date",
        offsetDays: 5,
        offsetIsBusinessDays: true,
        statuteCitation: "§ 53.055(a)(b)",
        description: "Send filed affidavit copies to owner + GC",
      },
      {
        id: "rule_enforce",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "commercial_sub",
        workStream: "construction",
        ruleKind: "enforcement",
        anchor: "filing_date",
        offsetDays: 365,
        statuteCitation: "§ 53.158(a)",
        description: "Enforcement deadline",
      },
      {
        id: "rule_design_filing",
        orgId: ORG,
        ruleSetId: "rs_tx_2022",
        lienWorkflowType: "commercial_sub",
        workStream: "design",
        ruleKind: "filing",
        anchor: "filing_date",
        offsetDays: 0,
        statuteCitation: "§ 53.124(e)",
        description: "Design lien inception",
      },
    ])
    .onConflictDoNothing();

  // ── Reference tree ───────────────────────────────────────────────────────
  await db
    .insert(departmentsTable)
    .values({ id: "dept_fp", orgId: ORG, name: "Fire Protection" })
    .onConflictDoNothing();

  await db
    .insert(systemTypesTable)
    .values([
      { id: "st_13r", orgId: ORG, name: "13R Multifamily", departmentId: "dept_fp" },
      { id: "st_13d", orgId: ORG, name: "13D Single Family", departmentId: "dept_fp" },
      { id: "st_comm", orgId: ORG, name: "Commercial Suppression", departmentId: "dept_fp" },
    ])
    .onConflictDoNothing();

  await db
    .insert(subSystemTypesTable)
    .values([
      { id: "sst_14u", orgId: ORG, name: "1–4 Units", systemTypeId: "st_13r", lienWorkflowType: "residential_sub" },
      { id: "sst_5plus", orgId: ORG, name: "5+ Units", systemTypeId: "st_13r", lienWorkflowType: "commercial_sub" },
      { id: "sst_owner_gc", orgId: ORG, name: "Owner-Contracted GC", systemTypeId: "st_13d", lienWorkflowType: "residential_sub" },
      { id: "sst_office", orgId: ORG, name: "Office / Retail", systemTypeId: "st_comm", lienWorkflowType: "commercial_sub" },
      { id: "sst_public", orgId: ORG, name: "Public Building", systemTypeId: "st_comm", lienWorkflowType: "public_bond" },
    ])
    .onConflictDoNothing();

  // ── Stage triggers ───────────────────────────────────────────────────────
  await db
    .insert(stageTriggerConfigsTable)
    .values([
      { id: "stg_lead", orgId: ORG, hubspotStageKey: "lead", label: "Lead", lienClockTrigger: "none" },
      { id: "stg_design", orgId: ORG, hubspotStageKey: "design", label: "Design Start", lienClockTrigger: "design_start" },
      { id: "stg_field", orgId: ORG, hubspotStageKey: "install", label: "Field Work Start", lienClockTrigger: "field_work_start" },
    ])
    .onConflictDoNothing();

  // ── Linked clients ───────────────────────────────────────────────────────
  await db
    .insert(linkedClientsTable)
    .values([
      {
        id: "cli_good",
        orgId: ORG,
        hubspotCompanyId: "hs_co_100",
        qboCustomerId: "qbo_cust_100",
        cachedName: "Summit Builders LLC",
        cachedEmail: "ap@summit.test",
        paymentTermsDays: 30,
        requiresNotarizedWaivers: true,
        matchState: "matched",
        lastSyncedAt: d("2026-06-01"),
      },
      {
        id: "cli_late",
        orgId: ORG,
        hubspotCompanyId: "hs_co_200",
        qboCustomerId: "qbo_cust_200",
        cachedName: "Delinquent Dev Co",
        cachedEmail: "billing@deldev.test",
        paymentTermsDays: 30,
        requiresNotarizedWaivers: false,
        matchState: "matched",
        lastSyncedAt: d("2026-06-01"),
      },
      {
        id: "cli_unmatched",
        orgId: ORG,
        hubspotCompanyId: "hs_co_300",
        cachedName: "Unmatched QBO Customer",
        matchState: "unmatched",
      },
    ])
    .onConflictDoNothing();

  // ── Collection accounts ──────────────────────────────────────────────────
  await db
    .insert(collectionAccountsTable)
    .values([
      {
        id: "acct_good",
        orgId: ORG,
        linkedClientId: "cli_good",
        status: "current",
        escalationStage: "none",
        totalOverdue: "0",
        oldestOverdueDays: 0,
        riskScore: 12,
      },
      {
        id: "acct_late",
        orgId: ORG,
        linkedClientId: "cli_late",
        status: "in_collections",
        escalationStage: "pre_lien_notice",
        totalOverdue: "48250.00",
        oldestOverdueDays: 74,
        riskScore: 88,
      },
    ])
    .onConflictDoNothing();

  // ── Projects ─────────────────────────────────────────────────────────────
  await db
    .insert(lienProjectsTable)
    .values([
      {
        id: "proj_comm",
        orgId: ORG,
        hubspotProjectId: "hs_proj_900",
        jurisdictionId: "jur_tx",
        subSystemTypeId: "sst_office",
        lienWorkflowType: "commercial_sub",
        contractorTier: "first_tier",
        legalPropertyAddress: "100 Main St, Austin, TX",
        county: "Travis",
        contractStartDate: d("2026-01-15"),
        completionDate: d("2026-04-15"),
        cachedProjectName: "Travis Office Retrofit",
        cachedHubspotStatus: "install",
        completionChecklistComplete: true,
      },
      {
        id: "proj_2nd",
        orgId: ORG,
        hubspotProjectId: "hs_proj_901",
        jurisdictionId: "jur_tx",
        subSystemTypeId: "sst_5plus",
        lienWorkflowType: "commercial_sub",
        contractorTier: "second_tier",
        legalPropertyAddress: "55 Oak Ave, Dallas, TX",
        county: "Dallas",
        contractStartDate: d("2026-02-01"),
        completionDate: d("2026-05-20"),
        cachedProjectName: "Oak Ave Apartments",
        cachedHubspotStatus: "install",
        completionChecklistComplete: false,
      },
      {
        id: "proj_res",
        orgId: ORG,
        hubspotProjectId: "hs_proj_902",
        jurisdictionId: "jur_tx",
        subSystemTypeId: "sst_owner_gc",
        lienWorkflowType: "residential_sub",
        contractorTier: "first_tier",
        legalPropertyAddress: "7 Cedar Ct, Houston, TX",
        county: "Harris",
        contractStartDate: d("2026-03-01"),
        completionDate: d("2026-06-01"),
        cachedProjectName: "Cedar Custom Home",
        cachedHubspotStatus: "install",
        completionChecklistComplete: true,
      },
    ])
    .onConflictDoUpdate({
      target: [lienProjectsTable.id],
      set: { completionDate: sql`excluded.completion_date` },
    });

  // ── Parties ───────────────────────────────────────────────────────────────
  await db
    .insert(projectPartyLinksTable)
    .values([
      { id: "pp_comm_owner", orgId: ORG, lienProjectId: "proj_comm", partyRelationType: "owner", hubspotCompanyId: "hs_co_owner1", cachedLegalName: "Travis Property Holdings LP", cachedMailingAddress: "PO Box 1, Austin TX" },
      { id: "pp_comm_gc", orgId: ORG, lienProjectId: "proj_comm", partyRelationType: "original_contractor", hubspotCompanyId: "hs_co_gc1", cachedLegalName: "Apex General Contractors", cachedMailingAddress: "200 Build Rd, Austin TX" },
      { id: "pp_2nd_owner", orgId: ORG, lienProjectId: "proj_2nd", partyRelationType: "owner", hubspotCompanyId: "hs_co_owner2", cachedLegalName: "Oak Ave Investors LLC", cachedMailingAddress: "1 Invest Way, Dallas TX" },
      { id: "pp_2nd_gc", orgId: ORG, lienProjectId: "proj_2nd", partyRelationType: "original_contractor", hubspotCompanyId: "hs_co_gc2", cachedLegalName: "TopChain GC Inc", cachedMailingAddress: "9 Prime St, Dallas TX" },
      { id: "pp_2nd_hire", orgId: ORG, lienProjectId: "proj_2nd", partyRelationType: "hiring_party", hubspotCompanyId: "hs_co_sub2", cachedLegalName: "MidSub Mechanical", cachedMailingAddress: "4 Mid Rd, Dallas TX" },
    ])
    .onConflictDoNothing();

  // ── Streams ──────────────────────────────────────────────────────────────
  await db
    .insert(lienScheduleOfValuesTable)
    .values([
      { id: "str_comm_con", orgId: ORG, lienProjectId: "proj_comm", workStream: "construction", status: "at_risk", openedAt: d("2026-02-01") },
      { id: "str_comm_des", orgId: ORG, lienProjectId: "proj_comm", workStream: "design", status: "open", openedAt: d("2026-01-20") },
      { id: "str_2nd_con", orgId: ORG, lienProjectId: "proj_2nd", workStream: "construction", status: "filed", openedAt: d("2026-02-15") },
      { id: "str_res_con", orgId: ORG, lienProjectId: "proj_res", workStream: "construction", status: "notice_active", openedAt: d("2026-03-10") },
    ])
    .onConflictDoNothing();

  // ── Invoices ──────────────────────────────────────────────────────────────
  await db
    .insert(invoiceLinksTable)
    .values([
      {
        id: "inv_overdue",
        orgId: ORG,
        lienProjectId: "proj_comm",
        linkedClientId: "cli_late",
        qboInvoiceId: "qbo_inv_1",
        amount: "48250.00",
        invoiceDate: d("2026-03-05"),
        dueDate: d("2026-04-04"),
        qboStatus: "open",
        clearedFlag: false,
        lastSyncedAt: d("2026-06-01"),
      },
      {
        id: "inv_cleared",
        orgId: ORG,
        lienProjectId: "proj_res",
        linkedClientId: "cli_good",
        qboInvoiceId: "qbo_inv_2",
        amount: "12000.00",
        invoiceDate: d("2026-03-01"),
        dueDate: d("2026-03-31"),
        qboStatus: "paid",
        clearedFlag: true,
        clearedAt: d("2026-04-02"),
        clearedByUserId: "user_coord",
        lastSyncedAt: d("2026-06-01"),
      },
      {
        id: "inv_supplier",
        orgId: ORG,
        lienProjectId: "proj_comm",
        isSupplierInvoice: true,
        qboSupplierInvoiceId: "qbo_sup_1",
        amount: "9000.00",
        invoiceDate: d("2026-03-02"),
        dueDate: d("2026-04-01"),
        qboStatus: "open",
        lastSyncedAt: d("2026-06-01"),
      },
    ])
    .onConflictDoNothing();

  // ── Timesheets ────────────────────────────────────────────────────────────
  await db
    .insert(timesheetLinksTable)
    .values([
      { id: "ts_1", orgId: ORG, lienProjectId: "proj_comm", connecteamUserId: "ct_u1", connecteamTimeRecordId: "ct_tr_1", stageTag: "install", workStream: "construction", hours: "38.5", workDate: d("2026-03-12") },
      { id: "ts_2", orgId: ORG, lienProjectId: "proj_comm", connecteamUserId: "ct_u2", connecteamTimeRecordId: "ct_tr_2", stageTag: "design", workStream: "design", hours: "10.0", workDate: d("2026-01-22") },
    ])
    .onConflictDoNothing();

  // ── Work months + deadlines ───────────────────────────────────────────────
  await db
    .insert(workMonthsTable)
    .values({
      id: "wm_mar",
      orgId: ORG,
      lienScheduleOfValuesId: "str_comm_con",
      month: d("2026-03-01"),
      derivedOverdue: true,
      clearedFlag: false,
      invoiceLinkId: "inv_overdue",
    })
    .onConflictDoNothing();

  await db
    .insert(lienDeadlinesTable)
    .values([
      {
        id: "dl_notice",
        orgId: ORG,
        workMonthId: "wm_mar",
        ruleId: "rule_cs_notice",
        ruleKind: "notice",
        computedDate: d("2026-06-15"),
        adjustedDate: d("2026-06-15"),
        sourceData: { month: "2026-03", rule: "§ 53.056(a-1)(1)", invoice: "qbo_inv_1" },
      },
      {
        id: "dl_filing",
        orgId: ORG,
        workMonthId: "wm_mar",
        ruleId: "rule_cs_filing",
        ruleKind: "filing",
        computedDate: d("2026-07-15"),
        adjustedDate: d("2026-07-15"),
        sourceData: { month: "2026-03", rule: "§ 53.052(b)" },
      },
    ])
    .onConflictDoNothing();

  // ── Notices ───────────────────────────────────────────────────────────────
  await db
    .insert(noticesTable)
    .values([
      {
        id: "not_statutory",
        orgId: ORG,
        lienScheduleOfValuesId: "str_comm_con",
        workMonthId: "wm_mar",
        noticeType: "statutory_claim",
        status: "sent",
        claimAmount: "48250.00",
        monthListed: d("2026-03-01"),
        sentAt: d("2026-05-10"),
        generatedDocUrl: "s3://notices/not_statutory.pdf",
      },
      {
        id: "not_early",
        orgId: ORG,
        lienScheduleOfValuesId: "str_comm_con",
        workMonthId: "wm_mar",
        noticeType: "early_warning",
        status: "draft",
        claimAmount: "48250.00",
        monthListed: d("2026-03-01"),
      },
      {
        id: "not_retainage",
        orgId: ORG,
        lienScheduleOfValuesId: "str_comm_con",
        noticeType: "retainage_claim",
        status: "approved",
        claimAmount: "5000.00",
        monthListed: d("2026-03-01"),
        approvedByUserId: "user_coord",
        approvedAt: d("2026-06-01"),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(noticeRecipientsTable)
    .values([
      { id: "nr_owner", orgId: ORG, noticeId: "not_statutory", recipientType: "owner", legalName: "Travis Property Holdings LP", mailingAddress: "PO Box 1, Austin TX" },
      { id: "nr_gc", orgId: ORG, noticeId: "not_statutory", recipientType: "original_contractor", legalName: "Apex General Contractors", mailingAddress: "200 Build Rd, Austin TX" },
    ])
    .onConflictDoNothing();

  await db
    .insert(mailingRecordsTable)
    .values({
      id: "mail_1",
      orgId: ORG,
      noticeId: "not_statutory",
      provider: "shippo",
      trackingNumber: "9400100000000000000001",
      sentDate: d("2026-05-10"),
      labelUrl: "s3://labels/mail_1.pdf",
    })
    .onConflictDoNothing();

  // ── Waivers ───────────────────────────────────────────────────────────────
  await db
    .insert(waiversTable)
    .values([
      { id: "wv_cond_prog", orgId: ORG, lienProjectId: "proj_comm", workStream: "construction", waiverType: "conditional_progress", paymentAmount: "12000", approvalStatus: "not_required", notarized: true, notaryLiveRef: "nl_1", signedDate: d("2026-04-05"), invoiceLinkId: "inv_cleared" },
      { id: "wv_uncond_prog", orgId: ORG, lienProjectId: "proj_comm", workStream: "construction", waiverType: "unconditional_progress", paymentAmount: "12000", approvalStatus: "pending_pm" },
      { id: "wv_cond_final", orgId: ORG, lienProjectId: "proj_res", workStream: "construction", waiverType: "conditional_final", paymentAmount: "12000", approvalStatus: "not_required" },
      { id: "wv_uncond_final", orgId: ORG, lienProjectId: "proj_res", workStream: "construction", waiverType: "unconditional_final", paymentAmount: "12000", approvalStatus: "pending_pm_finance" },
    ])
    .onConflictDoNothing();

  // ── Filing + Release ──────────────────────────────────────────────────────
  await db
    .insert(lienFilingsTable)
    .values({
      id: "fil_1",
      orgId: ORG,
      lienScheduleOfValuesId: "str_2nd_con",
      status: "filed",
      county: "Dallas",
      filingDate: d("2026-05-20"),
      recordingRef: "2026-DAL-00123",
      filingFee: "95.00",
      postFilingNoticeDeadline: d("2026-05-27"),
      enforcementDeadline: d("2027-05-20"),
      affidavitDocUrl: "s3://affidavits/fil_1.pdf",
    })
    .onConflictDoNothing();

  await db
    .insert(lienReleasesTable)
    .values({
      id: "rel_1",
      orgId: ORG,
      filingId: "fil_1",
      status: "signed",
      signedDate: d("2026-06-01"),
      filingConfirmation: "2026-DAL-00188",
    })
    .onConflictDoNothing();

  // ── Supplier notice risk ──────────────────────────────────────────────────
  await db
    .insert(supplierNoticeRisksTable)
    .values({
      id: "snr_1",
      orgId: ORG,
      lienProjectId: "proj_comm",
      invoiceLinkId: "inv_supplier",
      status: "flagged",
      supplierDeadline: d("2026-06-15"),
      beaconDeadline: d("2026-06-15"),
      monthAffected: d("2026-03-01"),
    })
    .onConflictDoNothing();

  // ── Dunning ───────────────────────────────────────────────────────────────
  await db
    .insert(dunningSequencesTable)
    .values({ id: "seq_default", orgId: ORG, name: "Standard", active: true })
    .onConflictDoNothing();

  await db
    .insert(dunningStepsTable)
    .values([
      { id: "step_rem", orgId: ORG, sequenceId: "seq_default", stepType: "reminder", daysOverdue: 7, order: 1 },
      { id: "step_stmt", orgId: ORG, sequenceId: "seq_default", stepType: "statement", daysOverdue: 21, order: 2 },
      { id: "step_call", orgId: ORG, sequenceId: "seq_default", stepType: "call", daysOverdue: 35, order: 3 },
      { id: "step_final", orgId: ORG, sequenceId: "seq_default", stepType: "final_demand", daysOverdue: 50, order: 4 },
    ])
    .onConflictDoNothing();

  // ── Collection activities, promises, plan ────────────────────────────────
  await db
    .insert(collectionActivitiesTable)
    .values({
      id: "act_1",
      orgId: ORG,
      accountId: "acct_late",
      method: "phone",
      activityDate: d("2026-05-15"),
      notes: "Spoke to AP; promised payment",
      hubspotActivityId: "hs_act_1",
      createdByUserId: "user_coord",
    })
    .onConflictDoNothing();

  await db
    .insert(promisesToPayTable)
    .values([
      { id: "prom_open", orgId: ORG, accountId: "acct_late", amount: "25000", promisedDate: d("2026-06-20"), status: "open" },
      { id: "prom_kept", orgId: ORG, accountId: "acct_late", amount: "10000", promisedDate: d("2026-05-01"), status: "kept" },
      { id: "prom_broken", orgId: ORG, accountId: "acct_late", amount: "13250", promisedDate: d("2026-05-10"), status: "broken" },
    ])
    .onConflictDoNothing();

  await db
    .insert(paymentPlansTable)
    .values({ id: "plan_1", orgId: ORG, accountId: "acct_late", status: "active", totalAmount: "30000" })
    .onConflictDoNothing();

  await db
    .insert(paymentPlanInstallmentsTable)
    .values([
      { id: "inst_1", orgId: ORG, planId: "plan_1", dueDate: d("2026-06-15"), amount: "10000", paid: true, paidDate: d("2026-06-14") },
      { id: "inst_2", orgId: ORG, planId: "plan_1", dueDate: d("2026-07-15"), amount: "10000", paid: false },
      { id: "inst_3", orgId: ORG, planId: "plan_1", dueDate: d("2026-08-15"), amount: "10000", paid: false },
    ])
    .onConflictDoNothing();

  // ── Holds ─────────────────────────────────────────────────────────────────
  await db
    .insert(holdsTable)
    .values([
      { id: "hold_sched", orgId: ORG, holdType: "schedule_hold", lienProjectId: "proj_comm", reason: "Invoice qbo_inv_1 past due", setAt: d("2026-04-05") },
      { id: "hold_mat", orgId: ORG, holdType: "material_hold", linkedClientId: "cli_late", reason: "Client overdue past threshold", setAt: d("2026-04-10") },
      { id: "hold_cleared", orgId: ORG, holdType: "schedule_hold", lienProjectId: "proj_res", reason: "Resolved", setAt: d("2026-03-15"), clearedAt: d("2026-04-02") },
    ])
    .onConflictDoNothing();

  console.log("✅ Seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
