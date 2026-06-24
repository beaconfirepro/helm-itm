/**
 * shippo.ts — Certified mail abstraction.
 *
 * In production: calls Shippo REST API to create a USPS certified-mail label.
 * In dev / no key: returns a deterministic stub so the full mailing flow can be
 * exercised without a real Shippo account.
 */

export interface ShippoLabel {
  trackingNumber: string;
  labelUrl: string;
}

export interface ShippoAddress {
  name: string;
  street1: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export async function createCertifiedMailLabel(
  recipientAddress: ShippoAddress,
  referenceId: string,
): Promise<ShippoLabel> {
  const apiKey = process.env.SHIPPO_API_KEY;

  if (apiKey) {
    // Real Shippo call — USPS certified mail (service token: usps_certified_mail).
    const body = {
      shipment: {
        address_from: {
          name: "Beacon Fire Protection",
          street1: "1000 Industrial Blvd",
          city: "Austin",
          state: "TX",
          zip: "78744",
          country: "US",
        },
        address_to: {
          name: recipientAddress.name,
          street1: recipientAddress.street1,
          city: recipientAddress.city ?? "Austin",
          state: recipientAddress.state ?? "TX",
          zip: recipientAddress.zip ?? "78701",
          country: recipientAddress.country ?? "US",
        },
        parcels: [{ length: "9", width: "6", height: "0.5", distance_unit: "in", weight: "0.5", mass_unit: "oz" }],
      },
      carrier_account: "USPS",
      servicelevel_token: "usps_certified_mail",
      metadata: referenceId,
      async: false,
    };

    const resp = await fetch("https://api.goshippo.com/transactions", {
      method: "POST",
      headers: { "Authorization": `ShippoToken ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Shippo API error ${resp.status}: ${err}`);
    }

    const data = await resp.json() as { tracking_number: string; label_url: string; status: string; messages?: {text:string}[] };

    if (data.status !== "SUCCESS") {
      const msg = data.messages?.[0]?.text ?? "Label creation failed";
      throw new Error(`Shippo label error: ${msg}`);
    }

    return { trackingNumber: data.tracking_number, labelUrl: data.label_url };
  }

  // PRETEST_REQUIRED: Configure SHIPPO_API_KEY to validate real certified-mail behavior.
  // Stub — deterministic fake tracking number derived from referenceId.
  const stub = `9400100000000${Buffer.from(referenceId).toString("hex").slice(0, 9).toUpperCase()}`;
  return {
    trackingNumber: stub,
    labelUrl: `https://shippo-delivery-live.s3.amazonaws.com/stub-${referenceId.slice(0, 8)}.pdf`,
  };
}
