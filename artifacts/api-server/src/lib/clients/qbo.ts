/**
 * QboSyncClient — syncs QuickBooks Online invoices into invoice_links.
 *
 * When QBO credentials are set: refreshes the OAuth2 access token, queries
 * invoices via the QBO REST API v3, upserts into invoice_links, and returns
 * the count synced.
 *
 * When not configured: logs a warning and skips sync. Callers should continue
 * reading from the existing link-table cache (populated by seed in dev).
 *
 * Environment variables required:
 *   QBO_CLIENT_ID       — OAuth2 client ID from Intuit Developer Portal
 *   QBO_CLIENT_SECRET   — OAuth2 client secret
 *   QBO_REFRESH_TOKEN   — Long-lived refresh token from initial OAuth flow
 *   QBO_REALM_ID        — Company ID (realmId) from QBO URL
 *   QBO_ENVIRONMENT     — "production" | "sandbox" (default: "sandbox")
 */

import { db } from "@workspace/db";
import { invoiceLinksTable, lienProjectsTable } from "@workspace/db";
import { eq, and, or, lt, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

const INTUIT_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function qboApiBase(env: string): string {
  return env === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company";
}

export interface SyncResult {
  synced: number;
  skipped: boolean;
  reason?: string;
}

interface QboCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
  environment: string;
}

function loadCredentials(): QboCredentials | null {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const refreshToken = process.env.QBO_REFRESH_TOKEN;
  const realmId = process.env.QBO_REALM_ID;
  if (!clientId || !clientSecret || !refreshToken || !realmId) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    realmId,
    environment: process.env.QBO_ENVIRONMENT ?? "sandbox",
  };
}

