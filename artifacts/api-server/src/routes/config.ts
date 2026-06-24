import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  departmentsTable,
  systemTypesTable,
  subSystemTypesTable,
  stageTriggerConfigsTable,
  jurisdictionsTable,
  lienRuleSetsTable,
  lienRulesTable,
  documentTemplatesTable,
  lienProjectsTable,
  riskScoreConfigsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { requireAdmin, requireAdminOrPm } from "../lib/admin";
import {
  DEFAULT_RISK_CONFIG,
  loadRiskConfig,
  validateRiskConfig,
} from "../lib/riskScore";
import {
  DOCUMENT_SCHEMAS,
  DOCUMENT_TYPES,
  FIELD_CATALOG,
  REGION_ORDER,
  REGION_META,
  getSchema,
  findInvalidTokens,
  resolveDocument,
  sampleData,
  sanitizeRegionContent,
  type RegionContent,
  type RegionKey,
} from "../lib/documentTemplates";

const router: IRouter = Router();

router.use(requireSession);

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

/**
 * GET /config/departments
 * Returns full department tree: dept → system types → sub-system types.
 */
router.get("/departments", async (req, res) => {
  const { orgId } = getSession(req);
  const [departments, systemTypes, subSystemTypes] = await Promise.all([
    db.select().from(departmentsTable).where(eq(departmentsTable.orgId, orgId)),
    db.select().from(systemTypesTable).where(eq(systemTypesTable.orgId, orgId)),
    db
      .select()
      .from(subSystemTypesTable)
      .where(eq(subSystemTypesTable.orgId, orgId)),
  ]);

  const tree = departments.map((dept) => ({
    ...dept,
    systemTypes: systemTypes
      .filter((st) => st.departmentId === dept.id)
      .map((st) => ({
        ...st,
        subSystemTypes: subSystemTypes.filter(
          (sst) => sst.systemTypeId === st.id,
        ),
      })),
  }));

  res.json({ departments: tree });
});

/**
 * PATCH /config/departments/:id
 * Partial update: name
 */
router.patch("/departments/:id", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [updated] = await db
    .update(departmentsTable)
    .set({ name: name.trim() })
    .where(and(eq(departmentsTable.id, id), eq(departmentsTable.orgId, orgId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  res.json({ department: updated });
});

/**
 * POST /config/departments
 * Creates a department. Body: { name }
 */
router.post("/departments", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId, name: name.trim() })
    .returning();

  res.status(201).json({ department: dept });
});

// ---------------------------------------------------------------------------
// System Types
// ---------------------------------------------------------------------------

/**
 * GET /config/system-types
 * Returns all system types for the org. Optional ?departmentId= filter.
 */
router.get("/system-types", async (req, res) => {
  const { orgId } = getSession(req);
  const { departmentId } = req.query as { departmentId?: string };

  const rows = await db
    .select()
    .from(systemTypesTable)
    .where(
      departmentId
        ? and(
            eq(systemTypesTable.orgId, orgId),
            eq(systemTypesTable.departmentId, departmentId),
          )
        : eq(systemTypesTable.orgId, orgId),
    );

  res.json({ systemTypes: rows });
});

/**
 * PATCH /config/system-types/:id
 * Partial update: name
 */
router.patch("/system-types/:id", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [updated] = await db
    .update(systemTypesTable)
    .set({ name: name.trim() })
    .where(and(eq(systemTypesTable.id, id), eq(systemTypesTable.orgId, orgId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "SystemType not found" });
    return;
  }

  res.json({ systemType: updated });
});

/**
 * POST /config/system-types
 * Body: { name, departmentId }
 */
