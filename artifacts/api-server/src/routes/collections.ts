/**
 * collections.ts — Collections Pipeline routes (Phase 7 / Feature 22.10)
 *
 * GET    /collections/aging                       AR aging buckets
 * GET    /collections/accounts                    accounts list
 * GET    /collections/accounts/:id                account full history
 * POST   /collections/accounts/:id/activity       log contact activity
 * POST   /collections/accounts/:id/advance        advance dunning step
 * POST   /collections/accounts/:id/promise        record promise-to-pay
 * PATCH  /collections/promises/:id                update promise status
 * POST   /collections/accounts/:id/plan           create payment plan
 * PATCH  /collections/plans/:id/installments/:iid mark installment paid/unpaid
 * POST   /collections/accounts/:id/escalate       advance escalation stage
 * GET    /collections/sequences                   dunning sequences
 * POST   /collections/sequences                   create sequence (admin)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  collectionAccountsTable,
  collectionActivitiesTable,
  promisesToPayTable,
  paymentPlansTable,
  paymentPlanInstallmentsTable,
  dunningSequencesTable,
  dunningStepsTable,
  linkedClientsTable,
  invoiceLinksTable,
  lienProjectsTable,
  lienScheduleOfValuesTable,
  workMonthsTable,
  lienDeadlinesTable,
  holdsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, isNull, sql } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { hubspotClient } from "../lib/clients/hubspot";
import { qboSyncClient } from "../lib/clients/qbo";
import { computeAccountRiskMetrics } from "../lib/riskScore";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get account (with orgId guard)
// ---------------------------------------------------------------------------
async function getAccount(accountId: string, orgId: string) {
  const [account] = await db
    .select()
    .from(collectionAccountsTable)
    .where(
      and(
        eq(collectionAccountsTable.id, accountId),
        eq(collectionAccountsTable.orgId, orgId),
      ),
    )
    .limit(1);
  return account ?? null;
}

// Escalation stage ladder — ordered from least to most severe
const ESCALATION_LADDER = [
  "none",
  "soft_collections",
  "pre_lien_notice",
  "lien_filing",
  "agency_attorney",
  "write_off",
] as const;

// ---------------------------------------------------------------------------
// Risk scoring engine
// Computes riskScore (0-100), oldestOverdueDays, and totalOverdue from live
// invoice data + promise history, then persists to collectionAccountsTable.
// Call after any event that changes account risk posture.
// ---------------------------------------------------------------------------
async function recomputeRiskScore(
  accountId: string,
  orgId: string,
  linkedClientId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  escalationStage: string,
): Promise<{ riskScore: number; oldestOverdueDays: number; totalOverdue: number }> {
  // All risk math (including the org's configurable scoring bands) lives in the
  // shared module so this path and the invoice-clear path can never compute
  // different figures.
  const { riskScore, oldestOverdueDays, totalOverdue } =
    await computeAccountRiskMetrics({ accountId, orgId, linkedClientId });

  // Persist refreshed values
  await db
    .update(collectionAccountsTable)
    .set({
      riskScore,
      oldestOverdueDays,
      totalOverdue: String(totalOverdue),
    })
    .where(
      and(
        eq(collectionAccountsTable.id, accountId),
        eq(collectionAccountsTable.orgId, orgId),
      ),
    );

  return { riskScore, oldestOverdueDays, totalOverdue };
}

// ---------------------------------------------------------------------------
// GET /collections/aging — AR aging buckets (org total + per-client breakdown)
// QBO cache freshness: invoices with lastSyncedAt older than 24h are flagged stale
// ---------------------------------------------------------------------------
router.get("/aging", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const arInvoiceFilter = and(
    eq(invoiceLinksTable.orgId, orgId),
    eq(invoiceLinksTable.clearedFlag, false),
    eq(invoiceLinksTable.isSupplierInvoice, false),
  );

  // AR invoices only — exclude supplier/AP invoices from aging totals
  let invoices = await db.select().from(invoiceLinksTable).where(arInvoiceFilter);

  const isStale = (inv: (typeof invoices)[number]) =>
    !inv.lastSyncedAt || new Date(inv.lastSyncedAt) < staleThreshold;

  // QBO cache freshness check — flag stale records and pull fresh data from QBO.
  let staleCount = invoices.filter(isStale).length;
  const qboConfigured = qboSyncClient.isConfigured();
  let qboSynced = 0;

  // Refresh stale invoices directly from QBO. When credentials are not
  // configured this is a no-op skip — we keep serving cached invoice_links
  // data rather than faking freshness by bumping lastSyncedAt.
  if (staleCount > 0 && qboConfigured) {
    const result = await qboSyncClient.syncStaleInvoicesForOrg({
      orgId,
      staleThresholdMs: 24 * 60 * 60 * 1000,
    });
    qboSynced = result.synced;
    if (!result.skipped && result.synced > 0) {
      // Re-read so aging buckets reflect freshly synced amounts/due dates.
      invoices = await db.select().from(invoiceLinksTable).where(arInvoiceFilter);
      staleCount = invoices.filter(isStale).length;
    }
  }

  // Org-level buckets
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91plus: 0 };
  let totalOverdue = 0;

  // Per-client aggregation: { [linkedClientId]: { buckets, totalOverdue, invoiceCount } }
  const byClient: Record<
    string,
    { buckets: typeof buckets; totalOverdue: number; invoiceCount: number }
  > = {};

  for (const inv of invoices) {
    if (!inv.dueDate) continue;
    const amount = Number(inv.amount ?? 0);
    const daysOverdue = Math.floor(
      (now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000,
    );

    const clientId = inv.linkedClientId ?? "__unknown__";
    if (!byClient[clientId]) {
      byClient[clientId] = {
        buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91plus: 0 },
        totalOverdue: 0,
        invoiceCount: 0,
      };
    }
    byClient[clientId].invoiceCount += 1;

    const bucket =
      daysOverdue <= 0 ? "current"
      : daysOverdue <= 30 ? "d1_30"
      : daysOverdue <= 60 ? "d31_60"
      : daysOverdue <= 90 ? "d61_90"
      : "d91plus";

    buckets[bucket] += amount;
    byClient[clientId].buckets[bucket] += amount;

    if (daysOverdue > 0) {
      totalOverdue += amount;
      byClient[clientId].totalOverdue += amount;
    }
  }

  res.json({
    buckets,
    totalOverdue,
    invoiceCount: invoices.length,
    overdueCount: invoices.filter((i) => {
      if (!i.dueDate) return false;
      return new Date(i.dueDate) < now;
    }).length,
    byClient,
    qboSync: {
      staleCount,
      configured: qboConfigured,
      synced: qboSynced,
      lastSyncedAt:
        invoices.length > 0
          ? invoices
              .map((i) => i.lastSyncedAt)
              .filter(Boolean)
              .sort()
              .at(-1) ?? null
          : null,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /collections/accounts — list accounts (with linked client info)
// ---------------------------------------------------------------------------
router.get("/accounts", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const { status, stage } = req.query as Record<string, string | undefined>;

  const accounts = await db
    .select()
    .from(collectionAccountsTable)
    .where(eq(collectionAccountsTable.orgId, orgId))
    .orderBy(desc(collectionAccountsTable.riskScore));

  const clientIds = accounts.map((a) => a.linkedClientId);
  const clients =
    clientIds.length > 0
      ? await db
          .select()
          .from(linkedClientsTable)
          .where(inArray(linkedClientsTable.id, clientIds))
      : ([] as (typeof linkedClientsTable.$inferSelect)[]);

  // Collect lien backstop dates for each account's client
  const invoicesByClient: Record<string, string[]> = {};
  if (clientIds.length > 0) {
    const clientInvoices = await db
      .select()
      .from(invoiceLinksTable)
      .where(
        and(
          eq(invoiceLinksTable.orgId, orgId),
          eq(invoiceLinksTable.clearedFlag, false),
          inArray(invoiceLinksTable.linkedClientId, clientIds),
        ),
      );
    for (const inv of clientInvoices) {
      if (!inv.linkedClientId || !inv.lienProjectId) continue;
      if (!invoicesByClient[inv.linkedClientId]) invoicesByClient[inv.linkedClientId] = [];
      invoicesByClient[inv.linkedClientId].push(inv.lienProjectId);
    }
  }

  // Open promises per account (to show dunning suppression)
  const accountIds = accounts.map((a) => a.id);
  const openPromises =
    accountIds.length > 0
      ? await db
          .select()
          .from(promisesToPayTable)
          .where(
            and(
              eq(promisesToPayTable.orgId, orgId),
              inArray(promisesToPayTable.accountId, accountIds),
              eq(promisesToPayTable.status, "open"),
            ),
          )
      : ([] as (typeof promisesToPayTable.$inferSelect)[]);

  let rows = accounts.map((acct) => {
    const client = clients.find((c) => c.id === acct.linkedClientId);
    const hasOpenPromise = openPromises.some((p) => p.accountId === acct.id);
    return {
      ...acct,
      cachedName: client?.cachedName ?? null,
      cachedEmail: client?.cachedEmail ?? null,
      hasOpenPromise,
    };
  });

  if (status) rows = rows.filter((r) => r.status === status);
  if (stage) rows = rows.filter((r) => r.escalationStage === stage);

  // Active holds count for the whole org (for dashboard KPI)
  const activeHolds = await db
    .select()
    .from(holdsTable)
    .where(
      and(
        eq(holdsTable.orgId, orgId),
        isNull(holdsTable.clearedAt),
      ),
    );

  res.json({ accounts: rows, activeHoldsCount: activeHolds.length });
});

// ---------------------------------------------------------------------------
// GET /collections/accounts/:id — full account with history
// ---------------------------------------------------------------------------
router.get("/accounts/:id", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const accountId = req.params["id"] as string;

  const account = await getAccount(accountId, orgId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  const [client] = await db
    .select()
    .from(linkedClientsTable)
    .where(eq(linkedClientsTable.id, account.linkedClientId))
    .limit(1);

  const [activities, promises, plans] = await Promise.all([
    db
      .select()
      .from(collectionActivitiesTable)
      .where(
        and(
          eq(collectionActivitiesTable.accountId, accountId),
          eq(collectionActivitiesTable.orgId, orgId),
        ),
      )
      .orderBy(desc(collectionActivitiesTable.activityDate)),
    db
      .select()
      .from(promisesToPayTable)
      .where(
        and(
          eq(promisesToPayTable.accountId, accountId),
          eq(promisesToPayTable.orgId, orgId),
        ),
      )
      .orderBy(desc(promisesToPayTable.promisedDate)),
    db
      .select()
      .from(paymentPlansTable)
      .where(
        and(
          eq(paymentPlansTable.accountId, accountId),
          eq(paymentPlansTable.orgId, orgId),
        ),
      ),
  ]);

  // Load installments for each plan
  const planIds = plans.map((p) => p.id);
  const installments =
    planIds.length > 0
      ? await db
          .select()
          .from(paymentPlanInstallmentsTable)
          .where(inArray(paymentPlanInstallmentsTable.planId, planIds))
          .orderBy(asc(paymentPlanInstallmentsTable.dueDate))
      : ([] as (typeof paymentPlanInstallmentsTable.$inferSelect)[]);

  const plansWithInstallments = plans.map((p) => ({
    ...p,
    installments: installments.filter((i) => i.planId === p.id),
  }));

  // Load invoices for this client to compute aging
  const clientInvoices = client
    ? await db
        .select()
        .from(invoiceLinksTable)
        .where(
          and(
            eq(invoiceLinksTable.orgId, orgId),
            eq(invoiceLinksTable.linkedClientId, client.id),
            eq(invoiceLinksTable.clearedFlag, false),
          ),
        )
    : ([] as (typeof invoiceLinksTable.$inferSelect)[]);

  // Lien backstop — earliest upcoming deadline across the client's projects
  const projectIds = [...new Set(
    clientInvoices.map((i) => i.lienProjectId).filter((id): id is string => id != null),
  )];
  let lienBackstop: { deadlineDate: string; deadlineType: string; sovId: string } | null = null;

  if (projectIds.length > 0) {
    const sovs = await db
      .select()
      .from(lienScheduleOfValuesTable)
      .where(
        and(
          eq(lienScheduleOfValuesTable.orgId, orgId),
          inArray(lienScheduleOfValuesTable.lienProjectId, projectIds),
        ),
      );
    const sovIds = sovs.map((s) => s.id);
    if (sovIds.length > 0) {
      const workMonths = await db
        .select()
        .from(workMonthsTable)
        .where(
          and(
            eq(workMonthsTable.orgId, orgId),
            inArray(workMonthsTable.lienScheduleOfValuesId, sovIds),
          ),
        );
      const wmIds = workMonths.map((w) => w.id);
      if (wmIds.length > 0) {
        const now = new Date();
        const deadlines = await db
          .select()
          .from(lienDeadlinesTable)
          .where(inArray(lienDeadlinesTable.workMonthId, wmIds))
          .orderBy(asc(lienDeadlinesTable.adjustedDate));

        const upcoming = deadlines.find(
          (d) => new Date(d.adjustedDate) >= now,
        );
        if (upcoming) {
          const wm = workMonths.find((w) => w.id === upcoming.workMonthId);
          const sov = wm
            ? sovs.find((s) => s.id === wm.lienScheduleOfValuesId)
            : undefined;
          lienBackstop = {
            deadlineDate: new Date(upcoming.adjustedDate).toISOString().slice(0, 10),
            deadlineType: upcoming.ruleKind,
            sovId: sov?.id ?? "",
          };
        }
      }
    }
  }

  // Recompute risk score on every GET so the detail page always reflects live data
  const freshScore = await recomputeRiskScore(
    accountId,
    orgId,
    account.linkedClientId,
    account.escalationStage,
  );
  const freshAccount = { ...account, ...freshScore };

  // Open promise suppressing dunning
  const openPromise = promises.find((p) => p.status === "open") ?? null;

  // Aging breakdown for this client
  const now = new Date();
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91plus: 0 };
  for (const inv of clientInvoices) {
    if (!inv.dueDate) continue;
    const amount = Number(inv.amount ?? 0);
    const daysOverdue = Math.floor(
      (now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000,
    );
    if (daysOverdue <= 0) aging.current += amount;
    else if (daysOverdue <= 30) aging.d1_30 += amount;
    else if (daysOverdue <= 60) aging.d31_60 += amount;
    else if (daysOverdue <= 90) aging.d61_90 += amount;
    else aging.d91plus += amount;
  }

  res.json({
    account: freshAccount,
    client: client ?? null,
    activities,
    promises,
    plans: plansWithInstallments,
    openPromise,
    lienBackstop,
    aging,
  });
});

// ---------------------------------------------------------------------------
// POST /collections/accounts/:id/activity — log contact activity
// ---------------------------------------------------------------------------
router.post(
  "/accounts/:id/activity",
  requireSession,
  async (req, res) => {
    const { orgId, userId } = getSession(req);
    const accountId = req.params["id"] as string;
    const { method, activityDate, notes } = req.body as {
      method?: string;
      activityDate?: string;
      notes?: string;
    };

    if (!method || !activityDate) {
      res.status(400).json({ error: "method and activityDate are required" });
      return;
    }

    const account = await getAccount(accountId, orgId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    // Resolve HubSpot company ID via linked client for write-back
    const [linkedClient] = await db
      .select()
      .from(linkedClientsTable)
      .where(eq(linkedClientsTable.id, account.linkedClientId))
      .limit(1);

    // PRETEST_REQUIRED: Validate with HUBSPOT_API_KEY to confirm real activity write-back.
    // Write activity to HubSpot (stub-safe — falls back gracefully when key absent)
    let hubspotActivityId: string | null = null;
    if (linkedClient?.hubspotCompanyId) {
      try {
        const hsResult = await hubspotClient.postActivity({
          hubspotCompanyId: linkedClient.hubspotCompanyId,
          type: method,
          body: notes ?? `${method} contact logged`,
          activityDate: new Date(activityDate),
        });
        hubspotActivityId = hsResult.hubspotActivityId;
      } catch {
        // Non-fatal — continue without HubSpot ID
      }
    }

    const [activity] = await db
      .insert(collectionActivitiesTable)
      .values({
        orgId,
        accountId,
        method: method as "email" | "phone" | "letter" | "sms" | "portal" | "in_person",
        activityDate: new Date(activityDate),
        notes: notes ?? null,
        hubspotActivityId,
        createdByUserId: userId ?? null,
      })
      .returning();

    res.status(201).json({ activity });
  },
);

// ---------------------------------------------------------------------------
// POST /collections/accounts/:id/advance — advance dunning step
// ---------------------------------------------------------------------------
router.post(
  "/accounts/:id/advance",
  requireSession,
  async (req, res) => {
    const { orgId } = getSession(req);
    const accountId = req.params["id"] as string;

    const account = await getAccount(accountId, orgId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    if (!account.dunningSequenceId) {
      res.status(422).json({ error: "Account has no dunning sequence assigned" });
      return;
    }

    // Check for open promise — suppress dunning advancement
    const [openPromise] = await db
      .select()
      .from(promisesToPayTable)
      .where(
        and(
          eq(promisesToPayTable.accountId, accountId),
          eq(promisesToPayTable.orgId, orgId),
          eq(promisesToPayTable.status, "open"),
        ),
      )
      .limit(1);

    if (openPromise) {
      res.status(409).json({
        error: "Dunning advancement suppressed — open promise-to-pay on file",
        suppressedUntil: openPromise.promisedDate,
        promiseId: openPromise.id,
      });
      return;
    }

    const steps = await db
      .select()
      .from(dunningStepsTable)
      .where(
        and(
          eq(dunningStepsTable.sequenceId, account.dunningSequenceId),
          eq(dunningStepsTable.orgId, orgId),
        ),
      )
      .orderBy(asc(dunningStepsTable.order));

    // Recompute oldest overdue days from live invoice data (do not trust stored value)
    const today = new Date();
    const unpaidInvoices = await db
      .select({ dueDate: invoiceLinksTable.dueDate })
      .from(invoiceLinksTable)
      .where(
        and(
          eq(invoiceLinksTable.orgId, orgId),
          eq(invoiceLinksTable.linkedClientId, account.linkedClientId),
          eq(invoiceLinksTable.clearedFlag, false),
        ),
      );
    const overdueInvoices = unpaidInvoices.filter(
      (inv) => new Date(inv.dueDate) < today,
    );
    const computedOldestDays =
      overdueInvoices.length > 0
        ? Math.max(
            ...overdueInvoices.map((inv) =>
              Math.floor(
                (today.getTime() - new Date(inv.dueDate).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            ),
          )
        : 0;

    // Forward-only: find current step index, then pick the NEXT step after it
    // that qualifies by daysOverdue threshold. Never regress to an earlier step.
    const currentStepIdx = account.currentDunningStepId
      ? steps.findIndex((s) => s.id === account.currentDunningStepId)
      : -1;

    const nextStep = steps
      .slice(currentStepIdx + 1)           // only steps AFTER the current one
      .find((s) => s.daysOverdue <= computedOldestDays);

    if (!nextStep) {
      res.json({ account, message: "No new dunning step triggered", advanced: false });
      return;
    }

    const [updated] = await db
      .update(collectionAccountsTable)
      .set({
        currentDunningStepId: nextStep.id,
        oldestOverdueDays: computedOldestDays,
        // Ensure status reflects active dunning
        status: account.status === "current" ? "overdue" : account.status,
      })
      .where(eq(collectionAccountsTable.id, accountId))
      .returning();

    // Recompute risk score after advancing dunning
    await recomputeRiskScore(accountId, orgId, account.linkedClientId, account.escalationStage);

    res.json({ account: updated, step: nextStep, advanced: true });
  },
);

// ---------------------------------------------------------------------------
// POST /collections/accounts/:id/promise — record promise-to-pay
// ---------------------------------------------------------------------------
router.post(
  "/accounts/:id/promise",
  requireSession,
  async (req, res) => {
    const { orgId } = getSession(req);
    const accountId = req.params["id"] as string;
    const { amount, promisedDate, notes } = req.body as {
      amount?: number;
      promisedDate?: string;
      notes?: string;
    };

    if (amount === undefined || amount === null || !promisedDate) {
      res.status(400).json({ error: "amount and promisedDate are required" });
      return;
    }

    const account = await getAccount(accountId, orgId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const [promise] = await db
      .insert(promisesToPayTable)
      .values({
        orgId,
        accountId,
        amount: String(amount),
        promisedDate: new Date(promisedDate),
        notes: notes ?? null,
        status: "open",
      })
      .returning();

    // Update account status to "promised" to suppress dunning display
    await db
      .update(collectionAccountsTable)
      .set({ status: "promised" })
      .where(eq(collectionAccountsTable.id, accountId));

    // Recompute risk score — new promise reduces immediate risk temporarily
    await recomputeRiskScore(accountId, orgId, account.linkedClientId, account.escalationStage);

    res.status(201).json({ promise });
  },
);

// ---------------------------------------------------------------------------
// PATCH /collections/promises/:id — update promise status
// ---------------------------------------------------------------------------
router.patch("/promises/:id", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const promiseId = req.params["id"] as string;
  const { status } = req.body as { status?: string };

  const validStatuses = ["open", "kept", "broken", "cancelled"] as const;
  if (!status || !validStatuses.includes(status as typeof validStatuses[number])) {
    res.status(400).json({
      error: `status must be one of: ${validStatuses.join(", ")}`,
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(promisesToPayTable)
    .where(
      and(
        eq(promisesToPayTable.id, promiseId),
        eq(promisesToPayTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Promise not found" }); return; }

  const [updated] = await db
    .update(promisesToPayTable)
    .set({ status: status as "open" | "kept" | "broken" | "cancelled" })
    .where(eq(promisesToPayTable.id, promiseId))
    .returning();

  // If the promise is now resolved (kept/broken/cancelled), revert account status
  // back to in_collections unless another open promise exists
  if (status !== "open") {
    const [anotherOpen] = await db
      .select()
      .from(promisesToPayTable)
      .where(
        and(
          eq(promisesToPayTable.accountId, existing.accountId),
          eq(promisesToPayTable.orgId, orgId),
          eq(promisesToPayTable.status, "open"),
        ),
      )
      .limit(1);

    if (!anotherOpen) {
      await db
        .update(collectionAccountsTable)
        .set({ status: "in_collections" })
        .where(
          and(
            eq(collectionAccountsTable.id, existing.accountId),
            eq(collectionAccountsTable.orgId, orgId),
            eq(collectionAccountsTable.status, "promised"),
          ),
        );
    }
  }

  // Recompute risk score — broken promise increases risk
  if (status === "broken" || status === "cancelled") {
    const [acctForRisk] = await db
      .select()
      .from(collectionAccountsTable)
      .where(
        and(
          eq(collectionAccountsTable.id, existing.accountId),
          eq(collectionAccountsTable.orgId, orgId),
        ),
      )
      .limit(1);
    if (acctForRisk) {
      await recomputeRiskScore(
        acctForRisk.id,
        orgId,
        acctForRisk.linkedClientId,
        acctForRisk.escalationStage,
      );
    }
  }

  res.json({ promise: updated });
});

// ---------------------------------------------------------------------------
// POST /collections/accounts/:id/plan — create payment plan with installments
// ---------------------------------------------------------------------------
router.post(
  "/accounts/:id/plan",
  requireSession,
  async (req, res) => {
    const { orgId } = getSession(req);
    const accountId = req.params["id"] as string;
    const { totalAmount, installments } = req.body as {
      totalAmount?: number;
      installments?: Array<{ dueDate: string; amount: number }>;
    };

    if (!totalAmount || !installments || !Array.isArray(installments) || installments.length === 0) {
      res.status(400).json({ error: "totalAmount and installments[] are required" });
      return;
    }

    const account = await getAccount(accountId, orgId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const [plan] = await db
      .insert(paymentPlansTable)
      .values({
        orgId,
        accountId,
        totalAmount: String(totalAmount),
        status: "active",
      })
      .returning();

    const insertedInstallments = await db
      .insert(paymentPlanInstallmentsTable)
      .values(
        installments.map((inst) => ({
          orgId,
          planId: plan.id,
          dueDate: new Date(inst.dueDate),
          amount: String(inst.amount),
          paid: false,
        })),
      )
      .returning();

    // Update account status
    await db
      .update(collectionAccountsTable)
      .set({ status: "payment_plan" })
      .where(eq(collectionAccountsTable.id, accountId));

    res.status(201).json({ plan: { ...plan, installments: insertedInstallments } });
  },
);

// ---------------------------------------------------------------------------
// PATCH /collections/plans/:id/installments/:iid — mark installment paid
// ---------------------------------------------------------------------------
router.patch(
  "/plans/:id/installments/:iid",
  requireSession,
  async (req, res) => {
    const { orgId } = getSession(req);
    const planId = req.params["id"] as string;
    const installmentId = req.params["iid"] as string;
    const { paid, paidDate } = req.body as { paid?: boolean; paidDate?: string };

    if (paid === undefined) {
      res.status(400).json({ error: "paid (boolean) is required" });
      return;
    }

    const [plan] = await db
      .select()
      .from(paymentPlansTable)
      .where(
        and(
          eq(paymentPlansTable.id, planId),
          eq(paymentPlansTable.orgId, orgId),
        ),
      )
      .limit(1);

    if (!plan) { res.status(404).json({ error: "Payment plan not found" }); return; }

    const [installment] = await db
      .select()
      .from(paymentPlanInstallmentsTable)
      .where(
        and(
          eq(paymentPlanInstallmentsTable.id, installmentId),
          eq(paymentPlanInstallmentsTable.planId, planId),
          eq(paymentPlanInstallmentsTable.orgId, orgId),
        ),
      )
      .limit(1);

    if (!installment) { res.status(404).json({ error: "Installment not found" }); return; }

    const [updated] = await db
      .update(paymentPlanInstallmentsTable)
      .set({
        paid,
        paidDate: paid && paidDate ? new Date(paidDate) : paid ? new Date() : null,
      })
      .where(eq(paymentPlanInstallmentsTable.id, installmentId))
      .returning();

    // Check if all installments are now paid → mark plan completed
    const remaining = await db
      .select()
      .from(paymentPlanInstallmentsTable)
      .where(
        and(
          eq(paymentPlanInstallmentsTable.planId, planId),
          eq(paymentPlanInstallmentsTable.paid, false),
        ),
      );

    if (remaining.length === 0) {
      await db
        .update(paymentPlansTable)
        .set({ status: "completed" as "active" | "completed" | "defaulted" | "cancelled" })
        .where(eq(paymentPlansTable.id, planId));
    }

    res.json({ installment: updated });
  },
);

// ---------------------------------------------------------------------------
// POST /collections/accounts/:id/escalate — advance escalation stage
// ---------------------------------------------------------------------------
router.post(
  "/accounts/:id/escalate",
  requireSession,
  async (req, res) => {
    const { orgId } = getSession(req);
    const accountId = req.params["id"] as string;
    const { escalationStage } = req.body as { escalationStage?: string };

    const validStages = ESCALATION_LADDER;
    if (!escalationStage || !validStages.includes(escalationStage as typeof validStages[number])) {
      res.status(400).json({
        error: `escalationStage must be one of: ${validStages.join(", ")}`,
      });
      return;
    }

    const account = await getAccount(accountId, orgId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const currentIdx = ESCALATION_LADDER.indexOf(
      account.escalationStage as typeof validStages[number],
    );
    const newIdx = ESCALATION_LADDER.indexOf(
      escalationStage as typeof validStages[number],
    );

    if (newIdx <= currentIdx) {
      res.status(409).json({
        error: `Cannot de-escalate: current stage is ${account.escalationStage}. Choose a later stage.`,
        currentStage: account.escalationStage,
      });
      return;
    }

    const [updated] = await db
      .update(collectionAccountsTable)
      .set({ escalationStage: escalationStage as typeof validStages[number] })
      .where(eq(collectionAccountsTable.id, accountId))
      .returning();

    // Recompute risk score — higher escalation stage increases risk
    await recomputeRiskScore(accountId, orgId, account.linkedClientId, escalationStage);

    res.json({ account: updated });
  },
);

// ---------------------------------------------------------------------------
// POST /collections/accounts/:id/write-off — admin-only write-off
// Moves the account to written_off status and write_off escalation stage.
// ---------------------------------------------------------------------------
router.post(
  "/accounts/:id/write-off",
  requireSession,
  async (req, res) => {
    const { orgId, role } = getSession(req);
    if (role !== "admin") {
      res.status(403).json({ error: "Admin role required" });
      return;
    }

    const accountId = req.params["id"] as string;
    const account = await getAccount(accountId, orgId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const [updated] = await db
      .update(collectionAccountsTable)
      .set({ status: "written_off", escalationStage: "write_off" })
      .where(eq(collectionAccountsTable.id, accountId))
      .returning();

    res.json({ account: updated });
  },
);

// ---------------------------------------------------------------------------
// GET /collections/sequences — list dunning sequences
// ---------------------------------------------------------------------------
router.get("/sequences", requireSession, async (req, res) => {
  const { orgId } = getSession(req);

  const sequences = await db
    .select()
    .from(dunningSequencesTable)
    .where(eq(dunningSequencesTable.orgId, orgId));

  const seqIds = sequences.map((s) => s.id);
  const steps =
    seqIds.length > 0
      ? await db
          .select()
          .from(dunningStepsTable)
          .where(inArray(dunningStepsTable.sequenceId, seqIds))
          .orderBy(asc(dunningStepsTable.order))
      : ([] as (typeof dunningStepsTable.$inferSelect)[]);

  const result = sequences.map((seq) => ({
    ...seq,
    steps: steps.filter((s) => s.sequenceId === seq.id),
  }));

  res.json({ sequences: result });
});

// ---------------------------------------------------------------------------
// POST /collections/sequences — create dunning sequence (admin)
// ---------------------------------------------------------------------------
router.post(
  "/sequences",
  requireSession,
  async (req, res) => {
    const { orgId, role } = getSession(req);
    if (role !== "admin") {
      res.status(403).json({ error: "Admin role required" });
      return;
    }
    const { name, steps } = req.body as {
      name?: string;
      steps?: Array<{ stepType: string; daysOverdue: number; order: number }>;
    };

    if (!name || !steps || !Array.isArray(steps)) {
      res.status(400).json({ error: "name and steps[] are required" });
      return;
    }

    const [seq] = await db
      .insert(dunningSequencesTable)
      .values({ orgId, name, active: true })
      .returning();

    const insertedSteps =
      steps.length > 0
        ? await db
            .insert(dunningStepsTable)
            .values(
              steps.map((s) => ({
                orgId,
                sequenceId: seq.id,
                stepType: s.stepType as "reminder" | "statement" | "call" | "final_demand",
                daysOverdue: s.daysOverdue,
                order: s.order,
              })),
            )
            .returning()
        : [];

    res.status(201).json({ sequence: { ...seq, steps: insertedSteps } });
  },
);

export default router;
