import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import {
  scoreRisk,
  validateRiskConfig,
  DEFAULT_RISK_CONFIG,
  type RiskScoreConfig,
} from "../src/lib/riskScore";

// ---------------------------------------------------------------------------
// Pure calculator
// ---------------------------------------------------------------------------

describe("scoreRisk (default config)", () => {
  it("matches the original hardcoded scoring for a high-risk account", () => {
    // oldest > 90 (40) + ratio >= 0.75 (30) + 3 broken (20) + >= 50k (10) = 100
    const { riskScore } = scoreRisk(
      { oldestOverdueDays: 120, overdueRatio: 0.9, brokenPromiseCount: 3, totalOverdue: 60000 },
      DEFAULT_RISK_CONFIG,
    );
    expect(riskScore).toBe(100);
  });

  it("scores a mid-risk account by summing the matched bands", () => {
    // oldest > 30 (22) + ratio >= 0.25 (15) + 1 broken (10) + >= 2500 (3) = 50
    const { riskScore, agePts, ratioPts, brokenPts, exposurePts } = scoreRisk(
      { oldestOverdueDays: 45, overdueRatio: 0.3, brokenPromiseCount: 1, totalOverdue: 4000 },
      DEFAULT_RISK_CONFIG,
    );
    expect(agePts).toBe(22);
    expect(ratioPts).toBe(15);
    expect(brokenPts).toBe(10);
    expect(exposurePts).toBe(3);
    expect(riskScore).toBe(50);
  });

  it("scores zero when nothing is overdue", () => {
    const { riskScore } = scoreRisk(
      { oldestOverdueDays: 0, overdueRatio: 0, brokenPromiseCount: 0, totalOverdue: 0 },
      DEFAULT_RISK_CONFIG,
    );
    expect(riskScore).toBe(0);
  });

  it("caps the total at 100", () => {
    const inflated: RiskScoreConfig = {
      ...DEFAULT_RISK_CONFIG,
      age: [{ threshold: 0, points: 100, inclusive: false }],
      exposure: [{ threshold: 0, points: 100, inclusive: true }],
    };
    const { riskScore } = scoreRisk(
      { oldestOverdueDays: 10, overdueRatio: 0.9, brokenPromiseCount: 3, totalOverdue: 99999 },
      inflated,
    );
    expect(riskScore).toBe(100);
  });

  it("honors a custom config (lower bands give lower scores)", () => {
    const lenient: RiskScoreConfig = {
      ...DEFAULT_RISK_CONFIG,
      age: [{ threshold: 365, points: 40, inclusive: false }],
    };
    const { agePts } = scoreRisk(
      { oldestOverdueDays: 120, overdueRatio: 0, brokenPromiseCount: 0, totalOverdue: 0 },
      lenient,
    );
    // 120 days no longer clears the 365-day band → 0 age points
    expect(agePts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validateRiskConfig", () => {
  it("accepts the defaults", () => {
    const r = validateRiskConfig(DEFAULT_RISK_CONFIG);
    expect(r.success).toBe(true);
  });

  it("rejects points out of range", () => {
    const bad = structuredClone(DEFAULT_RISK_CONFIG) as RiskScoreConfig;
    bad.age[0].points = 250;
    const r = validateRiskConfig(bad);
    expect(r.success).toBe(false);
  });

  it("rejects ratio thresholds above 1", () => {
    const bad = structuredClone(DEFAULT_RISK_CONFIG) as RiskScoreConfig;
    bad.ratio[0].threshold = 5;
    const r = validateRiskConfig(bad);
    expect(r.success).toBe(false);
  });

  it("rejects a missing factor", () => {
    const r = validateRiskConfig({ age: DEFAULT_RISK_CONFIG.age });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Endpoints (runs as seeded admin via AUTH_BYPASS in test env)
// ---------------------------------------------------------------------------

describe("/api/config/risk-scoring", () => {
  let original: RiskScoreConfig;

  beforeAll(async () => {
    const res = await request(app).get("/api/config/risk-scoring");
    original = res.body.config;
  });

  afterAll(async () => {
    // Restore the org's config so the suite is idempotent.
    await request(app)
      .put("/api/config/risk-scoring")
      .send({ config: original });
  });

  it("returns the config, defaults, and isDefault flag", async () => {
    const res = await request(app).get("/api/config/risk-scoring");
    expect(res.status).toBe(200);
    expect(res.body.config).toBeDefined();
    expect(res.body.defaults).toEqual(DEFAULT_RISK_CONFIG);
    expect(typeof res.body.isDefault).toBe("boolean");
  });

  it("saves a valid config via PUT and reads it back", async () => {
    const custom = structuredClone(DEFAULT_RISK_CONFIG) as RiskScoreConfig;
    custom.exposure[0].points = 9;

    const put = await request(app)
      .put("/api/config/risk-scoring")
      .send({ config: custom });
    expect(put.status).toBe(200);

    const get = await request(app).get("/api/config/risk-scoring");
    expect(get.body.config.exposure[0].points).toBe(9);
    expect(get.body.isDefault).toBe(false);
  });

  it("rejects an invalid config with 400", async () => {
    const bad = structuredClone(DEFAULT_RISK_CONFIG) as RiskScoreConfig;
    bad.age[0].points = 999;
    const res = await request(app)
      .put("/api/config/risk-scoring")
      .send({ config: bad });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("resets to defaults via DELETE", async () => {
    const res = await request(app).delete("/api/config/risk-scoring");
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);

    const get = await request(app).get("/api/config/risk-scoring");
    expect(get.body.isDefault).toBe(true);
    expect(get.body.config).toEqual(DEFAULT_RISK_CONFIG);
  });
});
