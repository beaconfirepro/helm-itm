/**
 * holds.ts — Schedule Hold / Material Hold management.
 *
 * POST /holds/recompute   recompute all holds for the org
 * GET  /holds             list holds (filterable by type, project, client)
 *
 * GET /external/holds is handled in external.ts (service-key auth).
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  holdsTable,
  lienProjectsTable,
  linkedClientsTable,
  invoiceLinksTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { recomputeHolds } from "../lib/holdEngine";

const router = Router();
router.use(requireSession);

/**
 * POST /holds/recompute
 *
 * Recomputes all Schedule/Material holds for the org.
 * Idempotent — safe to call any time; opens new holds and clears stale ones.
 */
router.post("/holds/recompute", async (req, res) => {
  const { orgId } = getSession(req);
  try {
    const result = await recomputeHolds(orgId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: "Hold recomputation failed" });
  }
});

/**
 * POST /holds/:id/clear
 *
 * Manually clears an active hold — stamps clearedAt so it drops out of the
 * active list. Idempotent-ish: clearing an already-cleared hold is a 409.
 */
router.post("/holds/:id/clear", async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [hold] = await db
    .select()
    .from(holdsTable)
    .where(and(eq(holdsTable.id, id), eq(holdsTable.orgId, orgId)))
    .limit(1);

  if (!hold) {
    return res.status(404).json({ error: "Hold not found" });
  }
  if (hold.clearedAt) {
    return res.status(409).json({ error: "Hold is already cleared" });
  }

  const [updated] = await db
    .update(holdsTable)
    .set({ clearedAt: new Date() })
    .where(and(eq(holdsTable.id, id), eq(holdsTable.orgId, orgId)))
    .returning();

  return res.json({ hold: updated });
});

/**
 * GET /holds?type=schedule_hold|material_hold&projectId=&clientId=&includeCleared=true
 */
router.get("/holds", async (req, res) => {
  const { orgId } = getSession(req);
  const { type, projectId, clientId, includeCleared } = req.query as {
    type?: string;
    projectId?: string;
    clientId?: string;
    includeCleared?: string;
  };

  const conditions = [eq(holdsTable.orgId, orgId)];

  if (type === "schedule_hold" || type === "material_hold") {
    conditions.push(eq(holdsTable.holdType, type));
  }
  if (projectId) {
    conditions.push(eq(holdsTable.lienProjectId, projectId));
  }
  if (clientId) {
    conditions.push(eq(holdsTable.linkedClientId, clientId));
  }
  if (includeCleared !== "true") {
    conditions.push(isNull(holdsTable.clearedAt));
  }

  const holds = await db
    .select({
      id: holdsTable.id,
      orgId: holdsTable.orgId,
      holdType: holdsTable.holdType,
      lienProjectId: holdsTable.lienProjectId,
      linkedClientId: holdsTable.linkedClientId,
      supplierInvoiceId: holdsTable.supplierInvoiceId,
      reason: holdsTable.reason,
      setAt: holdsTable.setAt,
      clearedAt: holdsTable.clearedAt,
      createdAt: holdsTable.createdAt,
      projectName: lienProjectsTable.cachedProjectName,
      hubspotProjectId: lienProjectsTable.hubspotProjectId,
      clientName: linkedClientsTable.cachedName,
      hubspotCompanyId: linkedClientsTable.hubspotCompanyId,
      // Vendor bill the hold withholds payment on (bill-based connection).
      supplierBillRef: invoiceLinksTable.qboSupplierInvoiceId,
      supplierBillAmount: invoiceLinksTable.amount,
      supplierBillDueDate: invoiceLinksTable.dueDate,
    })
    .from(holdsTable)
    .leftJoin(lienProjectsTable, eq(holdsTable.lienProjectId, lienProjectsTable.id))
    .leftJoin(linkedClientsTable, eq(holdsTable.linkedClientId, linkedClientsTable.id))
    .leftJoin(invoiceLinksTable, eq(holdsTable.supplierInvoiceId, invoiceLinksTable.id))
    .where(and(...conditions));

  return res.json({ holds });
});

export default router;
