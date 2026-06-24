import { Router } from "express";
import { db } from "@workspace/db";
import {
  lienProjectsTable,
  projectPartyLinksTable,
  linkedClientsTable,
  subSystemTypesTable,
  lienScheduleOfValuesTable,
  jurisdictionsTable,
  workMonthsTable,
  lienDeadlinesTable,
  lienRulesTable,
  timesheetLinksTable,
} from "@workspace/db";
import { eq, and, inArray, max, or, ilike } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { hubspotClient } from "../lib/clients/hubspot";

const router = Router();
router.use(requireSession);

// ---------------------------------------------------------------------------
// Risk helpers
// ---------------------------------------------------------------------------

type RiskLevel = "high" | "medium" | "low" | "ok";

const STREAM_STATUS_RISK: Record<string, RiskLevel> = {
  at_risk: "high",
  filing: "high",
  lapsed: "high",
  notice_active: "medium",
  filed: "medium",
  open: "low",
  released: "ok",
  closed: "ok",
};

const RISK_ORDER: RiskLevel[] = ["high", "medium", "low", "ok"];

function highestRisk(statuses: string[]): RiskLevel | null {
  if (!statuses.length) return null;
  for (const level of RISK_ORDER) {
    if (statuses.some((s) => STREAM_STATUS_RISK[s] === level)) return level;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Checklist helpers
// ---------------------------------------------------------------------------

function computeChecklist(
  project: {
    legalPropertyAddress: string | null;
    county: string | null;
    contractStartDate: Date | null;
    contractorTier: string;
  },
  parties: { partyRelationType: string }[],
) {
  const missing: { field: string; label: string }[] = [];

  if (!project.legalPropertyAddress) {
    missing.push({
      field: "legalPropertyAddress",
      label: "Legal property address is required",
    });
  }
  if (!project.county) {
    missing.push({ field: "county", label: "County is required" });
  }
  if (!project.contractStartDate) {
    missing.push({
      field: "contractStartDate",
      label: "Contract start date is required",
    });
  }
  if (project.contractorTier === "second_tier") {
    const hasHiringParty = parties.some(
      (p) => p.partyRelationType === "hiring_party",
    );
    const hasOriginalContractor = parties.some(
      (p) => p.partyRelationType === "original_contractor",
    );
    if (!hasHiringParty) {
      missing.push({
        field: "hiring_party",
        label: "Hiring party is required for 2nd-tier projects",
      });
    }
    if (!hasOriginalContractor) {
      missing.push({
        field: "original_contractor",
        label: "Original contractor is required for 2nd-tier projects",
      });
    }
  }

  return { complete: missing.length === 0, missing };
}

async function refreshChecklistComplete(orgId: string, projectId: string) {
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
  if (!project) return;

  const parties = await db
    .select({ partyRelationType: projectPartyLinksTable.partyRelationType })
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.lienProjectId, projectId),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    );

  const { complete } = computeChecklist(project, parties);

  await db
    .update(lienProjectsTable)
    .set({ completionChecklistComplete: complete })
    .where(
      and(
        eq(lienProjectsTable.id, projectId),
        eq(lienProjectsTable.orgId, orgId),
      ),
    );
}

