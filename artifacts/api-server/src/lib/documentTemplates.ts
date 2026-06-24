/**
 * documentTemplates.ts — shared contract + merge engine for client-facing
 * document customization (Company Settings → Document Templates).
 *
 * A "document template" lets an admin customize the branding, intro, closing,
 * signature, and footer regions of a client-facing document. The statutory body
 * text is LOCKED in code (see `lockedBody` per schema) and is never editable — it
 * is only resolved with real data at render time.
 *
 * Region content is stored as PLAIN TEXT with `{{fieldKey}}` merge tokens and
 * newlines. The web editor renders those tokens as chips; the PDF generators and
 * the live preview both resolve them through {@link renderTokens}.
 *
 * A null saved-region falls back to the hard-coded default below, so an org with
 * no saved template renders exactly as it did before this module existed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentCategory = "notice" | "waiver" | "affidavit";

export type RegionKey =
  | "branding"
  | "intro"
  | "closing"
  | "signature"
  | "footer";

export const REGION_ORDER: RegionKey[] = [
  "branding",
  "intro",
  "closing",
  "signature",
  "footer",
];

export const REGION_META: Record<
  RegionKey,
  { label: string; description: string }
> = {
  branding: {
    label: "Header",
    description: "Optional header rendered at the very top of the document.",
  },
  intro: {
    label: "Intro",
    description: "Optional paragraph(s) shown before the statutory body.",
  },
  closing: {
    label: "Closing",
    description: "Optional paragraph(s) shown after the statutory body.",
  },
  signature: {
    label: "Signature Block",
    description: "The signature / execution block.",
  },
  footer: {
    label: "Footer",
    description: "Footer disclaimer shown at the bottom of the document.",
  },
};

export type RegionContent = Partial<Record<RegionKey, string | null>>;

export interface DocumentSchema {
  type: string;
  category: DocumentCategory;
  label: string;
  /** Statute reference shown in the locked header. */
  statuteRef: string;
  /** Read-only statutory body (resolved with merge tokens at render time). */
  lockedBody: string;
  /** Merge fields offered to the editor for this document type. */
  fields: MergeFieldKey[];
  /** Hard-coded region defaults — must reproduce the current PDF copy. */
  defaults: Record<RegionKey, string>;
}

// ---------------------------------------------------------------------------
// Merge field catalog
// ---------------------------------------------------------------------------

export type MergeFieldKey =
  | "claimantName"
  | "projectName"
  | "propertyAddress"
  | "county"
  | "claimAmount"
  | "monthListed"
  | "deadlineDate"
  | "ownerName"
  | "ownerAddress"
  | "gcName"
  | "gcAddress"
  | "paymentAmount"
  | "workStream"
  | "throughDate"
  | "filingDate"
  | "recordingRef"
  | "todayDate";

export const FIELD_CATALOG: Record<MergeFieldKey, { label: string }> = {
  claimantName: { label: "Claimant Name" },
  projectName: { label: "Project Name" },
  propertyAddress: { label: "Property Address" },
  county: { label: "County" },
  claimAmount: { label: "Claim Amount" },
  monthListed: { label: "Month Listed" },
  deadlineDate: { label: "Deadline Date" },
  ownerName: { label: "Owner Name" },
  ownerAddress: { label: "Owner Address" },
  gcName: { label: "GC Name" },
  gcAddress: { label: "GC Address" },
  paymentAmount: { label: "Payment Amount" },
  workStream: { label: "Work Stream" },
  throughDate: { label: "Through Date" },
  filingDate: { label: "Filing Date" },
  recordingRef: { label: "Recording Reference" },
  todayDate: { label: "Today's Date" },
};

/** Default claimant identity — matches the current hard-coded PDF copy. */
export const DEFAULT_CLAIMANT_NAME = "Beacon Fire Protection";

// ---------------------------------------------------------------------------
// Region defaults
// ---------------------------------------------------------------------------

