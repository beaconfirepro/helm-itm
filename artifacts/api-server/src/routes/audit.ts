/**
 * audit.ts — read access to the append-only audit trail (D3).
 *
 * GET /audit  (admin) — filter by entityType, entityId, action, actorUserId,
 * and a created-at window; newest first. There are intentionally no
 * write/update/delete routes — entries are written only by lib/audit.ts as a
 * side effect of the actions they document.
 */

import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { and, eq, gte, lte, desc, type SQL } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { requireAdmin } from "../lib/admin";

const router = Router();

router.get("/audit", requireSession, requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const { entityType, entityId, action, actorUserId, from, to, limit } =
    req.query as Record<string, string | undefined>;

  const conditions: SQL[] = [eq(auditLogsTable.orgId, orgId)];
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
  if (entityId) conditions.push(eq(auditLogsTable.entityId, entityId));
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (actorUserId) conditions.push(eq(auditLogsTable.actorUserId, actorUserId));
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) conditions.push(gte(auditLogsTable.createdAt, d));
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) conditions.push(lte(auditLogsTable.createdAt, d));
  }

  // Bounded page size (default 100, max 500) to keep responses sane.
  const parsedLimit = Number(limit);
  const take =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;

  const entries = await db
    .select()
    .from(auditLogsTable)
    .where(and(...conditions))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(take);

  res.json({ entries });
});

export default router;
