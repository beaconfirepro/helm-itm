import { describe, it, expect } from "vitest";
import { buildAuditEntry } from "../src/lib/audit";

// ---------------------------------------------------------------------------
// Pure audit-entry shaping. The recorder's DB write is best-effort and covered
// by the UAT/integration layer; here we lock the normalization the builder does.
// ---------------------------------------------------------------------------

describe("buildAuditEntry", () => {
  it("maps a full entry through, including before/after and details", () => {
    const row = buildAuditEntry({
      orgId: "org_1",
      actor: { userId: "user_pm", role: "pm" },
      action: "waiver.approve_pm",
      entityType: "waiver",
      entityId: "wv_1",
      summary: "PM approved waiver",
      before: { approvalStatus: "pending_pm" },
      after: { approvalStatus: "approved" },
      details: { ip: "203.0.113.4" },
    });
    expect(row).toEqual({
      orgId: "org_1",
      actorUserId: "user_pm",
      actorRole: "pm",
      action: "waiver.approve_pm",
      entityType: "waiver",
      entityId: "wv_1",
      summary: "PM approved waiver",
      before: { approvalStatus: "pending_pm" },
      after: { approvalStatus: "approved" },
      details: { ip: "203.0.113.4" },
    });
  });

  it("normalizes missing optionals to null (system actor, no snapshots)", () => {
    const row = buildAuditEntry({
      orgId: "org_1",
      actor: {},
      action: "hold.recompute",
      entityType: "hold",
      summary: "Holds recomputed",
    });
    expect(row.actorUserId).toBeNull();
    expect(row.actorRole).toBeNull();
    expect(row.entityId).toBeNull();
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
    expect(row.details).toBeNull();
  });
});
