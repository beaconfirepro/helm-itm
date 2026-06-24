/**
 * holdEngine.ts
 *
 * Recomputes payment holds for an org. Holds are **bill-based**: each hold
 * withholds payment on one specific vendor bill (supplier invoice), connected by
 * the vendor bill reference (invoiceLinks.id / qboSupplierInvoiceId). We only ever
 * hold uncleared vendor bills — bills already paid/settled are never held (e.g. if
 * the design scope has been paid, its design vendor bills are not held).
 *
 * Two triggers decide which vendor bills get held:
 *
 * Schedule Hold (hold_type=schedule_hold):
 *   Hold each uncleared vendor bill on a project that has ≥1 non-supplier,
 *   uncleared invoice whose dueDate < now (a past-due receivable on that project).
 *
 * Material Hold (hold_type=material_hold):
 *   Hold each uncleared vendor bill for a client whose CollectionAccount.totalOverdue
 *   exceeds MATERIAL_HOLD_THRESHOLD_USD (default $0 — any overdue).
 *
 * The engine only manages bill-based holds (supplierInvoiceId set). Legacy/manual
 * holds with a null supplierInvoiceId (project- or client-wide) are left untouched.
 *
 * The entire pass runs in a single DB transaction: either all changes commit
 * or none do, preventing partial hold state on failure.
 */

import { db } from "@workspace/db";
import {
  holdsTable,
  invoiceLinksTable,
  collectionAccountsTable,
} from "@workspace/db";
import { eq, and, isNull, lt, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";

/** USD threshold above which a client's overdue balance triggers a Material Hold. */
function getMaterialHoldThreshold(): number {
  const raw = process.env.MATERIAL_HOLD_THRESHOLD_USD;
  if (raw !== undefined) {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`MATERIAL_HOLD_THRESHOLD_USD must be a non-negative number, got "${raw}"`);
    }
    return parsed;
  }
  return 0; // default: any overdue balance triggers a hold
}

export interface HoldRecomputeResult {
  set: number;
  cleared: number;
}

type HoldType = "schedule_hold" | "material_hold";

// ---------------------------------------------------------------------------
// Pure hold-decision logic (unit-tested in holdEngine.test.ts)
//
// The decision of *which* vendor bills to hold and *which* existing holds to
// clear is separated from all DB I/O so it can be exercised directly. The
// recomputeHolds transaction below loads the inputs, calls planHoldChanges, and
// applies the resulting plan.
// ---------------------------------------------------------------------------

/** A vendor bill (supplier invoice) considered for holding. */
export interface HoldBill {
  id: string;
  lienProjectId: string | null;
  linkedClientId: string | null;
  clearedFlag: boolean;
}

/** An existing, still-open bill-based hold. */
export interface ActiveBillHold {
  id: string;
  holdType: HoldType;
  supplierInvoiceId: string | null;
}

export interface HoldPlanInput {
  vendorBills: HoldBill[];
  /** Projects with ≥1 past-due, uncleared, non-supplier receivable. */
  overdueProjectIds: Set<string>;
  /** Clients whose overdue balance exceeds the material-hold threshold. */
  overThresholdClientIds: Set<string>;
  /** Per-client overdue balance, for the material-hold reason text. */
  clientOverdueAmount: Map<string, number>;
  materialThreshold: number;
  activeBillHolds: ActiveBillHold[];
}

export interface PlannedHold {
  holdType: HoldType;
  bill: HoldBill;
  reason: string;
}

