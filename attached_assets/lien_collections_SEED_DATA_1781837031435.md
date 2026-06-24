# Lien & Collections — Seed Data

**Module ID:** `lien_collections`
**Module #:** 22
**Version:** 1.0
**Date:** 2026-06-18
**Status:** Build spec — companion to `lien_collections_DATA_MODEL.md`

> Ready-to-paste seed for the standalone app's `prisma/seed.ts`. Exercises every UI view and includes **at least one record per enum state** plus edge cases. All records scoped to test org `org_beacon_test_001`.
>
> **Boundary:** No schema or endpoint specs here — see `DATA_MODEL.md`. Model and enum names match it exactly.

---

## 1. Conventions

- Test org: `const ORG = "org_beacon_test_001";`
- IDs are explicit string constants so related records cross-reference cleanly.
- Dates are anchored to a fixed "now" so deadline math is reproducible: `const NOW = new Date("2026-06-01T00:00:00Z");`
- Run order respects FKs: Org → Jurisdiction/RuleSet/Rules → Reference tree → StageTriggers → LinkedClients → CollectionAccounts → LienProjects → Parties → Streams → WorkMonths → Deadlines → Invoices/Timesheets → Notices → Waivers → Filing/Release → SupplierRisk → Dunning → Promises/Plans → Holds.

---

## 2. Seed Script

