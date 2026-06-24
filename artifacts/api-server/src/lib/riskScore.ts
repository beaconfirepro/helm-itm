import {
  db,
  riskScoreConfigsTable,
  invoiceLinksTable,
  promisesToPayTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Shared collection-risk scoring calculator
//
// The collection risk score (0-100) is computed from four factors, each
// contributing a capped number of points:
//   1. Age of oldest overdue invoice (~40%)
//   2. Overdue-to-total-AR ratio       (~30%)
//   3. Broken promises count           (~20%)
//   4. Total overdue exposure          (~10%)
//
// Each factor is a descending list of "bands": the first band whose threshold
// the value meets/exceeds wins. The band structure is org-configurable and
// stored in risk_score_configs. When no row exists for an org, DEFAULT_RISK_CONFIG
// is used, which reproduces the original hardcoded behavior exactly.
//
// Both recompute paths (account-detail GET in collections.ts and the
// invoice-clear path in invoices.ts) go through computeAccountRiskMetrics, which
// loads the org config and calls scoreRisk so the math stays consistent
// everywhere.
// ---------------------------------------------------------------------------

/**
 * A single scoring band. The first band (in descending threshold order) whose
 * value matches wins. `inclusive` controls whether the comparison is `>=`
 * (true) or `>` (false). `inclusive` reflects the fixed scoring model and is
 * not user-editable; only `threshold` and `points` are configurable.
 */
export interface RiskBand {
  threshold: number;
  points: number;
  inclusive: boolean;
}

export interface RiskScoreConfig {
  age: RiskBand[];
  ratio: RiskBand[];
  brokenPromises: RiskBand[];
  exposure: RiskBand[];
}

/**
 * Default risk-scoring configuration. These values reproduce the original
 * hardcoded behavior, so an org that never edits its config scores identically
 * to before.
 */
export const DEFAULT_RISK_CONFIG: RiskScoreConfig = {
  // Days since oldest overdue invoice (0-40 pts). Strictly greater-than bands.
  age: [
    { threshold: 90, points: 40, inclusive: false },
    { threshold: 60, points: 33, inclusive: false },
    { threshold: 30, points: 22, inclusive: false },
    { threshold: 0, points: 10, inclusive: false },
  ],
  // Overdue-to-total-AR ratio (0-30 pts). Top bands inclusive; lowest is "> 0".
  ratio: [
    { threshold: 0.75, points: 30, inclusive: true },
    { threshold: 0.5, points: 22, inclusive: true },
    { threshold: 0.25, points: 15, inclusive: true },
    { threshold: 0, points: 7, inclusive: false },
  ],
  // Broken promises count (0-20 pts).
  brokenPromises: [
    { threshold: 3, points: 20, inclusive: true },
    { threshold: 2, points: 16, inclusive: true },
    { threshold: 1, points: 10, inclusive: true },
  ],
  // Total overdue exposure in dollars (0-10 pts).
  exposure: [
    { threshold: 50000, points: 10, inclusive: true },
    { threshold: 25000, points: 8, inclusive: true },
    { threshold: 10000, points: 6, inclusive: true },
    { threshold: 2500, points: 3, inclusive: true },
  ],
};

const FACTOR_KEYS: (keyof RiskScoreConfig)[] = [
  "age",
  "ratio",
  "brokenPromises",
  "exposure",
];

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { success: true; data: RiskScoreConfig }
  | { success: false; issues: ValidationIssue[] };

/**
 * Validate an untrusted value as a RiskScoreConfig. Enforces sane ranges:
 * points are integers 0-100, thresholds are finite and non-negative, and ratio
 * thresholds additionally cap at 1. Each factor must have 1-8 bands.
 */
export function validateRiskConfig(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (typeof input !== "object" || input === null) {
    return { success: false, issues: [{ path: "", message: "config must be an object" }] };
  }

  const obj = input as Record<string, unknown>;
  const result: Partial<RiskScoreConfig> = {};

  for (const key of FACTOR_KEYS) {
    const raw = obj[key];
    if (!Array.isArray(raw)) {
      issues.push({ path: key, message: "must be an array of bands" });
      continue;
    }
    if (raw.length < 1 || raw.length > 8) {
      issues.push({ path: key, message: "must have between 1 and 8 bands" });
      continue;
    }

    const isRatio = key === "ratio";
    const bands: RiskBand[] = [];
    raw.forEach((bandRaw, idx) => {
      const path = `${key}[${idx}]`;
      if (typeof bandRaw !== "object" || bandRaw === null) {
        issues.push({ path, message: "band must be an object" });
        return;
      }
      const band = bandRaw as Record<string, unknown>;
      const { threshold, points, inclusive } = band;

      if (
        typeof threshold !== "number" ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        (isRatio && threshold > 1)
      ) {
        issues.push({
          path: `${path}.threshold`,
          message: isRatio
            ? "threshold must be a number between 0 and 1"
            : "threshold must be a non-negative number",
        });
      }
      if (
        typeof points !== "number" ||
        !Number.isInteger(points) ||
        points < 0 ||
        points > 100
      ) {
        issues.push({
          path: `${path}.points`,
          message: "points must be an integer between 0 and 100",
        });
      }
      if (typeof inclusive !== "boolean") {
        issues.push({ path: `${path}.inclusive`, message: "inclusive must be a boolean" });
      }

      bands.push({
        threshold: threshold as number,
        points: points as number,
        inclusive: inclusive as boolean,
      });
    });

    result[key] = bands;
  }

  if (issues.length > 0) return { success: false, issues };
  return { success: true, data: result as RiskScoreConfig };
}

/**
 * Pick the points for a value from a list of bands. Bands are evaluated in
 * descending threshold order; the first match wins. Returns 0 if no band
 * matches.
 */
function pickPoints(value: number, bands: RiskBand[]): number {
  const sorted = [...bands].sort((a, b) => b.threshold - a.threshold);
  for (const band of sorted) {
    const matches = band.inclusive
      ? value >= band.threshold
      : value > band.threshold;
    if (matches) return band.points;
  }
  return 0;
}

export interface RiskInputs {
  oldestOverdueDays: number;
  overdueRatio: number;
  brokenPromiseCount: number;
  totalOverdue: number;
}

export interface RiskScoreBreakdown {
  agePts: number;
  ratioPts: number;
  brokenPts: number;
  exposurePts: number;
  riskScore: number;
}

/**
 * Compute the collection risk score (0-100) from pre-aggregated metrics using
 * the supplied configuration. Pure function — no I/O.
 */
export function scoreRisk(
  inputs: RiskInputs,
  config: RiskScoreConfig,
): RiskScoreBreakdown {
  const agePts = pickPoints(inputs.oldestOverdueDays, config.age);
  const ratioPts = pickPoints(inputs.overdueRatio, config.ratio);
  const brokenPts = pickPoints(inputs.brokenPromiseCount, config.brokenPromises);
  const exposurePts = pickPoints(inputs.totalOverdue, config.exposure);
  const riskScore = Math.min(
    agePts + ratioPts + brokenPts + exposurePts,
    100,
  );
  return { agePts, ratioPts, brokenPts, exposurePts, riskScore };
}

/**
 * Load the saved risk-scoring config for an org, falling back to defaults when
 * no row exists or the stored value fails validation (e.g. an older shape).
 */
export async function loadRiskConfig(orgId: string): Promise<RiskScoreConfig> {
  const [row] = await db
    .select()
    .from(riskScoreConfigsTable)
    .where(eq(riskScoreConfigsTable.orgId, orgId))
    .limit(1);

  if (!row) return DEFAULT_RISK_CONFIG;

  const parsed = validateRiskConfig(row.config);
  return parsed.success ? parsed.data : DEFAULT_RISK_CONFIG;
}

export interface RiskMetrics {
  riskScore: number;
  oldestOverdueDays: number;
  totalOverdue: number;
  /** Number of unpaid invoices past their due date. */
  overdueCount: number;
}

/**
 * Single source of truth for collection account risk math.
 *
 * Fetches live unpaid invoices + broken-promise history, derives the overdue
 * total, oldest-overdue age, and overdue count, then scores the account using
 * the org's configured bands (DEFAULT_RISK_CONFIG when none are saved). Both
 * the account-detail recompute (collections.ts) and the invoice-clear flow
 * (invoices.ts) call this so the two paths can never drift apart.
 *
 * This function only computes and returns the figures — callers are
 * responsible for persisting them (and any path-specific side effects such as
 * resolving an account back to "current").
 */
export async function computeAccountRiskMetrics(params: {
  accountId: string;
  orgId: string;
  linkedClientId: string;
}): Promise<RiskMetrics> {
  const { accountId, orgId, linkedClientId } = params;
  const today = new Date();

  // Unpaid invoices for this client (cleared invoices are excluded)
  const unpaidInvoices = await db
    .select()
    .from(invoiceLinksTable)
    .where(
      and(
        eq(invoiceLinksTable.orgId, orgId),
        eq(invoiceLinksTable.linkedClientId, linkedClientId),
        eq(invoiceLinksTable.clearedFlag, false),
      ),
    );

  const overdueInvoices = unpaidInvoices.filter(
    (inv) => new Date(inv.dueDate) < today,
  );

  const totalOverdue = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.amount),
    0,
  );

  const oldestOverdueDays =
    overdueInvoices.length > 0
      ? Math.max(
          ...overdueInvoices.map((inv) =>
            Math.floor(
              (today.getTime() - new Date(inv.dueDate).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          ),
        )
      : 0;

  // Broken promises count
  const brokenPromises = await db
    .select()
    .from(promisesToPayTable)
    .where(
      and(
        eq(promisesToPayTable.orgId, orgId),
        eq(promisesToPayTable.accountId, accountId),
        eq(promisesToPayTable.status, "broken"),
      ),
    );

  // Total AR (all unpaid invoices — including non-overdue) for ratio computation
  const totalAR = unpaidInvoices.reduce(
    (sum, inv) => sum + Number(inv.amount),
    0,
  );

  const overdueRatio = totalAR > 0 ? totalOverdue / totalAR : 0;

  // Score using the org's configured bands (defaults reproduce prior behavior)
  const config = await loadRiskConfig(orgId);
  const { riskScore } = scoreRisk(
    {
      oldestOverdueDays,
      overdueRatio,
      brokenPromiseCount: brokenPromises.length,
      totalOverdue,
    },
    config,
  );

  return {
    riskScore,
    oldestOverdueDays,
    totalOverdue,
    overdueCount: overdueInvoices.length,
  };
}
