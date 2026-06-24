import { db, usersTable } from "@workspace/db";
import type { User, UserRole } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * The shape returned by the auth/profile endpoints. Mirrors the `AuthUser`
 * schema in the OpenAPI spec — including the per-user preferences and the
 * *effective* avatar (the uploaded photo when present, otherwise the
 * Replit-synced profile image).
 */
export interface AuthUserResponse {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole | null;
  displayName: string | null;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
  theme: "light" | "dark" | "system";
  language: string;
  currency: string;
}

/**
 * Build the API response for a user row, resolving the effective avatar.
 *
 * The DB stores the uploaded photo as a normalized object path
 * (`/objects/uploads/<id>`); the servable URL is that path mounted under the
 * storage route (`/api/storage/objects/uploads/<id>`). When no upload exists we
 * fall back to the Replit-synced profile image.
 */
export function buildAuthUserResponse(row: User): AuthUserResponse {
  const hasCustomAvatar = !!row.avatarUrl;
  const avatarUrl = hasCustomAvatar
    ? `/api/storage${row.avatarUrl}`
    : row.profileImageUrl;
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    profileImageUrl: row.profileImageUrl,
    role: row.role,
    displayName: row.displayName,
    avatarUrl,
    hasCustomAvatar,
    theme: row.theme,
    language: row.language,
    currency: row.currency,
  };
}

/**
 * Ensure a `users` row exists for the authenticated identity and return it.
 *
 * Real users are upserted during the OIDC login callback, but the dev
 * AUTH_BYPASS identity (and any other session-only identity) may not have a row
 * yet. Creating one lazily lets preferences persist for every authenticated
 * caller.
 */
export async function ensureUserRow(u: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}): Promise<User> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, u.id));
  if (existing) return existing;

  await db
    .insert(usersTable)
    .values({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      profileImageUrl: u.profileImageUrl,
    })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, u.id));
  return row;
}
