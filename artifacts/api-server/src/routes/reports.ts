/**
 * reports.ts — Lien Reporting routes (Phase 6, Feature 22.9).
 *
 * GET  /reports/exposure          all projects with open lien exposure
 * GET  /reports/timeline/:projectId  full lien timeline (L43)
 * GET  /reports/lapsed            streams where statutory deadline missed (L44)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  lienFilingsTable,
  lienReleasesTable,
  lienScheduleOfValuesTable,
  lienProjectsTable,
  workMonthsTable,
  noticesTable,
  lienDeadlinesTable,
  waiversTable,
  mailingRecordsTable,
} from "@workspace/db";
import { eq, and, inArray, lt, isNull, not } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";

const router = Router();

// ---------------------------------------------------------------------------
// GET /reports/exposure — all projects with open lien exposure
// ---------------------------------------------------------------------------

router.get("/reports/exposure", requireSession, async (req, res) => {
  const { orgId } = getSession(req);

  const openStatuses = ["open", "at_risk", "notice_active", "filing", "filed"] as const;

  const sovs = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        eq(lienScheduleOfValuesTable.orgId, orgId),
        inArray(lienScheduleOfValuesTable.status, [...openStatuses]),
      ),
    );

  if (sovs.length === 0) { res.json({ rows: [] }); return; }

  const projectIds = [...new Set(sovs.map((s) => s.lienProjectId))];

  const projects = await db
    .select()
    .from(lienProjectsTable)
    .where(inArray(lienProjectsTable.id, projectIds));

  const sovIds = sovs.map((s) => s.id);

  const workMonths = await db
    .select()
    .from(workMonthsTable)
    .where(and(inArray(workMonthsTable.lienScheduleOfValuesId, sovIds), eq(workMonthsTable.orgId, orgId)));

  const notices = await db
    .select()
    .from(noticesTable)
    .where(and(inArray(noticesTable.lienScheduleOfValuesId, sovIds), eq(noticesTable.orgId, orgId)));

  const waivers = await db
    .select()
    .from(waiversTable)
    .where(and(inArray(waiversTable.lienProjectId, projectIds), eq(waiversTable.orgId, orgId)));

  const filings = await db
    .select()
    .from(lienFilingsTable)
    .where(and(inArray(lienFilingsTable.lienScheduleOfValuesId, sovIds), eq(lienFilingsTable.orgId, orgId)));

  const rows = sovs.map((sov) => {
    const project = projects.find((p) => p.id === sov.lienProjectId);
    const overdueMonths = workMonths.filter(
      (wm) => wm.lienScheduleOfValuesId === sov.id && wm.derivedOverdue && !wm.clearedFlag,
    );
    const sovNotices = notices.filter((n) => n.lienScheduleOfValuesId === sov.id);
    const sovWaivers = waivers.filter(
      (w) => w.lienProjectId === sov.lienProjectId && w.workStream === sov.workStream,
    );
    const filing = filings.find((f) => f.lienScheduleOfValuesId === sov.id);

    const grossExposure = overdueMonths.reduce((sum, wm) => {
      const wn = sovNotices.find((n) => n.workMonthId === wm.id);
      return sum + (wn ? Number(wn.claimAmount) : 0);
    }, 0);

    const waivedAmount = sovWaivers
      .filter((w) => w.approvalStatus === "approved")
      .reduce((sum, w) => sum + Number(w.paymentAmount), 0);

    return {
      sovId: sov.id,
      lienProjectId: sov.lienProjectId,
      projectName: project?.cachedProjectName ?? null,
      county: project?.county ?? null,
      workStream: sov.workStream,
      streamStatus: sov.status,
      openedAt: sov.openedAt,
      overdueMonths: overdueMonths.length,
      grossExposure,
      waivedAmount,
      netExposure: Math.max(0, grossExposure - waivedAmount),
      filing: filing
        ? {
            id: filing.id,
            status: filing.status,
            filingDate: filing.filingDate,
            postFilingNoticeDeadline: filing.postFilingNoticeDeadline,
            enforcementDeadline: filing.enforcementDeadline,
          }
        : null,
    };
  });

  res.json({ rows });
});

// ---------------------------------------------------------------------------
// GET /reports/timeline/:projectId — full lien timeline (L43)
// ---------------------------------------------------------------------------

router.get("/reports/timeline/:projectId", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const projectId = req.params["projectId"] as string;

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, projectId), eq(lienProjectsTable.orgId, orgId)))
    .limit(1);

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const sovs = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.lienProjectId, projectId), eq(lienScheduleOfValuesTable.orgId, orgId)));

  const sovIds = sovs.map((s) => s.id);

  // If no sovs, skip work-month/notice/filing queries (inArray([]) would error).
  const [workMonths, notices, filings, waivers] = sovs.length === 0
    ? [[], [], [], await db.select().from(waiversTable).where(and(eq(waiversTable.lienProjectId, projectId), eq(waiversTable.orgId, orgId)))]
    : await Promise.all([
        db
          .select()
          .from(workMonthsTable)
          .where(and(inArray(workMonthsTable.lienScheduleOfValuesId, sovIds), eq(workMonthsTable.orgId, orgId))),
        db
          .select()
          .from(noticesTable)
          .where(and(inArray(noticesTable.lienScheduleOfValuesId, sovIds), eq(noticesTable.orgId, orgId))),
        db
          .select()
          .from(lienFilingsTable)
          .where(and(inArray(lienFilingsTable.lienScheduleOfValuesId, sovIds), eq(lienFilingsTable.orgId, orgId))),
        db
          .select()
          .from(waiversTable)
          .where(and(eq(waiversTable.lienProjectId, projectId), eq(waiversTable.orgId, orgId))),
      ]);

  const workMonthIds = workMonths.map((wm) => wm.id);
  const deadlines = workMonthIds.length
    ? await db
        .select()
        .from(lienDeadlinesTable)
        .where(and(inArray(lienDeadlinesTable.workMonthId, workMonthIds), eq(lienDeadlinesTable.orgId, orgId)))
    : [];

  const filingIds = filings.map((f) => f.id);
  const releases = filingIds.length
    ? await db
        .select()
        .from(lienReleasesTable)
        .where(and(inArray(lienReleasesTable.filingId, filingIds), eq(lienReleasesTable.orgId, orgId)))
    : [];

  // Build chronological event list
  type TimelineEvent = {
    eventType: string;
    date: string;
    label: string;
    streamId?: string;
    workStream?: string;
    entityId: string;
    meta?: Record<string, unknown>;
  };

  const events: TimelineEvent[] = [];

  // Streams opened
  for (const s of sovs) {
    events.push({
      eventType: "stream_opened",
      date: new Date(s.openedAt).toISOString(),
      label: `${s.workStream} stream opened`,
      streamId: s.id,
      workStream: s.workStream,
      entityId: s.id,
    });
  }

  // Work months
  for (const wm of workMonths) {
    const sov = sovs.find((s) => s.id === wm.lienScheduleOfValuesId);
    events.push({
      eventType: "work_month",
      date: new Date(wm.month).toISOString(),
      label: `Work month ${new Date(wm.month).toISOString().slice(0, 7)} — ${wm.derivedOverdue ? (wm.clearedFlag ? "cleared" : "overdue") : "active"}`,
      streamId: wm.lienScheduleOfValuesId,
      workStream: sov?.workStream,
      entityId: wm.id,
      meta: { derivedOverdue: wm.derivedOverdue, clearedFlag: wm.clearedFlag },
    });
  }

  // Deadlines
  for (const dl of deadlines) {
    const wm = workMonths.find((w) => w.id === dl.workMonthId);
    const sov = wm ? sovs.find((s) => s.id === wm.lienScheduleOfValuesId) : undefined;
    events.push({
      eventType: `deadline_${dl.ruleKind}`,
      date: new Date(dl.adjustedDate).toISOString(),
      label: `${dl.ruleKind.replace(/_/g, " ")} deadline`,
      streamId: wm?.lienScheduleOfValuesId,
      workStream: sov?.workStream,
      entityId: dl.id,
      meta: {
        adjustedDate: new Date(dl.adjustedDate).toISOString().slice(0, 10),
        satisfiedAt: dl.satisfiedAt ? new Date(dl.satisfiedAt).toISOString().slice(0, 10) : null,
      },
    });
  }

  // Notices
  for (const n of notices) {
    const eventDate = n.sentAt ?? n.createdAt;
    const sov = sovs.find((s) => s.id === n.lienScheduleOfValuesId);
    events.push({
      eventType: `notice_${n.status}`,
      date: new Date(eventDate).toISOString(),
      label: `${n.noticeType.replace(/_/g, " ")} notice — ${n.status}`,
      streamId: n.lienScheduleOfValuesId,
      workStream: sov?.workStream,
      entityId: n.id,
      meta: {
        status: n.status,
        claimAmount: n.claimAmount,
        sentAt: n.sentAt ? new Date(n.sentAt).toISOString().slice(0, 10) : null,
        deliveredAt: n.deliveredAt ? new Date(n.deliveredAt).toISOString().slice(0, 10) : null,
      },
    });
  }

  // Waivers
  for (const w of waivers) {
    const eventDate = w.signedDate ?? w.createdAt;
    events.push({
      eventType: `waiver_${w.approvalStatus}`,
      date: new Date(eventDate).toISOString(),
      label: `${w.waiverType.replace(/_/g, " ")} waiver — ${w.approvalStatus}`,
      workStream: w.workStream,
      entityId: w.id,
      meta: {
        waiverType: w.waiverType,
        approvalStatus: w.approvalStatus,
        paymentAmount: w.paymentAmount,
      },
    });
  }

  // Filings
  for (const f of filings) {
    const eventDate = f.filingDate ?? f.createdAt;
    const sov = sovs.find((s) => s.id === f.lienScheduleOfValuesId);
    events.push({
      eventType: `filing_${f.status}`,
      date: new Date(eventDate).toISOString(),
      label: `Lien filed — ${f.county ?? "county TBD"} (${f.status})`,
      streamId: f.lienScheduleOfValuesId,
      workStream: sov?.workStream,
      entityId: f.id,
      meta: {
        status: f.status,
        county: f.county,
        recordingRef: f.recordingRef,
        postFilingNoticeDeadline: f.postFilingNoticeDeadline
          ? new Date(f.postFilingNoticeDeadline).toISOString().slice(0, 10)
          : null,
        enforcementDeadline: f.enforcementDeadline
          ? new Date(f.enforcementDeadline).toISOString().slice(0, 10)
          : null,
      },
    });
  }

  // Releases
  for (const r of releases) {
    const eventDate = r.signedDate ?? r.requestedAt ?? r.createdAt;
    const filing = filings.find((f) => f.id === r.filingId);
    const stream = filing ? sovs.find((s) => s.id === filing.lienScheduleOfValuesId) : undefined;
    events.push({
      eventType: `release_${r.status}`,
      date: new Date(eventDate).toISOString(),
      label: `Lien release — ${r.status}`,
      streamId: stream?.id,
      workStream: stream?.workStream,
      entityId: r.id,
      meta: { status: r.status, filingConfirmation: r.filingConfirmation },
    });
  }

  // Sort chronologically
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  res.json({
    project: {
      id: project.id,
      cachedProjectName: project.cachedProjectName,
      county: project.county,
      legalPropertyAddress: project.legalPropertyAddress,
      lienWorkflowType: project.lienWorkflowType,
    },
    streams: sovs.map((s) => ({ id: s.id, workStream: s.workStream, status: s.status })),
    events,
  });
});

// ---------------------------------------------------------------------------
// GET /reports/lapsed — streams where a filing deadline was missed (L44)
// ---------------------------------------------------------------------------

router.get("/reports/lapsed", requireSession, async (req, res) => {
  const { orgId } = getSession(req);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Find all work months whose filing deadline has passed
  const overdueDeadlines = await db
    .select()
    .from(lienDeadlinesTable)
    .where(
      and(
        eq(lienDeadlinesTable.orgId, orgId),
        eq(lienDeadlinesTable.ruleKind, "filing"),
        lt(lienDeadlinesTable.adjustedDate, today),
        isNull(lienDeadlinesTable.satisfiedAt),
      ),
    );

  if (overdueDeadlines.length === 0) { res.json({ rows: [] }); return; }

  const overdueWorkMonthIds = [...new Set(overdueDeadlines.map((d) => d.workMonthId))];

  const overdueWorkMonths = await db
    .select()
    .from(workMonthsTable)
    .where(inArray(workMonthsTable.id, overdueWorkMonthIds));

  const overdueStreamIds = [...new Set(overdueWorkMonths.map((wm) => wm.lienScheduleOfValuesId))];

  // Get all filings for these streams
  const filings = await db
    .select()
    .from(lienFilingsTable)
    .where(
      and(
        inArray(lienFilingsTable.lienScheduleOfValuesId, overdueStreamIds),
        eq(lienFilingsTable.orgId, orgId),
      ),
    );

  const filedStreamIds = new Set(
    filings.filter((f) => f.status === "filed" || f.status === "post_filing_notice_sent").map((f) => f.lienScheduleOfValuesId),
  );

  // Lapsed = overdue filing deadline AND no filed filing
  const lapsedStreamIds = overdueStreamIds.filter((sid) => !filedStreamIds.has(sid));

  if (lapsedStreamIds.length === 0) { res.json({ rows: [] }); return; }

  const streams = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        inArray(lienScheduleOfValuesTable.id, lapsedStreamIds),
        eq(lienScheduleOfValuesTable.orgId, orgId),
      ),
    );

  const projectIds = [...new Set(streams.map((s) => s.lienProjectId))];
  const projects = await db
    .select()
    .from(lienProjectsTable)
    .where(inArray(lienProjectsTable.id, projectIds));

  // Mark lapsed streams in DB
  for (const sid of lapsedStreamIds) {
    const stream = streams.find((s) => s.id === sid);
    if (stream && stream.status !== "lapsed") {
      await db
        .update(lienScheduleOfValuesTable)
        .set({ status: "lapsed", updatedAt: new Date() })
        .where(eq(lienScheduleOfValuesTable.id, sid));
    }
  }

  const rows = lapsedStreamIds.map((sid) => {
    const stream = streams.find((s) => s.id === sid);
    const project = stream ? projects.find((p) => p.id === stream.lienProjectId) : undefined;
    const streamDeadlines = overdueDeadlines.filter((d) => {
      const wm = overdueWorkMonths.find((w) => w.id === d.workMonthId);
      return wm?.lienScheduleOfValuesId === sid;
    });
    const earliestMissed = streamDeadlines.reduce<Date | null>((min, d) => {
      const dt = new Date(d.adjustedDate);
      return !min || dt < min ? dt : min;
    }, null);

    return {
      streamId: sid,
      lienProjectId: stream?.lienProjectId ?? null,
      projectName: project?.cachedProjectName ?? null,
      county: project?.county ?? null,
      workStream: stream?.workStream ?? null,
      streamStatus: "lapsed",
      earliestMissedDeadline: earliestMissed ? earliestMissed.toISOString().slice(0, 10) : null,
      missedDeadlineCount: streamDeadlines.length,
    };
  });

  res.json({ rows });
});

export default router;
