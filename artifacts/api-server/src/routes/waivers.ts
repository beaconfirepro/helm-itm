/**
 * waivers.ts — Lien Waiver routes (Phase 5).
 *
 * POST   /waivers                     create waiver (cleared gate for unconditional)
 * GET    /waivers                     list waivers (filter ?projectId= &stream=)
 * GET    /waivers/exposure            remaining lien exposure per stream (L34)
 * POST   /waivers/:id/approve-pm      PM approval gate
 * POST   /waivers/:id/approve-finance Finance approval gate
 * POST   /waivers/:id/notarize        start NotaryLive RON order
 * POST   /waivers/:id/notary-refresh  poll NotaryLive order status & sync
 * GET    /waivers/:id/pdf             § 53.284 statutory waiver PDF
 *
 * NotaryLive v3 has no webhook — completion is discovered by polling
 * order/status (see notary-refresh), not by an inbound callback.
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  waiversTable,
  invoiceLinksTable,
  lienProjectsTable,
  lienScheduleOfValuesTable,
  workMonthsTable,
  noticesTable,
  mailingRecordsTable,
  linkedClientsTable,
  noticeRecipientsTable,
  documentTemplatesTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, not } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { createNotarySession, getNotaryOrderStatus } from "../lib/notarylive";
import {
  waiverRequiresClearedPayment,
  initialWaiverApprovalStatus,
  pmApprovalError,
  pmApprovalNextStatus,
  financeApprovalError,
  type WaiverType,
} from "../lib/stateMachines";
import { recordAudit } from "../lib/audit";
import {
  resolveDocument,
  formatCurrency,
  formatMonthYear,
  formatLongDate,
  DEFAULT_CLAIMANT_NAME,
  type RegionContent,
} from "../lib/documentTemplates";
import { renderRichText } from "../lib/pdfRichText";

const router = Router();

// Webhooks are registered without requireSession (they use signature validation).
// All other routes require a session.

// ---------------------------------------------------------------------------
// POST /waivers — create waiver with cleared gate
// ---------------------------------------------------------------------------

router.post("/waivers", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const { lienProjectId, workStream, waiverType, paymentAmount, invoiceLinkId } = req.body as {
    lienProjectId?: string;
    workStream?: string;
    waiverType?: string;
    paymentAmount?: string | number;
    invoiceLinkId?: string;
  };

  if (!lienProjectId || !workStream || !waiverType || paymentAmount === undefined) {
    res.status(400).json({ error: "lienProjectId, workStream, waiverType, and paymentAmount are required" });
    return;
  }

  const validWaiverTypes = ["conditional_progress", "unconditional_progress", "conditional_final", "unconditional_final"];
  if (!validWaiverTypes.includes(waiverType)) {
    res.status(400).json({ error: "Invalid waiverType" });
    return;
  }

  const validStreams = ["construction", "design"];
  if (!validStreams.includes(workStream)) {
    res.status(400).json({ error: "Invalid workStream" });
    return;
  }

  // Verify project belongs to org.
  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, lienProjectId), eq(lienProjectsTable.orgId, orgId)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // L33: Unconditional waivers require coordinator-cleared payment.
  const isUnconditional = waiverRequiresClearedPayment(waiverType as WaiverType);

  if (isUnconditional) {
    if (!invoiceLinkId) {
      res.status(409).json({
        error: "Unconditional waivers require an invoiceLinkId; payment must be coordinator-cleared before generating an unconditional waiver.",
      });
      return;
    }

    const [invoice] = await db
      .select({ clearedFlag: invoiceLinksTable.clearedFlag })
      .from(invoiceLinksTable)
      .where(and(eq(invoiceLinksTable.id, invoiceLinkId), eq(invoiceLinksTable.orgId, orgId)))
      .limit(1);

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    if (!invoice.clearedFlag) {
      res.status(409).json({
        error: "Payment has not been coordinator-cleared. Mark the invoice as cleared before generating an unconditional waiver.",
        code: "PAYMENT_NOT_CLEARED",
      });
      return;
    }
  }

  // Determine initial approval status.
  const approvalStatus = initialWaiverApprovalStatus(waiverType as WaiverType);

  const [waiver] = await db
    .insert(waiversTable)
    .values({
      id: randomUUID(),
      orgId,
      lienProjectId,
      workStream: workStream as "construction" | "design",
      waiverType: waiverType as "conditional_progress" | "unconditional_progress" | "conditional_final" | "unconditional_final",
      paymentAmount: String(paymentAmount),
      approvalStatus,
      invoiceLinkId: invoiceLinkId ?? null,
    })
    .returning();

  res.status(201).json({ waiver });
});

// ---------------------------------------------------------------------------
// GET /waivers — list waivers
// ---------------------------------------------------------------------------

router.get("/waivers", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const { projectId, stream } = req.query as { projectId?: string; stream?: string };

  const conditions = [eq(waiversTable.orgId, orgId)];
  if (projectId) conditions.push(eq(waiversTable.lienProjectId, projectId));
  if (stream) conditions.push(eq(waiversTable.workStream, stream as "construction" | "design"));

  const waivers = await db
    .select()
    .from(waiversTable)
    .where(and(...conditions));

  if (!waivers.length) {
    res.json({ waivers: [] });
    return;
  }

  // Enrich with project info.
  const projectIds = [...new Set(waivers.map((w) => w.lienProjectId))];
  const projects = await db
    .select({ id: lienProjectsTable.id, cachedProjectName: lienProjectsTable.cachedProjectName, lienWorkflowType: lienProjectsTable.lienWorkflowType })
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.orgId, orgId), inArray(lienProjectsTable.id, projectIds)));

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const enriched = waivers.map((w) => ({
    ...w,
    project: projectMap.get(w.lienProjectId) ?? null,
  }));

  res.json({ waivers: enriched });
});

// ---------------------------------------------------------------------------
// GET /waivers/exposure — remaining lien exposure per stream (L34)
// NOTE: must be declared BEFORE /:id to avoid route collision.
// ---------------------------------------------------------------------------

router.get("/waivers/exposure", requireSession, async (req, res) => {
  const { orgId } = getSession(req);

  // Streams with at-risk or notice-active status.
  const streams = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        eq(lienScheduleOfValuesTable.orgId, orgId),
        inArray(lienScheduleOfValuesTable.status, ["at_risk", "notice_active", "filing", "filed"]),
      ),
    );

  if (!streams.length) {
    res.json({ exposure: [] });
    return;
  }

  // For each stream, find overdue uncleared work months with invoices.
  const streamIds = streams.map((s) => s.id);
  const workMonths = await db
    .select()
    .from(workMonthsTable)
    .where(
      and(
        eq(workMonthsTable.orgId, orgId),
        inArray(workMonthsTable.lienScheduleOfValuesId, streamIds),
        eq(workMonthsTable.derivedOverdue, true),
        eq(workMonthsTable.clearedFlag, false),
      ),
    );

  // Gather invoice amounts.
  const invoiceIds = workMonths.map((wm) => wm.invoiceLinkId).filter(Boolean) as string[];
  const invoices = invoiceIds.length
    ? await db
        .select({ id: invoiceLinksTable.id, amount: invoiceLinksTable.amount })
        .from(invoiceLinksTable)
        .where(and(eq(invoiceLinksTable.orgId, orgId), inArray(invoiceLinksTable.id, invoiceIds)))
    : [];

  const invoiceMap = new Map(invoices.map((inv) => [inv.id, Number(inv.amount)]));

  // Get approved waivers to subtract released amounts.
  const approvedWaivers = await db
    .select()
    .from(waiversTable)
    .where(
      and(
        eq(waiversTable.orgId, orgId),
        eq(waiversTable.approvalStatus, "approved"),
        inArray(waiversTable.lienProjectId, [...new Set(streams.map((s) => s.lienProjectId))]),
      ),
    );

  // Sum waiver amounts per stream (by project+workStream key).
  const waiverReleasedByKey = new Map<string, number>();
  for (const wv of approvedWaivers) {
    const key = `${wv.lienProjectId}:${wv.workStream}`;
    waiverReleasedByKey.set(key, (waiverReleasedByKey.get(key) ?? 0) + Number(wv.paymentAmount));
  }

  // Load project names.
  const projectIds = [...new Set(streams.map((s) => s.lienProjectId))];
  const projects = await db
    .select({ id: lienProjectsTable.id, cachedProjectName: lienProjectsTable.cachedProjectName })
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.orgId, orgId), inArray(lienProjectsTable.id, projectIds)));

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Build per-stream exposure rows.
  const wmByStream = new Map<string, typeof workMonths>();
  for (const wm of workMonths) {
    const list = wmByStream.get(wm.lienScheduleOfValuesId) ?? [];
    list.push(wm);
    wmByStream.set(wm.lienScheduleOfValuesId, list);
  }

  const exposure = streams.map((s) => {
    const wms = wmByStream.get(s.id) ?? [];
    const gross = wms.reduce((sum, wm) => sum + (wm.invoiceLinkId ? (invoiceMap.get(wm.invoiceLinkId) ?? 0) : 0), 0);
    const released = waiverReleasedByKey.get(`${s.lienProjectId}:${s.workStream}`) ?? 0;
    const net = Math.max(0, gross - released);
    const project = projectMap.get(s.lienProjectId);
    return {
      streamId: s.id,
      lienProjectId: s.lienProjectId,
      projectName: project?.cachedProjectName ?? s.lienProjectId,
      workStream: s.workStream,
      streamStatus: s.status,
      overdueMonths: wms.length,
      grossExposure: gross,
      waivedAmount: released,
      netExposure: net,
    };
  });

  res.json({ exposure });
});

// ---------------------------------------------------------------------------
// POST /waivers/:id/approve-pm — PM approval gate
// ---------------------------------------------------------------------------

router.post("/waivers/:id/approve-pm", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [waiver] = await db
    .select()
    .from(waiversTable)
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .limit(1);

  if (!waiver) {
    res.status(404).json({ error: "Waiver not found" });
    return;
  }

  const pmErr = pmApprovalError(waiver.approvalStatus, !!waiver.pmApprovedAt);
  if (pmErr) {
    res.status(409).json({ error: pmErr });
    return;
  }

  // Role gate — only PM or admin (super-role) may approve.
  // Missing role → 403; role must be explicitly set in the session.
  const session = getSession(req);
  if (session.role !== "pm" && session.role !== "admin") {
    res.status(403).json({
      error: `Insufficient role: PM gate requires role 'pm'. Your role: '${session.role ?? "(none)"}'. Contact your administrator.`,
      requiredRoles: ["pm", "admin"],
    });
    return;
  }

  const userId = session.userId ?? "user_unknown";

  const newStatus = pmApprovalNextStatus(waiver.waiverType);

  const [updated] = await db
    .update(waiversTable)
    .set({
      pmApprovedByUserId: userId,
      pmApprovedAt: new Date(),
      approvalStatus: newStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .returning();

  await recordAudit({
    orgId,
    actor: { userId: session.userId, role: session.role },
    action: "waiver.approve_pm",
    entityType: "waiver",
    entityId: id,
    summary: `PM approved waiver (${waiver.waiverType})`,
    before: { approvalStatus: waiver.approvalStatus },
    after: { approvalStatus: updated.approvalStatus },
  });

  res.json({ waiver: updated });
});

// ---------------------------------------------------------------------------
// POST /waivers/:id/approve-finance — Finance approval gate
// ---------------------------------------------------------------------------

router.post("/waivers/:id/approve-finance", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [waiver] = await db
    .select()
    .from(waiversTable)
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .limit(1);

  if (!waiver) {
    res.status(404).json({ error: "Waiver not found" });
    return;
  }

  const financeErr = financeApprovalError(
    waiver.waiverType,
    waiver.approvalStatus,
    !!waiver.pmApprovedAt,
    !!waiver.financeApprovedAt,
  );
  if (financeErr) {
    res.status(409).json({ error: financeErr });
    return;
  }

  // Role gate — only Finance or admin (super-role) may approve.
  // Missing role → 403; role must be explicitly set in the session.
  const session = getSession(req);
  if (session.role !== "finance" && session.role !== "admin") {
    res.status(403).json({
      error: `Insufficient role: Finance gate requires role 'finance'. Your role: '${session.role ?? "(none)"}'. Contact your administrator.`,
      requiredRoles: ["finance", "admin"],
    });
    return;
  }

  const userId = session.userId ?? "user_unknown";

  const [updated] = await db
    .update(waiversTable)
    .set({
      financeApprovedByUserId: userId,
      financeApprovedAt: new Date(),
      approvalStatus: "approved",
      updatedAt: new Date(),
    })
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .returning();

  await recordAudit({
    orgId,
    actor: { userId: session.userId, role: session.role },
    action: "waiver.approve_finance",
    entityType: "waiver",
    entityId: id,
    summary: `Finance approved waiver (${waiver.waiverType}) — fully approved`,
    before: { approvalStatus: waiver.approvalStatus },
    after: { approvalStatus: updated.approvalStatus },
  });

  res.json({ waiver: updated });
});

// ---------------------------------------------------------------------------
// POST /waivers/:id/provide-to-gc — mark an approved waiver as handed to the GC
// Sets providedToGc=true. Only valid once the waiver is fully approved.
// ---------------------------------------------------------------------------

router.post("/waivers/:id/provide-to-gc", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [waiver] = await db
    .select()
    .from(waiversTable)
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .limit(1);

  if (!waiver) {
    res.status(404).json({ error: "Waiver not found" });
    return;
  }

  if (waiver.approvalStatus !== "approved") {
    res.status(409).json({
      error: `Only an approved waiver can be handed to the GC (current: '${waiver.approvalStatus}')`,
    });
    return;
  }

  const [updated] = await db
    .update(waiversTable)
    .set({ providedToGc: true, updatedAt: new Date() })
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .returning();

  res.json({ waiver: updated });
});

// ---------------------------------------------------------------------------
// POST /waivers/:id/notarize — trigger NotaryLive session
// ---------------------------------------------------------------------------

router.post("/waivers/:id/notarize", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [waiver] = await db
    .select()
    .from(waiversTable)
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .limit(1);

  if (!waiver) {
    res.status(404).json({ error: "Waiver not found" });
    return;
  }

  if (waiver.notarized) {
    res.status(409).json({ error: "Waiver has already been notarized" });
    return;
  }

  // Load project for display name.
  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, waiver.lienProjectId), eq(lienProjectsTable.orgId, orgId)))
    .limit(1);

  // Enforce requiresNotarizedWaivers gate via invoiceLinkId → linkedClient.
  // The join path: waiver.invoiceLinkId → invoiceLinksTable.linkedClientId → linkedClientsTable.requiresNotarizedWaivers
  if (waiver.invoiceLinkId) {
    const [invoice] = await db
      .select({ linkedClientId: invoiceLinksTable.linkedClientId })
      .from(invoiceLinksTable)
      .where(and(eq(invoiceLinksTable.id, waiver.invoiceLinkId), eq(invoiceLinksTable.orgId, orgId)))
      .limit(1);

    if (invoice?.linkedClientId) {
      const [client] = await db
        .select({ requiresNotarizedWaivers: linkedClientsTable.requiresNotarizedWaivers })
        .from(linkedClientsTable)
        .where(and(eq(linkedClientsTable.id, invoice.linkedClientId), eq(linkedClientsTable.orgId, orgId)))
        .limit(1);

      // If the client record explicitly states notarization is NOT required, block it.
      if (client && client.requiresNotarizedWaivers === false) {
        res.status(409).json({
          error: "The linked client does not require notarized waivers. Notarization is not applicable for this waiver.",
          code: "NOTARIZATION_NOT_REQUIRED",
        });
        return;
      }
    }
  }

  // Unique per-attempt reference NotaryLive echoes back for status polling.
  const internalId = `wv_${id}_${Date.now().toString(36)}`;
  const session = await createNotarySession({
    internalId,
    signerFirstName: "HELM",
    signerLastName: "Fire Protection",
    signerEmail: "liens@helmfp.com",
  });

  const [updated] = await db
    .update(waiversTable)
    .set({ notaryLiveRef: session.sessionRef, updatedAt: new Date() })
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .returning();

  res.json({ waiver: updated, signingUrl: session.signingUrl });
});

// ---------------------------------------------------------------------------
// POST /waivers/:id/notary-refresh — poll NotaryLive and sync completion
//
// NotaryLive v3 has no webhook; completion is discovered by polling
// order/status. Once the order reaches "notarized" we persist the signed
// document URL and mark the waiver notarized.
// ---------------------------------------------------------------------------

router.post("/waivers/:id/notary-refresh", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [waiver] = await db
    .select()
    .from(waiversTable)
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .limit(1);

  if (!waiver) {
    res.status(404).json({ error: "Waiver not found" });
    return;
  }

  if (!waiver.notaryLiveRef) {
    res.status(409).json({
      error: "No notarization session has been started for this waiver",
      code: "NO_NOTARY_SESSION",
    });
    return;
  }

  const status = await getNotaryOrderStatus(waiver.notaryLiveRef);

  if (status.notarized && !waiver.notarized) {
    const [updated] = await db
      .update(waiversTable)
      .set({
        notarized: true,
        generatedDocUrl: status.documentUrls[0] ?? null,
        signedDate: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
      .returning();

    res.json({ waiver: updated, status: status.status, notarized: true });
    return;
  }

  res.json({ waiver, status: status.status, notarized: waiver.notarized });
});

// ---------------------------------------------------------------------------
// GET /waivers/:id/pdf — § 53.284 statutory waiver PDF
// ---------------------------------------------------------------------------

router.get("/waivers/:id/pdf", requireSession, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [waiver] = await db
    .select()
    .from(waiversTable)
    .where(and(eq(waiversTable.id, id), eq(waiversTable.orgId, orgId)))
    .limit(1);

  if (!waiver) {
    res.status(404).json({ error: "Waiver not found" });
    return;
  }

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, waiver.lienProjectId), eq(lienProjectsTable.orgId, orgId)))
    .limit(1);

  const doc = new PDFDocument({ margin: 72, size: "letter" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="waiver-${id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  const BLUE = "#1a2b6b";
  const GRAY = "#555555";
  const LIGHT_GRAY = "#999999";

  const divider = () => {
    doc.moveTo(72, doc.y).lineTo(540, doc.y).lineWidth(0.5).strokeColor("#dddddd").stroke();
    doc.moveDown(0.5);
  };

  // Statute reference + title per waiver type (§ 53.284(b)-(e)).
  const WAIVER_META: Record<string, { subsection: string; title: string; description: string }> = {
    conditional_progress: {
      subsection: "§ 53.284(b)",
      title: "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
      description: "This waiver is conditional upon receipt of the progress payment described below.",
    },
    unconditional_progress: {
      subsection: "§ 53.284(c)",
      title: "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
      description: "Payment for the progress payment described below has been received; this waiver is unconditional.",
    },
    conditional_final: {
      subsection: "§ 53.284(d)",
      title: "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
      description: "This waiver is conditional upon receipt of the final payment described below.",
    },
    unconditional_final: {
      subsection: "§ 53.284(e)",
      title: "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
      description: "Final payment described below has been received; this waiver is unconditional.",
    },
  };

  const meta = WAIVER_META[waiver.waiverType] ?? WAIVER_META.conditional_progress;
  const amountFormatted = formatCurrency(waiver.paymentAmount);
  const today = formatLongDate(new Date());

  // Load any saved document template (region overrides) for this waiver type.
  const [tmplRow] = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.orgId, orgId),
        eq(documentTemplatesTable.documentType, waiver.waiverType),
      ),
    )
    .limit(1);
  const savedRegions: RegionContent | null = tmplRow
    ? {
        branding: tmplRow.branding,
        intro: tmplRow.intro,
        closing: tmplRow.closing,
        signature: tmplRow.signature,
        footer: tmplRow.footer,
      }
    : null;

  const mergeData: Record<string, string> = {
    claimantName: DEFAULT_CLAIMANT_NAME,
    projectName: project?.cachedProjectName ?? "",
    propertyAddress: project?.legalPropertyAddress ?? "",
    county: project?.county ?? "",
    paymentAmount: amountFormatted,
    workStream: waiver.workStream,
    throughDate: waiver.signedDate ? formatLongDate(waiver.signedDate) : "",
    todayDate: today,
  };

  const resolved = resolveDocument(waiver.waiverType, savedRegions, mergeData);

  // ── Branding / Letterhead (customizable) ────────────────────────────────────
  if (resolved.branding.trim()) {
    renderRichText(doc, resolved.branding, {
      fontSize: 9,
      color: GRAY,
      textOptions: { align: "center" },
    });
    doc.moveDown(0.6);
  }

  // Header.
  doc.fontSize(9).fillColor(LIGHT_GRAY).text("STATE OF TEXAS — LIEN WAIVER", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(13).fillColor(BLUE).font("Helvetica-Bold").text(meta.title, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor(GRAY).font("Helvetica").text(`Texas Property Code ${meta.subsection}`, { align: "center" });
  doc.moveDown(1);
  divider();

  // Project / claimant.
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("PROJECT:");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text(project?.cachedProjectName ?? "(Unknown Project)");
  if (project?.legalPropertyAddress) doc.text(project.legalPropertyAddress);
  if (project?.county) doc.text(`${project.county} County, Texas`);
  doc.moveDown(1);
  divider();

  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("CLAIMANT:");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text("Beacon Fire Protection");
  doc.text(`Work Stream: ${waiver.workStream.charAt(0).toUpperCase() + waiver.workStream.slice(1)}`);
  doc.moveDown(1);
  divider();

  // Payment amount.
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("PAYMENT:");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text(`Amount: ${amountFormatted}`);
  if (waiver.signedDate) {
    doc.text(`Through Date: ${new Date(waiver.signedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`);
  }
  doc.moveDown(1);
  divider();

  // Intro (customizable).
  if (resolved.intro.trim()) {
    renderRichText(doc, resolved.intro, {
      fontSize: 9,
      color: "#333333",
      textOptions: { lineGap: 3 },
    });
    doc.moveDown(1);
    divider();
  }

  // Statutory text (locked).
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("WAIVER AND RELEASE:");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(8.5).fillColor("#333333").text(resolved.lockedBody, { lineGap: 3 });
  doc.moveDown(1.5);
  divider();

  // Closing (customizable).
  if (resolved.closing.trim()) {
    renderRichText(doc, resolved.closing, {
      fontSize: 9,
      color: "#333333",
      textOptions: { lineGap: 3 },
    });
    doc.moveDown(1.5);
    divider();
  }

  // Approval gates (informational).
  const gateLines: string[] = [];
  if (waiver.pmApprovedAt) gateLines.push(`PM Approved: ${new Date(waiver.pmApprovedAt).toLocaleDateString()}`);
  if (waiver.financeApprovedAt) gateLines.push(`Finance Approved: ${new Date(waiver.financeApprovedAt).toLocaleDateString()}`);
  if (waiver.notarized) gateLines.push(`Notarized: Yes (NotaryLive ref: ${waiver.notaryLiveRef ?? "–"})`);

  if (gateLines.length) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("APPROVALS:");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor(GRAY);
    gateLines.forEach((l) => doc.text(l));
    doc.moveDown(1);
    divider();
  }

  // Signature block (customizable).
  renderRichText(doc, resolved.signature, {
    fontSize: 9,
    color: GRAY,
    textOptions: { lineGap: 2 },
  });
  doc.moveDown(2);

  // Footer (customizable).
  if (resolved.footer.trim()) {
    renderRichText(doc, resolved.footer, {
      fontSize: 7.5,
      color: LIGHT_GRAY,
      textOptions: { align: "center" },
    });
  }

  doc.end();
});

export default router;