router.post("/system-types", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const { name, departmentId } = req.body as {
    name?: string;
    departmentId?: string;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!departmentId || typeof departmentId !== "string") {
    res.status(400).json({ error: "departmentId is required" });
    return;
  }

  const [dept] = await db
    .select()
    .from(departmentsTable)
    .where(
      and(
        eq(departmentsTable.id, departmentId),
        eq(departmentsTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  const [st] = await db
    .insert(systemTypesTable)
    .values({ orgId, name: name.trim(), departmentId })
    .returning();

  res.status(201).json({ systemType: st });
});

// ---------------------------------------------------------------------------
// Sub-System Types
// ---------------------------------------------------------------------------

/**
 * GET /config/sub-system-types
 * Returns all sub-system types for the org. Optional ?systemTypeId= filter.
 */
router.get("/sub-system-types", async (req, res) => {
  const { orgId } = getSession(req);
  const { systemTypeId } = req.query as { systemTypeId?: string };

  const rows = await db
    .select()
    .from(subSystemTypesTable)
    .where(
      systemTypeId
        ? and(
            eq(subSystemTypesTable.orgId, orgId),
            eq(subSystemTypesTable.systemTypeId, systemTypeId),
          )
        : eq(subSystemTypesTable.orgId, orgId),
    );

  res.json({ subSystemTypes: rows });
});

/**
 * POST /config/sub-system-types
 * Body: { name, systemTypeId, lienWorkflowType } — lienWorkflowType REQUIRED (L05)
 */
router.post("/sub-system-types", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const { name, systemTypeId, lienWorkflowType } = req.body as {
    name?: string;
    systemTypeId?: string;
    lienWorkflowType?: string;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!systemTypeId || typeof systemTypeId !== "string") {
    res.status(400).json({ error: "systemTypeId is required" });
    return;
  }
  if (!lienWorkflowType || typeof lienWorkflowType !== "string") {
    res.status(400).json({
      error:
        "lienWorkflowType is required — every sub-system type must declare its lien workflow (L05)",
    });
    return;
  }

  const validTypes = [
    "residential_sub",
    "commercial_sub",
    "public_bond",
    "none",
  ];
  if (!validTypes.includes(lienWorkflowType)) {
    res.status(400).json({
      error: `lienWorkflowType must be one of: ${validTypes.join(", ")}`,
    });
    return;
  }

  const [st] = await db
    .select()
    .from(systemTypesTable)
    .where(
      and(
        eq(systemTypesTable.id, systemTypeId),
        eq(systemTypesTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!st) {
    res.status(404).json({ error: "SystemType not found" });
    return;
  }

  const [sst] = await db
    .insert(subSystemTypesTable)
    .values({
      orgId,
      name: name.trim(),
      systemTypeId,
      lienWorkflowType: lienWorkflowType as
        | "residential_sub"
        | "commercial_sub"
        | "public_bond"
        | "none",
    })
    .returning();

  res.status(201).json({ subSystemType: sst });
});

/**
 * PATCH /config/sub-system-types/:id
 * Partial update: name, lienWorkflowType
 */
router.patch("/sub-system-types/:id", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;
  const { name, lienWorkflowType } = req.body as {
    name?: string;
    lienWorkflowType?: string;
  };

  const [existing] = await db
    .select()
    .from(subSystemTypesTable)
    .where(
      and(eq(subSystemTypesTable.id, id), eq(subSystemTypesTable.orgId, orgId)),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "SubSystemType not found" });
    return;
  }

  const validTypes = [
    "residential_sub",
    "commercial_sub",
    "public_bond",
    "none",
  ];

  if (
    lienWorkflowType !== undefined &&
    !validTypes.includes(lienWorkflowType)
  ) {
    res.status(400).json({
      error: `lienWorkflowType must be one of: ${validTypes.join(", ")}`,
    });
    return;
  }

  const setName = name !== undefined ? name.trim() : undefined;
  const setWorkflowType =
    lienWorkflowType !== undefined
      ? (lienWorkflowType as
          | "residential_sub"
          | "commercial_sub"
          | "public_bond"
          | "none")
      : undefined;

  if (setName === undefined && setWorkflowType === undefined) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const [updated] = await db
    .update(subSystemTypesTable)
    .set({
      ...(setName !== undefined && { name: setName }),
      ...(setWorkflowType !== undefined && {
        lienWorkflowType: setWorkflowType,
      }),
    })
    .where(
      and(eq(subSystemTypesTable.id, id), eq(subSystemTypesTable.orgId, orgId)),
    )
    .returning();

  res.json({ subSystemType: updated });
});

