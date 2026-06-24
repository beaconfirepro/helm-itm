/**
 * seed-uat.ts — UAT enrichment seed.
 *
 * Adds the remaining enum states and per-role users that the base seed
 * (lib/db/src/seed.ts), seed-phase5.ts, and seed-phase6.ts do not cover, so
 * every major workflow and user role in LiensEasy has end-to-end UAT coverage.
 *
 * Run AFTER the base seed + phase5 + phase6:
 *   pnpm dlx tsx src/scripts/seed-uat.ts
 *   (from artifacts/api-server directory)
 *
 * Idempotent: every insert uses an explicit id with onConflictDoNothing /
 * onConflictDoUpdate so it can be re-run safely.
 */

import { db } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  usersTable,
  lienProjectsTable,
  lienScheduleOfValuesTable,
  workMonthsTable,
  lienDeadlinesTable,
  noticesTable,
  mailingRecordsTable,
  waiversTable,
  linkedClientsTable,
  collectionAccountsTable,
  collectionActivitiesTable,
  promisesToPayTable,
  paymentPlansTable,
  paymentPlanInstallmentsTable,
  supplierNoticeRisksTable,
  invoiceLinksTable,
  lienFilingsTable,
  lienReleasesTable,
} from "@workspace/db";

const ORG = "org_beacon_test_001";
const d = (s: string) => new Date(s);