const NOTICE_FIELDS: MergeFieldKey[] = [
  "claimantName",
  "projectName",
  "propertyAddress",
  "county",
  "claimAmount",
  "monthListed",
  "deadlineDate",
  "ownerName",
  "ownerAddress",
  "gcName",
  "gcAddress",
  "todayDate",
];

const WAIVER_FIELDS: MergeFieldKey[] = [
  "claimantName",
  "projectName",
  "propertyAddress",
  "county",
  "paymentAmount",
  "workStream",
  "throughDate",
  "todayDate",
];

const AFFIDAVIT_FIELDS: MergeFieldKey[] = [
  "claimantName",
  "projectName",
  "propertyAddress",
  "county",
  "claimAmount",
  "filingDate",
  "recordingRef",
  "todayDate",
];

const NOTICE_DEFAULTS: Record<RegionKey, string> = {
  branding: "",
  intro: "",
  closing: "",
  signature:
    "Date: {{todayDate}}\n\nBy: ___________________________________\nAuthorized Representative, {{claimantName}}",
  footer:
    "This notice is prepared pursuant to Texas Property Code Chapter 53. This document is not legal advice. Consult a licensed attorney before taking action based on this notice.",
};

const WAIVER_DEFAULTS: Record<RegionKey, string> = {
  branding: "",
  intro: "",
  closing: "",
  signature:
    "Date: {{todayDate}}\n\nSigned: ___________________________________\nAuthorized Representative, {{claimantName}}",
  footer:
    "This waiver is prepared pursuant to Texas Property Code § 53.284. This document is not legal advice. Consult a licensed attorney before signing.",
};

const AFFIDAVIT_DEFAULTS: Record<RegionKey, string> = {
  branding: "",
  intro: "",
  closing: "",
  signature:
    "Signature: _________________________________    Date: _______________\nNotary Public: _____________________________    My commission expires: _______________",
  footer: "",
};

// ---------------------------------------------------------------------------
// Locked statutory bodies (resolved with merge tokens at render time)
// ---------------------------------------------------------------------------

const NOTICE_BODY_EARLY_WARNING =
  `TO THE ABOVE NAMED OWNER AND ORIGINAL CONTRACTOR: This is a courtesy notice from ` +
  `{{claimantName}} ("Claimant") to advise you that Claimant has furnished ` +
  `labor and/or materials for improvements to the above-described property in the amount of ` +
  `{{claimAmount}} for work performed in {{monthListed}}. ` +
  `This notice is provided as a professional courtesy prior to the statutory notice deadline. ` +
  `Payment within ten (10) days will avoid the issuance of a formal statutory notice.`;

const NOTICE_BODY_STATUTORY =
  `TO THE ABOVE NAMED OWNER AND ORIGINAL CONTRACTOR: This is to notify you that {{claimantName}} ` +
  `("Claimant"), subcontractor, has provided labor and materials for fire-protection work ` +
  `at the above-described property. The unpaid balance for work performed in {{monthListed}} ` +
  `is {{claimAmount}}. Pursuant to Texas Property Code § 53.056, you are hereby notified ` +
  `that if payment of said amount is not made, the property described above may be subject ` +
  `to a mechanic's and materialman's lien. ` +
  `If you have paid the original contractor in full, you may have a defense to this claim.`;

const NOTICE_BODY_RETAINAGE =
  `TO THE ABOVE NAMED OWNER AND ORIGINAL CONTRACTOR: This is to notify you that {{claimantName}} ` +
  `("Claimant") has furnished labor and/or materials for the construction, ` +
  `alteration, or repair of the above-described property and claims a lien on the property ` +
  `for unpaid RETAINAGE in the amount of {{claimAmount}} for work performed through {{monthListed}}. ` +
  `Pursuant to Texas Property Code § 53.057, you are hereby notified that if said amount ` +
  `is not paid, the Claimant intends to perfect and enforce a lien claim against the property.`;

