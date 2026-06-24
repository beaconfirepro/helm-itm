import { describe, it, expect } from "vitest";
import {
  computeDeadline,
  nextBusinessDay,
  addBusinessDays,
  type LienRuleInput,
} from "../src/lib/deadlineEngine";

// ---------------------------------------------------------------------------
// These tests lock the statutory deadline math (Texas Property Code Ch. 53,
// § 53.003(e) business-day handling). A wrong date here can forfeit a lien
// right, so the engine is treated as the highest-stakes logic in the app.
//
// All dates are constructed in UTC and compared as YYYY-MM-DD strings to keep
// the suite independent of the machine timezone.
// ---------------------------------------------------------------------------

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function rule(overrides: Partial<LienRuleInput> = {}): LienRuleInput {
  return {
    id: "rule_1",
    ruleKind: "notice",
    anchor: "work_month",
    offsetMonths: null,
    offsetDayOfMonth: null,
    offsetDays: null,
    offsetIsBusinessDays: false,
    businessDayHandling: "next_business_day",
    statuteCitation: "§ 53.056(b)",
    description: "Notice of claim for unpaid labor or materials",
    ...overrides,
  };
}

describe("computeDeadline — month+day offset (notice deadline)", () => {
  it("computes the 15th of the 3rd month after the work month (Mar 2026 → Jun 15 2026)", () => {
    const result = computeDeadline({
      rule: rule({ offsetMonths: 3, offsetDayOfMonth: 15 }),
      workMonthDate: utc(2026, 3, 1),
      completionDate: null,
      filingDate: null,
    });
    expect(result).not.toBeNull();
    expect(iso(result!.computedDate)).toBe("2026-06-15");
    // Jun 15 2026 is a Monday (a business day) → no roll-forward.
    expect(iso(result!.adjustedDate)).toBe("2026-06-15");
  });

  it("rolls the year over correctly (Nov 2026 + 3 months → Feb 15 2027)", () => {
    const result = computeDeadline({
      rule: rule({ offsetMonths: 3, offsetDayOfMonth: 15 }),
      workMonthDate: utc(2026, 11, 1),
      completionDate: null,
      filingDate: null,
    });
    expect(iso(result!.computedDate)).toBe("2027-02-15");
  });
});

describe("computeDeadline — § 53.003(e) business-day roll-forward", () => {
  it("rolls a Saturday deadline past Presidents' Day (Feb 14 2026 Sat → Feb 17 2026 Tue)", () => {
    // Feb 14 2026 is a Saturday; Feb 16 2026 is Presidents' Day (3rd Mon Feb).
    const result = computeDeadline({
      rule: rule({ ruleKind: "retainage", offsetMonths: 0, offsetDayOfMonth: 14 }),
      workMonthDate: utc(2026, 2, 1),
      completionDate: null,
      filingDate: null,
    });
    expect(iso(result!.computedDate)).toBe("2026-02-14");
    expect(iso(result!.adjustedDate)).toBe("2026-02-17");
  });

  it("does NOT roll when businessDayHandling is 'exact', even on a weekend", () => {
    const result = computeDeadline({
      rule: rule({
        offsetMonths: 0,
        offsetDayOfMonth: 14,
        businessDayHandling: "exact",
      }),
      workMonthDate: utc(2026, 2, 1),
      completionDate: null,
      filingDate: null,
    });
    expect(iso(result!.computedDate)).toBe("2026-02-14");
    expect(iso(result!.adjustedDate)).toBe("2026-02-14");
  });
});