// ---------------------------------------------------------------------------
// GET /projects
// Query params: status, lienWorkflowType, contractorTier, incomplete, risk (high|medium|low|ok)
//              page (default 1), limit (default 50, max 200)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const { orgId } = getSession(req);
  const {
    status,
    lienWorkflowType,
    contractorTier,
    incomplete,
    risk,
    page: pageRaw,
    limit: limitRaw,
  } = req.query as Record<string, string | undefined>;

  const [projects, allSovs, allParties] = await Promise.all([
    db
      .select()
      .from(lienProjectsTable)
      .where(eq(lienProjectsTable.orgId, orgId)),
    db.select().from(lienScheduleOfValuesTable).where(eq(lienScheduleOfValuesTable.orgId, orgId)),
    db
      .select({
        lienProjectId: projectPartyLinksTable.lienProjectId,
        partyRelationType: projectPartyLinksTable.partyRelationType,
      })
      .from(projectPartyLinksTable)
      .where(eq(projectPartyLinksTable.orgId, orgId)),
  ]);

  // Fetch all work months + deadlines for the org so we can summarize each
  // project's next upcoming statutory deadline without N+1 queries.
  const allSovIds = allSovs.map((s) => s.id);
  const allWorkMonths =
    allSovIds.length > 0
      ? await db
          .select({ id: workMonthsTable.id, lienScheduleOfValuesId: workMonthsTable.lienScheduleOfValuesId })
          .from(workMonthsTable)
          .where(
            and(inArray(workMonthsTable.lienScheduleOfValuesId, allSovIds), eq(workMonthsTable.orgId, orgId)),
          )
      : [];
  const workMonthToSov = new Map(allWorkMonths.map((wm) => [wm.id, wm.lienScheduleOfValuesId]));
  const sovToProject = new Map(allSovs.map((s) => [s.id, s.lienProjectId]));
  const allWorkMonthIds = allWorkMonths.map((wm) => wm.id);
  const allDeadlines =
    allWorkMonthIds.length > 0
      ? await db
          .select({
            id: lienDeadlinesTable.id,
            workMonthId: lienDeadlinesTable.workMonthId,
            adjustedDate: lienDeadlinesTable.adjustedDate,
            satisfiedAt: lienDeadlinesTable.satisfiedAt,
            ruleId: lienDeadlinesTable.ruleId,
          })
          .from(lienDeadlinesTable)
          .where(
            and(
              inArray(lienDeadlinesTable.workMonthId, allWorkMonthIds),
              eq(lienDeadlinesTable.orgId, orgId),
            ),
          )
      : [];

  // Group earliest unsatisfied deadline per project (past = overdue, future = upcoming).
  const nextDeadlineByProject = new Map<
    string,
    { id: string; adjustedDate: Date; lienScheduleOfValuesId: string }
  >();
  for (const d of allDeadlines) {
    if (d.satisfiedAt) continue;
    const sovId = workMonthToSov.get(d.workMonthId);
    if (!sovId) continue;
    const projectId = sovToProject.get(sovId);
    if (!projectId) continue;
    const existing = nextDeadlineByProject.get(projectId);
    const candidate = { id: d.id, adjustedDate: d.adjustedDate, lienScheduleOfValuesId: sovId };
    if (
      !existing ||
      new Date(candidate.adjustedDate).getTime() < new Date(existing.adjustedDate).getTime()
    ) {
      nextDeadlineByProject.set(projectId, candidate);
    }
  }

  // Attach sovs + compute live checklist for each project
  const projectsWithMeta = projects.map((p) => {
    const sovs = allSovs.filter((s) => s.lienProjectId === p.id);
    const parties = allParties.filter((pp) => pp.lienProjectId === p.id);
    const { complete: liveChecklistComplete } = computeChecklist(p, parties);
    return {
      ...p,
      completionChecklistComplete: liveChecklistComplete,
      sovs,
      nextDeadline: nextDeadlineByProject.get(p.id) ?? null,
    };
  });

  let filtered = projectsWithMeta;

  if (status) {
    filtered = filtered.filter((p) => p.cachedHubspotStatus === status);
  }
  if (lienWorkflowType) {
    filtered = filtered.filter((p) => p.lienWorkflowType === lienWorkflowType);
  }
  if (contractorTier) {
    filtered = filtered.filter((p) => p.contractorTier === contractorTier);
  }
  if (incomplete === "true") {
    filtered = filtered.filter((p) => !p.completionChecklistComplete);
  }
  if (risk) {
    const validRisks: RiskLevel[] = ["high", "medium", "low", "ok"];
    if (validRisks.includes(risk as RiskLevel)) {
      filtered = filtered.filter((p) => {
        const statuses = p.sovs.map((s) => s.status);
        return highestRisk(statuses) === (risk as RiskLevel);
      });
    }
  }

  const total = filtered.length;
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(limitRaw ?? "50", 10) || 50),
  );
  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  res.json({ projects: paginated, total, page, limit });
});

