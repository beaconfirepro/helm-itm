/**
 * seed-phase6.ts — Seed Phase 6 filing, release, and lapsed-stream data.
 *
 * Run: pnpm dlx tsx src/scripts/seed-phase6.ts
 * (from artifacts/api-server directory)
 *
 * Idempotent: upserts using explicit IDs.
 */

import { db } from "@workspace/db";
import {
  lienFilingsTable,
  lienReleasesTable,
  lienScheduleOfValuesTable,
  workMonthsTable,
  lienDeadlinesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const ORG = "org_beacon_test_001";

async function upsert<T extends { id: string }>(
  table: Parameters<typeof db.insert>[0],
  record: T,
) {
  await db.insert(table as any).values(record).onConflictDoNothing();
}

async function main() {
  console.log("Seeding Phase 6 data (filing + release + lapsed stream)...");

  // ── fil_1: filed lien on str_2nd_con (proj_2nd / Oak Ave Apartments, Dallas) ──
  await upsert(lienFilingsTable, {
    id: "fil_1",
    orgId: ORG,
    lienScheduleOfValuesId: "str_2nd_con",
    status: "filed" as const,
    county: "Dallas",
    filingDate: new Date("2026-05-20"),
    recordingRef: "2026-DAL-00123",
    filingFee: "95.00",
    postFilingNoticeDeadline: new Date("2026-05-27"),
    enforcementDeadline: new Date("2027-05-20"),
    affidavitDocUrl: "s3://affidavits/fil_1.pdf",
  });

  // Ensure str_2nd_con stream status is "filed"
  await db
    .update(lienScheduleOfValuesTable)
    .set({ status: "filed", updatedAt: new Date() })
    .where(and(eq(lienScheduleOfValuesTable.id, "str_2nd_con"), eq(lienScheduleOfValuesTable.orgId, ORG)));

  console.log("  ✓ fil_1 (filed, Dallas, 2026-05-20)");

  // ── rel_1: signed release on fil_1 ──
  await upsert(lienReleasesTable, {
    id: "rel_1",
    orgId: ORG,
    filingId: "fil_1",
    status: "signed" as const,
    requestedAt: new Date("2026-05-28"),
    signedDate: new Date("2026-06-01"),
    filingConfirmation: "2026-DAL-00188",
  });

  console.log("  ✓ rel_1 (signed release, 2026-06-01)");

  // ── Lapsed stream: str_lapsed_con on proj_res (Cedar Custom Home, Harris) ──
  // This stream has a filing deadline that passed with no filed lien.
  await db
    .insert(lienScheduleOfValuesTable)
    .values({
      id: "str_lapsed_con",
      orgId: ORG,
      lienProjectId: "proj_res",
      workStream: "construction" as const,
      status: "lapsed" as const,
      openedAt: new Date("2026-01-15"),
    })
    .onConflictDoNothing();

  console.log("  ✓ str_lapsed_con (lapsed stream, proj_res)");

  // Work month for the lapsed stream (Jan 2026 — overdue, never cleared)
  await db
    .insert(workMonthsTable)
    .values({
      id: "wm_lapsed_jan",
      orgId: ORG,
      lienScheduleOfValuesId: "str_lapsed_con",
      month: new Date("2026-01-01"),
      derivedOverdue: true,
      clearedFlag: false,
    })
    .onConflictDoNothing();

  console.log("  ✓ wm_lapsed_jan (overdue work month on lapsed stream)");

  // Filing deadline that has already passed (residential_sub → 15th of 3rd month = Apr 15, 2026)
  await db
    .insert(lienDeadlinesTable)
    .values({
      id: "dl_lapsed_filing",
      orgId: ORG,
      workMonthId: "wm_lapsed_jan",
      ruleId: "rule_rs_filing",
      ruleKind: "filing" as const,
      computedDate: new Date("2026-04-15"),
      adjustedDate: new Date("2026-04-15"),
      sourceData: {
        anchor: "work_month",
        anchorDate: "2026-01-01",
        workMonth: "2026-01",
        rule: "§ 53.052(c)",
        ruleDescription: "Lien filing, residential sub",
        offsetMonths: 3,
        offsetDayOfMonth: 15,
      },
    })
    .onConflictDoNothing();

  console.log("  ✓ dl_lapsed_filing (filing deadline Apr 15, 2026 — now past)");

  console.log("\nPhase 6 seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