function waiverBody(
  subsection: string,
  description: string,
  unconditional: boolean,
): string {
  return (
    `${description} The undersigned, {{claimantName}} ("Claimant"), having furnished ` +
    `labor and/or materials (fire protection — {{workStream}} work) for the improvement of the real property described above, ` +
    `hereby releases and waives all lien rights against said property and all claims against the owner and ` +
    `original contractor arising out of the above-described payment, pursuant to Texas Property Code ${subsection}. ` +
    (unconditional
      ? "This waiver is UNCONDITIONAL and effective immediately upon execution."
      : "This waiver is CONDITIONAL and becomes effective only upon actual receipt and clearance of the payment stated above.")
  );
}

const AFFIDAVIT_BODY =
  "STATE OF TEXAS  §\n" +
  "COUNTY OF ________________  §\n\n" +
  "Before me, the undersigned authority, personally appeared the affiant, " +
  "who, being by me duly sworn, deposed as stated herein.";

// ---------------------------------------------------------------------------
// Schema registry
// ---------------------------------------------------------------------------

export const DOCUMENT_SCHEMAS: Record<string, DocumentSchema> = {
  early_warning: {
    type: "early_warning",
    category: "notice",
    label: "Early Warning Notice (Courtesy)",
    statuteRef: "§ 53.056",
    lockedBody: NOTICE_BODY_EARLY_WARNING,
    fields: NOTICE_FIELDS,
    defaults: NOTICE_DEFAULTS,
  },
  statutory_claim: {
    type: "statutory_claim",
    category: "notice",
    label: "Statutory Notice of Claim",
    statuteRef: "§ 53.056",
    lockedBody: NOTICE_BODY_STATUTORY,
    fields: NOTICE_FIELDS,
    defaults: NOTICE_DEFAULTS,
  },
  retainage_claim: {
    type: "retainage_claim",
    category: "notice",
    label: "Notice of Claim for Unpaid Retainage",
    statuteRef: "§ 53.057",
    lockedBody: NOTICE_BODY_RETAINAGE,
    fields: NOTICE_FIELDS,
    defaults: NOTICE_DEFAULTS,
  },
  conditional_progress: {
    type: "conditional_progress",
    category: "waiver",
    label: "Conditional Waiver on Progress Payment",
    statuteRef: "§ 53.284(b)",
    lockedBody: waiverBody(
      "§ 53.284(b)",
      "This waiver is conditional upon receipt of the progress payment described below.",
      false,
    ),
    fields: WAIVER_FIELDS,
    defaults: WAIVER_DEFAULTS,
  },
  unconditional_progress: {
    type: "unconditional_progress",
    category: "waiver",
    label: "Unconditional Waiver on Progress Payment",
    statuteRef: "§ 53.284(c)",
    lockedBody: waiverBody(
      "§ 53.284(c)",
      "Payment for the progress payment described below has been received; this waiver is unconditional.",
      true,
    ),
    fields: WAIVER_FIELDS,
    defaults: WAIVER_DEFAULTS,
  },
  conditional_final: {
    type: "conditional_final",
    category: "waiver",
    label: "Conditional Waiver on Final Payment",
    statuteRef: "§ 53.284(d)",
    lockedBody: waiverBody(
      "§ 53.284(d)",
      "This waiver is conditional upon receipt of the final payment described below.",
      false,
    ),
    fields: WAIVER_FIELDS,
    defaults: WAIVER_DEFAULTS,
  },
  unconditional_final: {
    type: "unconditional_final",
    category: "waiver",
    label: "Unconditional Waiver on Final Payment",
    statuteRef: "§ 53.284(e)",
    lockedBody: waiverBody(
      "§ 53.284(e)",
      "Final payment described below has been received; this waiver is unconditional.",
      true,
    ),
    fields: WAIVER_FIELDS,
    defaults: WAIVER_DEFAULTS,
  },
  lien_affidavit: {
    type: "lien_affidavit",
    category: "affidavit",
    label: "Affidavit of Mechanic's Lien",
    statuteRef: "§ 53.054",
    lockedBody: AFFIDAVIT_BODY,
    fields: AFFIDAVIT_FIELDS,
    defaults: AFFIDAVIT_DEFAULTS,
  },
};

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_SCHEMAS);

export function getSchema(type: string): DocumentSchema | undefined {
  return DOCUMENT_SCHEMAS[type];
}

