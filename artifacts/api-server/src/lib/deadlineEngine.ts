/**
 * deadlineEngine.ts — Texas § 53.003(e) jurisdiction rule engine.
 *
 * Given a LienRule and anchor context, computes:
 *  - computedDate: raw deadline per rule arithmetic
 *  - adjustedDate: rolled to next business day per § 53.003(e)
 *  - sourceData: provenance snapshot (L13) including statute citation,
 *    linked invoice ID, and contributing timesheet IDs
 *
 * Texas state holidays defined by Tex. Gov't Code § 662.021.
 * Unknown anchor types throw rather than silently default.
 */

// ---------------------------------------------------------------------------
// Texas state holiday computation
// ---------------------------------------------------------------------------

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === n) return new Date(d);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new Error(`No ${n}th weekday in ${year}-${month}`);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const d = new Date(Date.UTC(year, month, 0));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return new Date(d);
}

function observedDate(date: Date): Date {
  const dow = date.getUTCDay();
  if (dow === 0) return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  if (dow === 6) return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
  return date;
}

function texasHolidaysForYear(year: number): Set<string> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return new Set([
    fmt(observedDate(new Date(Date.UTC(year, 0, 1)))),   // New Year's Day
    fmt(nthWeekday(year, 1, 1, 3)),                       // MLK Day (3rd Mon Jan)
    fmt(nthWeekday(year, 2, 1, 3)),                       // Presidents' Day (3rd Mon Feb)
    fmt(observedDate(new Date(Date.UTC(year, 2, 2)))),    // Texas Independence Day (Mar 2)
    fmt(observedDate(new Date(Date.UTC(year, 3, 21)))),   // San Jacinto Day (Apr 21)
    fmt(lastWeekday(year, 5, 1)),                         // Memorial Day (last Mon May)
    fmt(observedDate(new Date(Date.UTC(year, 5, 19)))),   // Juneteenth (Jun 19)
    fmt(observedDate(new Date(Date.UTC(year, 6, 4)))),    // Independence Day
    fmt(observedDate(new Date(Date.UTC(year, 7, 27)))),   // LBJ Day (Aug 27)
    fmt(nthWeekday(year, 9, 1, 1)),                       // Labor Day (1st Mon Sep)
    fmt(nthWeekday(year, 10, 1, 2)),                      // Columbus Day (2nd Mon Oct)
    fmt(observedDate(new Date(Date.UTC(year, 10, 11)))),  // Veterans Day
    fmt(nthWeekday(year, 11, 4, 4)),                      // Thanksgiving (4th Thu Nov)
    fmt(observedDate(new Date(Date.UTC(year, 11, 25)))),  // Christmas
  ]);
}

const holidayCache = new Map<number, Set<string>>();

function isTexasHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  if (!holidayCache.has(year)) holidayCache.set(year, texasHolidaysForYear(year));
  return holidayCache.get(year)!.has(date.toISOString().slice(0, 10));
}

function isBusinessDay(date: Date): boolean {
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !isTexasHoliday(date);
}

export function nextBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (!isBusinessDay(d)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function addBusinessDays(date: Date, n: number): Date {
  const d = new Date(date);
  let remaining = n;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) remaining--;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LienRuleInput {
  id: string;
  ruleKind: string;
  anchor: string;
  offsetMonths: number | null;
  offsetDayOfMonth: number | null;
  offsetDays: number | null;
  offsetIsBusinessDays: boolean;
  businessDayHandling: string;
  statuteCitation: string;
  description: string;
}

export interface DeadlineInput {
  rule: LienRuleInput;
  workMonthDate: Date;
  completionDate: Date | null;
  filingDate: Date | null;
  /** Provenance: invoice linked to this work month (L13) */
  invoiceLinkId?: string | null;
  /** Provenance: Connecteam time-record IDs that define this work month (L13) */
  timesheetIds?: string[];
}

export interface ComputedDeadline {
  ruleId: string;
  ruleKind: string;
  computedDate: Date;
  adjustedDate: Date;
  sourceData: Record<string, unknown>;
}

/**
 * Compute a single deadline from a rule + anchor context.
 *
 * Returns null when a required anchor (completion, filing_date) is not yet
 * available — callers should skip that rule for now and recompute when the
 * data is ready.
 *
 * Throws for truly unsupported anchor values (data integrity guard).
 */
export function computeDeadline(input: DeadlineInput): ComputedDeadline | null {
  const { rule, workMonthDate, completionDate, filingDate, invoiceLinkId, timesheetIds } = input;

  let anchorDate: Date | null;
  switch (rule.anchor) {
    case "work_month":
      anchorDate = workMonthDate;
      break;
    case "completion":
      anchorDate = completionDate;
      break;
    case "filing_date":
      anchorDate = filingDate;
      break;
    default:
      throw new Error(
        `Unsupported anchor type: "${rule.anchor}" in rule "${rule.id}". ` +
        `Valid values: work_month, completion, filing_date.`,
      );
  }

  if (anchorDate === null) return null; // anchor not yet available — expected, not an error

  let raw: Date;

  if (rule.offsetMonths != null && rule.offsetDayOfMonth != null) {
    // "15th of the Nth month after the work month"
    // e.g. Mar 2026 + 3 months + day 15 → Jun 15, 2026
    const totalMonths = anchorDate.getUTCMonth() + rule.offsetMonths;
    const targetYear = anchorDate.getUTCFullYear() + Math.floor(totalMonths / 12);
    const targetMonth = totalMonths % 12;
    raw = new Date(Date.UTC(targetYear, targetMonth, rule.offsetDayOfMonth));
  } else if (rule.offsetDays != null) {
    raw = rule.offsetIsBusinessDays
      ? addBusinessDays(new Date(anchorDate), rule.offsetDays)
      : (() => { const d = new Date(anchorDate); d.setUTCDate(d.getUTCDate() + rule.offsetDays!); return d; })();
  } else {
    raw = new Date(anchorDate);
  }

  const adjusted =
    rule.businessDayHandling === "next_business_day" ? nextBusinessDay(raw) : new Date(raw);

  // Provenance snapshot — every field here helps a coordinator verify the date (L13)
  const sourceData: Record<string, unknown> = {
    anchor: rule.anchor,
    anchorDate: anchorDate.toISOString().slice(0, 10),
    workMonth: workMonthDate.toISOString().slice(0, 7),
    rule: rule.statuteCitation,
    ruleDescription: rule.description,
  };
  if (rule.offsetMonths != null) sourceData.offsetMonths = rule.offsetMonths;
  if (rule.offsetDayOfMonth != null) sourceData.offsetDayOfMonth = rule.offsetDayOfMonth;
  if (rule.offsetDays != null) sourceData.offsetDays = rule.offsetDays;
  if (rule.offsetIsBusinessDays) sourceData.offsetIsBusinessDays = true;
  // Traceability: link back to source records
  if (invoiceLinkId) sourceData.invoiceLinkId = invoiceLinkId;
  if (timesheetIds?.length) sourceData.timesheetIds = timesheetIds;

  return {
    ruleId: rule.id,
    ruleKind: rule.ruleKind,
    computedDate: raw,
    adjustedDate: adjusted,
    sourceData,
  };
}