// ---------------------------------------------------------------------------
// GET /projects/search
// Query params: q (substring), limit (default 8, max 25)
// Lightweight global search: matches project name, HubSpot id, or any linked
// party legal name (e.g. owner / GC / hiring party). Org-scoped.
// NOTE: must be declared before GET /:id so "search" isn't captured as an id.
// ---------------------------------------------------------------------------
router.get("/search", async (req, res) => {
  const { orgId } = getSession(req);
  const { q: qRaw, limit: limitRaw } = req.query as Record<
    string,
    string | undefined
  >;

  const q = (qRaw ?? "").trim();
  const limit = Math.min(25, Math.max(1, parseInt(limitRaw ?? "8", 10) || 8));

  if (q.length === 0) {
    res.json({ results: [] });
    return;
  }

  const pattern = `%${q}%`;

  // Parties whose legal name matches — so searching a client/GC name surfaces
  // the project. Map party -> project for org-scoped projects only.
  const partyMatches = await db
    .select({
      lienProjectId: projectPartyLinksTable.lienProjectId,
      cachedLegalName: projectPartyLinksTable.cachedLegalName,
      partyRelationType: projectPartyLinksTable.partyRelationType,
    })
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.orgId, orgId),
        ilike(projectPartyLinksTable.cachedLegalName, pattern),
      ),
    );
  const partyProjectIds = partyMatches.map((p) => p.lienProjectId);

  const matched = await db
    .select({
      id: lienProjectsTable.id,
      cachedProjectName: lienProjectsTable.cachedProjectName,
      hubspotProjectId: lienProjectsTable.hubspotProjectId,
      cachedHubspotStatus: lienProjectsTable.cachedHubspotStatus,
      lienWorkflowType: lienProjectsTable.lienWorkflowType,
    })
    .from(lienProjectsTable)
    .where(
      and(
        eq(lienProjectsTable.orgId, orgId),
        or(
          ilike(lienProjectsTable.cachedProjectName, pattern),
          ilike(lienProjectsTable.hubspotProjectId, pattern),
          partyProjectIds.length > 0
            ? inArray(lienProjectsTable.id, partyProjectIds)
            : undefined,
        ),
      ),
    );

  // Pick a representative client name per project (prefer hiring party / GC).
  const PARTY_PRIORITY: Record<string, number> = {
    hiring_party: 0,
    original_contractor: 1,
    owner: 2,
  };
  const clientByProject = new Map<string, string>();
  for (const party of partyMatches) {
    const existing = clientByProject.get(party.lienProjectId);
    if (existing === undefined) {
      clientByProject.set(party.lienProjectId, party.cachedLegalName);
    }
  }
  // Also resolve a primary client name for matched projects regardless of which
  // field matched, so result rows can show context.
  const matchedIds = matched.map((m) => m.id);
  if (matchedIds.length > 0) {
    const allParties = await db
      .select({
        lienProjectId: projectPartyLinksTable.lienProjectId,
        cachedLegalName: projectPartyLinksTable.cachedLegalName,
        partyRelationType: projectPartyLinksTable.partyRelationType,
      })
      .from(projectPartyLinksTable)
      .where(
        and(
          eq(projectPartyLinksTable.orgId, orgId),
          inArray(projectPartyLinksTable.lienProjectId, matchedIds),
        ),
      );
    const bestByProject = new Map<string, { name: string; rank: number }>();
    for (const party of allParties) {
      const rank = PARTY_PRIORITY[party.partyRelationType] ?? 99;
      const existing = bestByProject.get(party.lienProjectId);
      if (!existing || rank < existing.rank) {
        bestByProject.set(party.lienProjectId, {
          name: party.cachedLegalName,
          rank,
        });
      }
    }
    for (const [pid, best] of bestByProject) {
      clientByProject.set(pid, best.name);
    }
  }

  const results = matched
    .map((m) => ({
      id: m.id,
      projectName: m.cachedProjectName ?? m.hubspotProjectId,
      hubspotProjectId: m.hubspotProjectId,
      clientName: clientByProject.get(m.id) ?? null,
      status: m.cachedHubspotStatus,
      lienWorkflowType: m.lienWorkflowType,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
    .slice(0, limit);

  res.json({ results });
});

// ---------------------------------------------------------------------------
// POST /projects
// Body: { hubspotProjectId, subSystemTypeId, jurisdictionId?, contractorTier? }
// jurisdictionId is optional — defaults to first active jurisdiction for the org
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  const { orgId } = getSession(req);
  const {
    hubspotProjectId,
    subSystemTypeId,
    jurisdictionId: jurisdictionIdInput,
    contractorTier,
  } = req.body as {
    hubspotProjectId?: string;
    subSystemTypeId?: string;
    jurisdictionId?: string;
    contractorTier?: string;
  };

  if (!hubspotProjectId || typeof hubspotProjectId !== "string") {
    res.status(400).json({ error: "hubspotProjectId is required" });
    return;
  }
  if (!subSystemTypeId || typeof subSystemTypeId !== "string") {
    res.status(400).json({ error: "subSystemTypeId is required" });
    return;
  }

  // Verify subSystemType exists for this org
  const [sst] = await db
    .select()
    .from(subSystemTypesTable)
    .where(
      and(
        eq(subSystemTypesTable.id, subSystemTypeId),
        eq(subSystemTypesTable.orgId, orgId),
      ),
    )
    .limit(1);
  if (!sst) {
    res.status(404).json({ error: "SubSystemType not found" });
    return;
  }

  // Resolve jurisdictionId — use provided value, or fall back to first active jurisdiction for org
  let resolvedJurisdictionId = jurisdictionIdInput?.trim() || "";
  if (!resolvedJurisdictionId) {
    const [firstJur] = await db
      .select({ id: jurisdictionsTable.id })
      .from(jurisdictionsTable)
      .where(
        and(
          eq(jurisdictionsTable.orgId, orgId),
          eq(jurisdictionsTable.active, true),
        ),
      )
      .limit(1);
    if (!firstJur) {
      res.status(400).json({
        error:
          "No active jurisdiction found for this org. Set up a jurisdiction in Settings first.",
      });
      return;
    }
    resolvedJurisdictionId = firstJur.id;
  } else {
    // Verify explicit jurisdiction exists for this org
    const [jur] = await db
      .select({ id: jurisdictionsTable.id })
      .from(jurisdictionsTable)
      .where(
        and(
          eq(jurisdictionsTable.id, resolvedJurisdictionId),
          eq(jurisdictionsTable.orgId, orgId),
        ),
      )
      .limit(1);
    if (!jur) {
      res.status(404).json({ error: "Jurisdiction not found" });
      return;
    }
  }

  // Check for duplicate
  const [existing] = await db
    .select({ id: lienProjectsTable.id })
    .from(lienProjectsTable)
    .where(
      and(
        eq(lienProjectsTable.orgId, orgId),
        eq(lienProjectsTable.hubspotProjectId, hubspotProjectId),
      ),
    )
    .limit(1);
  if (existing) {
    res
      .status(409)
      .json({
        error: "A lien project for this HubSpot project already exists",
      });
    return;
  }

  // Pull from HubSpot (live if HUBSPOT_API_KEY is set, otherwise fixture)
  const hsProject = await hubspotClient.getProject(hubspotProjectId);

  const validTiers = ["first_tier", "second_tier"];
  const tier =
    contractorTier && validTiers.includes(contractorTier)
      ? (contractorTier as "first_tier" | "second_tier")
      : "first_tier";

  const [project] = await db
    .insert(lienProjectsTable)
    .values({
      orgId,
      hubspotProjectId,
      jurisdictionId: resolvedJurisdictionId,
      subSystemTypeId,
      lienWorkflowType: sst.lienWorkflowType,
      contractorTier: tier,
      cachedProjectName: hsProject?.projectName ?? null,
      cachedHubspotStatus: hsProject?.status ?? null,
      lastSyncedAt: hsProject ? new Date() : null,
      completionChecklistComplete: false,
    })
    .returning();

  res.status(201).json({ project });
});