// ---------------------------------------------------------------------------
// Merge engine
// ---------------------------------------------------------------------------

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Resolve `{{fieldKey}}` tokens in `content` against `data`. */
export function renderTokens(
  content: string,
  data: Partial<Record<string, string>>,
): string {
  return content.replace(TOKEN_RE, (_m, key: string) => data[key] ?? "");
}

/** Extract every `{{token}}` key referenced in `content`. */
export function extractTokens(content: string): string[] {
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Validate that every merge token used across the saved regions is part of the
 * document type's allowed field set. Returns the sorted list of unknown tokens
 * (empty when valid).
 */
export function findInvalidTokens(
  type: string,
  regions: RegionContent,
): string[] {
  const schema = DOCUMENT_SCHEMAS[type];
  if (!schema) return [];
  const allowed = new Set<string>(schema.fields);
  const invalid = new Set<string>();
  for (const key of REGION_ORDER) {
    const value = regions[key];
    if (typeof value === "string") {
      for (const token of extractTokens(value)) {
        if (!allowed.has(token)) invalid.add(token);
      }
    }
  }
  return [...invalid].sort();
}

export interface ResolvedDocument {
  branding: string;
  intro: string;
  closing: string;
  signature: string;
  footer: string;
  lockedBody: string;
}

/**
 * Resolve all five regions plus the locked body for a document type, applying
 * saved overrides where present and falling back to defaults otherwise.
 */
export function resolveDocument(
  type: string,
  saved: RegionContent | null,
  data: Partial<Record<string, string>>,
): ResolvedDocument {
  const schema = DOCUMENT_SCHEMAS[type];
  if (!schema) {
    throw new Error(`Unknown document type: ${type}`);
  }

  const pick = (key: RegionKey): string => {
    const override = saved?.[key];
    const raw = override == null ? schema.defaults[key] : override;
    return renderTokens(raw, data);
  };

  return {
    branding: pick("branding"),
    intro: pick("intro"),
    closing: pick("closing"),
    signature: pick("signature"),
    footer: pick("footer"),
    lockedBody: renderTokens(schema.lockedBody, data),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared by routes + preview)
// ---------------------------------------------------------------------------

export function formatCurrency(amount: number | string): string {
  return Number(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatMonthYear(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatLongDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Sample data (live preview)
// ---------------------------------------------------------------------------

/**
 * Representative sample values for every merge field, used by the live preview
 * when no real record is selected. `overrides` lets the preview endpoint splice
 * in real project data (name/address/county) on top of the sample baseline.
 */
export function sampleData(
  overrides: Partial<Record<MergeFieldKey, string>> = {},
): Record<MergeFieldKey, string> {
  return {
    claimantName: DEFAULT_CLAIMANT_NAME,
    projectName: "Riverside Medical Center — Phase II",
    propertyAddress: "4400 Riverside Pkwy, Austin, TX 78744",
    county: "Travis",
    claimAmount: "$48,250.00",
    monthListed: "March 2026",
    deadlineDate: "June 15, 2026",
    ownerName: "Riverside Health Holdings, LLC",
    ownerAddress: "100 Congress Ave, Suite 1200, Austin, TX 78701",
    gcName: "Lone Star General Contractors, Inc.",
    gcAddress: "850 Commerce St, Austin, TX 78702",
    paymentAmount: "$48,250.00",
    workStream: "construction",
    throughDate: "March 31, 2026",
    filingDate: "April 10, 2026",
    recordingRef: "2026-00481923",
    todayDate: formatLongDate(new Date()),
    ...overrides,
  };
}

/** Validate a saved region map: only known region keys, string|null values. */
export function sanitizeRegionContent(input: unknown): RegionContent {
  const out: RegionContent = {};
  if (input && typeof input === "object") {
    for (const key of REGION_ORDER) {
      const value = (input as Record<string, unknown>)[key];
      if (value === null) {
        out[key] = null;
      } else if (typeof value === "string") {
        out[key] = value;
      }
    }
  }
  return out;
}
