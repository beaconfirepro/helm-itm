/**
 * streams.ts — routes for LienStream management and deadline recomputation.
 *
 * POST   /streams/open              open a new stream
 * PATCH  /streams/:id/status        update stream status (state-machine gated)
 * GET    /streams/:id/work-months   list derived work months + deadlines
 * POST   /streams/:id/recompute     re-derive work months from timesheets + QBO,
 *                                   recompute ALL deadlines for every work month
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  lienScheduleOfValuesTable,
  lienProjectsTable,
  workMonthsTable,
  lienDeadlinesTable,
  lienRulesTable,
  lienRuleSetsTable,
  timesheetLinksTable,
  invoiceLinksTable,
  lienFilingsTable,
  noticesTable,
  noticeRecipientsTable,
  mailingRecordsTable,
  waiversTable,
} from "@workspace/db";
import { eq, and, lt, inArray } from "drizzle-orm";
import { connecteamSyncClient } from "../lib/clients/connecteam";
import { qboSyncClient } from "../lib/clients/qbo";
import { requireSession, getSession } from "../lib/session";
import { computeDeadline } from "../lib/deadlineEngine";
import { randomUUID } from "crypto";

const router = Router();
router.use(requireSession);

// ---------------------------------------------------------------------------
// Stream status state machine
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  open:           ["at_risk", "closed"],
  at_risk:        ["notice_active", "open", "closed"],
  notice_active:  ["filing", "at_risk", "released"],
  filing:         ["filed"],
  filed:          ["released", "lapsed"],
  released:       ["closed"],
  lapsed:         [],
  closed:         [],
};

// ---------------------------------------------------------------------------
// POST /streams/open
// ---------------------------------------------------------------------------

router.post("/streams/open", async (req, res) => {
  const { orgId } = getSession(req);
  const { lienProjectId, workStream } = req.body as {
    lienProjectId?: string;
    workStream?: string;
  };

  if (!lienProjectId || !workStream) {
    return res.status(400).json({ error: "lienProjectId and workStream are required" });
  }
  if (!["construction", "design"].includes(workStream)) {
    return res.status(400).json({ error: "workStream must be construction or design" });
  }

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, lienProjectId), eq(lienProjectsTable.orgId, orgId)));

  if (!project) return res.status(404).json({ error: "Project not found" });

  const existing = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        eq(lienScheduleOfValuesTable.lienProjectId, lienProjectId),
        eq(lienScheduleOfValuesTable.workStream, workStream as "construction" | "design"),
        eq(lienScheduleOfValuesTable.orgId, orgId),
      ),
    );

  if (existing.length > 0) {
    return res.status(409).json({
      error: `A ${workStream} stream already exists for this project`,
    });
  }

  const [sov] = await db
    .insert(lienScheduleOfValuesTable)
    .values({
      id: randomUUID(),
      orgId,
      lienProjectId,
      workStream: workStream as "construction" | "design",
      status: "open",
      openedAt: new Date(),
    })
    .returning();

  return res.status(201).json({ sov });
});

// ---------------------------------------------------------------------------
// PATCH /streams/:id/status
// ---------------------------------------------------------------------------

router.patch("/streams/:id/status", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!status) return res.status(400).json({ error: "status is required" });

  const [sov] = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.id, id), eq(lienScheduleOfValuesTable.orgId, orgId)));

  if (!sov) return res.status(404).json({ error: "Stream not found" });

  const allowed = VALID_TRANSITIONS[sov.status] ?? [];
  if (!allowed.includes(status)) {
    return res.status(409).json({
      error: `Cannot transition stream from ${sov.status} to ${status}`,
      allowedTransitions: allowed,
    });
  }

  const [updated] = await db
    .update(lienScheduleOfValuesTable)
    .set({ status: status as typeof sov.status, updatedAt: new Date() })
    .where(eq(lienScheduleOfValuesTable.id, id))
    .returning();

  return res.json({ sov: updated });
});

// ---------------------------------------------------------------------------
// GET /streams/:id
// Stream detail: stream record + project stub + work months (with deadlines)
// + notice list (with recipients & mailing) + waiver checklist
// ---------------------------------------------------------------------------

router.get("/streams/:id", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  const [sov] = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.id, id), eq(lienScheduleOfValuesTable.orgId, orgId)));

  if (!sov) return res.status(404).json({ error: "Stream not found" });

  // Load project, work months, notices, waivers, and filing in parallel
  const [projectRows, workMonths, notices, waivers, filingRows] = await Promise.all([
    db
      .select({
        id: lienProjectsTable.id,
        cachedProjectName: lienProjectsTable.cachedProjectName,
        lienWorkflowType: lienProjectsTable.lienWorkflowType,
        contractorTier: lienProjectsTable.contractorTier,
        legalPropertyAddress: lienProjectsTable.legalPropertyAddress,
        county: lienProjectsTable.county,
      })
      .from(lienProjectsTable)
      .where(and(eq(lienProjectsTable.id, sov.lienProjectId), eq(lienProjectsTable.orgId, orgId)))
      .limit(1),
    db
      .select()
      .from(workMonthsTable)
      .where(and(eq(workMonthsTable.lienScheduleOfValuesId, id), eq(workMonthsTable.orgId, orgId))),
    db
      .select()
      .from(noticesTable)
      .where(and(eq(noticesTable.lienScheduleOfValuesId, id), eq(noticesTable.orgId, orgId))),
    db
      .select()
      .from(waiversTable)
      .where(
        and(
          eq(waiversTable.lienProjectId, sov.lienProjectId),
          eq(waiversTable.workStream, sov.workStream),
          eq(waiversTable.orgId, orgId),
        ),
      ),
    db
      .select()
      .from(lienFilingsTable)
      .where(and(eq(lienFilingsTable.lienScheduleOfValuesId, id), eq(lienFilingsTable.orgId, orgId)))
      .limit(1),
  ]);

  const project = projectRows[0] ?? null;
  const filing = filingRows[0] ?? null;

  // Enrich work months with deadlines
  const workMonthIds = workMonths.map((wm) => wm.id);
  const allDeadlines =
    workMonthIds.length > 0
      ? await db
          .select()
          .from(lienDeadlinesTable)
          .where(
            and(inArray(lienDeadlinesTable.workMonthId, workMonthIds), eq(lienDeadlinesTable.orgId, orgId)),
          )
      : [];

  const ruleIds = [...new Set(allDeadlines.map((d) => d.ruleId))];
  const ruleRows =
    ruleIds.length > 0
      ? await db
          .select({
            id: lienRulesTable.id,
            ruleKind: lienRulesTable.ruleKind,
            statuteCitation: lienRulesTable.statuteCitation,
            description: lienRulesTable.description,
          })
          .from(lienRulesTable)
          .where(inArray(lienRulesTable.id, ruleIds))
      : [];
  const ruleMap = new Map(ruleRows.map((r) => [r.id, r]));

  const workMonthsEnriched = workMonths
    .map((wm) => ({
      ...wm,
      deadlines: allDeadlines
        .filter((d) => d.workMonthId === wm.id)
        .map((d) => ({ ...d, rule: ruleMap.get(d.ruleId) ?? null }))
        .sort((a, b) => new Date(a.adjustedDate).getTime() - new Date(b.adjustedDate).getTime()),
    }))
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

  // Enrich notices with recipients and mailing records
  const noticeIds = notices.map((n) => n.id);
  const [recipients, mailingRecords] =
    noticeIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(noticeRecipientsTable)
            .where(
              and(inArray(noticeRecipientsTable.noticeId, noticeIds), eq(noticeRecipientsTable.orgId, orgId)),
            ),
          db
            .select()
            .from(mailingRecordsTable)
            .where(
              and(inArray(mailingRecordsTable.noticeId, noticeIds), eq(mailingRecordsTable.orgId, orgId)),
            ),
        ])
      : [[], []];

  const noticesEnriched = notices
    .map((n) => ({
      ...n,
      recipients: recipients.filter((r) => r.noticeId === n.id),
      mailing: mailingRecords.find((m) => m.noticeId === n.id) ?? null,
    }))
    .sort((a, b) => new Date(a.monthListed).getTime() - new Date(b.monthListed).getTime());

  // Waiver checklist: group by type with completion state
  const waiverTypes = ["conditional_progress", "unconditional_progress", "conditional_final", "unconditional_final"] as const;
  const waiverChecklist = waiverTypes.map((waiverType) => {
    const existing = waivers.filter((w) => w.waiverType === waiverType);
    return {
      waiverType,
      count: existing.length,
      allApproved: existing.length > 0 && existing.every((w) => w.approvalStatus === "approved"),
      allProvidedToGc: existing.length > 0 && existing.every((w) => w.providedToGc),
      waivers: existing,
    };
  });

  // Summarize next upcoming deadline (not yet satisfied)
  const nextDeadline = workMonthsEnriched
    .flatMap((wm) => wm.deadlines)
    .filter((d) => !d.satisfiedAt && new Date(d.adjustedDate) > new Date())
    .sort((a, b) => new Date(a.adjustedDate).getTime() - new Date(b.adjustedDate).getTime())[0] ?? null;

  return res.json({
    sov,
    project,
    workMonths: workMonthsEnriched,
    notices: noticesEnriched,
    waiverChecklist,
    filing,
    nextDeadline,
    summary: {
      workMonthCount: workMonths.length,
      overdueMonths: workMonths.filter((wm) => wm.derivedOverdue && !wm.clearedFlag).length,
      noticeCount: notices.length,
      sentNotices: notices.filter((n) => n.status === "sent" || n.status === "delivered").length,
      totalDeadlines: allDeadlines.length,
      unsatisfiedDeadlines: allDeadlines.filter((d) => !d.satisfiedAt).length,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /streams/:id/work-months
// ---------------------------------------------------------------------------

router.get("/streams/:id/work-months", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  const [stream] = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.id, id), eq(lienScheduleOfValuesTable.orgId, orgId)));

  if (!stream) return res.status(404).json({ error: "Stream not found" });

  const workMonths = await db
    .select()
    .from(workMonthsTable)
    .where(and(eq(workMonthsTable.lienScheduleOfValuesId, id), eq(workMonthsTable.orgId, orgId)));

  // Batch-load all rule metadata so each deadline carries statute citation + description
  const allDeadlineRows = (
    await Promise.all(
      workMonths.map((wm) =>
        db
          .select()
          .from(lienDeadlinesTable)
          .where(and(eq(lienDeadlinesTable.workMonthId, wm.id), eq(lienDeadlinesTable.orgId, orgId))),
      ),
    )
  ).flat();

  const ruleIds = [...new Set(allDeadlineRows.map((d) => d.ruleId))];
  const ruleRows =
    ruleIds.length > 0
      ? await db
          .select({
            id: lienRulesTable.id,
            statuteCitation: lienRulesTable.statuteCitation,
            description: lienRulesTable.description,
            ruleKind: lienRulesTable.ruleKind,
          })
          .from(lienRulesTable)
          .where(inArray(lienRulesTable.id, ruleIds))
      : [];
  const ruleMap = new Map(ruleRows.map((r) => [r.id, r]));

  const enriched = workMonths.map((wm) => ({
    ...wm,
    deadlines: allDeadlineRows
      .filter((d) => d.workMonthId === wm.id)
      .map((d) => ({ ...d, rule: ruleMap.get(d.ruleId) ?? null })),
  }));

  return res.json({ stream, workMonths: enriched });
});

// ---------------------------------------------------------------------------
// POST /streams/:id/recompute
//
// Derives work months from Connecteam timesheets, cross-references QBO
// invoices on a per-month basis to determine overdue/cleared state, then
// recomputes ALL deadlines for every derived work month (not gated on
// overdue state — coordinators need to see all statutory dates).
// ---------------------------------------------------------------------------

router.post("/streams/:id/recompute", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  const [stream] = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.id, id), eq(lienScheduleOfValuesTable.orgId, orgId)));

  if (!stream) return res.status(404).json({ error: "Stream not found" });

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, stream.lienProjectId), eq(lienProjectsTable.orgId, orgId)),
    );

  if (!project) return res.status(404).json({ error: "Project not found" });

  const now = new Date();

  // ------------------------------------------------------------------
  // Step 0: Sync from external sources (graceful skip when unconfigured)
  //
  // ConnecteamSyncClient and QboSyncClient write into timesheet_links /
  // invoice_links respectively, then Steps 1-3 read from those tables.
  // In dev (no credentials set), they log a warning and skip; the seed
  // data in the link tables is used instead.
  // ------------------------------------------------------------------

  const [connecteamResult, qboResult] = await Promise.all([
    connecteamSyncClient.syncTimesheetsForProject({
      orgId,
      lienProjectId: project.id,
      hubspotProjectId: project.hubspotProjectId,
    }),
    qboSyncClient.syncInvoicesForProject({
      orgId,
      lienProjectId: project.id,
      hubspotProjectId: project.hubspotProjectId,
    }),
  ]);

  // ------------------------------------------------------------------
  // Step 1: Load timesheets and group by YYYY-MM, tracking record IDs
  // ------------------------------------------------------------------

  const timesheets = await db
    .select()
    .from(timesheetLinksTable)
    .where(
      and(
        eq(timesheetLinksTable.lienProjectId, project.id),
        eq(timesheetLinksTable.workStream, stream.workStream),
        eq(timesheetLinksTable.orgId, orgId),
      ),
    );

  // monthKey → { firstDayOfMonth, timesheetIds[] }
  type MonthBucket = { date: Date; timesheetIds: string[] };
  const monthBuckets = new Map<string, MonthBucket>();

  for (const ts of timesheets) {
    const d = new Date(ts.workDate);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthBuckets.has(key)) {
      monthBuckets.set(key, {
        date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
        timesheetIds: [],
      });
    }
    monthBuckets.get(key)!.timesheetIds.push(ts.connecteamTimeRecordId);
  }

  // ------------------------------------------------------------------
  // Step 2: Load all non-supplier invoices for the project (once)
  // ------------------------------------------------------------------

  const allInvoices = await db
    .select()
    .from(invoiceLinksTable)
    .where(
      and(
        eq(invoiceLinksTable.lienProjectId, project.id),
        eq(invoiceLinksTable.isSupplierInvoice, false),
        eq(invoiceLinksTable.orgId, orgId),
      ),
    );

  // ------------------------------------------------------------------
  // Step 3: Upsert WorkMonth records with per-month invoice cross-check
  //
  // A work month is "derivedOverdue" if there is an invoice whose
  // invoiceDate falls in the same YYYY-MM and that invoice is past-due
  // and not coordinator-cleared. The primary invoice for the month is
  // linked for source-data traceability.
  // ------------------------------------------------------------------

  type WorkMonthResult = {
    wm: typeof workMonthsTable.$inferSelect;
    timesheetIds: string[];
  };
  const upsertedWorkMonths: WorkMonthResult[] = [];

  for (const [monthKey, { date: monthDate, timesheetIds }] of monthBuckets) {
    // Invoices whose invoiceDate falls in this work month
    const monthInvoices = allInvoices.filter((inv) => {
      const d = new Date(inv.invoiceDate);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return k === monthKey;
    });

    const overdueForMonth = monthInvoices.filter(
      (inv) => !inv.clearedFlag && new Date(inv.dueDate) < now,
    );

    const derivedOverdue = overdueForMonth.length > 0;
    const clearedFlag = monthInvoices.length > 0 && monthInvoices.every((inv) => inv.clearedFlag);
    const primaryInvoice = overdueForMonth[0] ?? null;

    // Upsert the WorkMonth record
    const existingWM = await db
      .select()
      .from(workMonthsTable)
      .where(
        and(
          eq(workMonthsTable.lienScheduleOfValuesId, id),
          eq(workMonthsTable.month, monthDate),
          eq(workMonthsTable.orgId, orgId),
        ),
      )
      .limit(1);

    let wm: typeof workMonthsTable.$inferSelect;

    if (existingWM.length > 0) {
      const [updated] = await db
        .update(workMonthsTable)
        .set({
          derivedOverdue,
          clearedFlag,
          invoiceLinkId: primaryInvoice?.id ?? null,
          updatedAt: now,
        })
        .where(eq(workMonthsTable.id, existingWM[0].id))
        .returning();
      wm = updated;
    } else {
      const [created] = await db
        .insert(workMonthsTable)
        .values({
          id: randomUUID(),
          orgId,
          lienScheduleOfValuesId: id,
          month: monthDate,
          derivedOverdue,
          clearedFlag,
          invoiceLinkId: primaryInvoice?.id ?? null,
        })
        .returning();
      wm = created;
    }

    upsertedWorkMonths.push({ wm, timesheetIds });
  }

  // ------------------------------------------------------------------
  // Step 4: Load lien rules for this project's jurisdiction + workflow type + stream
  // ------------------------------------------------------------------

  const ruleSets = await db
    .select()
    .from(lienRuleSetsTable)
    .where(
      and(
        eq(lienRuleSetsTable.jurisdictionId, project.jurisdictionId),
        eq(lienRuleSetsTable.orgId, orgId),
      ),
    );

  const filingRows = await db
    .select()
    .from(lienFilingsTable)
    .where(and(eq(lienFilingsTable.lienScheduleOfValuesId, id), eq(lienFilingsTable.orgId, orgId)))
    .limit(1);

  const filingDate = filingRows[0]?.filingDate ? new Date(filingRows[0].filingDate) : null;
  const completionDate = project.completionDate ? new Date(project.completionDate) : null;

  // ------------------------------------------------------------------
  // Step 5: Compute deadlines for ALL work months (no overdue gate)
  // Coordinators need statutory dates for every month with billable work,
  // regardless of current payment status.
  // ------------------------------------------------------------------

  const allDeadlines: (typeof lienDeadlinesTable.$inferSelect)[] = [];

  for (const { wm, timesheetIds } of upsertedWorkMonths) {
    const monthDate = new Date(wm.month);

    for (const rs of ruleSets) {
      const rules = await db
        .select()
        .from(lienRulesTable)
        .where(
          and(
            eq(lienRulesTable.ruleSetId, rs.id),
            eq(lienRulesTable.lienWorkflowType, project.lienWorkflowType),
            eq(lienRulesTable.workStream, stream.workStream),
            eq(lienRulesTable.orgId, orgId),
          ),
        );

      for (const rule of rules) {
        let computed;
        try {
          computed = computeDeadline({
            rule,
            workMonthDate: monthDate,
            completionDate,
            filingDate,
            invoiceLinkId: wm.invoiceLinkId,
            timesheetIds,
          });
        } catch (engineErr) {
          // Unsupported anchor or bad rule data — skip and log; do not abort
          // the entire recompute for a single bad rule
          console.error(`[deadline-engine] Skipping rule ${rule.id}:`, engineErr);
          continue;
        }
        if (!computed) continue; // anchor not yet available (e.g. no filing date yet)

        // Upsert: one LienDeadline per (workMonth × rule)
        const existingDl = await db
          .select()
          .from(lienDeadlinesTable)
          .where(
            and(
              eq(lienDeadlinesTable.workMonthId, wm.id),
              eq(lienDeadlinesTable.ruleId, rule.id),
              eq(lienDeadlinesTable.orgId, orgId),
            ),
          )
          .limit(1);

        let dl: typeof lienDeadlinesTable.$inferSelect;

        if (existingDl.length > 0) {
          // Preserve manual overrides — a user has pinned this deadline to a
          // specific date, so recompute must not overwrite it. Still refresh
          // the provenance snapshot so the source data stays current.
          if (existingDl[0].isOverridden) {
            const [updated] = await db
              .update(lienDeadlinesTable)
              .set({
                sourceData: computed.sourceData,
                updatedAt: now,
              })
              .where(eq(lienDeadlinesTable.id, existingDl[0].id))
              .returning();
            dl = updated;
            allDeadlines.push(dl);
            continue;
          }

          const [updated] = await db
            .update(lienDeadlinesTable)
            .set({
              computedDate: computed.computedDate,
              adjustedDate: computed.adjustedDate,
              sourceData: computed.sourceData,
              updatedAt: now,
            })
            .where(eq(lienDeadlinesTable.id, existingDl[0].id))
            .returning();
          dl = updated;
        } else {
          const [created] = await db
            .insert(lienDeadlinesTable)
            .values({
              id: randomUUID(),
              orgId,
              workMonthId: wm.id,
              ruleId: rule.id,
              ruleKind: rule.ruleKind,
              computedDate: computed.computedDate,
              adjustedDate: computed.adjustedDate,
              sourceData: computed.sourceData,
            })
            .returning();
          dl = created;
        }

        allDeadlines.push(dl);
      }
    }
  }

  return res.json({
    stream,
    workMonths: upsertedWorkMonths.map((r) => r.wm),
    deadlines: allDeadlines,
    summary: {
      workMonthsProcessed: upsertedWorkMonths.length,
      deadlinesComputed: allDeadlines.length,
    },
  });
});

export default router;
