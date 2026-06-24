/**
 * legalReview.ts — production gate for jurisdiction rule sets (DD-04).
 *
 * Beacon owns its statutory rule data, so it also owns the legal accuracy of
 * that data. DD-04 requires a legal-review gate before any *production* use of
 * a rule set: no statutory notice may be sent, and no lien may be exported or
 * recorded, on a rule set that has not been marked `legalReviewed = true`.
 *
 * The gate is enforced only in production. In development, test, and the UAT
 * harness it is relaxed so local flows aren't blocked by seed data that has not
 * been "legally reviewed". Set `LEGAL_REVIEW_BYPASS=1` to relax it explicitly
 * (e.g. a staging environment that runs with NODE_ENV=production).
 *
 * The two decision functions below are pure and unit-tested; the DB resolver
 * walks SOV → project → jurisdiction → rule sets so the routes share one path.
 */

import {
  db,
  lienRuleSetsTable,
  lienScheduleOfValuesTable,
  lienProjectsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

export interface RuleSetReviewState {
  legalReviewed: boolean;
}

/** Whether the legal-review gate is enforced in the current environment. */
export function legalReviewEnforced(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "production" && env.LEGAL_REVIEW_BYPASS !== "1";
}

/**
 * Pure decision: may a statutory document go out, given the rule sets resolved
 * for the relevant jurisdiction? Allowed when the gate is not enforced, or when
 * at least one applicable rule set has passed legal review. With the gate
 * enforced and no reviewed rule set (the empty case included), it is blocked.
 */
export function ruleSetsPermitSend(
  ruleSets: RuleSetReviewState[],
  enforced: boolean,
): boolean {
  if (!enforced) return true;
  return ruleSets.some((rs) => rs.legalReviewed === true);
}

/**
 * Resolve the legal-review state of every rule set in the jurisdiction that
 * governs a given Schedule of Values (SOV). Returns an empty list when the SOV
 * or its project can't be found — which, under an enforced gate, blocks the
 * action (fail-closed).
 */
export async function jurisdictionRuleSetsForSov(
  orgId: string,
  sovId: string,
): Promise<RuleSetReviewState[]> {
  const [sov] = await db
    .select({ lienProjectId: lienScheduleOfValuesTable.lienProjectId })
    .from(lienScheduleOfValuesTable)
    .where(
      and(
        eq(lienScheduleOfValuesTable.id, sovId),
        eq(lienScheduleOfValuesTable.orgId, orgId),
      ),
    )
    .limit(1);
  if (!sov) return [];

  const [project] = await db
    .select({ jurisdictionId: lienProjectsTable.jurisdictionId })
    .from(lienProjectsTable)
    .where(
      and(
        eq(lienProjectsTable.id, sov.lienProjectId),
        eq(lienProjectsTable.orgId, orgId),
      ),
    )
    .limit(1);
  if (!project) return [];

  return db
    .select({ legalReviewed: lienRuleSetsTable.legalReviewed })
    .from(lienRuleSetsTable)
    .where(
      and(
        eq(lienRuleSetsTable.jurisdictionId, project.jurisdictionId),
        eq(lienRuleSetsTable.orgId, orgId),
      ),
    );
}

/**
 * Guard used by routes that perform a production statutory action. Returns an
 * error string to return to the caller (HTTP 409) when the action is blocked,
 * or null when it may proceed. No-op (null) outside production.
 */
export async function legalReviewBlockReason(
  orgId: string,
  sovId: string,
  action: string,
): Promise<string | null> {
  if (!legalReviewEnforced()) return null;
  const ruleSets = await jurisdictionRuleSetsForSov(orgId, sovId);
  if (ruleSetsPermitSend(ruleSets, true)) return null;
  return `Cannot ${action}: this project's jurisdiction lien rule set has not passed legal review (DD-04). An admin must mark the rule set legally reviewed before production use.`;
}
