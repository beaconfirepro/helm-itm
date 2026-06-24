import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { UserRole } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      role: UserRole | null;
    }

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

// ── TEMPORARY LOGIN BYPASS ───────────────────────────────────────────────
// When AUTH_BYPASS=1 (or NODE_ENV=test) every request is treated as an
// authenticated user so we can use the app without going through the real
// Replit Auth / OIDC flow during development and in the automated test suite.
// This is a full authorization bypass, so it is triple-guarded:
//   1. opt-in via AUTH_BYPASS=1 or NODE_ENV=test (development/test only),
//   2. refuses to activate when NODE_ENV === "production",
//   3. refuses to activate inside a Replit deployment (REPLIT_DEPLOYMENT set).
// Remove this block (and the AUTH_BYPASS env var) to restore normal login.
//
// Role switching: the bypass defaults to admin but honours the `dev_role`
// cookie (admin | pm | finance | coordinator). This lets a non-technical tester
// assume any role from inside the app (via the dev role switcher) so role gates
// can be verified both positively (allowed → works) and negatively
// (disallowed → 403) without editing the database by hand. Each role maps to
// the matching seeded user so approval attributions look correct.
export const AUTH_BYPASS =
  (process.env.AUTH_BYPASS === "1" || process.env.NODE_ENV === "test") &&
  process.env.NODE_ENV !== "production" &&
  !process.env.REPLIT_DEPLOYMENT;

export const DEV_ROLE_COOKIE = "dev_role";

if (AUTH_BYPASS) {
  // eslint-disable-next-line no-console
  console.warn(
    "⚠️  AUTH_BYPASS is ACTIVE — every request is authenticated and the role " +
      "can be switched in-app via the dev_role cookie. This must NEVER run in " +
      "a deployed/production environment.",
  );
}

// One synthetic user per app role, mapped to the seeded per-role test users so
// that actions attributed to the actor (e.g. PM/finance waiver approvals) carry
// the right identity. Keep ids/emails in sync with seed-uat.ts.
const BYPASS_USERS: Record<UserRole, Express.User> = {
  admin: {
    id: "user_admin",
    email: "admin@beacon.test",
    firstName: "Avery",
    lastName: "Admin",
    profileImageUrl: null,
    role: "admin",
  },
  pm: {
    id: "user_pm",
    email: "pm@beacon.test",
    firstName: "Pat",
    lastName: "Project-Manager",
    profileImageUrl: null,
    role: "pm",
  },
  finance: {
    id: "user_finance",
    email: "finance@beacon.test",
    firstName: "Robin",
    lastName: "Finance",
    profileImageUrl: null,
    role: "finance",
  },
  coordinator: {
    id: "user_coord",
    email: "coordinator@beacon.test",
    firstName: "Casey",
    lastName: "Coordinator",
    profileImageUrl: null,
    role: "coordinator",
  },
};

const DEFAULT_BYPASS_ROLE: UserRole = "admin";

export function isBypassRole(value: unknown): value is UserRole {
  return typeof value === "string" && value in BYPASS_USERS;
}

// Ordered options the dev role switcher renders. The label/name match the
// seeded users in the UAT plan.
export const BYPASS_ROLE_OPTIONS: ReadonlyArray<{
  role: UserRole;
  label: string;
  name: string;
}> = [
  { role: "admin", label: "Tenant Admin", name: "Avery Admin" },
  { role: "coordinator", label: "Project Coordinator", name: "Casey Coordinator" },
  { role: "pm", label: "Project Manager", name: "Pat Project-Manager" },
  { role: "finance", label: "Finance Manager", name: "Robin Finance" },
];

function resolveBypassUser(req: Request): Express.User {
  const raw = req.cookies?.[DEV_ROLE_COOKIE];
  const role = isBypassRole(raw) ? raw : DEFAULT_BYPASS_ROLE;
  return BYPASS_USERS[role];
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  if (AUTH_BYPASS) {
    req.user = resolveBypassUser(req);
    next();
    return;
  }

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  // Rehydrate the app-managed role from the DB on every request. The role
  // stored in the session (`sessions.sess.user.role`) is a snapshot taken at
  // login and would otherwise go stale — an admin changing a user's role must
  // take effect on that user's NEXT request, not only after they re-login.
  // This is especially important for revocation/demotion, where stale
  // privileged access must not persist.
  let role = refreshed.user.role;
  try {
    const [row] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, refreshed.user.id))
      .limit(1);
    role = row ? row.role : null;
  } catch {
    // On a lookup failure keep the session role rather than locking the user
    // out over a transient DB error.
  }

  req.user = { ...refreshed.user, role };
  next();
}
