import { describe, it, expect } from "vitest";
import {
  noticeEditError,
  noticeApproveError,
  noticeSendError,
  waiverRequiresClearedPayment,
  initialWaiverApprovalStatus,
  pmApprovalError,
  pmApprovalNextStatus,
  financeApprovalError,
  filingExportError,
  filingRecordError,
} from "../src/lib/stateMachines";

// ---------------------------------------------------------------------------
// Pure state-machine rules for the statutory document lifecycles. These lock
// the legally-significant transitions (who can approve/send/file what, when)
// that were previously inline string checks in the routes.
// ---------------------------------------------------------------------------

describe("notice lifecycle", () => {
  it("allows editing a draft; freezes sent/delivered", () => {
    expect(noticeEditError("draft")).toBeNull();
    expect(noticeEditError("approved")).toBeNull();
    expect(noticeEditError("sent")).toBe("Cannot edit a sent or delivered notice");
    expect(noticeEditError("delivered")).toBe("Cannot edit a sent or delivered notice");
  });

  it("approves only from draft", () => {
    expect(noticeApproveError("draft")).toBeNull();
    expect(noticeApproveError("approved")).toBe("Cannot approve a notice in 'approved' status");
    expect(noticeApproveError("sent")).toBe("Cannot approve a notice in 'sent' status");
  });

  it("sends only from approved", () => {
    expect(noticeSendError("approved")).toBeNull();
    expect(noticeSendError("draft")).toBe("Notice must be in 'approved' status to send (current: 'draft')");
    expect(noticeSendError("delivered")).toBe("Notice must be in 'approved' status to send (current: 'delivered')");
  });
});

describe("waiver cleared-gate + initial approval status", () => {
  it("requires cleared payment only for unconditional waivers", () => {
    expect(waiverRequiresClearedPayment("unconditional_progress")).toBe(true);
    expect(waiverRequiresClearedPayment("unconditional_final")).toBe(true);
    expect(waiverRequiresClearedPayment("conditional_progress")).toBe(false);
    expect(waiverRequiresClearedPayment("conditional_final")).toBe(false);
  });

  it("derives the initial approval status by type", () => {
    expect(initialWaiverApprovalStatus("conditional_progress")).toBe("not_required");
    expect(initialWaiverApprovalStatus("conditional_final")).toBe("not_required");
    expect(initialWaiverApprovalStatus("unconditional_progress")).toBe("pending_pm");
    expect(initialWaiverApprovalStatus("unconditional_final")).toBe("pending_pm_finance");
  });
});

describe("waiver PM approval", () => {
  it("blocks PM approval unless pending", () => {
    expect(pmApprovalError("pending_pm", false)).toBeNull();
    expect(pmApprovalError("pending_pm_finance", false)).toBeNull();
    expect(pmApprovalError("not_required", false)).toBe(
      "PM approval is not required for a waiver in 'not_required' status",
    );
    expect(pmApprovalError("approved", false)).toBe(
      "PM approval is not required for a waiver in 'approved' status",
    );
  });

  it("blocks a double PM approval", () => {
    expect(pmApprovalError("pending_pm", true)).toBe("PM has already approved this waiver");
  });

  it("routes progress → approved and final → pending_pm_finance after PM", () => {
    expect(pmApprovalNextStatus("unconditional_progress")).toBe("approved");
    expect(pmApprovalNextStatus("unconditional_final")).toBe("pending_pm_finance");
  });
});

describe("waiver Finance approval", () => {
  it("only applies to unconditional_final", () => {
    expect(financeApprovalError("unconditional_progress", "pending_pm_finance", true, false)).toBe(
      "Finance approval is only required for unconditional_final waivers",
    );
  });

  it("requires the pending_pm_finance status", () => {
    expect(financeApprovalError("unconditional_final", "pending_pm", true, false)).toBe(
      "Finance approval is not applicable for a waiver in 'pending_pm' status",
    );
  });

  it("requires PM to have approved first", () => {
    expect(financeApprovalError("unconditional_final", "pending_pm_finance", false, false)).toBe(
      "PM must approve before Finance approval can be granted",
    );
  });

  it("blocks a double Finance approval", () => {
    expect(financeApprovalError("unconditional_final", "pending_pm_finance", true, true)).toBe(
      "Finance has already approved this waiver",
    );
  });

  it("allows finance approval when PM-approved and pending", () => {
    expect(financeApprovalError("unconditional_final", "pending_pm_finance", true, false)).toBeNull();
  });
});

describe("filing lifecycle", () => {
  it("exports only from affidavit_draft", () => {
    expect(filingExportError("affidavit_draft")).toBeNull();
    expect(filingExportError("exported")).toBe("Export requires status affidavit_draft; current: exported");
    expect(filingExportError("not_filed")).toBe("Export requires status affidavit_draft; current: not_filed");
  });

  it("records from affidavit_draft, exported, or compliance_check", () => {
    expect(filingRecordError("affidavit_draft")).toBeNull();
    expect(filingRecordError("exported")).toBeNull();
    expect(filingRecordError("compliance_check")).toBeNull();
    expect(filingRecordError("filed")).toBe(
      "Record requires status affidavit_draft, exported, or compliance_check; current: filed",
    );
    expect(filingRecordError("not_filed")).toBe(
      "Record requires status affidavit_draft, exported, or compliance_check; current: not_filed",
    );
  });
});