async function refreshAccessToken(creds: QboCredentials): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const resp = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`QBO token refresh failed ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

export class QboSyncClient {
  isConfigured(): boolean {
    return loadCredentials() !== null;
  }

  /**
   * Sync QBO invoices for a project into invoice_links.
   *
   * Queries invoices where CustomerRef matches the project's hubspotProjectId
   * (assuming QBO customer name includes the HS project ID as a reference).
   * Upserts on qboInvoiceId matching within the org, stamping lastSyncedAt.
   */
  async syncInvoicesForProject(params: {
    orgId: string;
    lienProjectId: string;
    hubspotProjectId: string;
    linkedClientId?: string | null;
  }): Promise<SyncResult> {
    const creds = loadCredentials();
    if (!creds) {
      // PRETEST_REQUIRED: Configure QBO_* credentials to test live invoice sync.
      console.warn(
        `[QboSyncClient] QBO credentials not configured — ` +
          `skipping sync for project ${params.lienProjectId}. ` +
          `Using cached invoice_links data.`,
      );
      return { synced: 0, skipped: true, reason: "QBO credentials not set" };
    }

    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(creds);
    } catch (err) {
      console.error("[QboSyncClient] Token refresh failed:", err);
      return { synced: 0, skipped: true, reason: String(err) };
    }

    try {
      const synced = await this.syncOneProject(accessToken, creds, params);
      return { synced, skipped: false };
    } catch (err) {
      console.error("[QboSyncClient] Invoice query failed:", err);
      return { synced: 0, skipped: true, reason: String(err) };
    }
  }

  /**
   * Refresh all stale AR invoices for an org directly from QBO.
   *
   * Finds uncleared, non-supplier invoices whose lastSyncedAt is null or older
   * than the threshold, groups them by owning project, refreshes the OAuth2
   * token once, and re-queries QBO per project. Returns the number of invoices
   * synced. When credentials are not configured this is a no-op skip — callers
   * should keep serving cached data rather than faking freshness.
   */
  async syncStaleInvoicesForOrg(params: {
    orgId: string;
    staleThresholdMs?: number;
  }): Promise<{ synced: number; skipped: boolean; reason?: string; projectsSynced: number }> {
    const creds = loadCredentials();
    if (!creds) {
      return { synced: 0, skipped: true, reason: "QBO credentials not set", projectsSynced: 0 };
    }

    const { orgId } = params;
    const thresholdMs = params.staleThresholdMs ?? 24 * 60 * 60 * 1000;
    const staleBefore = new Date(Date.now() - thresholdMs);

    // Stale AR invoices joined to their owning project (PrivateNote query key)
    const staleRows = await db
      .select({
        lienProjectId: invoiceLinksTable.lienProjectId,
        linkedClientId: invoiceLinksTable.linkedClientId,
        hubspotProjectId: lienProjectsTable.hubspotProjectId,
      })
      .from(invoiceLinksTable)
      .innerJoin(
        lienProjectsTable,
        eq(invoiceLinksTable.lienProjectId, lienProjectsTable.id),
      )
      .where(
        and(
          eq(invoiceLinksTable.orgId, orgId),
          eq(lienProjectsTable.orgId, orgId),
          eq(invoiceLinksTable.clearedFlag, false),
          eq(invoiceLinksTable.isSupplierInvoice, false),
          or(
            isNull(invoiceLinksTable.lastSyncedAt),
            lt(invoiceLinksTable.lastSyncedAt, staleBefore),
          ),
        ),
      );

    if (staleRows.length === 0) {
      return { synced: 0, skipped: false, projectsSynced: 0 };
    }

    // De-dupe by project so each project is queried at most once.
    const projectMap = new Map<
      string,
      { hubspotProjectId: string; linkedClientId: string | null }
    >();
    for (const row of staleRows) {
      if (!row.lienProjectId) continue;
      if (!projectMap.has(row.lienProjectId)) {
        projectMap.set(row.lienProjectId, {
          hubspotProjectId: row.hubspotProjectId,
          linkedClientId: row.linkedClientId ?? null,
        });
      }
    }

    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(creds);
    } catch (err) {
      console.error("[QboSyncClient] Token refresh failed:", err);
      return { synced: 0, skipped: true, reason: String(err), projectsSynced: 0 };
    }

    let synced = 0;
    let projectsSynced = 0;
    for (const [lienProjectId, info] of projectMap) {
      try {
        synced += await this.syncOneProject(accessToken, creds, {
          orgId,
          lienProjectId,
          hubspotProjectId: info.hubspotProjectId,
          linkedClientId: info.linkedClientId,
        });
        projectsSynced++;
      } catch (err) {
        console.error(
          `[QboSyncClient] Sync failed for project ${lienProjectId}:`,
          err,
        );
      }
    }

    return { synced, skipped: false, projectsSynced };
  }

  /**
   * Query QBO for one project's invoices and upsert them into invoice_links.
   * Assumes a valid access token; throws on query failure so callers can decide
   * how to handle it (skip the whole sync vs. continue with other projects).
   */
  private async syncOneProject(
    accessToken: string,
    creds: QboCredentials,
    params: {
      orgId: string;
      lienProjectId: string;
      hubspotProjectId: string;
      linkedClientId?: string | null;
    },
  ): Promise<number> {
    const { orgId, lienProjectId, hubspotProjectId, linkedClientId } = params;
    const now = new Date();

    // QBO Query API — fetch invoices by memo/custom field matching hubspotProjectId
    const query = encodeURIComponent(
      `SELECT * FROM Invoice WHERE PrivateNote LIKE '%${hubspotProjectId}%' MAXRESULTS 200`,
    );
    const baseUrl = qboApiBase(creds.environment);

    const resp = await fetch(
      `${baseUrl}/${creds.realmId}/query?query=${query}&minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`QBO API ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = (await resp.json()) as QboQueryResponse;
    const invoices = data.QueryResponse?.Invoice ?? [];

    let synced = 0;
    for (const inv of invoices) {
      const qboInvoiceId = inv.Id;
      const isSupplier = false; // Customer invoices from QBO; supplier bills are queried separately
      const invoiceDate = inv.TxnDate ? new Date(inv.TxnDate) : new Date();
      const dueDate = inv.DueDate ? new Date(inv.DueDate) : invoiceDate;
      const amount = String(inv.TotalAmt ?? "0");
      const qboStatus = inv.Balance === 0 ? "paid" : "open";

      // Upsert: match on (orgId + qboInvoiceId)
      const existing = await db
        .select({ id: invoiceLinksTable.id, clearedFlag: invoiceLinksTable.clearedFlag })
        .from(invoiceLinksTable)
        .where(
          and(
            eq(invoiceLinksTable.orgId, orgId),
            eq(invoiceLinksTable.qboInvoiceId, qboInvoiceId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Never overwrite coordinator-cleared flag from QBO sync
        await db
          .update(invoiceLinksTable)
          .set({ amount, qboStatus, dueDate, invoiceDate, lastSyncedAt: now, updatedAt: now })
          .where(eq(invoiceLinksTable.id, existing[0].id));
      } else {
        await db.insert(invoiceLinksTable).values({
          id: randomUUID(),
          orgId,
          lienProjectId,
          linkedClientId: linkedClientId ?? null,
          qboInvoiceId,
          isSupplierInvoice: isSupplier,
          amount,
          invoiceDate,
          dueDate,
          qboStatus,
          clearedFlag: false,
          lastSyncedAt: now,
        });
      }
      synced++;
    }

    return synced;
  }
}

// QBO API response shapes (relevant fields only)
interface QboApiInvoice {
  Id: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
}
interface QboQueryResponse {
  QueryResponse?: { Invoice?: QboApiInvoice[] };
}

export const qboSyncClient = new QboSyncClient();