export interface HoldPlan {
  /** New holds to insert (a bill not already held for that hold type). */
  toCreate: PlannedHold[];
  /** Existing hold IDs to clear (no longer justified this pass). */
  toClearHoldIds: string[];
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Decide hold changes for one recompute pass. Pure — no I/O.
 *
 * A vendor bill is held when it is uncleared and either (a) its project has a
 * past-due receivable (schedule_hold) or (b) its client's overdue balance
 * exceeds the threshold (material_hold). A bill can carry both hold types.
 * Existing bill-based holds that are no longer justified this pass are cleared.
 */
export function planHoldChanges(input: HoldPlanInput): HoldPlan {
  const {
    vendorBills,
    overdueProjectIds,
    overThresholdClientIds,
    clientOverdueAmount,
    materialThreshold,
    activeBillHolds,
  } = input;

  const activeByKey = new Map<string, string>();
  for (const h of activeBillHolds) {
    // Only ever touch bill-based holds. A legacy/manual hold (null
    // supplierInvoiceId) must be left untouched — never keyed here, so it can
    // never be reported as stale and cleared, even if a caller passes mixed holds.
    if (h.supplierInvoiceId == null) continue;
    activeByKey.set(`${h.holdType}|${h.supplierInvoiceId}`, h.id);
  }

  const toCreate: PlannedHold[] = [];
  const stillJustified = new Set<string>();

  const ensure = (holdType: HoldType, bill: HoldBill, reason: string) => {
    const key = `${holdType}|${bill.id}`;
    stillJustified.add(key);
    if (activeByKey.has(key)) return; // already held — leave it
    toCreate.push({ holdType, bill, reason });
  };

  for (const bill of vendorBills) {
    if (bill.clearedFlag) continue; // never hold an already-paid vendor bill

    if (bill.lienProjectId && overdueProjectIds.has(bill.lienProjectId)) {
      ensure("schedule_hold", bill, "Vendor payment withheld — project has a past-due receivable");
    }

    if (bill.linkedClientId && overThresholdClientIds.has(bill.linkedClientId)) {
      const overdue = clientOverdueAmount.get(bill.linkedClientId) ?? 0;
      ensure(
        "material_hold",
        bill,
        `Vendor payment withheld — client overdue balance $${formatUsd(overdue)} exceeds threshold $${materialThreshold.toFixed(2)}`,
      );
    }
  }

  // Clear active bill-based holds no longer justified (bill paid, project no
  // longer overdue, or client back under threshold).
  const toClearHoldIds: string[] = [];
  for (const [key, holdId] of activeByKey) {
    if (!stillJustified.has(key)) toClearHoldIds.push(holdId);
  }

  return { toCreate, toClearHoldIds };
}

export async function recomputeHolds(orgId: string): Promise<HoldRecomputeResult> {
  const now = new Date();
  const materialThreshold = getMaterialHoldThreshold();
  let set = 0;
  let cleared = 0;

  await db.transaction(async (tx) => {
    // -------------------------------------------------------------------------
    // Triggers
    // -------------------------------------------------------------------------

    // Projects with a past-due receivable (non-supplier, uncleared, dueDate < now).
    const overdueInvoiceRows = await tx
      .select({ lienProjectId: invoiceLinksTable.lienProjectId })
      .from(invoiceLinksTable)
      .where(
        and(
          eq(invoiceLinksTable.orgId, orgId),
          eq(invoiceLinksTable.isSupplierInvoice, false),
          eq(invoiceLinksTable.clearedFlag, false),
          lt(invoiceLinksTable.dueDate, now),
        ),
      );

    const overdueProjectIds = new Set(
      overdueInvoiceRows
        .map((r) => r.lienProjectId)
        .filter((id): id is string => id !== null && id !== undefined),
    );

    // Clients whose overdue balance exceeds the material-hold threshold.
    const accounts = await tx
      .select({
        linkedClientId: collectionAccountsTable.linkedClientId,
        totalOverdue: collectionAccountsTable.totalOverdue,
      })
      .from(collectionAccountsTable)
      .where(eq(collectionAccountsTable.orgId, orgId));

    const overThresholdClientIds = new Set(
      accounts
        .filter((a) => parseFloat(a.totalOverdue ?? "0") > materialThreshold)
        .map((a) => a.linkedClientId),
    );

    const clientOverdueAmount = new Map(
      accounts.map((a) => [a.linkedClientId, parseFloat(a.totalOverdue ?? "0")]),
    );

    // -------------------------------------------------------------------------
    // Vendor bills (supplier invoices) — the things we actually hold
    // -------------------------------------------------------------------------

    const vendorBills = await tx
      .select({
        id: invoiceLinksTable.id,
        lienProjectId: invoiceLinksTable.lienProjectId,
        linkedClientId: invoiceLinksTable.linkedClientId,
        clearedFlag: invoiceLinksTable.clearedFlag,
      })
      .from(invoiceLinksTable)
      .where(
        and(
          eq(invoiceLinksTable.orgId, orgId),
          eq(invoiceLinksTable.isSupplierInvoice, true),
        ),
      );

    // Currently active bill-based holds.
    const activeBillHolds = await tx
      .select({
        id: holdsTable.id,
        holdType: holdsTable.holdType,
        supplierInvoiceId: holdsTable.supplierInvoiceId,
      })
      .from(holdsTable)
      .where(
        and(
          eq(holdsTable.orgId, orgId),
          isNull(holdsTable.clearedAt),
          isNotNull(holdsTable.supplierInvoiceId),
        ),
      );

    // Pure decision of what to set/clear this pass.
    const plan = planHoldChanges({
      vendorBills,
      overdueProjectIds,
      overThresholdClientIds,
      clientOverdueAmount,
      materialThreshold,
      activeBillHolds,
    });

    for (const planned of plan.toCreate) {
      await tx.insert(holdsTable).values({
        id: randomUUID(),
        orgId,
        holdType: planned.holdType,
        lienProjectId: planned.bill.lienProjectId,
        linkedClientId: planned.bill.linkedClientId,
        supplierInvoiceId: planned.bill.id,
        reason: planned.reason,
        setAt: now,
      });
      set++;
    }

    for (const holdId of plan.toClearHoldIds) {
      await tx
        .update(holdsTable)
        .set({ clearedAt: now, updatedAt: now })
        .where(eq(holdsTable.id, holdId));
      cleared++;
    }
  });

  return { set, cleared };
}
