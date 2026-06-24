import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const VERSION = process.env.npm_package_version ?? "0.0.0";

/**
 * GET /health
 * Returns { status: "ok", db: "ok", version } when the DB ping succeeds.
 * Service-key and session authentication are intentionally omitted — this
 * endpoint is polled by infrastructure health checkers that have no session.
 */
router.get(["/health", "/healthz"], async (_req, res) => {
  let dbStatus: "ok" | "error" = "ok";

  try {
    await pool.query("SELECT 1");
  } catch {
    dbStatus = "error";
  }

  const httpStatus = dbStatus === "ok" ? 200 : 503;

  res.status(httpStatus).json({
    status: dbStatus === "ok" ? "ok" : "error",
    db: dbStatus,
    version: VERSION,
  });
});

export default router;
