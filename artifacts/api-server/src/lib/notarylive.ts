/**
 * notarylive.ts — NotaryLive Remote Online Notarization (RON) client.
 *
 * Talks to the real NotaryLive v3 API:
 *   - POST /api/v3/order/create  → starts a notarization order, returns the
 *                                  signer link (`link_to_order`).
 *   - POST /api/v3/order/status  → polls an order by our `internal_id`; returns
 *                                  the live status and any notarized document URLs.
 *
 * Authentication is HTTP Basic (api_user:api_key). When NOTARYLIVE_API_USER /
 * NOTARYLIVE_API_KEY are not set we fall back to NotaryLive's public sandbox
 * credentials, which are documented to work without signup for development.
 * Set both env vars to switch to a production NotaryLive account.
 *
 * NotaryLive v3 has no webhook — completion is discovered by polling
 * order/status (status === "notarized"), not by a callback.
 */

const NOTARYLIVE_BASE_URL = "https://notarylive.com/api/v3";

// Public sandbox credentials (per NotaryLive docs — safe for dev, no signup).
const SANDBOX_API_USER = "api_test_user";
const SANDBOX_API_KEY = "api_test_key";

export interface NotarySession {
  /** Our internal order id — used to poll status later. Stored as notaryLiveRef. */
  sessionRef: string;
  /** URL the signer visits to complete the remote online notarization. */
  signingUrl: string;
}

export interface CreateNotarySessionParams {
  /** Unique reference we control; NotaryLive echoes it back for status lookups. */
  internalId: string;
  signerFirstName: string;
  signerLastName: string;
  signerEmail: string;
  /** Optional pre-uploaded government ID reference (from POST /api/v3/id/upload). */
  preuploadId?: string;
}

export interface NotaryOrderStatus {
  /** Raw NotaryLive status string, e.g. "paid", "notarized". */
  status: string;
  /** Convenience flag — true once the order reaches the notarized state. */
  notarized: boolean;
  /** Notarized document download URLs (present once notarized). */
  documentUrls: string[];
}

function getCredentials(): { apiUser: string; apiKey: string; isSandbox: boolean } {
  const apiUser = process.env.NOTARYLIVE_API_USER;
  const apiKey = process.env.NOTARYLIVE_API_KEY;
  if (apiUser && apiKey) {
    return { apiUser, apiKey, isSandbox: false };
  }
  return { apiUser: SANDBOX_API_USER, apiKey: SANDBOX_API_KEY, isSandbox: true };
}

function basicAuthHeader(apiUser: string, apiKey: string): string {
  return "Basic " + Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
}

/** True when the integration is running against a real (non-sandbox) account. */
export function isNotaryLiveConfigured(): boolean {
  return !getCredentials().isSandbox;
}

/**
 * Create a NotaryLive notarization order for a single signer. Works for any
 * document/subject — the waiver flow is one specific caller.
 */
export async function createNotarySession(
  params: CreateNotarySessionParams,
): Promise<NotarySession> {
  const { apiUser, apiKey } = getCredentials();

  const participant: Record<string, unknown> = {
    first_name: params.signerFirstName,
    last_name: params.signerLastName,
    email: params.signerEmail,
    type: "signer",
  };
  if (params.preuploadId) participant["preupload_id"] = params.preuploadId;

  const resp = await fetch(`${NOTARYLIVE_BASE_URL}/order/create`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiUser, apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      internal_id: params.internalId,
      participants: [participant],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`NotaryLive order/create error ${resp.status}: ${err}`);
  }

  const data = (await resp.json()) as {
    success?: number;
    link_to_order?: string;
    errors?: unknown;
  };

  if (data.success !== 1 || !data.link_to_order) {
    throw new Error(
      `NotaryLive order/create failed: ${JSON.stringify(data.errors ?? data)}`,
    );
  }

  return { sessionRef: params.internalId, signingUrl: data.link_to_order };
}

/**
 * Poll the status of a previously created order by our internal reference.
 */
export async function getNotaryOrderStatus(
  orderRef: string,
): Promise<NotaryOrderStatus> {
  const { apiUser, apiKey } = getCredentials();

  const resp = await fetch(`${NOTARYLIVE_BASE_URL}/order/status`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiUser, apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: orderRef }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`NotaryLive order/status error ${resp.status}: ${err}`);
  }

  const data = (await resp.json()) as {
    success?: number;
    status?: string;
    document_urls?: string[];
  };

  if (data.success !== 1) {
    throw new Error(`NotaryLive order/status failed: ${JSON.stringify(data)}`);
  }

  const status = data.status ?? "unknown";
  return {
    status,
    notarized: status === "notarized",
    documentUrls: data.document_urls ?? [],
  };
}