// ---------------------------------------------------------------------------
// Stage Triggers
// ---------------------------------------------------------------------------

/**
 * GET /config/stage-triggers
 */
router.get("/stage-triggers", async (req, res) => {
  const { orgId } = getSession(req);
  const triggers = await db
    .select()
    .from(stageTriggerConfigsTable)
    .where(eq(stageTriggerConfigsTable.orgId, orgId));

  res.json({ stageTriggers: triggers });
});

/**
 * POST /config/stage-triggers
 * Body: { hubspotStageKey, label, lienClockTrigger }
 */
router.post("/stage-triggers", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  const { hubspotStageKey, label, lienClockTrigger } = req.body as {
    hubspotStageKey?: string;
    label?: string;
    lienClockTrigger?: string;
  };

  if (!hubspotStageKey || typeof hubspotStageKey !== "string") {
    res.status(400).json({ error: "hubspotStageKey is required" });
    return;
  }
  if (!label || typeof label !== "string") {
    res.status(400).json({ error: "label is required" });
    return;
  }
  if (!lienClockTrigger || typeof lienClockTrigger !== "string") {
    res.status(400).json({ error: "lienClockTrigger is required" });
    return;
  }

  const validTriggers = ["none", "design_start", "field_work_start"];
  if (!validTriggers.includes(lienClockTrigger)) {
    res.status(400).json({
      error: `lienClockTrigger must be one of: ${validTriggers.join(", ")}`,
    });
    return;
  }

  const [trigger] = await db
    .insert(stageTriggerConfigsTable)
    .values({
      orgId,
      hubspotStageKey: hubspotStageKey.trim(),
      label: label.trim(),
      lienClockTrigger: lienClockTrigger as
        | "none"
        | "design_start"
        | "field_work_start",
    })
    .returning();

  res.status(201).json({ stageTrigger: trigger });
});

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------

/**
 * GET /config/jurisdictions
 * Returns jurisdictions with their rule sets.
 */
router.get("/jurisdictions", async (req, res) => {
  const { orgId } = getSession(req);
  const [jurisdictions, ruleSets] = await Promise.all([
    db
      .select()
      .from(jurisdictionsTable)
      .where(eq(jurisdictionsTable.orgId, orgId)),
    db
      .select()
      .from(lienRuleSetsTable)
      .where(eq(lienRuleSetsTable.orgId, orgId)),
  ]);

  const result = jurisdictions.map((j) => ({
    ...j,
    ruleSets: ruleSets.filter((rs) => rs.jurisdictionId === j.id),
  }));

  res.json({ jurisdictions: result });
});

/**
 * POST /config/jurisdictions
 * Body: { code, name }
 */
router.post("/jurisdictions", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const { code, name } = req.body as { code?: string; name?: string };

  if (!code || typeof code !== "string" || code.trim() === "") {
    res.status(400).json({ error: "code is required" });
    return;
  }
  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [jurisdiction] = await db
    .insert(jurisdictionsTable)
    .values({ orgId, code: code.trim().toUpperCase(), name: name.trim() })
    .returning();

  res.status(201).json({ jurisdiction });
});

// ---------------------------------------------------------------------------
// Rule Sets
// ---------------------------------------------------------------------------

/**
 * POST /config/rule-sets
 * Body: { jurisdictionId, version, effectiveDate, statuteRef }
 */
