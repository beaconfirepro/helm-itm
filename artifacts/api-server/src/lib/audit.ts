/**
 * audit.ts — append-only audit trail for statutory & financial actions (D3).
 *
 * Every legally-significant mutation records who did what, when, with before/
 * after snapshots of the salient fields. `details` is a flexible bag for context
 * counsel may later require (IP, request id, document content hash, ...) without
 * a schema change.
 *
 * The writer is BEST-EFFORT: a failure to record must never break the statutory
 * action it documents, so insert errors are logged, not thrown. For a hard
 * "action and audit commit atomically" guarantee we would move to a
 * same-transaction write — tracked as a follow-up.
 */

import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export interface AuditActor {
  userId?: string | null;
  role?: string | null;
}

export interface AuditEntryInput {
  orgId: string;
  actor: AuditActor;
  /** Dotted verb, e.g. "notice.send", "waiver.approve_finance", "filing.record". */
  action: string;
  /** e.g. "notice" | "waiver" | "filing" | "invoice" | "deadline". */
  entityType: string;
  entityId?: string | null;
  /** Human-readable one-liner for the audit view. */
  summary: string;
  /** Salient fields before the change (null on create). */
  before?: Record<string, unknown> | null;
  /** Salient fields after the change. */
  after?: Record<string, unknown> | null;
  /** Extensible context bag (legal must-haves TBD). */
  details?: Record<string, unknown> | null;
}

export interface AuditRow {
  orgId: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}

/**
 * Pure: shape an audit input into the row to insert (normalizing optionals to
 * null). Unit-tested; no I/O.
 */
export function buildAuditEntry(input: AuditEntryInput): AuditRow {
  return {
    orgId: input.orgId,
    actorUserId: input.actor.userId ?? null,
    actorRole: input.actor.role ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    details: input.details ?? null,
  };
}

/** Record an audit entry. Best-effort — never throws into the caller. */
export async function recordAudit(input: AuditEntryInput): Promise<void> {
  try {
    await db.insert(auditLogsTable).values(buildAuditEntry(input));
  } catch (err) {
    logger.error(
      { err, action: input.action, entityType: input.entityType, entityId: input.entityId },
      "audit log write failed",
    );
  }
}
