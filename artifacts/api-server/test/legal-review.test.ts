import { describe, it, expect } from "vitest";
import {
  legalReviewEnforced,
  ruleSetsPermitSend,
} from "../src/lib/legalReview";

// ---------------------------------------------------------------------------
// DD-04 legal-review gate. The pure decision functions are tested here; the DB
// resolver (jurisdictionRuleSetsForSov) and route wiring are exercised by the
// integration/UAT layer because they require a seeded database.
// ---------------------------------------------------------------------------

describe("legalReviewEnforced", () => {
  it("is enforced in production", () => {
    expect(legalReviewEnforced({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("is relaxed outside production (dev/test/UAT)", () => {
    expect(legalReviewEnforced({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
    expect(legalReviewEnforced({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("can be explicitly bypassed in production via LEGAL_REVIEW_BYPASS=1", () => {
    expect(
      legalReviewEnforced({ NODE_ENV: "production", LEGAL_REVIEW_BYPASS: "1" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("ruleSetsPermitSend", () => {
  it("permits anything when the gate is not enforced", () => {
    expect(ruleSetsPermitSend([], false)).toBe(true);
    expect(ruleSetsPermitSend([{ legalReviewed: false }], false)).toBe(true);
  });

  it("permits when at least one rule set is legally reviewed", () => {
    expect(
      ruleSetsPermitSend([{ legalReviewed: false }, { legalReviewed: true }], true),
    ).toBe(true);
  });

  it("blocks when no rule set is legally reviewed", () => {
    expect(ruleSetsPermitSend([{ legalReviewed: false }], true)).toBe(false);
  });

  it("blocks (fail-closed) when there are no rule sets at all", () => {
    expect(ruleSetsPermitSend([], true)).toBe(false);
  });
});
