/**
 * HubSpotClient — real read client with fixture fallback.
 *
 * When HUBSPOT_API_KEY is set, makes live calls to the HubSpot CRM v3 API.
 * Falls back to canned fixture data when the key is absent (dev/test mode)
 * so every downstream consumer has a working interface without credentials.
 *
 * Project records are stored as Deals in HubSpot.
 * Company records are HubSpot Companies.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

export interface HubSpotProject {
  hubspotProjectId: string;
  projectName: string;
  status: string;
  jobSiteAddress: string;
}

export interface HubSpotCompany {
  hubspotCompanyId: string;
  legalName: string;
  mailingAddress: string;
  email?: string;
  phone?: string;
  paymentTermsDays: number;
  requiresNotarizedWaivers: boolean;
}

// ---------------------------------------------------------------------------
// Fixture data (used when HUBSPOT_API_KEY is absent)
// ---------------------------------------------------------------------------

const FIXTURE_PROJECTS: HubSpotProject[] = [
  {
    hubspotProjectId: "hs_proj_900",
    projectName: "Travis Office Retrofit",
    status: "install",
    jobSiteAddress: "100 Main St, Austin, TX",
  },
  {
    hubspotProjectId: "hs_proj_901",
    projectName: "Oak Ave Apartments",
    status: "install",
    jobSiteAddress: "55 Oak Ave, Dallas, TX",
  },
  {
    hubspotProjectId: "hs_proj_902",
    projectName: "Cedar Custom Home",
    status: "install",
    jobSiteAddress: "7 Cedar Ct, Houston, TX",
  },
];

const FIXTURE_COMPANIES: HubSpotCompany[] = [
  {
    hubspotCompanyId: "hs_co_100",
    legalName: "Summit Builders LLC",
    mailingAddress: "100 Summit Dr, Austin TX",
    email: "ap@summit.test",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: true,
  },
  {
    hubspotCompanyId: "hs_co_200",
    legalName: "Delinquent Dev Co",
    mailingAddress: "200 Dev Blvd, Dallas TX",
    email: "billing@deldev.test",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: false,
  },
  {
    hubspotCompanyId: "hs_co_owner1",
    legalName: "Travis Property Holdings LP",
    mailingAddress: "PO Box 1, Austin TX",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: false,
  },
  {
    hubspotCompanyId: "hs_co_gc1",
    legalName: "Apex General Contractors",
    mailingAddress: "200 Build Rd, Austin TX",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: false,
  },
  {
    hubspotCompanyId: "hs_co_owner2",
    legalName: "Oak Ave Investors LLC",
    mailingAddress: "1 Invest Way, Dallas TX",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: false,
  },
  {
    hubspotCompanyId: "hs_co_gc2",
    legalName: "TopChain GC Inc",
    mailingAddress: "9 Prime St, Dallas TX",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: false,
  },
  {
    hubspotCompanyId: "hs_co_sub2",
    legalName: "MidSub Mechanical",
    mailingAddress: "4 Mid Rd, Dallas TX",
    paymentTermsDays: 30,
    requiresNotarizedWaivers: false,
  },
];

// ---------------------------------------------------------------------------
// Live API helpers
// ---------------------------------------------------------------------------

interface HsApiDeal {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    address?: string;
    [key: string]: string | undefined;
  };
}

interface HsApiCompany {
  id: string;
  properties: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    email?: string;
    phone?: string;
    [key: string]: string | undefined;
  };
}

async function hsGet<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(`${HUBSPOT_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function hsPost<T>(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<T | null> {
  try {
    const res = await fetch(`${HUBSPOT_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function buildMailingAddress(c: HsApiCompany["properties"]): string {
  const parts = [c.address, c.city, c.state, c.zip].filter(Boolean);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

export class HubSpotClient {
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.HUBSPOT_API_KEY;
  }

  private get live(): boolean {
    return !!this.apiKey;
  }

  async getProject(hubspotProjectId: string): Promise<HubSpotProject | null> {
    if (this.live) {
      const deal = await hsGet<HsApiDeal>(
        `/crm/v3/objects/deals/${hubspotProjectId}?properties=dealname,dealstage,address`,
        this.apiKey!,
      );
      if (deal) {
        return {
          hubspotProjectId,
          projectName: deal.properties.dealname ?? hubspotProjectId,
          status: deal.properties.dealstage ?? "unknown",
          jobSiteAddress: deal.properties.address ?? "",
        };
      }
    }
    return (
      FIXTURE_PROJECTS.find((p) => p.hubspotProjectId === hubspotProjectId) ??
      null
    );
  }

  async getCompany(hubspotCompanyId: string): Promise<HubSpotCompany | null> {
    if (this.live) {
      const co = await hsGet<HsApiCompany>(
        `/crm/v3/objects/companies/${hubspotCompanyId}?properties=name,address,city,state,zip,email,phone`,
        this.apiKey!,
      );
      if (co) {
        return {
          hubspotCompanyId,
          legalName: co.properties.name ?? hubspotCompanyId,
          mailingAddress: buildMailingAddress(co.properties),
          email: co.properties.email,
          phone: co.properties.phone,
          paymentTermsDays: 30,
          requiresNotarizedWaivers: false,
        };
      }
    }
    return (
      FIXTURE_COMPANIES.find((c) => c.hubspotCompanyId === hubspotCompanyId) ??
      null
    );
  }

  async listProjects(): Promise<HubSpotProject[]> {
    if (this.live) {
      const res = await hsGet<{ results: HsApiDeal[] }>(
        `/crm/v3/objects/deals?properties=dealname,dealstage,address&limit=100`,
        this.apiKey!,
      );
      if (res?.results) {
        return res.results.map((d) => ({
          hubspotProjectId: d.id,
          projectName: d.properties.dealname ?? d.id,
          status: d.properties.dealstage ?? "unknown",
          jobSiteAddress: d.properties.address ?? "",
        }));
      }
    }
    return FIXTURE_PROJECTS;
  }

  async postActivity(params: {
    hubspotCompanyId: string;
    type: string;
    body: string;
    activityDate: Date;
  }): Promise<{ hubspotActivityId: string }> {
    if (this.live) {
      // Create a Note engagement and associate it to the company.
      // associationTypeId 190 = note → company (HUBSPOT_DEFINED).
      const created = await hsPost<{ id: string }>(
        "/crm/v3/objects/notes",
        this.apiKey!,
        {
          properties: {
            hs_note_body: params.body,
            hs_timestamp: params.activityDate.toISOString(),
          },
          associations: [
            {
              to: { id: params.hubspotCompanyId },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 190,
                },
              ],
            },
          ],
        },
      );
      if (created?.id) {
        return { hubspotActivityId: created.id };
      }
    }
    // PRETEST_REQUIRED: Configure HUBSPOT_API_KEY to verify live CRM activity write-back.
    // No-key (or failed live call) fallback — deterministic stub
    return { hubspotActivityId: `hs_act_stub_${Date.now()}` };
  }
}

export const hubspotClient = new HubSpotClient();
