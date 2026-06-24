import { Request, Response, NextFunction } from "express";
import { getSession } from "./session";

/**
 * requireAdmin — enforces that the authenticated user has the `admin` role.
 *
 * Must run AFTER requireSession. The role is the app-managed `users.role`
 * column loaded onto `req.user` by Replit Auth's authMiddleware. Returns 403
 * when the user's role is not `admin`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (getSession(req).role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Admin access required — this action is restricted to administrators" });
}

/**
 * requireAdminOrPm — enforces that the authenticated user has either the
 * `admin` or `pm` (project manager) role.
 *
 * Used for managing jurisdiction standards: editing global rule sets, toggling
 * the informational "reviewed" badge, and setting/clearing per-deadline
 * overrides. `finance` and `coordinator` can view these but cannot change them.
 *
 * Must run AFTER requireSession.
 */
export function requireAdminOrPm(req: Request, res: Response, next: NextFunction): void {
  const role = getSession(req).role;
  if (role === "admin" || role === "pm") {
    return next();
  }
  res.status(403).json({
    error: "Restricted — only administrators and project managers can change jurisdiction standards",
  });
}
