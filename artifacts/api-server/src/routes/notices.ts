/**
 * notices.ts — Notice generation & sending routes (Phase 4 + 5).
 *
 * POST  /notices              create notice (draft) from lienScheduleOfValuesId + workMonthId + noticeType
 * PATCH /notices/:id          edit claimAmount, workDescription, monthListed, recipients
 * POST  /notices/:id/approve  approve a draft notice
 * GET   /notices/:id/pdf      generate print-ready statutory PDF (§ 53.056 / § 53.057)
 * POST  /notices/:id/send     send via Shippo certified mail; creates MailingRecord
 * POST  /notices/:id/proof    attach delivery proof URL to MailingRecord
 * POST  /webhooks/mailing     Shippo delivery callback → notice status `delivered`
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  noticesTable,
  noticeRecipientsTable,
  workMonthsTable,
  lienScheduleOfValuesTable,
  lienProjectsTable,
  projectPartyLinksTable,
  invoiceLinksTable,
  mailingRecordsTable,
  lienDeadlinesTable,
  documentTemplatesTable,
} from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { createCertifiedMailLabel } from "../lib/shippo";
import {
  resolveDocument,
  formatCurrency,
  formatMonthYear,
  formatLongDate,
  DEFAULT_CLAIMANT_NAME,
  type RegionContent,
} from "../lib/documentTemplates";
import { renderRichText } from "../lib/pdfRichText";
import { legalReviewBlockReason } from "../lib/legalReview";
import { noticeEditError, noticeApproveError, noticeSendError } from "../lib/stateMachines";
import { recordAudit } from "../lib/audit";

const router = Router();
router.use(requireSession);

// ---------------------------------------------------------------------------
// GET /notices — list notices with optional status filter
// ---------------------------------------------------------------------------

router.get("/notices", async (req, res) => {
  const { orgId } = getSession(req);
  const { status, projectId, streamId } = req.query as {
    status?: string;
    projectId?: string;
    streamId?: string;
  };

  const conditions = [eq(noticesTable.orgId, orgId)];

  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(noticesTable.status, statuses[0] as "draft" | "approved" | "sent" | "delivered"));
    } else if (statuses.length > 1) {
      conditions.push(inArray(noticesTable.status, statuses as ("draft" | "approved" | "sent" | "delivered")[]));
    }
  }

  if (streamId) {
    const [stream] = await db
      .select({ id: lienScheduleOfValuesTable.id })
      .from(lienScheduleOfValuesTable)
      .where(and(eq(lienScheduleOfValuesTable.orgId, orgId), eq(lienScheduleOfValuesTable.id, streamId as string)))
      .limit(1);
    if (!stream) {
      res.json({ notices: [] });
      return;
    }
    conditions.push(eq(noticesTable.lienScheduleOfValuesId, streamId as string));
  } else if (projectId) {
    const streams = await db
      .select({ id: lienScheduleOfValuesTable.id })
      .from(lienScheduleOfValuesTable)
      .where(and(eq(lienScheduleOfValuesTable.orgId, orgId), eq(lienScheduleOfValuesTable.lienProjectId, projectId)));
    const streamIds = streams.map((s) => s.id);
    if (!streamIds.length) {
      res.json({ notices: [] });
      return;
    }
    conditions.push(inArray(noticesTable.lienScheduleOfValuesId, streamIds));
  }

  const notices = await db
    .select()
    .from(noticesTable)
    .where(and(...conditions));

  if (!notices.length) {
    res.json({ notices: [] });
    return;
  }

  // Enrich with mailing records and project names.
  const noticeIds = notices.map((n) => n.id);
  const mailings = await db
    .select()
    .from(mailingRecordsTable)
    .where(and(eq(mailingRecordsTable.orgId, orgId), inArray(mailingRecordsTable.noticeId, noticeIds)));

  const mailingByNotice = new Map(mailings.map((m) => [m.noticeId, m]));

  // Load projects via streams.
  const streamIds = [...new Set(notices.map((n) => n.lienScheduleOfValuesId).filter(Boolean))] as string[];
  const streams = streamIds.length
    ? await db
        .select({ id: lienScheduleOfValuesTable.id, lienProjectId: lienScheduleOfValuesTable.lienProjectId })
        .from(lienScheduleOfValuesTable)
        .where(and(eq(lienScheduleOfValuesTable.orgId, orgId), inArray(lienScheduleOfValuesTable.id, streamIds)))
    : [];

  const projectIds = [...new Set(streams.map((s) => s.lienProjectId))];
  const projects = projectIds.length
    ? await db
        .select({ id: lienProjectsTable.id, cachedProjectName: lienProjectsTable.cachedProjectName })
        .from(lienProjectsTable)
        .where(and(eq(lienProjectsTable.orgId, orgId), inArray(lienProjectsTable.id, projectIds)))
    : [];

  const streamProjectMap = new Map(streams.map((s) => [s.id, s.lienProjectId]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const enriched = notices.map((n) => {
    const projectId = n.lienScheduleOfValuesId ? streamProjectMap.get(n.lienScheduleOfValuesId) : undefined;
    const project = projectId ? projectMap.get(projectId) : undefined;
    const mailing = n.id ? mailingByNotice.get(n.id) : undefined;
    return {
      ...n,
      project: project ?? null,
      mailing: mailing ?? null,
    };
  });

  res.json({ notices: enriched });
});

function buildWorkDescription(workStream: string, noticeType: string): string {
  if (noticeType === "retainage_claim") {
    return `Retainage for fire-protection ${workStream} work`;
  }
  if (noticeType === "early_warning") {
    return `Fire-protection ${workStream} services — courtesy notice`;
  }
  return `Labor and materials furnished for fire-protection ${workStream} work`;
}

// ---------------------------------------------------------------------------
// POST /notices — create a draft notice
// ---------------------------------------------------------------------------

router.post("/notices", async (req, res) => {
  const { orgId } = getSession(req);
  const { lienScheduleOfValuesId, workMonthId, noticeType } = req.body as {
    lienScheduleOfValuesId?: string;
    workMonthId?: string;
    noticeType?: string;
  };

  if (!lienScheduleOfValuesId || !noticeType) {
    res.status(400).json({ error: "lienScheduleOfValuesId and noticeType are required" });
    return;
  }

  if (!["early_warning", "statutory_claim", "retainage_claim"].includes(noticeType)) {
    res.status(400).json({ error: "Invalid noticeType" });
    return;
  }

  // Verify stream belongs to org.
  const [stream] = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.id, lienScheduleOfValuesId), eq(lienScheduleOfValuesTable.orgId, orgId)))
    .limit(1);

  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }

  // Load project + parties.
  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(and(eq(lienProjectsTable.id, stream.lienProjectId), eq(lienProjectsTable.orgId, orgId)))
    .limit(1);

  const parties = await db
    .select()
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.lienProjectId, stream.lienProjectId),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    );

  // Determine monthListed and claimAmount from workMonth (if provided).
  let monthListed: Date = new Date();
  let claimAmount = "0.00";

  if (workMonthId) {
    const [wm] = await db
      .select()
      .from(workMonthsTable)
      .where(and(eq(workMonthsTable.id, workMonthId), eq(workMonthsTable.orgId, orgId)))
      .limit(1);

    if (wm) {
      monthListed = wm.month;
      if (wm.invoiceLinkId) {
        const [inv] = await db
          .select({ amount: invoiceLinksTable.amount })
          .from(invoiceLinksTable)
          .where(and(eq(invoiceLinksTable.id, wm.invoiceLinkId), eq(invoiceLinksTable.orgId, orgId)))
          .limit(1);
        if (inv) claimAmount = String(inv.amount);
      }
    }
  }

  const noticeId = randomUUID();

  const [notice] = await db
    .insert(noticesTable)
    .values({
      id: noticeId,
      orgId,
      lienScheduleOfValuesId,
      workMonthId: workMonthId ?? null,
      noticeType: noticeType as "early_warning" | "statutory_claim" | "retainage_claim",
      status: "draft",
      claimAmount,
      workDescription: buildWorkDescription(stream.workStream, noticeType),
      monthListed,
    })
    .returning();

  // Auto-create recipients from parties (owner + original_contractor only).
  const recipientRows = parties
    .filter((p) => p.partyRelationType === "owner" || p.partyRelationType === "original_contractor")
    .map((p) => ({
      id: randomUUID(),
      orgId,
      noticeId,
      recipientType: p.partyRelationType as "owner" | "original_contractor",
      legalName: p.cachedLegalName,
      mailingAddress: p.cachedMailingAddress ?? "",
    }));

  const recipients = recipientRows.length
    ? await db.insert(noticeRecipientsTable).values(recipientRows).returning()
    : [];

  res.status(201).json({ notice, recipients });
});

// ---------------------------------------------------------------------------
// PATCH /notices/:id — edit draft notice fields + recipients
// ---------------------------------------------------------------------------

router.patch("/notices/:id", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;
  const { claimAmount, workDescription, monthListed, recipients } = req.body as {
    claimAmount?: string;
    workDescription?: string;
    monthListed?: string;
    recipients?: { id?: string; recipientType: string; legalName: string; mailingAddress: string }[];
  };

  const [existing] = await db
    .select()
    .from(noticesTable)
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  const editErr = noticeEditError(existing.status);
  if (editErr) {
    res.status(409).json({ error: editErr });
    return;
  }

  const updates: Partial<typeof existing> = {};
  if (claimAmount !== undefined) updates.claimAmount = claimAmount;
  if (workDescription !== undefined) updates.workDescription = workDescription;
  if (monthListed !== undefined) updates.monthListed = new Date(monthListed);

  const [notice] = await db
    .update(noticesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .returning();

  // Update recipients if provided.
  let updatedRecipients = null;
  if (recipients !== undefined) {
    // Delete existing recipients and recreate.
    await db
      .delete(noticeRecipientsTable)
      .where(and(eq(noticeRecipientsTable.noticeId, id), eq(noticeRecipientsTable.orgId, orgId)));

    const rows = recipients.map((r) => ({
      id: r.id ?? randomUUID(),
      orgId,
      noticeId: id,
      recipientType: r.recipientType as "owner" | "original_contractor",
      legalName: r.legalName,
      mailingAddress: r.mailingAddress,
    }));

    updatedRecipients = rows.length
      ? await db.insert(noticeRecipientsTable).values(rows).returning()
      : [];
  }

  res.json({ notice, recipients: updatedRecipients });
});

// ---------------------------------------------------------------------------
// POST /notices/:id/approve
// ---------------------------------------------------------------------------

router.post("/notices/:id/approve", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  const [existing] = await db
    .select()
    .from(noticesTable)
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  const approveErr = noticeApproveError(existing.status);
  if (approveErr) {
    res.status(409).json({ error: approveErr });
    return;
  }

  const [notice] = await db
    .update(noticesTable)
    .set({
      status: "approved",
      approvedByUserId: "user_coord",
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .returning();

  const approveSession = getSession(req);
  await recordAudit({
    orgId,
    actor: { userId: approveSession.userId, role: approveSession.role },
    action: "notice.approve",
    entityType: "notice",
    entityId: id,
    summary: `Notice approved (${notice.noticeType})`,
    before: { status: existing.status },
    after: { status: notice.status },
  });

  res.json({ notice });
});

// ---------------------------------------------------------------------------
// GET /notices/:id/pdf — generate print-ready statutory PDF
// ---------------------------------------------------------------------------

router.get("/notices/:id/pdf", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  // Load notice.
  const [notice] = await db
    .select()
    .from(noticesTable)
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .limit(1);

  if (!notice) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  // Load recipients.
  const recipients = await db
    .select()
    .from(noticeRecipientsTable)
    .where(and(eq(noticeRecipientsTable.noticeId, id), eq(noticeRecipientsTable.orgId, orgId)));

  // Load stream + project.
  const [stream] = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(and(eq(lienScheduleOfValuesTable.id, notice.lienScheduleOfValuesId), eq(lienScheduleOfValuesTable.orgId, orgId)))
    .limit(1);

  const project = stream
    ? (
        await db
          .select()
          .from(lienProjectsTable)
          .where(
            and(eq(lienProjectsTable.id, stream.lienProjectId), eq(lienProjectsTable.orgId, orgId)),
          )
          .limit(1)
      )[0]
    : undefined;

  // Load any saved document template (region overrides) for this notice type.
  const [tmplRow] = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.orgId, orgId),
        eq(documentTemplatesTable.documentType, notice.noticeType),
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

  const owner = recipients.find((r) => r.recipientType === "owner");
  const gc = recipients.find((r) => r.recipientType === "original_contractor");

  const monthStr = formatMonthYear(notice.monthListed);
  const claimFormatted = formatCurrency(notice.claimAmount);
  const today = formatLongDate(new Date());

  // Best-effort deadline lookup for the {{deadlineDate}} merge field.
  let deadlineDateStr = "";
  if (notice.workMonthId) {
    const [dl] = await db
      .select()
      .from(lienDeadlinesTable)
      .where(
        and(
          eq(lienDeadlinesTable.orgId, orgId),
          eq(lienDeadlinesTable.workMonthId, notice.workMonthId),
          inArray(lienDeadlinesTable.ruleKind, ["notice", "retainage"]),
        ),
      )
      .limit(1);
    if (dl?.computedDate) deadlineDateStr = formatLongDate(dl.computedDate);
  }

  const mergeData: Record<string, string> = {
    claimantName: DEFAULT_CLAIMANT_NAME,
    projectName: project?.cachedProjectName ?? "",
    propertyAddress: project?.legalPropertyAddress ?? "",
    county: project?.county ?? "",
    claimAmount: claimFormatted,
    monthListed: monthStr,
    deadlineDate: deadlineDateStr,
    ownerName: owner?.legalName ?? "",
    ownerAddress: owner?.mailingAddress ?? "",
    gcName: gc?.legalName ?? "",
    gcAddress: gc?.mailingAddress ?? "",
    todayDate: today,
  };

  const resolved = resolveDocument(notice.noticeType, savedRegions, mergeData);

  // Build PDF.
  const doc = new PDFDocument({ margin: 72, size: "letter" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="notice-${id.slice(0, 8)}.pdf"`,
  );
  doc.pipe(res);

  const BLUE = "#1a2b6b";
  const GRAY = "#555555";
  const LIGHT_GRAY = "#999999";

  // Helper: section divider.
  const divider = () => {
    doc
      .moveTo(72, doc.y)
      .lineTo(540, doc.y)
      .lineWidth(0.5)
      .strokeColor("#dddddd")
      .stroke();
    doc.moveDown(0.5);
  };

  // ── Branding / Letterhead (customizable) ────────────────────────────────────
  if (resolved.branding.trim()) {
    renderRichText(doc, resolved.branding, {
      fontSize: 9,
      color: GRAY,
      textOptions: { align: "center" },
    });
    doc.moveDown(0.6);
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  doc
    .fontSize(9)
    .fillColor(LIGHT_GRAY)
    .text("STATE OF TEXAS — MECHANICS' LIEN NOTICE", { align: "center" });
  doc.moveDown(0.3);

  const isRetainage = notice.noticeType === "retainage_claim";
  const statuteRef = isRetainage ? "§ 53.057" : "§ 53.056";
  const noticeTitle = isRetainage
    ? "NOTICE OF CLAIM FOR UNPAID RETAINAGE"
    : notice.noticeType === "early_warning"
    ? "EARLY WARNING NOTICE (COURTESY)"
    : "NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS";

  doc
    .fontSize(14)
    .fillColor(BLUE)
    .font("Helvetica-Bold")
    .text(noticeTitle, { align: "center" });
  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .fillColor(GRAY)
    .font("Helvetica")
    .text(`Texas Property Code ${statuteRef}`, { align: "center" });
  doc.moveDown(1);
  divider();

  // ── Recipients ─────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("NOTICE TO:");
  doc.moveDown(0.4);

  if (owner) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("OWNER:");
    doc.font("Helvetica").fontSize(9).fillColor("#333333").text(owner.legalName);
    if (owner.mailingAddress) doc.text(owner.mailingAddress);
    doc.moveDown(0.5);
  }

  if (gc) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("ORIGINAL CONTRACTOR (GENERAL CONTRACTOR):");
    doc.font("Helvetica").fontSize(9).fillColor("#333333").text(gc.legalName);
    if (gc.mailingAddress) doc.text(gc.mailingAddress);
    doc.moveDown(0.5);
  }

  doc.moveDown(0.5);
  divider();

  // ── Claimant ───────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("CLAIMANT:");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text("Beacon Fire Protection");
  doc.text("Texas Contractor License #:");
  doc.moveDown(1);
  divider();

  // ── Property ───────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("PROPERTY IMPROVED:");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text(project?.cachedProjectName ?? "(Project name not specified)");
  if (project?.legalPropertyAddress) doc.text(project.legalPropertyAddress);
  if (project?.county) doc.text(`${project.county} County, Texas`);
  doc.moveDown(1);
  divider();

  // ── Work + Claim ───────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("CLAIM DETAILS:");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text(`Month of Work Listed: ${monthStr}`);
  doc.text(`Amount of Claim:       ${claimFormatted}`, { characterSpacing: 0.1 });
  if (notice.workDescription) {
    doc.moveDown(0.3);
    doc.text(`Description of Work:   ${notice.workDescription}`);
  }
  doc.moveDown(1);
  divider();

  // ── Intro (customizable) ────────────────────────────────────────────────────
  if (resolved.intro.trim()) {
    renderRichText(doc, resolved.intro, {
      fontSize: 9,
      color: "#333333",
      textOptions: { lineGap: 3 },
    });
    doc.moveDown(1);
    divider();
  }

  // ── Statutory Notice Text (locked) ──────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("STATUTORY NOTICE:");
  doc.moveDown(0.6);
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#333333")
    .text(resolved.lockedBody, { lineGap: 3 });

  doc.moveDown(1.5);
  divider();

  // ── Closing (customizable) ──────────────────────────────────────────────────
  if (resolved.closing.trim()) {
    renderRichText(doc, resolved.closing, {
      fontSize: 9,
      color: "#333333",
      textOptions: { lineGap: 3 },
    });
    doc.moveDown(1.5);
    divider();
  }

  // ── Signature Block (customizable) ──────────────────────────────────────────
  renderRichText(doc, resolved.signature, {
    fontSize: 9,
    color: GRAY,
    textOptions: { lineGap: 2 },
  });
  doc.moveDown(2);

  // ── Footer (customizable) ───────────────────────────────────────────────────
  if (resolved.footer.trim()) {
    renderRichText(doc, resolved.footer, {
      fontSize: 7.5,
      color: LIGHT_GRAY,
      textOptions: { align: "center" },
    });
  }

  doc.end();
});

// ---------------------------------------------------------------------------
// POST /notices/:id/send — send via Shippo certified mail
// ---------------------------------------------------------------------------

router.post("/notices/:id/send", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  const [notice] = await db
    .select()
    .from(noticesTable)
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .limit(1);

  if (!notice) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  const sendErr = noticeSendError(notice.status);
  if (sendErr) {
    res.status(409).json({ error: sendErr });
    return;
  }

  // DD-04: a statutory notice may not go out on a rule set that has not passed
  // legal review (enforced in production only).
  const blockReason = await legalReviewBlockReason(orgId, notice.lienScheduleOfValuesId, "send this notice");
  if (blockReason) {
    res.status(409).json({ error: blockReason });
    return;
  }

  // Check for existing mailing record.
  const [existingMailing] = await db
    .select()
    .from(mailingRecordsTable)
    .where(and(eq(mailingRecordsTable.noticeId, id), eq(mailingRecordsTable.orgId, orgId)))
    .limit(1);

  if (existingMailing) {
    res.status(409).json({ error: "A mailing record already exists for this notice" });
    return;
  }

  // Load recipients for addressing.
  const recipients = await db
    .select()
    .from(noticeRecipientsTable)
    .where(and(eq(noticeRecipientsTable.noticeId, id), eq(noticeRecipientsTable.orgId, orgId)));

  // For certified mail, we send to the first recipient (typically owner).
  // In production, generate a label per recipient.
  const primaryRecipient = recipients.find((r) => r.recipientType === "owner") ?? recipients[0];

  const addressParts = (primaryRecipient?.mailingAddress ?? "").split(",");
  const shippoAddress = {
    name: primaryRecipient?.legalName ?? "Property Owner",
    street1: addressParts[0]?.trim() ?? "Unknown Street",
    city: addressParts[1]?.trim(),
    state: addressParts[2]?.trim(),
  };

  const label = await createCertifiedMailLabel(shippoAddress, id);

  // Create mailing record.
  const [mailing] = await db
    .insert(mailingRecordsTable)
    .values({
      id: randomUUID(),
      orgId,
      noticeId: id,
      provider: "shippo",
      trackingNumber: label.trackingNumber,
      labelUrl: label.labelUrl,
      sentDate: new Date(),
    })
    .returning();

  // Update notice status to sent.
  const [updated] = await db
    .update(noticesTable)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .returning();

  // Auto-satisfy matching open deadlines for this work month. When a notice is
  // sent, the notice/retainage deadline it fulfills should be marked satisfied
  // so the timeline greys it out and the countdown badge disappears.
  let satisfiedDeadlines: typeof lienDeadlinesTable.$inferSelect[] = [];
  if (notice.workMonthId) {
    satisfiedDeadlines = await db
      .update(lienDeadlinesTable)
      .set({ satisfiedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(lienDeadlinesTable.orgId, orgId),
          eq(lienDeadlinesTable.workMonthId, notice.workMonthId),
          inArray(lienDeadlinesTable.ruleKind, ["notice", "retainage"]),
          isNull(lienDeadlinesTable.satisfiedAt),
        ),
      )
      .returning();
  }

  const sendSession = getSession(req);
  await recordAudit({
    orgId,
    actor: { userId: sendSession.userId, role: sendSession.role },
    action: "notice.send",
    entityType: "notice",
    entityId: id,
    summary: `Notice sent via certified mail (tracking ${mailing.trackingNumber ?? "n/a"})`,
    before: { status: notice.status },
    after: { status: updated.status, trackingNumber: mailing.trackingNumber ?? null },
  });

  res.json({ notice: updated, mailing, satisfiedDeadlines });
});

// ---------------------------------------------------------------------------
// POST /notices/:id/deliver — manually confirm delivery of a sent notice
// Used when no Shippo webhook is available (e.g. manual certified-mail send or
// when a green card / proof comes back). Sets notice.status = delivered.
// ---------------------------------------------------------------------------

router.post("/notices/:id/deliver", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;
  const { deliveredAt, proofUrl } = req.body as {
    deliveredAt?: string;
    proofUrl?: string;
  };

  const [notice] = await db
    .select()
    .from(noticesTable)
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .limit(1);

  if (!notice) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  if (notice.status !== "sent") {
    res.status(409).json({
      error: `Notice must be in 'sent' status to confirm delivery (current: '${notice.status}')`,
    });
    return;
  }

  const deliveredDate = deliveredAt ? new Date(deliveredAt) : new Date();

  const [updated] = await db
    .update(noticesTable)
    .set({ status: "delivered", deliveredAt: deliveredDate, updatedAt: new Date() })
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .returning();

  // Attach proof URL to the mailing record if one was supplied.
  let mailing = null;
  if (proofUrl) {
    const [existingMailing] = await db
      .select()
      .from(mailingRecordsTable)
      .where(and(eq(mailingRecordsTable.noticeId, id), eq(mailingRecordsTable.orgId, orgId)))
      .limit(1);
    if (existingMailing) {
      [mailing] = await db
        .update(mailingRecordsTable)
        .set({ proofUrl, updatedAt: new Date() })
        .where(eq(mailingRecordsTable.id, existingMailing.id))
        .returning();
    }
  }

  res.json({ notice: updated, mailing });
});

// ---------------------------------------------------------------------------
// POST /notices/:id/proof — attach delivery proof URL to MailingRecord
// ---------------------------------------------------------------------------

router.post("/notices/:id/proof", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;
  const { proofUrl } = req.body as { proofUrl?: string };

  if (!proofUrl) {
    res.status(400).json({ error: "proofUrl is required" });
    return;
  }

  const [notice] = await db
    .select({ id: noticesTable.id })
    .from(noticesTable)
    .where(and(eq(noticesTable.id, id), eq(noticesTable.orgId, orgId)))
    .limit(1);

  if (!notice) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  const [mailing] = await db
    .select()
    .from(mailingRecordsTable)
    .where(and(eq(mailingRecordsTable.noticeId, id), eq(mailingRecordsTable.orgId, orgId)))
    .limit(1);

  if (!mailing) {
    res.status(404).json({ error: "No mailing record found for this notice" });
    return;
  }

  const [updated] = await db
    .update(mailingRecordsTable)
    .set({ proofUrl, updatedAt: new Date() })
    .where(eq(mailingRecordsTable.id, mailing.id))
    .returning();

  res.json({ mailing: updated });
});

// ---------------------------------------------------------------------------
// POST /webhooks/mailing — Shippo delivery callback
// NOTE: This route is intentionally placed inside the session-gated router
// but the router.use(requireSession) at line 30 is for ALL routes.
// The webhook needs to be outside that gate — it is re-exported by app.ts
// separately under /api without requireSession.
// ---------------------------------------------------------------------------

export const mailingWebhookRouter = Router();

mailingWebhookRouter.post("/webhooks/mailing", async (req, res) => {
  const { tracking_number, status, event } = req.body as {
    tracking_number?: string;
    status?: string;
    event?: string;
  };

  // Validate Shippo webhook secret.
  const sigHeader = req.headers["shippo-webhook-token"] as string | undefined;
  const expectedSig = process.env.SHIPPO_WEBHOOK_SECRET;
  if (expectedSig && sigHeader !== expectedSig) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const deliveryEvents = ["delivered", "transit_delivered", "shippo:delivery:event:delivered"];
  const isDelivered =
    status === "DELIVERED" ||
    (event && deliveryEvents.some((e) => event.includes("delivered")));

  if (!tracking_number || !isDelivered) {
    res.json({ received: true, action: "none" });
    return;
  }

  // Find the mailing record by tracking number.
  const [mailing] = await db
    .select()
    .from(mailingRecordsTable)
    .where(eq(mailingRecordsTable.trackingNumber, tracking_number))
    .limit(1);

  if (!mailing?.noticeId) {
    res.json({ received: true, action: "not_found" });
    return;
  }

  // Update notice to delivered.
  await db
    .update(noticesTable)
    .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
    .where(eq(noticesTable.id, mailing.noticeId));

  res.json({ received: true, noticeId: mailing.noticeId });
});

export default router;
