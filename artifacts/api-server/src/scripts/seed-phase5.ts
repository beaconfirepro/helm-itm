/**
 * seed-phase5.ts — Seed waivers and mailing record for Phase 5.
 *
 * Run: pnpm dlx tsx src/scripts/seed-phase5.ts
 * (from artifacts/api-server directory)
 */

import { db } from "@workspace/db";
import { waiversTable, mailingRecordsTable, noticesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const ORG = "org_beacon_test_001";

async function main() {
  console.log("Seeding Phase 5 data (waivers + mailing records)...");

  // Waivers — one per WaiverType, covering all WaiverApprovalStatus states.
  const waivers = [
    {
      id: "wv_cond_prog",
      orgId: ORG,
      lienProjectId: "proj_comm",
      workStream: "construction" as const,
      waiverType: "conditional_progress" as const,
      paymentAmount: "12000.00",
      approvalStatus: "not_required" as const,
      notarized: true,
      notaryLiveRef: "nl_1",
      signedDate: new Date("2026-04-05"),
      invoiceLinkId: "inv_cleared",
    },
    {
      id: "wv_uncond_prog",
      orgId: ORG,
      lienProjectId: "proj_comm",
      workStream: "construction" as const,
      waiverType: "unconditional_progress" as const,
      paymentAmount: "12000.00",
      approvalStatus: "pending_pm" as const,
      notarized: false,
    },
    {
      id: "wv_cond_final",
      orgId: ORG,
      lienProjectId: "proj_res",
      workStream: "construction" as const,
      waiverType: "conditional_final" as const,
      paymentAmount: "12000.00",
      approvalStatus: "not_required" as const,
      notarized: false,
    },
    {
      id: "wv_uncond_final",
      orgId: ORG,
      lienProjectId: "proj_res",
      workStream: "construction" as const,
      waiverType: "unconditional_final" as const,
      paymentAmount: "12000.00",
      approvalStatus: "pending_pm_finance" as const,
      notarized: false,
    },
  ];

  for (const w of waivers) {
    try {
      await db.insert(waiversTable).values(w).onConflictDoUpdate({
        target: waiversTable.id,
        set: {
          approvalStatus: w.approvalStatus,
          pmApprovedByUserId: null,
          pmApprovedAt: null,
          financeApprovedByUserId: null,
          financeApprovedAt: null,
          notarized: w.notarized,
          signedDate: w.signedDate ?? null,
          invoiceLinkId: w.invoiceLinkId ?? null,
          notaryLiveRef: w.notaryLiveRef ?? null,
          updatedAt: new Date(),
        },
      });
      console.log(`  ✓ waiver ${w.id} (${w.waiverType})`);
    } catch (e) {
      console.log(`  ✗ waiver ${w.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Mailing record for the already-sent notice (not_statutory).
  try {
    await db.insert(mailingRecordsTable).values({
      id: "mail_1",
      orgId: ORG,
      noticeId: "not_statutory",
      provider: "shippo",
      trackingNumber: "9400100000000000000001",
      sentDate: new Date("2026-05-10"),
      labelUrl: "s3://labels/mail_1.pdf",
    }).onConflictDoUpdate({
      target: mailingRecordsTable.id,
      set: { trackingNumber: "9400100000000000000001", updatedAt: new Date() },
    });
    console.log("  ✓ mailing record mail_1");
  } catch (e) {
    console.log(`  ✗ mailing record mail_1: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log("Phase 5 seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