```ts
// prisma/seed.ts  (standalone app)
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const ORG = "org_beacon_test_001";
const NOW = new Date("2026-06-01T00:00:00Z");
const d = (s: string) => new Date(s);

async function main() {
  // ---- Org (platform root; upsert minimal) ----
  await prisma.organization.upsert({
    where: { id: ORG }, update: {},
    create: { id: ORG, name: "Beacon Fire Protection (Test)" },
  });

  // ---- Jurisdiction + Rule Set (Texas) ----
  const tx = await prisma.jurisdiction.create({
    data: { id: "jur_tx", orgId: ORG, code: "US-TX", name: "Texas", active: true },
  });
  const rs = await prisma.lienRuleSet.create({
    data: {
      id: "rs_tx_2022", orgId: ORG, jurisdictionId: tx.id,
      version: "TX-2022.01", effectiveDate: d("2022-01-01"),
      statuteRef: "Tex. Prop. Code Ch. 53", legalReviewed: true,
    },
  });

  // LienRule covers every RuleKind across both workflow types/streams.
  await prisma.lienRule.createMany({ data: [
    // commercial_sub — notice: 15th of 3rd month after work month
    { id: "rule_cs_notice", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "commercial_sub",
      workStream: "construction", ruleKind: "notice", anchor: "work_month", offsetMonths: 3,
      offsetDayOfMonth: 15, businessDayHandling: "next_business_day",
      statuteCitation: "§ 53.056(a-1)(1)", description: "Pre-lien notice, commercial sub" },
    // commercial_sub — filing: 15th of 4th month or 30 days after completion
    { id: "rule_cs_filing", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "commercial_sub",
      workStream: "construction", ruleKind: "filing", anchor: "work_month", offsetMonths: 4,
      offsetDayOfMonth: 15, statuteCitation: "§ 53.052(b)", description: "Lien filing, commercial sub" },
    // residential_sub — notice: 15th of 2nd month
    { id: "rule_rs_notice", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "residential_sub",
      workStream: "construction", ruleKind: "notice", anchor: "work_month", offsetMonths: 2,
      offsetDayOfMonth: 15, statuteCitation: "§ 53.056(a-1)(2)", description: "Pre-lien notice, residential sub" },
    // residential_sub — filing: 15th of 3rd month
    { id: "rule_rs_filing", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "residential_sub",
      workStream: "construction", ruleKind: "filing", anchor: "work_month", offsetMonths: 3,
      offsetDayOfMonth: 15, statuteCitation: "§ 53.052(c)", description: "Lien filing, residential sub" },
    // retainage: 30 days from completion
    { id: "rule_retainage", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "commercial_sub",
      workStream: "construction", ruleKind: "retainage", anchor: "completion", offsetDays: 30,
      statuteCitation: "§ 53.057(a-1)", description: "Retainage notice" },
    // post-filing notice: 5 business days
    { id: "rule_postfile", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "commercial_sub",
      workStream: "construction", ruleKind: "post_filing_notice", anchor: "filing_date",
      offsetDays: 5, offsetIsBusinessDays: true, statuteCitation: "§ 53.055(a)(b)",
      description: "Send filed affidavit copies to owner + GC" },
    // enforcement: 1 year from last filing date
    { id: "rule_enforce", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "commercial_sub",
      workStream: "construction", ruleKind: "enforcement", anchor: "filing_date", offsetDays: 365,
      statuteCitation: "§ 53.158(a)", description: "Enforcement deadline" },
    // design stream — inception at affidavit recording (lower priority)
    { id: "rule_design_filing", orgId: ORG, ruleSetId: rs.id, lienWorkflowType: "commercial_sub",
      workStream: "design", ruleKind: "filing", anchor: "filing_date", offsetDays: 0,
      statuteCitation: "§ 53.124(e)", description: "Design lien inception" },
  ]});

  // ---- Reference tree (covers all LienWorkflowType values) ----
  const dept = await prisma.department.create({ data: { id: "dept_fp", orgId: ORG, name: "Fire Protection" } });
  const st13r = await prisma.systemType.create({ data: { id: "st_13r", orgId: ORG, name: "13R Multifamily", departmentId: dept.id } });
  const st13d = await prisma.systemType.create({ data: { id: "st_13d", orgId: ORG, name: "13D Single Family", departmentId: dept.id } });
  const stComm = await prisma.systemType.create({ data: { id: "st_comm", orgId: ORG, name: "Commercial Suppression", departmentId: dept.id } });
  await prisma.subSystemType.createMany({ data: [
    { id: "sst_14u", orgId: ORG, name: "1–4 Units", systemTypeId: st13r.id, lienWorkflowType: "residential_sub" },
    { id: "sst_5plus", orgId: ORG, name: "5+ Units", systemTypeId: st13r.id, lienWorkflowType: "commercial_sub" },
    { id: "sst_owner_gc", orgId: ORG, name: "Owner-Contracted GC", systemTypeId: st13d.id, lienWorkflowType: "residential_sub" },
    { id: "sst_office", orgId: ORG, name: "Office / Retail", systemTypeId: stComm.id, lienWorkflowType: "commercial_sub" },
    { id: "sst_public", orgId: ORG, name: "Public Building", systemTypeId: stComm.id, lienWorkflowType: "public_bond" },
  ]});

  // ---- Stage triggers (all LienClockTrigger values) ----
  await prisma.stageTriggerConfig.createMany({ data: [
    { id: "stg_lead", orgId: ORG, hubspotStageKey: "lead", label: "Lead", lienClockTrigger: "none" },
    { id: "stg_design", orgId: ORG, hubspotStageKey: "design", label: "Design Start", lienClockTrigger: "design_start" },
    { id: "stg_field", orgId: ORG, hubspotStageKey: "install", label: "Field Work Start", lienClockTrigger: "field_work_start" },
  ]});

  // ---- Linked clients (matched / unmatched / needs_review) ----
  const cliGood = await prisma.linkedClient.create({ data: {
    id: "cli_good", orgId: ORG, hubspotCompanyId: "hs_co_100", qboCustomerId: "qbo_cust_100",
    cachedName: "Summit Builders LLC", cachedEmail: "ap@summit.test", paymentTermsDays: 30,
    requiresNotarizedWaivers: true, matchState: "matched", lastSyncedAt: NOW } });
  const cliLate = await prisma.linkedClient.create({ data: {
    id: "cli_late", orgId: ORG, hubspotCompanyId: "hs_co_200", qboCustomerId: "qbo_cust_200",
    cachedName: "Delinquent Dev Co", cachedEmail: "billing@deldev.test", paymentTermsDays: 30,
    requiresNotarizedWaivers: false, matchState: "matched", lastSyncedAt: NOW } });
  await prisma.linkedClient.create({ data: {
    id: "cli_unmatched", orgId: ORG, hubspotCompanyId: "hs_co_300",
    cachedName: "Unmatched QBO Customer", matchState: "unmatched" } }); // edge case

  // ---- Collection accounts (one per CollectionStatus / EscalationStage) ----
  await prisma.collectionAccount.create({ data: {
    id: "acct_good", orgId: ORG, linkedClientId: cliGood.id, status: "current",
    escalationStage: "none", totalOverdue: 0, oldestOverdueDays: 0, riskScore: 12 } });
  const acctLate = await prisma.collectionAccount.create({ data: {
    id: "acct_late", orgId: ORG, linkedClientId: cliLate.id, status: "in_collections",
    escalationStage: "pre_lien_notice", totalOverdue: 48250.00, oldestOverdueDays: 74, riskScore: 88 } });

  // ---- Projects (1st tier commercial / 2nd tier commercial / residential) ----
  const projComm = await prisma.lienProject.create({ data: {
    id: "proj_comm", orgId: ORG, hubspotProjectId: "hs_proj_900", jurisdictionId: tx.id,
    subSystemTypeId: "sst_office", lienWorkflowType: "commercial_sub", contractorTier: "first_tier",
    legalPropertyAddress: "100 Main St, Austin, TX", county: "Travis", contractStartDate: d("2026-01-15"),
    cachedProjectName: "Travis Office Retrofit", cachedHubspotStatus: "install",
    completionChecklistComplete: true } });
  const proj2nd = await prisma.lienProject.create({ data: {
    id: "proj_2nd", orgId: ORG, hubspotProjectId: "hs_proj_901", jurisdictionId: tx.id,
    subSystemTypeId: "sst_5plus", lienWorkflowType: "commercial_sub", contractorTier: "second_tier",
    legalPropertyAddress: "55 Oak Ave, Dallas, TX", county: "Dallas", contractStartDate: d("2026-02-01"),
    cachedProjectName: "Oak Ave Apartments", cachedHubspotStatus: "install",
    completionChecklistComplete: false } }); // edge: incomplete checklist
  const projRes = await prisma.lienProject.create({ data: {
    id: "proj_res", orgId: ORG, hubspotProjectId: "hs_proj_902", jurisdictionId: tx.id,
    subSystemTypeId: "sst_owner_gc", lienWorkflowType: "residential_sub", contractorTier: "first_tier",
    legalPropertyAddress: "7 Cedar Ct, Houston, TX", county: "Harris", contractStartDate: d("2026-03-01"),
    cachedProjectName: "Cedar Custom Home", cachedHubspotStatus: "install",
    completionChecklistComplete: true } });

  // ---- Parties (2nd tier captures BOTH hiring_party and original_contractor) ----
  await prisma.projectPartyLink.createMany({ data: [
    { id: "pp_comm_owner", orgId: ORG, lienProjectId: projComm.id, partyRelationType: "owner",
      hubspotCompanyId: "hs_co_owner1", cachedLegalName: "Travis Property Holdings LP", cachedMailingAddress: "PO Box 1, Austin TX" },
    { id: "pp_comm_gc", orgId: ORG, lienProjectId: projComm.id, partyRelationType: "original_contractor",
      hubspotCompanyId: "hs_co_gc1", cachedLegalName: "Apex General Contractors", cachedMailingAddress: "200 Build Rd, Austin TX" },
    { id: "pp_2nd_owner", orgId: ORG, lienProjectId: proj2nd.id, partyRelationType: "owner",
      hubspotCompanyId: "hs_co_owner2", cachedLegalName: "Oak Ave Investors LLC", cachedMailingAddress: "1 Invest Way, Dallas TX" },
    { id: "pp_2nd_gc", orgId: ORG, lienProjectId: proj2nd.id, partyRelationType: "original_contractor",
      hubspotCompanyId: "hs_co_gc2", cachedLegalName: "TopChain GC Inc", cachedMailingAddress: "9 Prime St, Dallas TX" },
    { id: "pp_2nd_hire", orgId: ORG, lienProjectId: proj2nd.id, partyRelationType: "hiring_party",
      hubspotCompanyId: "hs_co_sub2", cachedLegalName: "MidSub Mechanical", cachedMailingAddress: "4 Mid Rd, Dallas TX" },
  ]});

  // ---- Streams (construction + design; statuses across LienStreamStatus) ----
  const streamComm = await prisma.lienStream.create({ data: {
    id: "str_comm_con", orgId: ORG, lienProjectId: projComm.id, workStream: "construction",
    status: "at_risk", openedAt: d("2026-02-01") } });
  await prisma.lienStream.create({ data: {
    id: "str_comm_des", orgId: ORG, lienProjectId: projComm.id, workStream: "design",
    status: "open", openedAt: d("2026-01-20") } });
  const stream2nd = await prisma.lienStream.create({ data: {
    id: "str_2nd_con", orgId: ORG, lienProjectId: proj2nd.id, workStream: "construction",
    status: "filed", openedAt: d("2026-02-15") } });
  await prisma.lienStream.create({ data: {
    id: "str_res_con", orgId: ORG, lienProjectId: projRes.id, workStream: "construction",
    status: "notice_active", openedAt: d("2026-03-10") } });

  // ---- Invoices (overdue, cleared, supplier) ----
  const invOverdue = await prisma.invoiceLink.create({ data: {
    id: "inv_overdue", orgId: ORG, lienProjectId: projComm.id, linkedClientId: cliLate.id,
    qboInvoiceId: "qbo_inv_1", amount: 48250.00, invoiceDate: d("2026-03-05"), dueDate: d("2026-04-04"),
    qboStatus: "open", clearedFlag: false, lastSyncedAt: NOW } });
  await prisma.invoiceLink.create({ data: {
    id: "inv_cleared", orgId: ORG, lienProjectId: projRes.id, linkedClientId: cliGood.id,
    qboInvoiceId: "qbo_inv_2", amount: 12000.00, invoiceDate: d("2026-03-01"), dueDate: d("2026-03-31"),
    qboStatus: "paid", clearedFlag: true, clearedAt: d("2026-04-02"), clearedByUserId: "user_coord", lastSyncedAt: NOW } });
  await prisma.invoiceLink.create({ data: {
    id: "inv_supplier", orgId: ORG, lienProjectId: projComm.id, isSupplierInvoice: true,
    qboSupplierInvoiceId: "qbo_sup_1", amount: 9000.00, invoiceDate: d("2026-03-02"), dueDate: d("2026-04-01"),
    qboStatus: "open", lastSyncedAt: NOW } });

  // ---- Timesheets (construction + design via Connecteam) ----
  await prisma.timesheetLink.createMany({ data: [
    { id: "ts_1", orgId: ORG, lienProjectId: projComm.id, connecteamUserId: "ct_u1", connecteamTimeRecordId: "ct_tr_1",
      stageTag: "install", workStream: "construction", hours: 38.5, workDate: d("2026-03-12") },
    { id: "ts_2", orgId: ORG, lienProjectId: projComm.id, connecteamUserId: "ct_u2", connecteamTimeRecordId: "ct_tr_2",
      stageTag: "design", workStream: "design", hours: 10.0, workDate: d("2026-01-22") },
  ]});

  // ---- Work months (overdue / cleared / at-risk) + deadlines ----
  const wmOverdue = await prisma.workMonth.create({ data: {
    id: "wm_mar", orgId: ORG, lienScheduleOfValuesId: streamComm.id, month: d("2026-03-01"),
    derivedOverdue: true, clearedFlag: false, invoiceLinkId: invOverdue.id } });
  await prisma.lienDeadline.createMany({ data: [
    { id: "dl_notice", orgId: ORG, workMonthId: wmOverdue.id, ruleId: "rule_cs_notice", ruleKind: "notice",
      computedDate: d("2026-06-15"), adjustedDate: d("2026-06-15"),
      sourceData: { month: "2026-03", rule: "§ 53.056(a-1)(1)", invoice: "qbo_inv_1" } },
    { id: "dl_filing", orgId: ORG, workMonthId: wmOverdue.id, ruleId: "rule_cs_filing", ruleKind: "filing",
      computedDate: d("2026-07-15"), adjustedDate: d("2026-07-15"),
      sourceData: { month: "2026-03", rule: "§ 53.052(b)" } },
  ]});

  // ---- Notices (one per NoticeType + NoticeStatus) ----
  const noticeSent = await prisma.notice.create({ data: {
    id: "not_statutory", orgId: ORG, lienScheduleOfValuesId: streamComm.id, workMonthId: wmOverdue.id,
    noticeType: "statutory_claim", status: "sent", claimAmount: 48250.00, monthListed: d("2026-03-01"),
    sentAt: d("2026-05-10"), generatedDocUrl: "s3://notices/not_statutory.pdf" } });
  await prisma.notice.create({ data: {
    id: "not_early", orgId: ORG, lienScheduleOfValuesId: streamComm.id, workMonthId: wmOverdue.id,
    noticeType: "early_warning", status: "draft", claimAmount: 48250.00, monthListed: d("2026-03-01") } });
  await prisma.notice.create({ data: {
    id: "not_retainage", orgId: ORG, lienScheduleOfValuesId: streamComm.id, noticeType: "retainage_claim",
    status: "approved", claimAmount: 5000.00, monthListed: d("2026-03-01"), approvedByUserId: "user_coord", approvedAt: NOW } });
  await prisma.noticeRecipient.createMany({ data: [
    { id: "nr_owner", orgId: ORG, noticeId: noticeSent.id, recipientType: "owner",
      legalName: "Travis Property Holdings LP", mailingAddress: "PO Box 1, Austin TX" },
    { id: "nr_gc", orgId: ORG, noticeId: noticeSent.id, recipientType: "original_contractor",
      legalName: "Apex General Contractors", mailingAddress: "200 Build Rd, Austin TX" },
  ]});
  await prisma.mailingRecord.create({ data: {
    id: "mail_1", orgId: ORG, noticeId: noticeSent.id, provider: "shippo",
    trackingNumber: "9400100000000000000001", sentDate: d("2026-05-10"), labelUrl: "s3://labels/mail_1.pdf" } });

  // ---- Waivers (one per WaiverType + approval states) ----
  await prisma.waiver.create({ data: {
    id: "wv_cond_prog", orgId: ORG, lienProjectId: projComm.id, workStream: "construction",
    waiverType: "conditional_progress", paymentAmount: 12000, approvalStatus: "not_required",
    notarized: true, notaryLiveRef: "nl_1", signedDate: d("2026-04-05"), invoiceLinkId: "inv_cleared" } });
  await prisma.waiver.create({ data: {
    id: "wv_uncond_prog", orgId: ORG, lienProjectId: projComm.id, workStream: "construction",
    waiverType: "unconditional_progress", paymentAmount: 12000, approvalStatus: "pending_pm" } }); // gate
  await prisma.waiver.create({ data: {
    id: "wv_cond_final", orgId: ORG, lienProjectId: projRes.id, workStream: "construction",
    waiverType: "conditional_final", paymentAmount: 12000, approvalStatus: "not_required" } });
  await prisma.waiver.create({ data: {
    id: "wv_uncond_final", orgId: ORG, lienProjectId: projRes.id, workStream: "construction",
    waiverType: "unconditional_final", paymentAmount: 12000, approvalStatus: "pending_pm_finance" } }); // dual gate

  // ---- Filing + Release (on the 2nd-tier filed stream) ----
  const filing = await prisma.lienFiling.create({ data: {
    id: "fil_1", orgId: ORG, lienScheduleOfValuesId: stream2nd.id, status: "filed", county: "Dallas",
    filingDate: d("2026-05-20"), recordingRef: "2026-DAL-00123", filingFee: 95.00,
    postFilingNoticeDeadline: d("2026-05-27"), enforcementDeadline: d("2027-05-20"),
    affidavitDocUrl: "s3://affidavits/fil_1.pdf" } });
  await prisma.lienRelease.create({ data: {
    id: "rel_1", orgId: ORG, filingId: filing.id, status: "signed", signedDate: d("2026-06-01"),
    filingConfirmation: "2026-DAL-00188" } });

  // ---- Supplier notice risk (flagged) ----
  await prisma.supplierNoticeRisk.create({ data: {
    id: "snr_1", orgId: ORG, lienProjectId: projComm.id, invoiceLinkId: "inv_supplier",
    status: "flagged", supplierDeadline: d("2026-06-15"), beaconDeadline: d("2026-06-15"),
    monthAffected: d("2026-03-01") } });

  // ---- Dunning sequence + steps ----
  const seq = await prisma.dunningSequence.create({ data: { id: "seq_default", orgId: ORG, name: "Standard", active: true } });
  await prisma.dunningStep.createMany({ data: [
    { id: "step_rem", orgId: ORG, sequenceId: seq.id, stepType: "reminder", daysOverdue: 7, order: 1 },
    { id: "step_stmt", orgId: ORG, sequenceId: seq.id, stepType: "statement", daysOverdue: 21, order: 2 },
    { id: "step_call", orgId: ORG, sequenceId: seq.id, stepType: "call", daysOverdue: 35, order: 3 },
    { id: "step_final", orgId: ORG, sequenceId: seq.id, stepType: "final_demand", daysOverdue: 50, order: 4 },
  ]});

  // ---- Collection activities, promises (open/kept/broken), payment plan ----
  await prisma.collectionActivity.create({ data: {
    id: "act_1", orgId: ORG, accountId: acctLate.id, method: "phone", activityDate: d("2026-05-15"),
    notes: "Spoke to AP; promised payment", hubspotActivityId: "hs_act_1", createdByUserId: "user_coord" } });
  await prisma.promiseToPay.createMany({ data: [
    { id: "prom_open", orgId: ORG, accountId: acctLate.id, amount: 25000, promisedDate: d("2026-06-20"), status: "open" },
    { id: "prom_kept", orgId: ORG, accountId: acctLate.id, amount: 10000, promisedDate: d("2026-05-01"), status: "kept" },
    { id: "prom_broken", orgId: ORG, accountId: acctLate.id, amount: 13250, promisedDate: d("2026-05-10"), status: "broken" },
  ]});
  const plan = await prisma.paymentPlan.create({ data: {
    id: "plan_1", orgId: ORG, accountId: acctLate.id, status: "active", totalAmount: 30000 } });
  await prisma.paymentPlanInstallment.createMany({ data: [
    { id: "inst_1", orgId: ORG, planId: plan.id, dueDate: d("2026-06-15"), amount: 10000, paid: true, paidDate: d("2026-06-14") },
    { id: "inst_2", orgId: ORG, planId: plan.id, dueDate: d("2026-07-15"), amount: 10000, paid: false },
    { id: "inst_3", orgId: ORG, planId: plan.id, dueDate: d("2026-08-15"), amount: 10000, paid: false },
  ]});

  // ---- Holds (both HoldType; set + cleared) ----
  await prisma.hold.createMany({ data: [
    { id: "hold_sched", orgId: ORG, holdType: "schedule_hold", lienProjectId: projComm.id,
      reason: "Invoice qbo_inv_1 past due", setAt: d("2026-04-05") },
    { id: "hold_mat", orgId: ORG, holdType: "material_hold", linkedClientId: cliLate.id,
      reason: "Client overdue past threshold", setAt: d("2026-04-10") },
    { id: "hold_cleared", orgId: ORG, holdType: "schedule_hold", lienProjectId: projRes.id,
      reason: "Resolved", setAt: d("2026-03-15"), clearedAt: d("2026-04-02") }, // cleared edge case
  ]});
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

---

## 3. Enum-State Coverage Matrix

| Enum | States covered by seed |
|------|------------------------|
| LienWorkflowType | residential_sub, commercial_sub, public_bond (sst_public), none (add via config UI) |
| ContractorTier | first_tier (proj_comm), second_tier (proj_2nd) |
| LienClockTrigger | none, design_start, field_work_start (stage triggers) |
| WorkStream | construction, design (streams) |
| LienStreamStatus | open, at_risk, notice_active, filed (+ released via filing) |
| RuleKind | notice, filing, retainage, post_filing_notice, enforcement (+ design filing) |
| NoticeType | early_warning, statutory_claim, retainage_claim |
| NoticeStatus | draft, approved, sent (delivered via webhook) |
| WaiverType | all four |
| WaiverApprovalStatus | not_required, pending_pm, pending_pm_finance |
| FilingStatus | filed |
| ReleaseStatus | signed |
| PartyRelationType | owner, original_contractor, hiring_party |
| HoldType | schedule_hold, material_hold (+ cleared) |
| SupplierNoticeRiskStatus | flagged |
| CollectionStatus | current, in_collections |
| EscalationStage | none, pre_lien_notice |
| DunningStepType | reminder, statement, call, final_demand |
| PromiseStatus | open, kept, broken |
| PaymentPlanStatus | active |
| CollectionActivityMethod | phone |

> Remaining enum states (e.g. `lapsed` stream, `defaulted` plan, additional `CollectionStatus`/`EscalationStage` values, `cancelled` promise) are reachable through the UI; add one record each before UAT to fully exercise filters. Flagged for the seed-completion step.

---

## 4. Revision Log

| Date | Author | What Changed |
|------|--------|--------------|
| 2026-06-18 | Deb (with AI Support) | Initial seed. Texas rule set, reference tree across all workflow types, 1st/2nd-tier + residential projects, both streams, invoices/timesheets, deadlines with source-data trace, notices/waivers/filing/release, supplier risk, dunning, promises, payment plan, holds. Enum coverage matrix included. |
