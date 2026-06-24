/**
 * invoices.ts — coordinator invoice management routes.
 *
 * GET  /invoices               list invoices for the org (by project)
 * POST /invoices/sync          trigger QBO invoice sync for a project
 * POST /invoices/:id/clear     coordinator marks an invoice as cleared
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoiceLinksTable,
  collectionAccountsTable,
  lienProjectsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { recordAudit } from "../lib/audit";
import { qboSyncClient } from "../lib/clients/qbo";
import { computeAccountRiskMetrics } from "../lib/riskScore";

const router = Router();
router.use(requireSession);

/**
 * POST /invoices/sync
 *
 * Trigger a QBO invoice sync for a specific project. Accepts { projectId }
 * and calls qboSyncClient.syncInvoicesForProject. This decouples invoice sync
 * from the full stream recompute, so coordinators can pull fresh QBO data
 * without recomputing all deadlines.
 *
 * Returns { synced, skipped, reason? }.
 */
router.post("/invoices/sync", async (req, res) => {
  const { orgId } = getSession(req);
  const { projectId } = req.body as { projectId?: string };

  if (!projectId) {
    return res.status(400).json({ error: "projectId is required" });
  }

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, projectId), eq(lienProjectsTable.orgId, orgId)))
    .limit(1);

  if (!project) return res.status(404).json({ error: "Project not found" });

  const result = await qboSyncClient.syncInvoicesForProject({
    orgId,
    lienProjectId: project.id,
    hubspotProjectId: project.hubspotProjectId,
    linkedClientId: null,
  });

  return res.json(result);
});

/**
 * GET /invoices?projectId=
 */
router.get("/invoices", async (req, res) => {
  const { orgId } = getSession(req);
  const { projectId } = req.query as { projectId?: string };

  const conditions = [eq(invoiceLinksTable.orgId, orgId)];
  if (projectId) {
    conditions.push(eq(invoiceLinksTable.lienProjectId, projectId));
  }

  const invoices = await db
    .select()
    .from(invoiceLinksTable)
    .where(and(...conditions));

  return res.json({ invoices });
});

/**
 * POST /invoices/:id/clear
 *
 * Coordinator confirms an invoice is cleared (paid + received).
 * This is distinct from QBO status — QBO may say "open" while coordinator
 * has confirmed receipt, or vice versa.
 *
 * After clearing, the linked collection account's risk score is recomputed
 * so the call queue and dashboard reflect fresh overdue data.
 */
router.post("/invoices/:id/clear", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;
  const { clearedFlag } = req.body as { clearedFlag?: boolean };

  if (clearedFlag === undefined) {
    return res.status(400).json({ error: "clearedFlag is required" });
  }

  const [invoice] = await db
    .select()
    .from(invoiceLinksTable)
    .where(and(eq(invoiceLinksTable.id, id), eq(invoiceLinksTable.orgId, orgId)));

  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const userId = req.user?.id ?? null;
  const now = new Date();

  const [updated] = await db
    .update(invoiceLinksTable)
    .set({
      clearedFlag,
      clearedAt: clearedFlag ? now : null,
      clearedByUserId: clearedFlag ? userId : null,
      updatedAt: now,
    })
    .where(eq(invoiceLinksTable.id, id))
    .returning();

  // Recompute risk score for the linked collection account so overdue totals
  // and call-queue ordering reflect the cleared invoice immediately.
  if (invoice.linkedClientId) {
    const [account] = await db
      .select()
      .from(collectionAccountsTable)
      .where(
        and(
          eq(collectionAccountsTable.orgId, orgId),
          eq(collectionAccountsTable.linkedClientId, invoice.linkedClientId),
        ),
      )
      .limit(1);

    if (account) {
      await recomputeRiskScoreForAccount(account, orgId);
    }
  }

  const clearSession = getSession(req);
  await recordAudit({
    orgId,
    actor: { userId: clearSession.userId, role: clearSession.role },
    action: "invoice.clear",
    entityType: "invoice",
    entityId: id,
    summary: `Invoice marked ${clearedFlag ? "cleared" : "uncleared"} (amount ${invoice.amount})`,
    before: { clearedFlag: invoice.clearedFlag },
    after: { clearedFlag: updated.clearedFlag },
  });

  return res.json({ invoice: updated });
});

// ---------------------------------------------------------------------------
// Risk recomputation after a payment clear. The risk math itself lives in the
// shared computeAccountRiskMetrics module so this path can never drift from the
// account-detail recompute in collections.ts. This wrapper adds the
// clear-specific side effect of resolving an account back to "current" once
// every overdue invoice is cleared.
// ---------------------------------------------------------------------------
async function recomputeRiskScoreForAccount(
  account: typeof collectionAccountsTable.$inferSelect,
  orgId: string,
): Promise<void> {
  const { riskScore, oldestOverdueDays, totalOverdue, overdueCount } =
    await computeAccountRiskMetrics({
      accountId: account.id,
      orgId,
      linkedClientId: account.linkedClientId,
    });

  // If all invoices are now cleared → resolve account to "current"
  const newStatus =
    overdueCount === 0 && account.status !== "written_off"
      ? "current"
      : account.status;

  await db
    .update(collectionAccountsTable)
    .set({
      riskScore,
      oldestOverdueDays,
      totalOverdue: String(totalOverdue),
      status: newStatus as typeof account.status,
    })
    .where(
      and(
        eq(collectionAccountsTable.id, account.id),
        eq(collectionAccountsTable.orgId, orgId),
      ),
    );
}

export default router;
