import { defineConfig } from "drizzle-kit";
import path from "path";

const usingSupabase = !!process.env.SUPABASE_DATABASE_URL;
const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string set. Provide SUPABASE_DATABASE_URL (preferred) or DATABASE_URL.",
  );
}

export default defineConfig({
  schema: "./src/schema",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ...(usingSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});
