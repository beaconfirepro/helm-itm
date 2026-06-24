import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("GET /api/healthz", () => {
  it("returns 200 with ok status and a healthy db ping", async () => {
    const res = await request(app).get("/api/healthz");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
    expect(typeof res.body.version).toBe("string");
  });

  it("serves the /api/health alias identically", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
  });

  it("does not require authentication", async () => {
    const res = await request(app).get("/api/healthz");

    expect(res.status).not.toBe(401);
  });
});
