import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";
import { TEST_SERVICE_KEY } from "./setup";

const withKey = () => ({ "X-Service-Key": TEST_SERVICE_KEY });

describe("GET /api/external/holds", () => {
  it("rejects requests without a service key (401)", async () => {
    const res = await request(app).get("/api/external/holds");

    expect(res.status).toBe(401);
  });

  it("rejects requests with the wrong service key (401)", async () => {
    const res = await request(app)
      .get("/api/external/holds")
      .set("X-Service-Key", "not-the-key");

    expect(res.status).toBe(401);
  });

  it("returns an array of active holds with a valid service key", async () => {
    const res = await request(app).get("/api/external/holds").set(withKey());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.holds)).toBe(true);
  });
});

describe("GET /api/external/reference", () => {
  it("rejects requests without a service key (401)", async () => {
    const res = await request(app).get("/api/external/reference");

    expect(res.status).toBe(401);
  });

  it("returns the reference tree and stage triggers with a valid service key", async () => {
    const res = await request(app)
      .get("/api/external/reference")
      .set(withKey());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.departments)).toBe(true);
    expect(Array.isArray(res.body.stageTriggers)).toBe(true);
  });
});