async function step(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    console.log(`  ✗ ${label}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

async function main() {
  console.log("Seeding UAT enrichment data…");

  // ── Users — one per app role ─────────────────────────────────────────────
  // Roles live in users.role (admin / pm / finance / coordinator). They are
  // not FK-referenced by other tables, but seeding them lets approval gates and
  // the (future) user-management screen be exercised, and makes the user ids
  // referenced elsewhere (user_coord, user_pm, user_finance) resolvable.
  await step("users (admin / coordinator / pm / finance)", async () => {
    const users = [
      { id: "user_admin", email: "admin@beacon.test", firstName: "Avery", lastName: "Admin", role: "admin" as const },
      { id: "user_coord", email: "coordinator@beacon.test", firstName: "Casey", lastName: "Coordinator", role: "coordinator" as const },
      { id: "user_pm", email: "pm@beacon.test", firstName: "Pat", lastName: "Project-Manager", role: "pm" as const },
      { id: "user_finance", email: "finance@beacon.test", firstName: "Robin", lastName: "Finance", role: "finance" as const },
    ];
    for (const u of users) {
      await db
        .insert(usersTable)
        .values(u)
        .onConflictDoUpdate({ target: usersTable.id, set: { role: u.role, firstName: u.firstName, lastName: u.lastName } });
    }
  });

  // ── Projects — healthy / approaching / released / filing+closed ──────────
  await step("projects (healthy, approaching, released, extra)", async () => {
    await db
      .insert(lienProjectsTable)
      .values([
        {
          id: "proj_healthy",
          orgId: ORG,
          hubspotProjectId: "hs_proj_910",
          jurisdictionId: "jur_tx",
          subSystemTypeId: "sst_office",
          lienWorkflowType: "commercial_sub",
          contractorTier: "first_tier",
          legalPropertyAddress: "900 Riverside Dr, Austin, TX",
          county: "Travis",
          contractStartDate: d("2026-04-01"),
          completionDate: d("2026-08-01"),
          cachedProjectName: "Riverside Data Center",
          cachedHubspotStatus: "install",
          completionChecklistComplete: true,
        },
        {
          id: "proj_approaching",
          orgId: ORG,
          hubspotProjectId: "hs_proj_911",
          jurisdictionId: "jur_tx",
          subSystemTypeId: "sst_office",
          lienWorkflowType: "commercial_sub",
          contractorTier: "first_tier",
          legalPropertyAddress: "120 Lakeline Blvd, Cedar Park, TX",
          county: "Williamson",
          contractStartDate: d("2026-03-01"),
          completionDate: d("2026-07-01"),
          cachedProjectName: "Lakeline Medical Plaza",
          cachedHubspotStatus: "install",
          completionChecklistComplete: true,
        },
        {
          id: "proj_released",
          orgId: ORG,
          hubspotProjectId: "hs_proj_912",
          jurisdictionId: "jur_tx",
          subSystemTypeId: "sst_office",
          lienWorkflowType: "commercial_sub",
          contractorTier: "first_tier",
          legalPropertyAddress: "4500 Industrial Pkwy, San Antonio, TX",
          county: "Bexar",
          contractStartDate: d("2026-01-10"),
          completionDate: d("2026-04-30"),
          cachedProjectName: "Hill Country Warehouse",
          cachedHubspotStatus: "install",
          completionChecklistComplete: true,
        },
        {
          id: "proj_extra",
          orgId: ORG,
          hubspotProjectId: "hs_proj_913",
          jurisdictionId: "jur_tx",
          subSystemTypeId: "sst_office",
          lienWorkflowType: "commercial_sub",
          contractorTier: "first_tier",
          legalPropertyAddress: "75 Greenline Ave, Austin, TX",
          county: "Travis",
          contractStartDate: d("2025-11-01"),
          completionDate: d("2026-03-15"),
          cachedProjectName: "Greenline Transit Hub",
          cachedHubspotStatus: "install",
          completionChecklistComplete: true,
        },
      ])
      .onConflictDoNothing();
  });

  // ── Streams — open(healthy), open(approaching), released, filing, closed ──
  await step("streams (healthy / approaching / released / filing / closed)", async () => {
    await db
      .insert(lienScheduleOfValuesTable)
      .values([
        { id: "str_healthy_con", orgId: ORG, lienProjectId: "proj_healthy", workStream: "construction", status: "open", openedAt: d("2026-05-01") },
        { id: "str_approaching_con", orgId: ORG, lienProjectId: "proj_approaching", workStream: "construction", status: "open", openedAt: d("2026-04-01") },
        { id: "str_released_con", orgId: ORG, lienProjectId: "proj_released", workStream: "construction", status: "released", openedAt: d("2026-02-10") },
        { id: "str_filing_con", orgId: ORG, lienProjectId: "proj_extra", workStream: "construction", status: "filing", openedAt: d("2026-01-05") },
        { id: "str_closed_con", orgId: ORG, lienProjectId: "proj_extra", workStream: "design", status: "closed", openedAt: d("2025-12-01") },
      ])
      .onConflictDoNothing();
  });

  // ── Restore canonical UAT statuses (guards against runtime drift) ────────
  // The base seed defines str_comm_con as the "at_risk" example, but it uses
  // onConflictDoNothing, so once runtime actions (e.g. recompute) move it to
  // another status the base seed can no longer reset it. Re-assert it here so
  // UAT always has an at-risk stream.
  await step("restore str_comm_con → at_risk (canonical at-risk example)", async () => {
    await db
      .update(lienScheduleOfValuesTable)
      .set({ status: "at_risk", updatedAt: new Date() })
      .where(and(eq(lienScheduleOfValuesTable.id, "str_comm_con"), eq(lienScheduleOfValuesTable.orgId, ORG)));
  });

  // Same drift guard for the base collection accounts: the recompute action
  // recalculates status/escalationStage from invoice + promise data, which can
  // move acct_late off its documented "pre_lien_notice" baseline. Re-assert the
  // canonical values so UAT starts from a complete escalation-stage spread
  // (none → soft_collections → pre_lien_notice → lien_filing → agency_attorney
  // → write_off).
  await step("restore canonical collection-account baselines (acct_good / acct_late)", async () => {
    await db
      .update(collectionAccountsTable)
      .set({ status: "current", escalationStage: "none", totalOverdue: "0", oldestOverdueDays: 0, updatedAt: new Date() })
      .where(and(eq(collectionAccountsTable.id, "acct_good"), eq(collectionAccountsTable.orgId, ORG)));
    await db
      .update(collectionAccountsTable)
      .set({ status: "in_collections", escalationStage: "pre_lien_notice", updatedAt: new Date() })
      .where(and(eq(collectionAccountsTable.id, "acct_late"), eq(collectionAccountsTable.orgId, ORG)));
  });

  // ── Work months + deadlines (healthy cleared, approaching) ───────────────
  await step("work months (healthy cleared + approaching overdue)", async () => {
    await db
      .insert(workMonthsTable)
      .values([
        { id: "wm_healthy", orgId: ORG, lienScheduleOfValuesId: "str_healthy_con", month: d("2026-05-01"), derivedOverdue: false, clearedFlag: true },
        { id: "wm_approaching", orgId: ORG, lienScheduleOfValuesId: "str_approaching_con", month: d("2026-04-01"), derivedOverdue: true, clearedFlag: false },
      ])
      .onConflictDoNothing();
  });

  await step("deadlines (approaching notice + retainage)", async () => {
    await db
      .insert(lienDeadlinesTable)
      .values([
        {
          id: "dl_approaching_notice",
          orgId: ORG,
          workMonthId: "wm_approaching",
          ruleId: "rule_cs_notice",
          ruleKind: "notice",
          computedDate: d("2026-06-26"),
          adjustedDate: d("2026-06-26"),
          sourceData: { month: "2026-04", rule: "§ 53.056(a-1)(1)", note: "approaching — within alert window" },
        },
        {
          id: "dl_approaching_retainage",
          orgId: ORG,
          workMonthId: "wm_approaching",
          ruleId: "rule_retainage",
          ruleKind: "retainage",
          computedDate: d("2026-07-01"),
          adjustedDate: d("2026-07-01"),
          sourceData: { anchor: "completion", rule: "§ 53.057(a-1)", note: "retainage deadline coverage" },
        },
      ])
      .onConflictDoNothing();
  });

  // ── Filing + Release for the released stream; in-progress filing ─────────
  await step("filings (released-stream filed + in-progress draft)", async () => {
    await db
      .insert(lienFilingsTable)
      .values([
        {
          id: "fil_released",
          orgId: ORG,
          lienScheduleOfValuesId: "str_released_con",
          status: "filed",
          county: "Bexar",
          filingDate: d("2026-04-10"),
          recordingRef: "2026-BEX-00777",
          filingFee: "95.00",
          postFilingNoticeDeadline: d("2026-04-17"),
          enforcementDeadline: d("2027-04-10"),
          affidavitDocUrl: "s3://affidavits/fil_released.pdf",
        },
        {
          id: "fil_inprogress",
          orgId: ORG,
          lienScheduleOfValuesId: "str_filing_con",
          status: "affidavit_draft",
          county: "Travis",
          affidavitDocUrl: "s3://affidavits/fil_inprogress_draft.pdf",
        },
      ])
      .onConflictDoNothing();
  });

  await step("release (filed) for released stream", async () => {
    await db
      .insert(lienReleasesTable)
      .values({
        id: "rel_released",
        orgId: ORG,
        filingId: "fil_released",
        status: "filed",
        requestedAt: d("2026-05-15"),
        generatedDocUrl: "s3://releases/rel_released.pdf",
        signedDate: d("2026-05-20"),
        filingConfirmation: "2026-BEX-00901",
      })
      .onConflictDoNothing();
  });

  // ── Notice — delivered (with proof of delivery) ──────────────────────────
  await step("notice (delivered) + mailing record with proof", async () => {
    await db
      .insert(noticesTable)
      .values({
        id: "not_delivered",
        orgId: ORG,
        lienScheduleOfValuesId: "str_res_con",
        noticeType: "statutory_claim",
        status: "delivered",
        claimAmount: "12000.00",
        monthListed: d("2026-04-01"),
        generatedDocUrl: "s3://notices/not_delivered.pdf",
        approvedByUserId: "user_coord",
        approvedAt: d("2026-05-01"),
        sentAt: d("2026-05-05"),
        deliveredAt: d("2026-05-09"),
      })
      .onConflictDoNothing();

    await db
      .insert(mailingRecordsTable)
      .values({
        id: "mail_delivered",
        orgId: ORG,
        noticeId: "not_delivered",
        provider: "shippo",
        trackingNumber: "9400100000000000000099",
        sentDate: d("2026-05-05"),
        labelUrl: "s3://labels/mail_delivered.pdf",
        proofUrl: "s3://proofs/mail_delivered_pod.pdf",
      })
      .onConflictDoNothing();
  });

  // ── Waivers — approved, handed-to-GC, rejected ───────────────────────────
  await step("waivers (approved / handed-to-GC / rejected)", async () => {
    await db
      .insert(waiversTable)
      .values([
        {
          id: "wv_approved",
          orgId: ORG,
          lienProjectId: "proj_comm",
          workStream: "construction",
          waiverType: "unconditional_progress",
          paymentAmount: "18000.00",
          approvalStatus: "approved",
          pmApprovedByUserId: "user_pm",
          pmApprovedAt: d("2026-05-20"),
          financeApprovedByUserId: "user_finance",
          financeApprovedAt: d("2026-05-21"),
          notarized: false,
          providedToGc: false,
          generatedDocUrl: "s3://waivers/wv_approved.pdf",
        },
        {
          id: "wv_gc",
          orgId: ORG,
          lienProjectId: "proj_2nd",
          workStream: "construction",
          waiverType: "unconditional_final",
          paymentAmount: "42000.00",
          approvalStatus: "approved",
          pmApprovedByUserId: "user_pm",
          pmApprovedAt: d("2026-06-01"),
          financeApprovedByUserId: "user_finance",
          financeApprovedAt: d("2026-06-02"),
          notarized: true,
          notaryLiveRef: "nl_gc",
          signedDate: d("2026-06-03"),
          providedToGc: true,
          generatedDocUrl: "s3://waivers/wv_gc.pdf",
        },
        {
          id: "wv_rejected",
          orgId: ORG,
          lienProjectId: "proj_comm",
          workStream: "construction",
          waiverType: "conditional_progress",
          paymentAmount: "9000.00",
          approvalStatus: "rejected",
          notarized: false,
          providedToGc: false,
        },
      ])
      .onConflictDoNothing();
  });

  // ── Linked clients for the new collection accounts ───────────────────────
  await step("linked clients (collections coverage)", async () => {
    await db
      .insert(linkedClientsTable)
      .values([
        { id: "cli_soft", orgId: ORG, hubspotCompanyId: "hs_co_400", qboCustomerId: "qbo_cust_400", cachedName: "Soft Touch Interiors", cachedEmail: "ap@softtouch.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
        { id: "cli_filing", orgId: ORG, hubspotCompanyId: "hs_co_500", qboCustomerId: "qbo_cust_500", cachedName: "Filing Risk Partners", cachedEmail: "ap@filingrisk.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
        { id: "cli_agency", orgId: ORG, hubspotCompanyId: "hs_co_600", qboCustomerId: "qbo_cust_600", cachedName: "Agency Escalation Co", cachedEmail: "ap@agencyco.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
        { id: "cli_writeoff", orgId: ORG, hubspotCompanyId: "hs_co_700", qboCustomerId: "qbo_cust_700", cachedName: "Write-Off Holdings", cachedEmail: "ap@writeoff.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
        { id: "cli_promised", orgId: ORG, hubspotCompanyId: "hs_co_800", qboCustomerId: "qbo_cust_800", cachedName: "Promised Pay LLC", cachedEmail: "ap@promisedpay.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
        { id: "cli_plan", orgId: ORG, hubspotCompanyId: "hs_co_900", qboCustomerId: "qbo_cust_900", cachedName: "Installment Industries", cachedEmail: "ap@installment.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
        { id: "cli_resolved", orgId: ORG, hubspotCompanyId: "hs_co_910", qboCustomerId: "qbo_cust_910", cachedName: "Resolved & Paid Inc", cachedEmail: "ap@resolved.test", matchState: "matched", lastSyncedAt: d("2026-06-01") },
      ])
      .onConflictDoNothing();
  });

  // ── Collection accounts — every escalation stage + status ────────────────
  await step("collection accounts (all escalation stages + statuses)", async () => {
    await db
      .insert(collectionAccountsTable)
      .values([
        { id: "acct_soft", orgId: ORG, linkedClientId: "cli_soft", status: "overdue", escalationStage: "soft_collections", totalOverdue: "8200.00", oldestOverdueDays: 35, riskScore: 45, dunningSequenceId: "seq_default", currentDunningStepId: "step_rem" },
        { id: "acct_filing", orgId: ORG, linkedClientId: "cli_filing", status: "escalated", escalationStage: "lien_filing", totalOverdue: "62000.00", oldestOverdueDays: 120, riskScore: 92 },
        { id: "acct_agency", orgId: ORG, linkedClientId: "cli_agency", status: "escalated", escalationStage: "agency_attorney", totalOverdue: "95000.00", oldestOverdueDays: 210, riskScore: 97 },
        { id: "acct_writeoff", orgId: ORG, linkedClientId: "cli_writeoff", status: "written_off", escalationStage: "write_off", totalOverdue: "15000.00", oldestOverdueDays: 400, riskScore: 99 },
        { id: "acct_promised", orgId: ORG, linkedClientId: "cli_promised", status: "promised", escalationStage: "soft_collections", totalOverdue: "20000.00", oldestOverdueDays: 28, riskScore: 38 },
        { id: "acct_plan", orgId: ORG, linkedClientId: "cli_plan", status: "payment_plan", escalationStage: "soft_collections", totalOverdue: "30000.00", oldestOverdueDays: 60, riskScore: 55 },
        { id: "acct_resolved", orgId: ORG, linkedClientId: "cli_resolved", status: "resolved", escalationStage: "none", totalOverdue: "0.00", oldestOverdueDays: 0, riskScore: 10 },
      ])
      .onConflictDoNothing();
  });

  // ── AR invoices behind the collection accounts ───────────────────────────
  // The collections feature derives totalOverdue / oldestOverdueDays / riskScore
  // from LIVE invoice data (invoice_links for the account's linkedClientId) on
  // every recompute (see recomputeRiskScore in routes/collections.ts). The base
  // seed only backs acct_late (inv_overdue → cli_late) and acct_good
  // (inv_cleared → cli_good); the UAT accounts created above had hardcoded
  // overdue figures with no invoices, so a recompute collapsed them to $0.
  //
  // These AR invoices (non-supplier, non-cleared, net-30) aggregate to each
  // account's intended overdue total and oldest-overdue age, spread across aging
  // buckets so the per-client aging breakdown renders meaningfully. Dates are
  // anchored to the seed "today" of 2026-06-19 so re-running is idempotent.
  // recomputeRiskScore leaves status / escalationStage untouched, so the
  // canonical seeded stages survive a recompute; only the derived overdue/age/
  // risk figures are refreshed from these invoices.
  await step("AR invoices backing collection accounts", async () => {
    await db
      .insert(invoiceLinksTable)
      .values([
        // acct_soft (cli_soft) → ~8,200 overdue, oldest ~35 days
        { id: "inv_soft_1", orgId: ORG, linkedClientId: "cli_soft", qboInvoiceId: "qbo_inv_soft_1", isSupplierInvoice: false, amount: "5000.00", invoiceDate: d("2026-04-15"), dueDate: d("2026-05-15"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_soft_2", orgId: ORG, linkedClientId: "cli_soft", qboInvoiceId: "qbo_inv_soft_2", isSupplierInvoice: false, amount: "3200.00", invoiceDate: d("2026-05-10"), dueDate: d("2026-06-09"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },

        // acct_filing (cli_filing) → ~62,000 overdue, oldest ~120 days
        { id: "inv_filing_1", orgId: ORG, linkedClientId: "cli_filing", qboInvoiceId: "qbo_inv_filing_1", isSupplierInvoice: false, amount: "32000.00", invoiceDate: d("2026-01-20"), dueDate: d("2026-02-19"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_filing_2", orgId: ORG, linkedClientId: "cli_filing", qboInvoiceId: "qbo_inv_filing_2", isSupplierInvoice: false, amount: "20000.00", invoiceDate: d("2026-03-06"), dueDate: d("2026-04-05"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_filing_3", orgId: ORG, linkedClientId: "cli_filing", qboInvoiceId: "qbo_inv_filing_3", isSupplierInvoice: false, amount: "10000.00", invoiceDate: d("2026-04-05"), dueDate: d("2026-05-05"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },

        // acct_agency (cli_agency) → ~95,000 overdue, oldest ~210 days
        { id: "inv_agency_1", orgId: ORG, linkedClientId: "cli_agency", qboInvoiceId: "qbo_inv_agency_1", isSupplierInvoice: false, amount: "50000.00", invoiceDate: d("2025-10-22"), dueDate: d("2025-11-21"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_agency_2", orgId: ORG, linkedClientId: "cli_agency", qboInvoiceId: "qbo_inv_agency_2", isSupplierInvoice: false, amount: "30000.00", invoiceDate: d("2026-01-10"), dueDate: d("2026-02-09"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_agency_3", orgId: ORG, linkedClientId: "cli_agency", qboInvoiceId: "qbo_inv_agency_3", isSupplierInvoice: false, amount: "15000.00", invoiceDate: d("2026-02-14"), dueDate: d("2026-03-16"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },

        // acct_writeoff (cli_writeoff) → ~15,000 overdue, oldest ~400 days
        { id: "inv_writeoff_1", orgId: ORG, linkedClientId: "cli_writeoff", qboInvoiceId: "qbo_inv_writeoff_1", isSupplierInvoice: false, amount: "15000.00", invoiceDate: d("2025-04-15"), dueDate: d("2025-05-15"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },

        // acct_promised (cli_promised) → ~20,000 overdue, oldest ~28 days (open promise suppresses alerts)
        { id: "inv_promised_1", orgId: ORG, linkedClientId: "cli_promised", qboInvoiceId: "qbo_inv_promised_1", isSupplierInvoice: false, amount: "12000.00", invoiceDate: d("2026-04-22"), dueDate: d("2026-05-22"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_promised_2", orgId: ORG, linkedClientId: "cli_promised", qboInvoiceId: "qbo_inv_promised_2", isSupplierInvoice: false, amount: "8000.00", invoiceDate: d("2026-05-10"), dueDate: d("2026-06-09"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },

        // acct_plan (cli_plan) → ~30,000 overdue, oldest ~60 days
        { id: "inv_plan_1", orgId: ORG, linkedClientId: "cli_plan", qboInvoiceId: "qbo_inv_plan_1", isSupplierInvoice: false, amount: "18000.00", invoiceDate: d("2026-03-21"), dueDate: d("2026-04-20"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },
        { id: "inv_plan_2", orgId: ORG, linkedClientId: "cli_plan", qboInvoiceId: "qbo_inv_plan_2", isSupplierInvoice: false, amount: "12000.00", invoiceDate: d("2026-04-25"), dueDate: d("2026-05-25"), qboStatus: "open", clearedFlag: false, lastSyncedAt: d("2026-06-01") },

        // acct_resolved (cli_resolved) → cleared invoice only, keeps $0 overdue on recompute
        { id: "inv_resolved_1", orgId: ORG, linkedClientId: "cli_resolved", qboInvoiceId: "qbo_inv_resolved_1", isSupplierInvoice: false, amount: "18000.00", invoiceDate: d("2026-03-01"), dueDate: d("2026-03-31"), qboStatus: "paid", clearedFlag: true, clearedAt: d("2026-04-02"), clearedByUserId: "user_coord", lastSyncedAt: d("2026-06-01") },
      ])
      .onConflictDoNothing();
  });

  // ── Collection activities — dunning history (covers all methods) ─────────
  await step("collection activities (dunning history, all methods)", async () => {
    await db
      .insert(collectionActivitiesTable)
      .values([
        { id: "act_soft_email", orgId: ORG, accountId: "acct_soft", method: "email", activityDate: d("2026-05-20"), notes: "Sent friendly reminder #1", createdByUserId: "user_coord" },
        { id: "act_soft_sms", orgId: ORG, accountId: "acct_soft", method: "sms", activityDate: d("2026-05-27"), notes: "Texted payment link", createdByUserId: "user_coord" },
        { id: "act_filing_letter", orgId: ORG, accountId: "acct_filing", method: "letter", activityDate: d("2026-05-10"), notes: "Mailed final demand letter", createdByUserId: "user_coord" },
        { id: "act_agency_phone", orgId: ORG, accountId: "acct_agency", method: "phone", activityDate: d("2026-05-12"), notes: "Escalated to collections agency", createdByUserId: "user_coord" },
        { id: "act_agency_inperson", orgId: ORG, accountId: "acct_agency", method: "in_person", activityDate: d("2026-05-18"), notes: "Site visit to discuss payment", createdByUserId: "user_coord" },
        { id: "act_plan_portal", orgId: ORG, accountId: "acct_plan", method: "portal", activityDate: d("2026-05-22"), notes: "Customer set up plan via portal", createdByUserId: "user_coord" },
      ])
      .onConflictDoNothing();
  });

  // ── Promises to pay — open (suppresses alerts) + cancelled ───────────────
  await step("promises (open-suppresses-alerts + cancelled)", async () => {
    await db
      .insert(promisesToPayTable)
      .values([
        { id: "prom_promised_open", orgId: ORG, accountId: "acct_promised", amount: "20000.00", promisedDate: d("2026-07-10"), status: "open", notes: "Open promise — should suppress dunning alerts" },
        { id: "prom_cancelled", orgId: ORG, accountId: "acct_late", amount: "5000.00", promisedDate: d("2026-05-25"), status: "cancelled", notes: "Cancelled after dispute" },
      ])
      .onConflictDoNothing();
  });

  // ── Payment plans — active / defaulted / completed / cancelled ───────────
  await step("payment plans (active / defaulted / completed / cancelled)", async () => {
    await db
      .insert(paymentPlansTable)
      .values([
        { id: "plan_active2", orgId: ORG, accountId: "acct_plan", status: "active", totalAmount: "30000.00" },
        { id: "plan_defaulted", orgId: ORG, accountId: "acct_filing", status: "defaulted", totalAmount: "40000.00" },
        { id: "plan_completed", orgId: ORG, accountId: "acct_resolved", status: "completed", totalAmount: "18000.00" },
        { id: "plan_cancelled", orgId: ORG, accountId: "acct_writeoff", status: "cancelled", totalAmount: "12000.00" },
      ])
      .onConflictDoNothing();

    await db
      .insert(paymentPlanInstallmentsTable)
      .values([
        { id: "pi_active2_1", orgId: ORG, planId: "plan_active2", dueDate: d("2026-06-15"), amount: "10000.00", paid: true, paidDate: d("2026-06-14") },
        { id: "pi_active2_2", orgId: ORG, planId: "plan_active2", dueDate: d("2026-07-15"), amount: "10000.00", paid: false },
        { id: "pi_active2_3", orgId: ORG, planId: "plan_active2", dueDate: d("2026-08-15"), amount: "10000.00", paid: false },
        { id: "pi_completed_1", orgId: ORG, planId: "plan_completed", dueDate: d("2026-03-15"), amount: "9000.00", paid: true, paidDate: d("2026-03-14") },
        { id: "pi_completed_2", orgId: ORG, planId: "plan_completed", dueDate: d("2026-04-15"), amount: "9000.00", paid: true, paidDate: d("2026-04-13") },
        { id: "pi_defaulted_1", orgId: ORG, planId: "plan_defaulted", dueDate: d("2026-04-15"), amount: "20000.00", paid: true, paidDate: d("2026-04-15") },
        { id: "pi_defaulted_2", orgId: ORG, planId: "plan_defaulted", dueDate: d("2026-05-15"), amount: "20000.00", paid: false },
      ])
      .onConflictDoNothing();
  });

  // ── Supplier notice risk — cleared (complements seeded "flagged") ────────
  await step("supplier invoice + cleared risk", async () => {
    await db
      .insert(invoiceLinksTable)
      .values({
        id: "inv_supplier2",
        orgId: ORG,
        lienProjectId: "proj_2nd",
        isSupplierInvoice: true,
        qboSupplierInvoiceId: "qbo_sup_2",
        amount: "4200.00",
        invoiceDate: d("2026-02-10"),
        dueDate: d("2026-03-12"),
        qboStatus: "paid",
        clearedFlag: true,
        clearedAt: d("2026-03-15"),
        lastSyncedAt: d("2026-06-01"),
      })
      .onConflictDoNothing();

    await db
      .insert(supplierNoticeRisksTable)
      .values({
        id: "snr_cleared",
        orgId: ORG,
        lienProjectId: "proj_2nd",
        invoiceLinkId: "inv_supplier2",
        status: "cleared",
        supplierDeadline: d("2026-05-15"),
        beaconDeadline: d("2026-05-15"),
        monthAffected: d("2026-02-01"),
      })
      .onConflictDoNothing();
  });

  console.log("\nUAT enrichment seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