describe("computeDeadline — day offsets", () => {
  it("adds calendar days from the completion anchor", () => {
    const result = computeDeadline({
      rule: rule({
        ruleKind: "post_filing_notice",
        anchor: "completion",
        offsetDays: 30,
        businessDayHandling: "exact",
      }),
      workMonthDate: utc(2026, 3, 1),
      completionDate: utc(2026, 3, 10),
      filingDate: null,
    });
    expect(iso(result!.computedDate)).toBe("2026-04-09");
  });

  it("adds business days (skipping weekends/holidays) from the filing anchor", () => {
    // 5 business days after Fri Jul 3 2026 (observed Independence Day) — the
    // § 53.055 post-filing 5-business-day window.
    const result = computeDeadline({
      rule: rule({
        ruleKind: "post_filing_notice",
        anchor: "filing_date",
        offsetDays: 5,
        offsetIsBusinessDays: true,
        businessDayHandling: "exact",
      }),
      workMonthDate: utc(2026, 7, 1),
      completionDate: null,
      filingDate: utc(2026, 6, 30), // Tue Jun 30 2026
    });
    // Jun 30 (Tue) +5 business days: Jul1,Jul2, (Jul3 observed holiday skip),
    // (Jul4-5 weekend), Jul6,Jul7,Jul8 → Jul 8 2026.
    expect(iso(result!.computedDate)).toBe("2026-07-08");
  });
});

describe("computeDeadline — anchor availability", () => {
  it("returns null when the completion anchor is not yet available", () => {
    const result = computeDeadline({
      rule: rule({ anchor: "completion", offsetDays: 30 }),
      workMonthDate: utc(2026, 3, 1),
      completionDate: null,
      filingDate: null,
    });
    expect(result).toBeNull();
  });

  it("returns null when the filing anchor is not yet available", () => {
    const result = computeDeadline({
      rule: rule({ anchor: "filing_date", offsetDays: 365 }),
      workMonthDate: utc(2026, 3, 1),
      completionDate: null,
      filingDate: null,
    });
    expect(result).toBeNull();
  });

  it("throws for an unsupported anchor type (data-integrity guard)", () => {
    expect(() =>
      computeDeadline({
        rule: rule({ anchor: "made_up_anchor" }),
        workMonthDate: utc(2026, 3, 1),
        completionDate: null,
        filingDate: null,
      }),
    ).toThrow(/Unsupported anchor type/);
  });
});

describe("computeDeadline — provenance (sourceData, L13)", () => {
  it("captures the statute citation, anchor, and traceability links", () => {
    const result = computeDeadline({
      rule: rule({
        offsetMonths: 3,
        offsetDayOfMonth: 15,
        statuteCitation: "§ 53.056(a-1)(1)",
      }),
      workMonthDate: utc(2026, 3, 1),
      completionDate: null,
      filingDate: null,
      invoiceLinkId: "inv_123",
      timesheetIds: ["ts_1", "ts_2"],
    });
    expect(result!.sourceData).toMatchObject({
      rule: "§ 53.056(a-1)(1)",
      anchor: "work_month",
      anchorDate: "2026-03-01",
      offsetMonths: 3,
      offsetDayOfMonth: 15,
      invoiceLinkId: "inv_123",
      timesheetIds: ["ts_1", "ts_2"],
    });
  });
});

describe("nextBusinessDay / addBusinessDays helpers", () => {
  it("skips a holiday that falls on a weekday (Thanksgiving 2026, Thu Nov 26 → Fri Nov 27)", () => {
    expect(iso(nextBusinessDay(utc(2026, 11, 26)))).toBe("2026-11-27");
  });

  it("skips an observed holiday + weekend (Independence Day observed Fri Jul 3 2026 → Mon Jul 6)", () => {
    // Jul 4 2026 is a Saturday → observed Friday Jul 3 → next business day is Jul 6.
    expect(iso(nextBusinessDay(utc(2026, 7, 3)))).toBe("2026-07-06");
  });

  it("returns the same day when it is already a business day", () => {
    // Wed Jun 17 2026.
    expect(iso(nextBusinessDay(utc(2026, 6, 17)))).toBe("2026-06-17");
  });

  it("counts only business days in addBusinessDays", () => {
    // Fri Jun 12 2026 + 1 business day → Mon Jun 15 2026 (skips the weekend).
    expect(iso(addBusinessDays(utc(2026, 6, 12), 1))).toBe("2026-06-15");
  });
});