// ---------------------------------------------------------------------------
// POST /projects/:id/sync
// Re-fetches project and party data from HubSpot and updates cached fields +
// lastSyncedAt on lienProjectsTable, projectPartyLinksTable, and any matching
// linkedClientsTable rows.
// ---------------------------------------------------------------------------
router.post("/:id/sync", async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const now = new Date();

  // --- Sync project from HubSpot ---
  const hsProject = await hubspotClient.getProject(project.hubspotProjectId);

  await db
    .update(lienProjectsTable)
    .set({
      cachedProjectName: hsProject?.projectName ?? project.cachedProjectName,
      cachedHubspotStatus: hsProject?.status ?? project.cachedHubspotStatus,
      lastSyncedAt: now,
    })
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    );

  // --- Sync parties ---
  const parties = await db
    .select()
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.lienProjectId, id),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    );

  const partySyncResults: {
    partyId: string;
    hubspotCompanyId: string;
    synced: boolean;
  }[] = [];

  for (const party of parties) {
    const hsCompany = await hubspotClient.getCompany(party.hubspotCompanyId);
    if (hsCompany) {
      // Update projectPartyLinksTable cached fields
      await db
        .update(projectPartyLinksTable)
        .set({
          cachedLegalName: hsCompany.legalName,
          cachedMailingAddress:
            hsCompany.mailingAddress ?? party.cachedMailingAddress,
          lastSyncedAt: now,
        })
        .where(
          and(
            eq(projectPartyLinksTable.id, party.id),
            eq(projectPartyLinksTable.orgId, orgId),
          ),
        );

      // Update matching linkedClientsTable row if one exists
      await db
        .update(linkedClientsTable)
        .set({
          cachedName: hsCompany.legalName,
          cachedEmail: hsCompany.email ?? null,
          cachedPhone: hsCompany.phone ?? null,
          lastSyncedAt: now,
        })
        .where(
          and(
            eq(linkedClientsTable.orgId, orgId),
            eq(linkedClientsTable.hubspotCompanyId, party.hubspotCompanyId),
          ),
        );

      partySyncResults.push({
        partyId: party.id,
        hubspotCompanyId: party.hubspotCompanyId,
        synced: true,
      });
    } else {
      partySyncResults.push({
        partyId: party.id,
        hubspotCompanyId: party.hubspotCompanyId,
        synced: false,
      });
    }
  }

  // Return refreshed project
  const [refreshed] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  // Collect the project's synced streams to return alongside the refreshed project
  const syncedStreams = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        eq(lienScheduleOfValuesTable.lienProjectId, id),
        eq(lienScheduleOfValuesTable.orgId, orgId),
      ),
    );

  res.json({
    project: refreshed,
    parties: partySyncResults,
    streams: syncedStreams,
    syncedAt: now.toISOString(),
    live: !!process.env.HUBSPOT_API_KEY,
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:id/deadlines
// Returns all lien deadlines for a project grouped by stream → work month.
// Aggregates across all streams — useful for the project dashboard overview.
// ---------------------------------------------------------------------------
router.get("/:id/deadlines", async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params["id"] as string;

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const streams = await db
    .select()
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        eq(lienScheduleOfValuesTable.lienProjectId, id),
        eq(lienScheduleOfValuesTable.orgId, orgId),
      ),
    );

  if (streams.length === 0) {
    res.json({
      project: { id: project.id, cachedProjectName: project.cachedProjectName },
      streams: [],
    });
    return;
  }

  const streamIds = streams.map((s) => s.id);

  const allWorkMonths = await db
    .select()
    .from(workMonthsTable)
    .where(
      and(
        inArray(workMonthsTable.lienScheduleOfValuesId, streamIds),
        eq(workMonthsTable.orgId, orgId),
      ),
    );

  const workMonthIds = allWorkMonths.map((wm) => wm.id);

  const allDeadlines =
    workMonthIds.length > 0
      ? await db
          .select()
          .from(lienDeadlinesTable)
          .where(
            and(
              inArray(lienDeadlinesTable.workMonthId, workMonthIds),
              eq(lienDeadlinesTable.orgId, orgId),
            ),
          )
      : [];

  // Enrich deadlines with rule metadata
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

  // Build nested response: stream → workMonths → deadlines
  const streamsWithDeadlines = streams.map((stream) => {
    const workMonths = allWorkMonths
      .filter((wm) => wm.lienScheduleOfValuesId === stream.id)
      .map((wm) => ({
        ...wm,
        deadlines: allDeadlines
          .filter((d) => d.workMonthId === wm.id)
          .map((d) => ({ ...d, rule: ruleMap.get(d.ruleId) ?? null }))
          .sort(
            (a, b) =>
              new Date(a.adjustedDate).getTime() -
              new Date(b.adjustedDate).getTime(),
          ),
      }))
      .sort(
        (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
      );

    const nextDeadline =
      workMonths
        .flatMap((wm) => wm.deadlines)
        .filter((d) => !d.satisfiedAt && new Date(d.adjustedDate) > new Date())
        .sort(
          (a, b) =>
            new Date(a.adjustedDate).getTime() -
            new Date(b.adjustedDate).getTime(),
        )[0] ?? null;

    return { ...stream, workMonths, nextDeadline };
  });

  res.json({
    project: {
      id: project.id,
      cachedProjectName: project.cachedProjectName,
      lienWorkflowType: project.lienWorkflowType,
    },
    streams: streamsWithDeadlines,
    summary: {
      totalStreams: streams.length,
      totalWorkMonths: allWorkMonths.length,
      totalDeadlines: allDeadlines.length,
      unsatisfiedDeadlines: allDeadlines.filter((d) => !d.satisfiedAt).length,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [parties, streams, sstRows] = await Promise.all([
    db
      .select()
      .from(projectPartyLinksTable)
      .where(
        and(
          eq(projectPartyLinksTable.lienProjectId, id),
          eq(projectPartyLinksTable.orgId, orgId),
        ),
      ),
    db
      .select()
      .from(lienScheduleOfValuesTable)
      .where(
        and(
          eq(lienScheduleOfValuesTable.lienProjectId, id),
          eq(lienScheduleOfValuesTable.orgId, orgId),
        ),
      ),
    db
      .select()
      .from(subSystemTypesTable)
      .where(
        and(
          eq(subSystemTypesTable.id, project.subSystemTypeId),
          eq(subSystemTypesTable.orgId, orgId),
        ),
      )
      .limit(1),
  ]);

  const checklist = computeChecklist(project, parties);

  res.json({
    project,
    parties,
    streams,
    subSystemType: sstRows[0] ?? null,
    checklist,
  });
});

// ---------------------------------------------------------------------------
// PATCH /projects/:id
// Body: { contractorTier?, legalPropertyAddress?, county?, contractStartDate? }
// ---------------------------------------------------------------------------
router.patch("/:id", async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;

  const { contractorTier, legalPropertyAddress, county, contractStartDate } =
    req.body as {
      contractorTier?: string;
      legalPropertyAddress?: string | null;
      county?: string | null;
      contractStartDate?: string | null;
    };

  const [existing] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const validTiers = ["first_tier", "second_tier"];
  const updates: Record<string, unknown> = {};

  if (contractorTier !== undefined) {
    if (!validTiers.includes(contractorTier)) {
      res
        .status(400)
        .json({ error: "contractorTier must be first_tier or second_tier" });
      return;
    }
    updates.contractorTier = contractorTier;
  }
  if (legalPropertyAddress !== undefined)
    updates.legalPropertyAddress = legalPropertyAddress;
  if (county !== undefined) updates.county = county;
  if (contractStartDate !== undefined) {
    updates.contractStartDate = contractStartDate
      ? new Date(contractStartDate)
      : null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  await db
    .update(lienProjectsTable)
    .set(updates)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    );

  // Recompute checklist after update
  await refreshChecklistComplete(orgId, id);

  const [refreshed] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  res.json({ project: refreshed });
});

// ---------------------------------------------------------------------------
// GET /projects/:id/checklist
// ---------------------------------------------------------------------------
router.get("/:id/checklist", async (req, res) => {
  const { orgId } = getSession(req);
  const id = req.params.id as string;

  const [project] = await db
    .select()
    .from(lienProjectsTable)
    .where(
      and(eq(lienProjectsTable.id, id), eq(lienProjectsTable.orgId, orgId)),
    )
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const parties = await db
    .select({ partyRelationType: projectPartyLinksTable.partyRelationType })
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.lienProjectId, id),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    );

  const checklist = computeChecklist(project, parties);

  res.json(checklist);
});

