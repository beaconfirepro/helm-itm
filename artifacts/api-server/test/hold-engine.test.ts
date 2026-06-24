import { describe, it, expect } from "vitest";
import {
  planHoldChanges,
  type HoldBill,
  type HoldPlanInput,
} from "../src/lib/holdEngine";

// ---------------------------------------------------------------------------
// Pure hold-decision logic. The recomputeHolds transaction loads inputs from
// the DB and applies the plan; this suite locks the *decision* of which vendor
// bills to hold (schedule_hold / material_hold) and which existing holds to
// clear, with no database.
// ---------------------------------------------------------------------------

function bill(overrides: Partial<HoldBill> = {}): HoldBill {
  return {
    id: "bill_1",
    lienProjectId: "proj_1",
    linkedClientId: "client_1",
    clearedFlag: false,
    ...overrides,
  };
}

function input(overrides: Partial<HoldPlanInput> = {}): HoldPlanInput {
  return {
    vendorBills: [],
    overdueProjectIds: new Set<string>(),
    overThresholdClientIds: new Set<string>(),
    clientOverdueAmount: new Map<string, number>(),
    materialThreshold: 0,
    activeBillHolds: [],
    ...overrides,
  };
}

describe("planHoldChanges — schedule_hold", () => {
  it("holds an uncleared vendor bill on a project with a past-due receivable", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ id: "b1", lienProjectId: "proj_1" })],
        overdueProjectIds: new Set(["proj_1"]),
      }),
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0]).toMatchObject({ holdType: "schedule_hold" });
    expect(plan.toCreate[0].bill.id).toBe("b1");
    expect(plan.toClearHoldIds).toEqual([]);
  });

  it("does NOT hold a bill whose project has no past-due receivable", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ lienProjectId: "proj_2" })],
        overdueProjectIds: new Set(["proj_1"]),
      }),
    );
    expect(plan.toCreate).toEqual([]);
  });
});

describe("planHoldChanges — material_hold", () => {
  it("holds an uncleared bill for a client over the overdue threshold, with the amount in the reason", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ id: "b1", linkedClientId: "client_1" })],
        overThresholdClientIds: new Set(["client_1"]),
        clientOverdueAmount: new Map([["client_1", 12345.6]]),
        materialThreshold: 1000,
      }),
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].holdType).toBe("material_hold");
    expect(plan.toCreate[0].reason).toContain("$12,345.60");
    expect(plan.toCreate[0].reason).toContain("$1000.00");
  });
});

describe("planHoldChanges — never holds a cleared (paid) bill", () => {
  it("skips a cleared bill even when both triggers fire", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ clearedFlag: true })],
        overdueProjectIds: new Set(["proj_1"]),
        overThresholdClientIds: new Set(["client_1"]),
      }),
    );
    expect(plan.toCreate).toEqual([]);
  });
});

describe("planHoldChanges — both triggers on one bill", () => {
  it("creates both a schedule_hold and a material_hold for the same bill", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ id: "b1", lienProjectId: "proj_1", linkedClientId: "client_1" })],
        overdueProjectIds: new Set(["proj_1"]),
        overThresholdClientIds: new Set(["client_1"]),
        clientOverdueAmount: new Map([["client_1", 5000]]),
      }),
    );
    const types = plan.toCreate.map((h) => h.holdType).sort();
    expect(types).toEqual(["material_hold", "schedule_hold"]);
  });
});

describe("planHoldChanges — idempotency with existing holds", () => {
  it("does not re-create a hold that is already active, and does not clear it", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ id: "b1", lienProjectId: "proj_1" })],
        overdueProjectIds: new Set(["proj_1"]),
        activeBillHolds: [
          { id: "hold_1", holdType: "schedule_hold", supplierInvoiceId: "b1" },
        ],
      }),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClearHoldIds).toEqual([]);
  });

  it("clears an active hold that is no longer justified", () => {
    // The bill's project is no longer overdue, so its schedule_hold is stale.
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ id: "b1", lienProjectId: "proj_1" })],
        overdueProjectIds: new Set<string>(), // proj_1 cleared up
        activeBillHolds: [
          { id: "hold_1", holdType: "schedule_hold", supplierInvoiceId: "b1" },
        ],
      }),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClearHoldIds).toEqual(["hold_1"]);
  });

  it("clears the hold on a bill that has since been paid", () => {
    const plan = planHoldChanges(
      input({
        vendorBills: [bill({ id: "b1", lienProjectId: "proj_1", clearedFlag: true })],
        overdueProjectIds: new Set(["proj_1"]),
        activeBillHolds: [
          { id: "hold_1", holdType: "schedule_hold", supplierInvoiceId: "b1" },
        ],
      }),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClearHoldIds).toEqual(["hold_1"]);
  });

  it("never clears a legacy/manual hold (null supplierInvoiceId), even if passed in", () => {
    // The engine only manages bill-based holds; project/client-wide manual holds
    // must be left untouched regardless of what the caller passes.
    const plan = planHoldChanges(
      input({
        vendorBills: [],
        activeBillHolds: [
          { id: "manual_1", holdType: "material_hold", supplierInvoiceId: null },
        ],
      }),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClearHoldIds).toEqual([]);
  });
});
