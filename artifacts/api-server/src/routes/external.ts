import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  departmentsTable,
  systemTypesTable,
  subSystemTypesTable,
  stageTriggerConfigsTable,
  holdsTable,
  lienProjectsTable,
  lienScheduleOfValuesTable,
  lienFilingsTable,
  workMonthsTable,
  noticesTable,
  linkedClientsTable,
  collectionAccountsTable,
  invoiceLinksTable,
} from "@workspace/db";
import { eq, isNull, and, inArray, not } from "drizzle-orm";
import { requireServiceKey } from "../lib/serviceKey";

const router: IRouter = Router();

/**
 * GET /external/reference
 *
 * Returns the full reference tree (Dept → SystemType → SubSystemType)
 * plus stage-trigger configs for all orgs (Helm Core doesn't scope by org —
 * it reads a combined catalogue). Service-key authenticated.
 *
 * Phase 0: returns fixture/seeded data. Full implementation in Phase 1.
 */
router.get("/external/reference", requireServiceKey, async (_req, res) => {
  try {
    const [departments, systemTypes, subSystemTypes, stageTriggers] = await Promise.all([
      db.select().from(departmentsTable),
      db.select().from(systemTypesTable),
      db.select().from(subSystemTypesTable),
      db.select().from(stageTriggerConfigsTable),
    ]);

    const tree = departments.map((dept) => ({
      ...dept,
      systemTypes: systemTypes
        .filter((st) => st.departmentId === dept.id)
        .map((st) => ({
          ...st,
          subSystemTypes: subSystemTypes.filter((sst) => sst.systemTypeId === st.id),
        })),
    }));

    res.json({
      departments: tree,
      stageTriggers,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load reference data" });
  }
});

/**
 * GET /external/holds
 *
 * Returns all active (not cleared) holds for Helm Core to consume.
 * Used to block scheduling and material orders. Service-key authenticated.
 *
 * Phase 0: returns seeded holds. Hold computation engine built in Phase 3.
 */
router.get("/external/holds", requireServiceKey, async (_req, res) => {
  try {
    const activeHolds = await db
      .select({
        id: holdsTable.id,
        orgId: holdsTable.orgId,
        holdType: holdsTable.holdType,
        lienProjectId: holdsTable.lienProjectId,
        linkedClientId: holdsTable.linkedClientId,
        supplierInvoiceId: holdsTable.supplierInvoiceId,
        reason: holdsTable.reason,
        setAt: holdsTable.setAt,
        createdAt: holdsTable.createdAt,
        projectName: lienProjectsTable.cachedProjectName,
        clientName: linkedClientsTable.cachedName,
        hubspotProjectId: lienProjectsTable.hubspotProjectId,
        hubspotCompanyId: linkedClientsTable.hubspotCompanyId,
        // Vendor bill reference Helm Core blocks payment on (bill-based hold).
        supplierBillRef: invoiceLinksTable.qboSupplierInvoiceId,
        supplierBillAmount: invoiceLinksTable.amount,
        supplierBillDueDate: invoiceLinksTable.dueDate,
      })
      .from(holdsTable)
      .leftJoin(lienProjectsTable, eq(holdsTable.lienProjectId, lienProjectsTable.id))
      .leftJoin(linkedClientsTable, eq(holdsTable.linkedClientId, linkedClientsTable.id))
      .leftJoin(invoiceLinksTable, eq(holdsTable.supplierInvoiceId, invoiceLinksTable.id))
      .where(isNull(holdsTable.clearedAt));

    res.json({ holds: activeHolds });
  } catch (err) {
    res.status(500).json({ error: "Failed to load holds" });
  }
});

/**
 * GET /external/exposure
 *
 * Returns lien exposure + collections status for Helm Core cross-app dashboards.
 * Service-key authenticated (Phase 6).
 */
router.get("/external/exposure", requireServiceKey, async (_req, res) => {
  try {
    const openStatuses = ["open", "at_risk", "notice_active", "filing", "filed"] as const;

    const streams = await db
      .select()
      .from(lienScheduleOfValuesTable)
      .where(inArray(lienScheduleOfValuesTable.status, [...openStatuses]));

    if (streams.length === 0) {
      res.json({
        openStreamCount: 0, openProjectCount: 0, totalGrossExposure: 0,
        filedLienCount: 0, collectionsAccountsInCollections: 0, collectionsOverdueTotal: 0,
        streams: [],
      });
      return;
    }

    const streamIds = streams.map((s) => s.id);
    const projectIds = [...new Set(streams.map((s) => s.lienProjectId))];

    const [projects, workMonths, notices, filings, collectionAccounts] = await Promise.all([
      db.select().from(lienProjectsTable).where(inArray(lienProjectsTable.id, projectIds)),
      db.select().from(workMonthsTable).where(inArray(workMonthsTable.lienScheduleOfValuesId, streamIds)),
      db.select().from(noticesTable).where(inArray(noticesTable.lienScheduleOfValuesId, streamIds)),
      db.select().from(lienFilingsTable).where(inArray(lienFilingsTable.lienScheduleOfValuesId, streamIds)),
      db.select().from(collectionAccountsTable),
    ]);

    const totalGrossExposure = streams.reduce((sum, stream) => {
      const overdueMonths = workMonths.filter(
        (wm) => wm.lienScheduleOfValuesId === stream.id && wm.derivedOverdue && !wm.clearedFlag,
      );
      const streamNotices = notices.filter((n) => n.lienScheduleOfValuesId === stream.id);
      return sum + overdueMonths.reduce((s2, wm) => {
        const n = streamNotices.find((x) => x.workMonthId === wm.id);
        return s2 + (n ? Number(n.claimAmount) : 0);
      }, 0);
    }, 0);

    const filedCount = filings.filter((f) => f.status === "filed" || f.status === "post_filing_notice_sent").length;
    const inCollections = collectionAccounts.filter((a) => a.status === "in_collections").length;
    const totalOverdue = collectionAccounts.reduce((sum, a) => sum + Number(a.totalOverdue ?? 0), 0);

    res.json({
      openStreamCount: streams.length,
      openProjectCount: projectIds.length,
      totalGrossExposure,
      filedLienCount: filedCount,
      collectionsAccountsInCollections: inCollections,
      collectionsOverdueTotal: totalOverdue,
      streams: streams.map((s) => {
        const project = projects.find((p) => p.id === s.lienProjectId);
        const filing = filings.find((f) => f.lienScheduleOfValuesId === s.id);
        return {
          streamId: s.id,
          projectId: s.lienProjectId,
          hubspotProjectId: project?.hubspotProjectId ?? null,
          workStream: s.workStream,
          status: s.status,
          filing: filing
            ? { status: filing.status, enforcementDeadline: filing.enforcementDeadline }
            : null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load exposure data" });
  }
});

export default router;
