/**
 * ConnecteamSyncClient — syncs Connecteam time-clock records into timesheet_links.
 *
 * When CONNECTEAM_API_KEY is set: calls the Connecteam v1 API, upserts records
 * into timesheet_links with lastSyncedAt, and returns the count synced.
 *
 * When not configured: logs a warning and skips sync. Callers should continue
 * reading from the existing link-table cache (populated by seed in dev).
 *
 * Environment variables required:
 *   CONNECTEAM_API_KEY  — Connecteam API key from Settings › Integrations
 */

import { db } from "@workspace/db";
import { timesheetLinksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const CONNECTEAM_BASE = "https://api.connecteam.com/v1";

// Mapping from Connecteam stage tag → LienStream workStream
function stageTagToWorkStream(tag: string): "construction" | "design" | null {
  const lower = tag.toLowerCase();
  if (/install|rough|trim|const|build|plumb|elec|mech|fire/.test(lower)) return "construction";
  if (/design|eng|plan|draw|arch/.test(lower)) return "design";
  return null; // unknown — skip record
}

export interface SyncResult {
  synced: number;
  skipped: boolean;
  reason?: string;
}

export interface ConnecteamUser {
  connecteamUserId: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export class ConnecteamSyncClient {
  private readonly apiKey: string | null;

  constructor() {
    this.apiKey = process.env.CONNECTEAM_API_KEY ?? null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Fetch all users (team members) from Connecteam and return a map of
   * connecteamUserId → displayName. Returns an empty map when the API is
   * not configured or the call fails (graceful degradation).
   */
  async fetchUsers(): Promise<Map<string, string>> {
    if (!this.apiKey) {
      return new Map();
    }

    try {
      const resp = await fetch(`${CONNECTEAM_BASE}/users`, {
        headers: { "x-api-key": this.apiKey, "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.warn(`[ConnecteamSyncClient] fetchUsers API ${resp.status}: ${body.slice(0, 200)}`);
        return new Map();
      }
      const data = (await resp.json()) as ConnecteamUsersApiResponse;
      const users = data.data ?? data.users ?? [];
      const map = new Map<string, string>();
      for (const u of users) {
        const userId = String(u.id ?? u.user_id ?? "");
        if (!userId) continue;
        const first = u.first_name ?? u.firstName ?? "";
        const last = u.last_name ?? u.lastName ?? "";
        const display = `${first} ${last}`.trim() || userId;
        map.set(userId, display);
      }
      return map;
    } catch (err) {
      console.warn(`[ConnecteamSyncClient] fetchUsers failed:`, err);
      return new Map();
    }
  }

  /**
   * Sync Connecteam time-clock records for a project into timesheet_links.
   *
   * Connecteam time records are filtered by job tag matching the
   * hubspotProjectId. Records are upserted on (orgId, connecteamTimeRecordId)
   * and lastSyncedAt is stamped on every touched row.
   */
  async syncTimesheetsForProject(params: {
    orgId: string;
    lienProjectId: string;
    hubspotProjectId: string;
    from?: Date;
    to?: Date;
  }): Promise<SyncResult> {
    if (!this.apiKey) {
      // PRETEST_REQUIRED: Configure CONNECTEAM_API_KEY to test live timesheet sync.
      console.warn(
        `[ConnecteamSyncClient] CONNECTEAM_API_KEY not configured — ` +
          `skipping sync for project ${params.lienProjectId}. ` +
          `Using cached timesheet_links data.`,
      );
      return { synced: 0, skipped: true, reason: "CONNECTEAM_API_KEY not set" };
    }

    const { orgId, lienProjectId, hubspotProjectId, from, to } = params;
    const now = new Date();

    // Fetch user display names upfront so we can embed them into each row
    const userMap = await this.fetchUsers();

    // Build query params for the Connecteam time-clock records endpoint
    const qs = new URLSearchParams({ job_id: hubspotProjectId, limit: "200" });
    if (from) qs.set("from", from.toISOString().slice(0, 10));
    if (to) qs.set("to", to.toISOString().slice(0, 10));

    let records: ConnecteamTimeRecord[];
    try {
      const resp = await fetch(`${CONNECTEAM_BASE}/time-clock/records?${qs}`, {
        headers: { "x-api-key": this.apiKey, "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Connecteam API ${resp.status}: ${body.slice(0, 200)}`);
      }
      const data = (await resp.json()) as ConnecteamApiResponse;
      records = data.data ?? [];
    } catch (err) {
      console.error(`[ConnecteamSyncClient] API call failed:`, err);
      return { synced: 0, skipped: true, reason: String(err) };
    }

    let synced = 0;
    for (const record of records) {
      const workStream = stageTagToWorkStream(record.tag ?? "");
      if (!workStream) continue; // skip unrecognised tags

      const workDate = new Date(record.clock_in ?? record.date ?? new Date().toISOString());
      const userId = String(record.user_id ?? "");
      const displayName = userMap.get(userId) ?? null;

      // Check for existing record by unique key (orgId, connecteamTimeRecordId)
      const existing = await db
        .select({ id: timesheetLinksTable.id })
        .from(timesheetLinksTable)
        .where(
          and(
            eq(timesheetLinksTable.orgId, orgId),
            eq(timesheetLinksTable.connecteamTimeRecordId, String(record.id)),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(timesheetLinksTable)
          .set({
            hours: String(record.total_hours ?? record.hours ?? 0),
            workDate,
            stageTag: record.tag ?? "",
            workStream,
            displayName,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(timesheetLinksTable.id, existing[0].id));
      } else {
        await db.insert(timesheetLinksTable).values({
          id: randomUUID(),
          orgId,
          lienProjectId,
          connecteamUserId: userId,
          connecteamTimeRecordId: String(record.id),
          displayName,
          stageTag: record.tag ?? "",
          workStream,
          hours: String(record.total_hours ?? record.hours ?? 0),
          workDate,
          lastSyncedAt: now,
        });
      }
      synced++;
    }

    return { synced, skipped: false };
  }
}

// Connecteam API response shape (relevant fields only)
interface ConnecteamTimeRecord {
  id: string | number;
  user_id?: string | number;
  tag?: string;
  date?: string;
  clock_in?: string;
  total_hours?: number;
  hours?: number;
}
interface ConnecteamApiResponse {
  data?: ConnecteamTimeRecord[];
}

interface ConnecteamUserRecord {
  id?: string | number;
  user_id?: string | number;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
}
interface ConnecteamUsersApiResponse {
  data?: ConnecteamUserRecord[];
  users?: ConnecteamUserRecord[];
}

export const connecteamSyncClient = new ConnecteamSyncClient();
