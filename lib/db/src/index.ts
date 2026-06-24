import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const usingSupabase = !!process.env.SUPABASE_DATABASE_URL;
const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string set. Provide SUPABASE_DATABASE_URL (preferred) or DATABASE_URL.",
  );
}

export const pool = new Pool({
  connectionString,
  ...(usingSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