// ---------------------------------------------------------------------------
// POST /projects/:id/parties
// Body: { hubspotCompanyId, partyRelationType, cachedLegalName?, cachedMailingAddress? }
// ---------------------------------------------------------------------------
router.post("/:id/parties", async (req, res) => {
  const { orgId } = getSession(req);
  const projectId = req.params.id as string;

  const {
    hubspotCompanyId,
    partyRelationType,
    cachedLegalName,
    cachedMailingAddress,
  } = req.body as {
    hubspotCompanyId?: string;
    partyRelationType?: string;
    cachedLegalName?: string;
    cachedMailingAddress?: string;
  };

  if (!hubspotCompanyId || typeof hubspotCompanyId !== "string") {
    res.status(400).json({ error: "hubspotCompanyId is required" });
    return;
  }

  const validRoles = ["owner", "original_contractor", "hiring_party"];
  if (!partyRelationType || !validRoles.includes(partyRelationType)) {
    res.status(400).json({
      error: `partyRelationType must be one of: ${validRoles.join(", ")}`,
    });
    return;
  }

  // Verify project exists
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

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Enforce: no duplicate role on same project
  const existingParties = await db
    .select()
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.lienProjectId, projectId),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    );

  const roleAlreadyExists = existingParties.some(
    (p) => p.partyRelationType === partyRelationType,
  );
  if (roleAlreadyExists) {
    res.status(409).json({
      error: `A party with role '${partyRelationType}' already exists on this project. Remove it first to replace.`,
    });
    return;
  }

  // Try to fetch legal name from HubSpot if not provided
  let legalName = cachedLegalName?.trim();
  let mailingAddress = cachedMailingAddress?.trim();

  if (!legalName) {
    const hsCompany = await hubspotClient.getCompany(hubspotCompanyId);
    if (hsCompany) {
      legalName = hsCompany.legalName;
      mailingAddress = mailingAddress ?? hsCompany.mailingAddress;
    }
  }

  if (!legalName) {
    res.status(400).json({
      error:
        "cachedLegalName is required (or hubspotCompanyId must match a known company)",
    });
    return;
  }

  const [party] = await db
    .insert(projectPartyLinksTable)
    .values({
      orgId,
      lienProjectId: projectId,
      partyRelationType: partyRelationType as
        | "owner"
        | "original_contractor"
        | "hiring_party",
      hubspotCompanyId,
      cachedLegalName: legalName,
      cachedMailingAddress: mailingAddress ?? null,
      lastSyncedAt: new Date(),
    })
    .returning();

  // Recompute checklist
  await refreshChecklistComplete(orgId, projectId);

  // 2nd-tier dual-party warning
  const warnings: string[] = [];
  if (project.contractorTier === "second_tier") {
    const allParties = [...existingParties, party];
    const hasHP = allParties.some(
      (p) => p.partyRelationType === "hiring_party",
    );
    const hasOC = allParties.some(
      (p) => p.partyRelationType === "original_contractor",
    );
    if (!hasHP)
      warnings.push("hiring_party is still required for 2nd-tier projects");
    if (!hasOC)
      warnings.push(
        "original_contractor is still required for 2nd-tier projects",
      );
  }

  res.status(201).json({ party, warnings });
});

