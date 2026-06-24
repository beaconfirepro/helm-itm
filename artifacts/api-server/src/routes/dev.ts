import { Router, type IRouter, type Request, type Response } from "express";
import {
  AUTH_BYPASS,
  DEV_ROLE_COOKIE,
  BYPASS_ROLE_OPTIONS,
  isBypassRole,
} from "../middlewares/authMiddleware";

const DEV_ROLE_COOKIE_TTL = 7 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

/**
 * GET /api/dev/auth — describes the dev login bypass so the in-app role
 * switcher can render. Returns `enabled: false` (and nothing else useful) when
 * the bypass is off, which is always the case in any deployed/production
 * environment. Safe to call unauthenticated.
 */
router.get("/dev/auth", (req: Request, res: Response) => {
  if (!AUTH_BYPASS) {
    res.json({ enabled: false, role: null, options: [] });
    return;
  }
  const raw = req.cookies?.[DEV_ROLE_COOKIE];
  const role = isBypassRole(raw) ? raw : "admin";
  res.json({ enabled: true, role, options: BYPASS_ROLE_OPTIONS });
});

/**
 * POST /api/dev/auth/role — sets the `dev_role` cookie so subsequent requests
 * are authenticated as that role's seeded test user. Only available while the
 * bypass is active; returns 404 otherwise so it is invisible in production.
 */
router.post("/dev/auth/role", (req: Request, res: Response) => {
  if (!AUTH_BYPASS) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const role = (req.body ?? {}).role;
  if (!isBypassRole(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  res.cookie(DEV_ROLE_COOKIE, role, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEV_ROLE_COOKIE_TTL,
  });
  res.json({ ok: true, role });
});

export default router;
