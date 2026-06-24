/**
 * stateMachines.ts — pure transition & derivation rules for the statutory
 * document lifecycles (notices, waivers, filings).
 *
 * These rules were previously inline string-literal checks scattered across the
 * notice/waiver/filing routes. Centralizing them here gives one tested source of
 * truth (ED-05) for the legally-significant state machines. Each guard returns
 * the exact 409 error string the routes emit, or `null` when the action is
 * allowed — so the routes are a thin wrapper and the rules are unit-tested
 * without a database.
 *
 * IMPORTANT: the returned strings are part of the API contract — keep them in
 * sync with any client copy.
 */

export type NoticeStatus = "draft" | "approved" | "sent" | "delivered";

export type WaiverType =
  | "conditional_progress"
  | "unconditional_progress"
  | "conditional_final"
  | "unconditional_final";

export type WaiverApprovalStatus =
  | "not_required"
  | "pending_pm"
  | "pending_pm_finance"
  | "approved"
  | "rejected";

export type FilingStatus =
  | "not_filed"
  | "compliance_check"
  | "affidavit_draft"
  | "exported"
  | "filed"
  | "post_filing_notice_sent";

// ---------------------------------------------------------------------------
// Notice lifecycle: draft → approved → sent → delivered
// ---------------------------------------------------------------------------

/** A draft notice may be edited; once sent/delivered it is frozen. */
export function noticeEditError(current: NoticeStatus): string | null {
  if (current === "sent" || current === "delivered") {
    return "Cannot edit a sent or delivered notice";
  }
  return null;
}

/** Only a draft notice may be approved. */
export function noticeApproveError(current: NoticeStatus): string | null {
  if (current !== "draft") return `Cannot approve a notice in '${current}' status`;
  return null;
}

/** Only an approved notice may be sent. */
export function noticeSendError(current: NoticeStatus): string | null {
  if (current !== "approved") {
    return `Notice must be in 'approved' status to send (current: '${current}')`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Waiver approval state machine (§ 53.284)
//
// conditional_*        → not_required (no approval gate)
// unconditional_progress → pending_pm → approved
// unconditional_final  → pending_pm_finance → (pm) pending_pm_finance → (finance) approved
//
// Unconditional waivers additionally require coordinator-cleared payment before
// they may be generated (the "cleared gate").
// ---------------------------------------------------------------------------

/** Unconditional waivers may only be generated against coordinator-cleared payment. */
export function waiverRequiresClearedPayment(waiverType: WaiverType): boolean {
  return waiverType === "unconditional_progress" || waiverType === "unconditional_final";
}

/** The approval status a freshly-created waiver starts in, by type. */
export function initialWaiverApprovalStatus(
  waiverType: WaiverType,
): "not_required" | "pending_pm" | "pending_pm_finance" {
  if (waiverType === "unconditional_progress") return "pending_pm";
  if (waiverType === "unconditional_final") return "pending_pm_finance";
  return "not_required";
}

/** Guard for the PM approval action. */
export function pmApprovalError(
  current: WaiverApprovalStatus,
  pmAlreadyApproved: boolean,
): string | null {
  if (current !== "pending_pm" && current !== "pending_pm_finance") {
    return `PM approval is not required for a waiver in '${current}' status`;
  }
  if (pmAlreadyApproved) return "PM has already approved this waiver";
  return null;
}

/** Status after a successful PM approval: progress → done; final → awaits finance. */
export function pmApprovalNextStatus(
  waiverType: WaiverType,
): "approved" | "pending_pm_finance" {
  return waiverType === "unconditional_progress" ? "approved" : "pending_pm_finance";
}

/** Guard for the Finance approval action (only unconditional_final, PM first). */
export function financeApprovalError(
  waiverType: WaiverType,
  current: WaiverApprovalStatus,
  pmApproved: boolean,
  financeAlreadyApproved: boolean,
): string | null {
  if (waiverType !== "unconditional_final") {
    return "Finance approval is only required for unconditional_final waivers";
  }
  if (current !== "pending_pm_finance") {
    return `Finance approval is not applicable for a waiver in '${current}' status`;
  }
  if (!pmApproved) return "PM must approve before Finance approval can be granted";
  if (financeAlreadyApproved) return "Finance has already approved this waiver";
  return null;
}

// ---------------------------------------------------------------------------
// Filing lifecycle (§ 53.054 / § 53.052)
// ---------------------------------------------------------------------------

/** Only an affidavit_draft filing may be exported to the county-filing handoff. */
export function filingExportError(current: FilingStatus): string | null {
  if (current !== "affidavit_draft") {
    return `Export requires status affidavit_draft; current: ${current}`;
  }
  return null;
}

const RECORDABLE_FILING_STATUSES: FilingStatus[] = [
  "affidavit_draft",
  "exported",
  "compliance_check",
];

/** A filing may be recorded from affidavit_draft, exported, or compliance_check. */
export function filingRecordError(current: FilingStatus): string | null {
  if (!RECORDABLE_FILING_STATUSES.includes(current)) {
    return `Record requires status affidavit_draft, exported, or compliance_check; current: ${current}`;
  }
  return null;
}