router.post("/rule-sets", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const { jurisdictionId, version, effectiveDate, statuteRef } = req.body as {
    jurisdictionId?: string;
    version?: string;
    effectiveDate?: string;
    statuteRef?: string;
  };

  if (!jurisdictionId) {
    res.status(400).json({ error: "jurisdictionId is required" });
    return;
  }
  if (!version || typeof version !== "string" || version.trim() === "") {
    res.status(400).json({ error: "version is required" });
    return;
  }
  if (!effectiveDate || isNaN(Date.parse(effectiveDate))) {
    res
      .status(400)
      .json({ error: "effectiveDate must be a valid ISO date string" });
    return;
  }
  if (
    !statuteRef ||
    typeof statuteRef !== "string" ||
    statuteRef.trim() === ""
  ) {
    res.status(400).json({ error: "statuteRef is required" });
    return;
  }

  const [jur] = await db
    .select()
    .from(jurisdictionsTable)
    .where(
      and(
        eq(jurisdictionsTable.id, jurisdictionId),
        eq(jurisdictionsTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!jur) {
    res.status(404).json({ error: "Jurisdiction not found" });
    return;
  }

  const [ruleSet] = await db
    .insert(lienRuleSetsTable)
    .values({
      orgId,
      jurisdictionId,
      version: version.trim(),
      effectiveDate: new Date(effectiveDate),
      statuteRef: statuteRef.trim(),
    })
    .returning();

  res.status(201).json({ ruleSet });
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * GET /config/rule-sets/:id/rules
 * Returns all rules for a given rule set.
 */
router.get("/rule-sets/:id/rules", async (req, res) => {
  const { orgId } = getSession(req);
  const { id } = req.params;

  const [rs] = await db
    .select()
    .from(lienRuleSetsTable)
    .where(
      and(eq(lienRuleSetsTable.id, id), eq(lienRuleSetsTable.orgId, orgId)),
    )
    .limit(1);

  if (!rs) {
    res.status(404).json({ error: "RuleSet not found" });
    return;
  }

  const rules = await db
    .select()
    .from(lienRulesTable)
    .where(
      and(eq(lienRulesTable.ruleSetId, id), eq(lienRulesTable.orgId, orgId)),
    );

  res.json({ rules });
});

/**
 * POST /config/rules
 * Full LienRule body.
 */
router.post("/rules", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const {
    ruleSetId,
    lienWorkflowType,
    workStream,
    ruleKind,
    anchor,
    offsetMonths,
    offsetDayOfMonth,
    offsetDays,
    offsetIsBusinessDays,
    businessDayHandling,
    statuteCitation,
    description,
  } = req.body as {
    ruleSetId?: string;
    lienWorkflowType?: string;
    workStream?: string;
    ruleKind?: string;
    anchor?: string;
    offsetMonths?: number;
    offsetDayOfMonth?: number;
    offsetDays?: number;
    offsetIsBusinessDays?: boolean;
    businessDayHandling?: string;
    statuteCitation?: string;
    description?: string;
  };

  if (!ruleSetId) {
    res.status(400).json({ error: "ruleSetId is required" });
    return;
  }
  if (!lienWorkflowType) {
    res.status(400).json({ error: "lienWorkflowType is required" });
    return;
  }
  if (!workStream) {
    res.status(400).json({ error: "workStream is required" });
    return;
  }
  if (!ruleKind) {
    res.status(400).json({ error: "ruleKind is required" });
    return;
  }
  if (!anchor) {
    res.status(400).json({ error: "anchor is required" });
    return;
  }
  if (!statuteCitation) {
    res.status(400).json({ error: "statuteCitation is required" });
    return;
  }
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  const [rs] = await db
    .select()
    .from(lienRuleSetsTable)
    .where(
      and(
        eq(lienRuleSetsTable.id, ruleSetId),
        eq(lienRuleSetsTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!rs) {
    res.status(404).json({ error: "RuleSet not found" });
    return;
  }

  const [rule] = await db
    .insert(lienRulesTable)
    .values({
      orgId,
      ruleSetId,
      lienWorkflowType: lienWorkflowType as
        | "residential_sub"
        | "commercial_sub"
        | "public_bond"
        | "none",
      workStream: workStream as "construction" | "design",
      ruleKind: ruleKind as
        | "notice"
        | "filing"
        | "retainage"
        | "post_filing_notice"
        | "enforcement"
        | "release",
      anchor,
      offsetMonths: offsetMonths ?? null,
      offsetDayOfMonth: offsetDayOfMonth ?? null,
      offsetDays: offsetDays ?? null,
      offsetIsBusinessDays: offsetIsBusinessDays ?? false,
      businessDayHandling:
        (businessDayHandling as "next_business_day" | "exact" | undefined) ??
        "next_business_day",
      statuteCitation: statuteCitation.trim(),
      description: description.trim(),
    })
    .returning();

  res.status(201).json({ rule });
});

/**
 * DELETE /config/rules/:id
 *
 * Removes a single rule from a rule set. Restricted to admin/pm. Rules are
 * standards the team manages, so deletion is allowed freely; previously
 * computed deadlines that referenced this rule are left untouched and simply
 * won't be regenerated on the next recompute.
 */
router.delete("/rules/:id", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;

  const [existing] = await db
    .select()
    .from(lienRulesTable)
    .where(and(eq(lienRulesTable.id, id), eq(lienRulesTable.orgId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  await db
    .delete(lienRulesTable)
    .where(and(eq(lienRulesTable.id, id), eq(lienRulesTable.orgId, orgId)));

  res.json({ ok: true });
});

/**
 * PATCH /config/rules/:id
 *
 * Updates an existing rule's values in place. Restricted to admin/pm and
 * org-scoped. The parent rule set (ruleSetId) is immutable here — to move a
 * rule, delete and re-create it. All other fields are required, mirroring the
 * POST /rules contract so a rule can never be left in a half-defined state.
 */
router.patch("/rules/:id", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;
  const {
    lienWorkflowType,
    workStream,
    ruleKind,
    anchor,
    offsetMonths,
    offsetDayOfMonth,
    offsetDays,
    offsetIsBusinessDays,
    businessDayHandling,
    statuteCitation,
    description,
  } = req.body as {
    lienWorkflowType?: string;
    workStream?: string;
    ruleKind?: string;
    anchor?: string;
    offsetMonths?: number | null;
    offsetDayOfMonth?: number | null;
    offsetDays?: number | null;
    offsetIsBusinessDays?: boolean;
    businessDayHandling?: string;
    statuteCitation?: string;
    description?: string;
  };

  if (!lienWorkflowType) {
    res.status(400).json({ error: "lienWorkflowType is required" });
    return;
  }
  if (!workStream) {
    res.status(400).json({ error: "workStream is required" });
    return;
  }
  if (!ruleKind) {
    res.status(400).json({ error: "ruleKind is required" });
    return;
  }
  if (!anchor) {
    res.status(400).json({ error: "anchor is required" });
    return;
  }
  if (!statuteCitation) {
    res.status(400).json({ error: "statuteCitation is required" });
    return;
  }
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(lienRulesTable)
    .where(and(eq(lienRulesTable.id, id), eq(lienRulesTable.orgId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  const [rule] = await db
    .update(lienRulesTable)
    .set({
      lienWorkflowType: lienWorkflowType as
        | "residential_sub"
        | "commercial_sub"
        | "public_bond"
        | "none",
      workStream: workStream as "construction" | "design",
      ruleKind: ruleKind as
        | "notice"
        | "filing"
        | "retainage"
        | "post_filing_notice"
        | "enforcement"
        | "release",
      anchor,
      offsetMonths: offsetMonths ?? null,
      offsetDayOfMonth: offsetDayOfMonth ?? null,
      offsetDays: offsetDays ?? null,
      offsetIsBusinessDays: offsetIsBusinessDays ?? false,
      businessDayHandling:
        (businessDayHandling as "next_business_day" | "exact" | undefined) ??
        "next_business_day",
      statuteCitation: statuteCitation.trim(),
      description: description.trim(),
      updatedAt: new Date(),
    })
    .where(and(eq(lienRulesTable.id, id), eq(lienRulesTable.orgId, orgId)))
    .returning();

  res.json({ rule });
});

/**
 * DELETE /config/rule-sets/:id
 *
 * Removes a rule set and all of its child rules. Restricted to admin/pm.
 * FK columns are plain text (no DB-level cascade), so child rules are deleted
 * explicitly first.
 */
router.delete("/rule-sets/:id", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;

  const [existing] = await db
    .select()
    .from(lienRuleSetsTable)
    .where(and(eq(lienRuleSetsTable.id, id), eq(lienRuleSetsTable.orgId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "RuleSet not found" });
    return;
  }

  await db
    .delete(lienRulesTable)
    .where(
      and(eq(lienRulesTable.ruleSetId, id), eq(lienRulesTable.orgId, orgId)),
    );

  await db
    .delete(lienRuleSetsTable)
    .where(
      and(eq(lienRuleSetsTable.id, id), eq(lienRuleSetsTable.orgId, orgId)),
    );

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Rule Set "Reviewed" badge (informational, non-blocking)
// ---------------------------------------------------------------------------

/**
 * PATCH /config/rule-sets/:id/review
 *
 * Toggles the informational "Reviewed" badge on a rule set. This is NOT a
 * production gate — rule sets are usable regardless of review state (recompute
 * never filtered on it). Authorized users (admin/pm) can set it both true and
 * false. Body: { legalReviewed: boolean }
 */
router.patch("/rule-sets/:id/review", requireAdminOrPm, async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;
  const { legalReviewed } = req.body as { legalReviewed?: unknown };

  if (typeof legalReviewed !== "boolean") {
    res.status(400).json({
      error: "legalReviewed must be a boolean",
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(lienRuleSetsTable)
    .where(
      and(eq(lienRuleSetsTable.id, id), eq(lienRuleSetsTable.orgId, orgId)),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "RuleSet not found" });
    return;
  }

  const [updated] = await db
    .update(lienRuleSetsTable)
    .set({ legalReviewed })
    .where(
      and(eq(lienRuleSetsTable.id, id), eq(lienRuleSetsTable.orgId, orgId)),
    )
    .returning();

  res.json({ ruleSet: updated });
});

/**
 * GET /config/qbo-status
 *
 * Returns whether QBO credentials are present in the environment.
 * The UI uses this to decide whether to show the Sync QBO button or a
 * "Not connected" message. No credential values are ever returned.
 */
router.get("/qbo-status", (_req, res) => {
  const connected = !!(
    process.env.QBO_CLIENT_ID &&
    process.env.QBO_CLIENT_SECRET &&
    process.env.QBO_REFRESH_TOKEN &&
    process.env.QBO_REALM_ID
  );
  res.json({ connected });
});

/**
 * GET /config/hubspot-status
 *
 * Returns whether a HubSpot API key is present in the environment.
 * The UI uses this to show connection status. No credential values are returned.
 */
router.get("/hubspot-status", (_req, res) => {
  const connected = !!process.env.HUBSPOT_API_KEY;
  res.json({ connected });
});

/**
 * GET /config/notarylive-status
 *
 * Returns whether real (non-sandbox) NotaryLive credentials are present.
 * When absent, the integration still works against NotaryLive's public
 * sandbox, but orders never reach a true notarized state. No credential
 * values are ever returned.
 */
router.get("/notarylive-status", (_req, res) => {
  const connected = !!(
    process.env.NOTARYLIVE_API_USER && process.env.NOTARYLIVE_API_KEY
  );
  res.json({ connected });
});

// ---------------------------------------------------------------------------
// Document Templates
//
// Admins customize the branding/intro/closing/signature/footer regions of each
// client-facing document type. Statutory body text is locked in code and merged
// with real data only at PDF generation. A null saved region falls back to the
// hard-coded default (no regression when nothing is saved).
// ---------------------------------------------------------------------------

function regionOverridesFromRow(
  row: typeof documentTemplatesTable.$inferSelect | undefined,
): RegionContent {
  const out: RegionContent = {};
  for (const key of REGION_ORDER) {
    out[key] = (row?.[key] ?? null) as string | null;
  }
  return out;
}

/**
 * GET /config/document-templates
 * Lists every customizable document type with category, label, and whether a
 * saved template exists for this org.
 */
router.get("/document-templates", async (req, res) => {
  const { orgId, role } = getSession(req);

  const rows = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.orgId, orgId));

  const savedByType = new Map(rows.map((r) => [r.documentType, r]));

  const templates = DOCUMENT_TYPES.map((type) => {
    const schema = DOCUMENT_SCHEMAS[type]!;
    const row = savedByType.get(type);
    return {
      type,
      category: schema.category,
      label: schema.label,
      statuteRef: schema.statuteRef,
      customized: !!row,
      updatedAt: row?.updatedAt ?? null,
    };
  });

  res.json({ templates, canEdit: role === "admin" });
});

/**
 * GET /config/document-templates/:type
 * Returns the schema (region defaults, locked body, available fields) plus any
 * saved region overrides for this org.
 */
router.get("/document-templates/:type", async (req, res) => {
  const { orgId, role } = getSession(req);
  const type = req.params["type"] as string;

  const schema = getSchema(type);
  if (!schema) {
    res.status(404).json({ error: "Unknown document type" });
    return;
  }

  const [row] = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.orgId, orgId),
        eq(documentTemplatesTable.documentType, type),
      ),
    )
    .limit(1);

  res.json({
    type,
    category: schema.category,
    label: schema.label,
    statuteRef: schema.statuteRef,
    lockedBody: schema.lockedBody,
    regions: REGION_ORDER.map((key) => ({
      key,
      label: REGION_META[key].label,
      description: REGION_META[key].description,
      default: schema.defaults[key],
    })),
    fields: schema.fields.map((key) => ({ key, label: FIELD_CATALOG[key].label })),
    saved: regionOverridesFromRow(row),
    customized: !!row,
    updatedAt: row?.updatedAt ?? null,
    canEdit: role === "admin",
  });
});

/**
 * PUT /config/document-templates/:type
 * Upserts the saved region overrides for a document type. Admin only.
 * Body: { branding, intro, closing, signature, footer } — each string|null.
 * A null region resets that region to its hard-coded default.
 */
router.put("/document-templates/:type", requireAdmin, async (req, res) => {
  const { orgId, userId } = getSession(req);
  const type = req.params["type"] as string;

  if (!getSchema(type)) {
    res.status(404).json({ error: "Unknown document type" });
    return;
  }

  const regions = sanitizeRegionContent(req.body);

  // Reject any merge token not in this document type's allowed field set, so
  // unsupported tokens (e.g. typed by hand) never reach PDF generation.
  const invalidTokens = findInvalidTokens(type, regions);
  if (invalidTokens.length > 0) {
    res.status(400).json({
      error: `Unknown merge field(s) for this document: ${invalidTokens
        .map((t) => `{{${t}}}`)
        .join(", ")}`,
    });
    return;
  }

  const values = {
    branding: regions.branding ?? null,
    intro: regions.intro ?? null,
    closing: regions.closing ?? null,
    signature: regions.signature ?? null,
    footer: regions.footer ?? null,
  };

  const [existing] = await db
    .select({ id: documentTemplatesTable.id })
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.orgId, orgId),
        eq(documentTemplatesTable.documentType, type),
      ),
    )
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(documentTemplatesTable)
      .set({ ...values, updatedByUserId: userId ?? null, updatedAt: new Date() })
      .where(eq(documentTemplatesTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(documentTemplatesTable)
      .values({
        orgId,
        documentType: type,
        ...values,
        updatedByUserId: userId ?? null,
      })
      .returning();
  }

  res.json({
    type,
    saved: regionOverridesFromRow(row),
    customized: true,
    updatedAt: row?.updatedAt ?? null,
  });
});

/**
 * POST /config/document-templates/:type/preview
 * Resolves the document with the supplied (unsaved) region content against
 * sample data. An optional projectId splices a real project's name/address/
 * county into the sample baseline. Admin or not — read-only preview.
 * Body: { regions?: RegionContent, projectId?: string }
 */
router.post("/document-templates/:type/preview", async (req, res) => {
  const { orgId } = getSession(req);
  const type = req.params["type"] as string;

  const schema = getSchema(type);
  if (!schema) {
    res.status(404).json({ error: "Unknown document type" });
    return;
  }

  const { regions, projectId } = req.body as {
    regions?: unknown;
    projectId?: string;
  };

  const overrides: Partial<Record<string, string>> = {};
  let projectName: string | null = null;
  if (projectId) {
    const [project] = await db
      .select()
      .from(lienProjectsTable)
      .where(
        and(
          eq(lienProjectsTable.id, projectId),
          eq(lienProjectsTable.orgId, orgId),
        ),
      )
      .limit(1);
    if (project) {
      projectName = project.cachedProjectName ?? null;
      if (project.cachedProjectName) overrides.projectName = project.cachedProjectName;
      if (project.legalPropertyAddress)
        overrides.propertyAddress = project.legalPropertyAddress;
      if (project.county) overrides.county = project.county;
    }
  }

  const data = sampleData(overrides);
  const resolved = resolveDocument(
    type,
    sanitizeRegionContent(regions),
    data,
  );

  res.json({
    type,
    label: schema.label,
    statuteRef: schema.statuteRef,
    resolved,
    source: projectName ? { kind: "project", projectName } : { kind: "sample" },
  });
});

// ---------------------------------------------------------------------------
// Risk Scoring
// Org-wide configuration of the collection risk score factor bands. The shared
// calculator (lib/riskScore.ts) reads this config on every recompute, so saved
// changes immediately drive new scores. When no row exists, defaults are used.
// ---------------------------------------------------------------------------

/**
 * GET /config/risk-scoring
 * Returns the org's saved risk-scoring config (or defaults), plus the system
 * defaults so the UI can offer a reset and indicate whether the org has
 * customized its scoring.
 */
router.get("/risk-scoring", async (req, res) => {
  const { orgId } = getSession(req);
  const config = await loadRiskConfig(orgId);
  const isDefault =
    JSON.stringify(config) === JSON.stringify(DEFAULT_RISK_CONFIG);
  res.json({ config, defaults: DEFAULT_RISK_CONFIG, isDefault });
});

/**
 * PUT /config/risk-scoring
 * Admin-only. Validates and upserts the org's risk-scoring config.
 */
router.put("/risk-scoring", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);

  const body = req.body as { config?: unknown };
  const candidate = body && body.config !== undefined ? body.config : req.body;
  const parsed = validateRiskConfig(candidate);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid risk-scoring configuration",
      details: parsed.issues,
    });
    return;
  }

  const config = parsed.data;

  const [existing] = await db
    .select()
    .from(riskScoreConfigsTable)
    .where(eq(riskScoreConfigsTable.orgId, orgId))
    .limit(1);

  if (existing) {
    await db
      .update(riskScoreConfigsTable)
      .set({ config })
      .where(eq(riskScoreConfigsTable.orgId, orgId));
  } else {
    await db.insert(riskScoreConfigsTable).values({ orgId, config });
  }

  res.json({ config });
});

/**
 * DELETE /config/risk-scoring
 * Admin-only. Removes the org's custom config so scoring falls back to the
 * system defaults (reset-to-defaults).
 */
router.delete("/risk-scoring", requireAdmin, async (req, res) => {
  const { orgId } = getSession(req);
  await db
    .delete(riskScoreConfigsTable)
    .where(eq(riskScoreConfigsTable.orgId, orgId));
  res.json({ config: DEFAULT_RISK_CONFIG, defaults: DEFAULT_RISK_CONFIG, isDefault: true });
});

export default router;
