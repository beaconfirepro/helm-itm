import { Request, Response, NextFunction } from "express";

export type UserRole = "admin" | "pm" | "finance" | "coordinator";

export interface SessionData {
  orgId: string;
  userId?: string;
  role?: UserRole;
}

/**
 * Single-tenant default org.
 *
 * Replit Auth carries no organization concept — it identifies a person, not a
 * tenant. This app currently serves a single organization, so every
 * authenticated user operates within DEFAULT_ORG_ID. Override via env when the
 * deployment serves a different org.
 */
const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ??
  process.env.DEV_ORG_ID ??
  "org_beacon_test_001";

/**
 * requireSession — thin wrapper over Replit Auth's `req.isAuthenticated()`.
 *
 * The real OIDC session is loaded by `authMiddleware` (mounted globally before
 * the routers). This guard rejects requests without a valid session with 401,
 * preserving the contract every protected route already relies on.
 */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized — valid session required" });
}

/**
 * getSession — typed accessor used by route handlers after `requireSession`.
 *
 * Derives the legacy `{ orgId, userId, role }` shape from the Replit-Auth
 * `req.user`. `orgId` is the single-tenant default; `userId` and `role` come
 * from the authenticated user (role is the app-managed DB column).
 *
 * Throws if called on an unauthenticated request — always run after
 * `requireSession`.
 */
export function getSession(req: Request): SessionData {
  if (!req.isAuthenticated()) {
    throw new Error("requireSession must run before getSession");
  }
  return {
    orgId: DEFAULT_ORG_ID,
    userId: req.user.id,
    role: req.user.role ?? undefined,
  };
}
