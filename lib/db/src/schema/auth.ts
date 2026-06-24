import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// App-managed roles. These are NOT part of the Replit identity — they are set
// directly in the database and loaded alongside the Replit profile.
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "pm",
  "finance",
  "coordinator",
]);

// User-facing theme preference. "system" follows the OS color scheme.
export const userThemeEnum = pgEnum("user_theme", ["light", "dark", "system"]);

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // App-specific role (nullable). Assigned by admins via the Team page, or
  // directly in the DB.
  role: userRoleEnum("role"),
  // ── Per-user, editable profile & preferences ──────────────────────────────
  // `displayName` is a user-chosen name kept SEPARATE from the Replit-synced
  // first/last name so the login upsert never overwrites it.
  displayName: varchar("display_name"),
  // `avatarUrl` is a user-uploaded photo (object-storage path) kept SEPARATE
  // from the Replit-synced `profileImageUrl`; the app prefers it when present.
  avatarUrl: varchar("avatar_url"),
  theme: userThemeEnum("theme").notNull().default("system"),
  language: varchar("language").notNull().default("en"),
  currency: varchar("currency").notNull().default("USD"),
  // Updated on every successful login so admins can see who is active.
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserTheme = (typeof userThemeEnum.enumValues)[number];
