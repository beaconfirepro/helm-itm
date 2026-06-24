import { Router, type IRouter } from "express";
import { db, usersTable, userRoleEnum } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSession, getSession } from "../lib/session";
import { requireAdmin } from "../lib/admin";

const router: IRouter = Router();

// Every endpoint here is admin-only: it manages who can access the app and
// what role they hold. requireSession runs first (401 when no session), then
// requireAdmin (403 when the user is not an admin).
router.use(requireSession, requireAdmin);

const VALID_ROLES = userRoleEnum.enumValues;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_COLUMNS = {
  id: usersTable.id,
  email: usersTable.email,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  profileImageUrl: usersTable.profileImageUrl,
  role: usersTable.role,
  lastLoginAt: usersTable.lastLoginAt,
  createdAt: usersTable.createdAt,
} as const;

/**
 * GET /users
 * Lists every user who has logged in (or been provisioned), with their current
 * role and last login. Ordered by most-recent login first so active members
 * surface at the top.
 */
router.get("/users", async (_req, res) => {
  const rows = await db.select(USER_COLUMNS).from(usersTable);

  // Most-recently active first; users who have never logged in sort last.
  rows.sort((a, b) => {
    const at = a.lastLoginAt ? a.lastLoginAt.getTime() : 0;
    const bt = b.lastLoginAt ? b.lastLoginAt.getTime() : 0;
    return bt - at;
  });

  res.json({ users: rows });
});

/**
 * POST /users
 *
 * Invites a teammate by email and (optionally) assigns their role up front.
 * Replit Auth creates accounts on first login, so this stores a pending record
 * keyed by email. When that person signs in, the login flow adopts the real
 * identity onto this record and keeps the role the admin assigned here.
 */
router.post("/users", async (req, res) => {
  const { email, role } = (req.body ?? {}) as { email?: unknown; role?: unknown };

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  if (role !== null && role !== undefined && !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    res.status(400).json({
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")} (or omitted for no access yet).`,
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "A user with that email already exists." });
    return;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      role: (role ?? null) as (typeof VALID_ROLES)[number] | null,
    })
    .returning(USER_COLUMNS);

  res.status(201).json({ user: created });
});

/**
 * PATCH /api/users/:id/role
 *
 * Sets (or clears) a user's app-managed role. The change is reflected on the
 * user's next request because the role is read from the DB onto req.user.
 *
 * Guardrails:
 *   - `role` must be one of the known roles, or `null` to revoke access.
 *   - An admin cannot change their own role (prevents accidental self-lockout).
 */
router.patch("/users/:id/role", async (req, res) => {
  const id = req.params["id"] as string;
  const { role } = req.body as { role?: unknown };

  if (role !== null && !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    res.status(400).json({
      error: `role must be one of: ${VALID_ROLES.join(", ")}, or null to revoke access`,
    });
    return;
  }

  const { userId } = getSession(req);
  const nextRole = role as (typeof VALID_ROLES)[number] | null;

  // Guard against an admin removing their own admin access and locking
  // everyone out of this screen.
  if (id === userId && nextRole !== "admin") {
    res.status(400).json({
      error:
        "You cannot change your own role away from admin — ask another admin to do it.",
    });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role: nextRole, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning(USER_COLUMNS);

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ user: updated });
});

export default router;