// ---------------------------------------------------------------------------
// DELETE /projects/:id/parties/:partyId  →  204 No Content
// ---------------------------------------------------------------------------
router.delete("/:id/parties/:partyId", async (req, res) => {
  const { orgId } = getSession(req);
  const projectId = req.params.id as string;
  const partyId = req.params.partyId as string;

  const [party] = await db
    .select()
    .from(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.id, partyId),
        eq(projectPartyLinksTable.lienProjectId, projectId),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }

  await db
    .delete(projectPartyLinksTable)
    .where(
      and(
        eq(projectPartyLinksTable.id, partyId),
        eq(projectPartyLinksTable.orgId, orgId),
      ),
    );

  // Recompute checklist
  await refreshChecklistComplete(orgId, projectId);

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// GET /projects/:id/last-timelog
//
// Returns each unique Connecteam employee who has timesheet records for this
// project, with their most recent workDate and display name, sorted
// descending by last work date. No sync is triggered — reads from cached data.
// ---------------------------------------------------------------------------

router.get("/:id/last-timelog", async (req, res) => {
  const { orgId } = getSession(req);
  const projectId = req.params["id"] as string;

  const [project] = await db
    .select({ id: lienProjectsTable.id })
    .from(lienProjectsTable)
    .where(
      and(
        eq(lienProjectsTable.id, projectId),
        eq(lienProjectsTable.orgId, orgId),
      ),
    )
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Group by connecteamUserId, picking MAX(workDate) and the associated displayName.
  // We use a subquery approach: get max workDate per user, then join back to get displayName.
  const rows = await db
    .select({
      connecteamUserId: timesheetLinksTable.connecteamUserId,
      displayName: timesheetLinksTable.displayName,
      lastWorkDate: max(timesheetLinksTable.workDate),
    })
    .from(timesheetLinksTable)
    .where(
      and(
        eq(timesheetLinksTable.lienProjectId, projectId),
        eq(timesheetLinksTable.orgId, orgId),
      ),
    )
    .groupBy(
      timesheetLinksTable.connecteamUserId,
      timesheetLinksTable.displayName,
    );

  // When a single user has records both with and without a displayName (e.g. seeded rows
  // before the column was added), we may get duplicate userId rows. Merge them: prefer the
  // row with a displayName and keep the latest workDate across both.
  const merged = new Map<
    string,
    {
      connecteamUserId: string;
      displayName: string | null;
      lastWorkDate: Date | null;
    }
  >();
  for (const row of rows) {
    const existing = merged.get(row.connecteamUserId);
    if (!existing) {
      merged.set(row.connecteamUserId, {
        connecteamUserId: row.connecteamUserId,
        displayName: row.displayName,
        lastWorkDate: row.lastWorkDate ?? null,
      });
    } else {
      // Keep the more recent date
      const existingMs = existing.lastWorkDate?.getTime() ?? 0;
      const rowMs = row.lastWorkDate?.getTime() ?? 0;
      if (rowMs > existingMs) existing.lastWorkDate = row.lastWorkDate ?? null;
      // Prefer a non-null displayName
      if (!existing.displayName && row.displayName)
        existing.displayName = row.displayName;
    }
  }

  const result = [...merged.values()]
    .sort((a, b) => {
      const aMs = a.lastWorkDate?.getTime() ?? 0;
      const bMs = b.lastWorkDate?.getTime() ?? 0;
      return bMs - aMs;
    })
    .map((r) => ({
      connecteamUserId: r.connecteamUserId,
      displayName: r.displayName ?? r.connecteamUserId,
      lastWorkDate: r.lastWorkDate ? r.lastWorkDate.toISOString() : null,
    }));

  res.json({ employees: result });
});

export default router;
