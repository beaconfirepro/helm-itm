/**
 * FilingWorkspace — the per-stream filing execution UI, extracted from the old
 * standalone /filing/:streamId page so it can live inside the merged Project
 * workspace "Filing" tab. Takes a `streamId` prop instead of reading the route.
 *
 * Steps:
 *  1. Compliance Check (POST /filing/:streamId/escalate)
 *  2. Affidavit Package (POST /filing/:streamId/affidavit)
 *  3. Export to Texas Easy Lien (POST /filing/:id/export)
 *  4. Record with County (POST /filing/:id/record)
 *  5. Post-Notice Mailing (POST /filing/:id/post-notice)
 *  6. Release (POST /filing/:id/release)
 */

import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { QueueList } from "@/components/ui/queue-list";
import {
  AlertTriangle,
  CheckCircle2,
  Scale,
  Send,
  Download,
  Plus,
  FileText,
} from "lucide-react";
import { alpha, money } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type FilingStatus =
  | "not_filed"
  | "compliance_check"
  | "affidavit_draft"
  | "exported"
  | "filed"
  | "post_filing_notice_sent";

type ReleaseStatus = "not_required" | "requested" | "generated" | "signed" | "filed";

interface ScheduleOfValues {
  id: string;
  workStream: "construction" | "design";
  status: string;
  openedAt: string;
  lienProjectId: string;
}

interface LienProject {
  id: string;
  cachedProjectName: string | null;
  county: string | null;
  legalPropertyAddress: string | null;
  lienWorkflowType: string;
}

interface WorkMonth {
  id: string;
  month: string;
  derivedOverdue: boolean;
  clearedFlag: boolean;
}

interface Notice {
  id: string;
  noticeType: string;
  status: string;
  claimAmount: string;
  sentAt: string | null;
}

interface LienFiling {
  id: string;
  status: FilingStatus;
  county: string | null;
  filingDate: string | null;
  recordingRef: string | null;
  filingFee: string | null;
  affidavitDocUrl: string | null;
  postFilingNoticeDeadline: string | null;
  enforcementDeadline: string | null;
}

interface LienRelease {
  id: string;
  status: ReleaseStatus;
  requestedAt: string | null;
  signedDate: string | null;
  filingConfirmation: string | null;
}

interface ComplianceGap {
  workMonthId: string;
  month: string;
  deadlineDate: string;
  issue: string;
  noticeSentAt: string | null;
}

interface ExposureRow {
  streamId: string;
  lienProjectId: string;
  projectName: string;
  workStream: string;
  streamStatus: string;
  overdueMonths: number;
  grossExposure: number;
  waivedAmount: number;
  netExposure: number;
}

const EMPTY_EXPOSURE: ExposureRow[] = [];

// ── API helpers ────────────────────────────────────────────────────────────

function apiFetch<T>(path: string): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include" }).then((r) => r.json());
}

function apiPost(path: string, body?: unknown) {
  return fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

// ── Helpers ────────────────────────────────────────────────────────────────

const FILING_STATUS_ORDER: FilingStatus[] = [
  "not_filed",
  "compliance_check",
  "affidavit_draft",
  "exported",
  "filed",
  "post_filing_notice_sent",
];

function filingStatusStep(status: FilingStatus): number {
  return FILING_STATUS_ORDER.indexOf(status);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(d: string | null | undefined): string {
  if (!d) return "—";
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} days past`;
  if (diff === 0) return "today";
  return `${diff} day${diff !== 1 ? "s" : ""} remaining`;
}

// Post-filing deadline status — drives color-coded badges in the right panel.
type DeadlineState = "upcoming" | "due_soon" | "overdue" | "satisfied";

const DEADLINE_META: Record<DeadlineState, { label: string; tone: string }> = {
  satisfied: { label: "Done", tone: "#14eba3" },
  overdue: { label: "Overdue", tone: "#eb143f" },
  due_soon: { label: "Due soon", tone: "#f59e0b" },
  upcoming: { label: "On track", tone: "#14eba3" },
};

const DUE_SOON_DAYS = 7;

function deadlineState(date: string | null | undefined, satisfied: boolean): DeadlineState {
  if (satisfied) return "satisfied";
  if (!date) return "upcoming";
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StepBadge({
  n,
  done,
  accent,
}: {
  n: number;
  done: boolean;
  accent: string;
}) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-bold"
      style={{ color: done ? "#0b0e13" : accent, background: done ? "#14eba3" : alpha(accent, 0.15) }}
    >
      {done ? "✓" : n}
    </span>
  );
}

function SectionCard({
  children,
  accent = "var(--helm-border)",
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--surface)", borderColor: accent }}
    >
      {children}
    </div>
  );
}

function FieldGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value }) => (
        <div key={label}>
          <div
            className="text-[10.5px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-dim)" }}
          >
            {label}
          </div>
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-base)" }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FilingWorkspace({ streamId }: { streamId: string }) {
  const qc = useQueryClient();

  const [county, setCounty] = useState("");
  const [filingDate, setFilingDate] = useState("");
  const [recordingRef, setRecordingRef] = useState("");
  const [filingFee, setFilingFee] = useState("");
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>("requested");
  const [releaseSignedDate, setReleaseSignedDate] = useState("");
  const [releaseConfirmation, setReleaseConfirmation] = useState("");
  const [complianceResult, setComplianceResult] = useState<{
    ok: boolean;
    gaps: ComplianceGap[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["filing-stream", streamId],
    queryFn: () =>
      apiFetch<{
        sov: ScheduleOfValues;
        project: LienProject | null;
        filing: LienFiling | null;
        release: LienRelease | null;
        workMonths: WorkMonth[];
        notices: Notice[];
      }>(`/filing/stream/${streamId}`),
    enabled: !!streamId,
  });

  const { data: exposureData } = useQuery({
    queryKey: ["filing-exposure"],
    queryFn: () => apiFetch<{ exposure: ExposureRow[] }>("/waivers/exposure"),
    staleTime: 30_000,
  });

  const escalate = useMutation({
    mutationFn: () => apiPost(`/filing/${streamId}/escalate`),
    onSuccess: (result) => {
      setComplianceResult(result);
      qc.invalidateQueries({ queryKey: ["filing-stream", streamId] });
    },
  });

  const affidavit = useMutation({
    mutationFn: () => apiPost(`/filing/${streamId}/affidavit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filing-stream", streamId] }),
  });

  const exportTEL = useMutation({
    mutationFn: () => {
      if (!data?.filing) throw new Error("No filing record");
      return apiPost(`/filing/${data.filing.id}/export`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filing-stream", streamId] }),
  });

  const record = useMutation({
    mutationFn: () => {
      if (!data?.filing) throw new Error("No filing record");
      return apiPost(`/filing/${data.filing.id}/record`, {
        county,
        filingDate,
        recordingRef,
        filingFee: filingFee ? parseFloat(filingFee) : undefined,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filing-stream", streamId] }),
  });

  const postNotice = useMutation({
    mutationFn: () => {
      if (!data?.filing) throw new Error("No filing record");
      return apiPost(`/filing/${data.filing.id}/post-notice`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filing-stream", streamId] }),
  });

  const release = useMutation({
    mutationFn: () => {
      if (!data?.filing) throw new Error("No filing record");
      return apiPost(`/filing/${data.filing.id}/release`, {
        status: releaseStatus,
        signedDate: releaseSignedDate || undefined,
        filingConfirmation: releaseConfirmation || undefined,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filing-stream", streamId] }),
  });

  const filing = data?.filing ?? null;
  const currentRelease = data?.release ?? null;

  // Pre-fill form from existing filing record
  useEffect(() => {
    if (filing) {
      if (filing.county && !county) setCounty(filing.county);
      if (filing.filingDate && !filingDate) setFilingDate(filing.filingDate.slice(0, 10));
      if (filing.recordingRef && !recordingRef) setRecordingRef(filing.recordingRef);
      if (filing.filingFee && !filingFee) setFilingFee(filing.filingFee);
    }
  }, [filing?.id]); // eslint-disable-line

  // Right panel with post-filing deadlines — derived from live filing + release data.
  const filingRecorded = !!(filing?.postFilingNoticeDeadline || filing?.enforcementDeadline);

  const postFilingObligations: Array<{
    key: string;
    title: string;
    date: string | null;
    satisfied: boolean;
    satisfiedSub: string;
    pendingSub?: string;
  }> = filingRecorded
    ? [
        {
          key: "pf-notice",
          title: "Send filed copies to owner + GC",
          date: filing?.postFilingNoticeDeadline ?? null,
          satisfied: filing?.status === "post_filing_notice_sent",
          satisfiedSub: "Filed copies sent (§ 53.055)",
        },
        {
          key: "pf-enforce",
          title: "Suit to foreclose (enforcement)",
          date: filing?.enforcementDeadline ?? null,
          satisfied: false,
          satisfiedSub: "Enforced (§ 53.158)",
        },
        {
          key: "pf-release",
          title: "Release lien after payoff",
          date: null,
          satisfied: !!currentRelease,
          satisfiedSub: currentRelease?.signedDate
            ? `Released ${fmtDate(currentRelease.signedDate)}`
            : `Release ${currentRelease?.status ?? "recorded"}`,
          pendingSub: "Due once the balance is paid (§ 53.152)",
        },
      ]
    : [];

  const postFilingItems = postFilingObligations.map((o) => {
    const state = deadlineState(o.date, o.satisfied);
    const meta = DEADLINE_META[state];
    let sub: string;
    if (o.satisfied) {
      sub = o.satisfiedSub;
    } else if (o.date) {
      sub = `${fmtDate(o.date)} · ${daysUntil(o.date)}`;
    } else {
      sub = o.pendingSub ?? "Pending";
    }
    return { id: o.key, title: o.title, sub, badge: meta.label, badgeTone: meta.tone };
  });

  const outstandingCount = postFilingObligations.filter((o) => !o.satisfied).length;

  useRightPanel(
    <Panel
      title="Post-Filing Deadlines"
      accent="#eb143f"
      count={filingRecorded ? outstandingCount : undefined}
    >
      {filingRecorded ? (
        <QueueList items={postFilingItems} />
      ) : (
        <div
          className="px-4 py-6 text-[11.5px] leading-relaxed"
          style={{ color: "var(--text-muted-color)" }}
        >
          No post-filing deadlines yet. Record the filing with the county to generate the
          § 53.055 notice-to-owner and § 53.158 enforcement deadlines.
        </div>
      )}
    </Panel>,
    [
      filingRecorded,
      filing?.status,
      filing?.postFilingNoticeDeadline,
      filing?.enforcementDeadline,
      currentRelease?.id,
      currentRelease?.status,
      currentRelease?.signedDate,
    ],
  );

  const compliance = exposureData?.exposure ?? EMPTY_EXPOSURE;

  useLeftPanel(
    <Panel title="New Filing" accent="#f59e0b">
      <div className="flex flex-col gap-2 p-3">
        <button
          onClick={() => escalate.mutate()}
          disabled={escalate.isPending}
          className="flex items-center gap-2 rounded-md px-3 py-2.5 text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "#f59e0b", color: "#1a1205" }}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          {escalate.isPending ? "Checking…" : "New filing"}
        </button>
        <button
          onClick={() => affidavit.mutate()}
          disabled={affidavit.isPending}
          className="flex items-center gap-2 rounded-md border px-3 py-2.5 text-[12.5px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          {affidavit.isPending ? "Generating…" : "New affidavit"}
        </button>

        <div
          className="px-1 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--text-muted-color)" }}
        >
          Upcoming Compliance
        </div>

        {compliance.length > 0 ? (
          compliance.map((row) => {
            const dot = row.overdueMonths > 0 ? "#eb143f" : row.netExposure > 0 ? "#f59e0b" : "#14eba3";
            const sub =
              row.overdueMonths > 0
                ? `${row.overdueMonths} overdue month${row.overdueMonths !== 1 ? "s" : ""}`
                : row.netExposure > 0
                ? `Net exposure ${money(row.netExposure)}`
                : "On track";
            return (
              <Link
                key={row.streamId}
                href={`/filing/${row.streamId}`}
              >
                <div
                  className="cursor-pointer rounded-md border px-3 py-2 transition-colors"
                  style={{
                    background: row.streamId === streamId ? "var(--surface-3)" : "var(--surface-2)",
                    borderColor: row.streamId === streamId ? "var(--helm-accent)" : "var(--helm-border)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
                    <span className="min-w-0 truncate text-[12px] font-semibold" style={{ color: "var(--text-base)" }}>
                      {row.projectName}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-3.5 text-[11px]" style={{ color: "var(--text-muted-color)" }}>
                    {sub}
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="px-1 py-2 text-[11px]" style={{ color: "var(--text-muted-color)" }}>
            No compliance gaps flagged.
          </div>
        )}

        <div className="px-1 pt-1 text-[10.5px] leading-snug" style={{ color: "var(--text-muted-color)" }}>
          Start a filing or affidavit; compliance gaps flagged above.
        </div>
      </div>
    </Panel>,
    [compliance, streamId, escalate.isPending, affidavit.isPending],
  );

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-24 text-[13px]"
        style={{ color: "var(--text-dim)" }}
      >
        Loading filing workspace…
      </div>
    );
  }

  if (!data?.sov) {
    return (
      <div
        className="flex items-center justify-center py-24 text-[13px]"
        style={{ color: "var(--text-dim)" }}
      >
        Stream not found.
      </div>
    );
  }

  const { sov, workMonths, notices } = data;
  const overdueMonths = workMonths.filter((wm) => wm.derivedOverdue && !wm.clearedFlag);
  const filingStep = filing ? filingStatusStep(filing.status) : -1;
  const totalClaim = notices
    .filter((n) => n.status === "sent" || n.status === "delivered")
    .reduce((s, n) => s + Number(n.claimAmount), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Stats strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Overdue months", value: overdueMonths.length.toString() },
          { label: "Total claim", value: totalClaim > 0 ? money(totalClaim) : "—" },
          { label: "Stream opened", value: fmtDate(sov.openedAt) },
          {
            label: "Filing status",
            value: (filing?.status ?? "not filed").replace(/_/g, " "),
          },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-0.5 rounded-lg border p-3"
            style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
          >
            <div
              className="text-[10.5px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-dim)" }}
            >
              {s.label}
            </div>
            <div className="text-[16px] font-bold" style={{ color: "var(--text-base)" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Step 1: Compliance Check ──────────────────────────────────── */}
      <SectionCard
        accent={
          complianceResult
            ? complianceResult.ok
              ? alpha("#14eba3", 0.5)
              : alpha("#eb143f", 0.5)
            : "var(--helm-border)"
        }
      >
        <div className="flex items-start gap-3">
          <StepBadge n={1} done={filingStep >= 1} accent="#f59e0b" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                Compliance Check
              </div>
              <button
                onClick={() => escalate.mutate()}
                disabled={escalate.isPending}
                className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
                style={{ background: alpha("#f59e0b", 0.15), color: "#f59e0b" }}
              >
                {escalate.isPending ? "Checking…" : "Run Check"}
              </button>
            </div>
            <div className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-dim)" }}>
              Verify every monthly notice was sent on time before generating the affidavit.
            </div>

            {complianceResult && (
              <div className="mt-3">
                {complianceResult.ok ? (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: "#14eba3" }}>
                    <CheckCircle2 className="h-4 w-4" />
                    All notices sent on time — ready to proceed.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div
                      className="flex items-center gap-2 text-[12px] font-semibold"
                      style={{ color: "#eb143f" }}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {complianceResult.gaps.length} gap
                      {complianceResult.gaps.length !== 1 ? "s" : ""} detected
                    </div>
                    {complianceResult.gaps.map((g, i) => (
                      <div
                        key={i}
                        className="rounded-md border px-3 py-2 text-[12px]"
                        style={{
                          background: alpha("#eb143f", 0.06),
                          borderColor: alpha("#eb143f", 0.25),
                          color: "var(--text-dim)",
                        }}
                      >
                        <span
                          className="font-semibold"
                          style={{ color: "var(--text-base)" }}
                        >
                          {g.month}
                        </span>{" "}
                        — {g.issue}{" "}
                        <span style={{ color: "#eb143f" }}>Deadline: {g.deadlineDate}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Step 2: Affidavit Package ────────────────────────────────── */}
      <SectionCard accent={filingStep >= 2 ? alpha("#3b82f6", 0.5) : "var(--helm-border)"}>
        <div className="flex items-start gap-3">
          <StepBadge n={2} done={filingStep >= 2} accent="#3b82f6" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                Affidavit of Lien (§ 53.054)
              </div>
              <div className="flex items-center gap-2">
                {filing?.id && (
                  <a
                    href={`/api/filing/${filing.id}/affidavit`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: alpha("#3b82f6", 0.12), color: "#3b82f6" }}
                  >
                    <Download className="mr-1 inline h-3 w-3" />
                    PDF
                  </a>
                )}
                <button
                  onClick={() => affidavit.mutate()}
                  disabled={affidavit.isPending || filingStep >= 2}
                  className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: alpha("#3b82f6", 0.15), color: "#3b82f6" }}
                >
                  {affidavit.isPending
                    ? "Generating…"
                    : filingStep >= 2
                    ? "Generated ✓"
                    : "Generate"}
                </button>
              </div>
            </div>
            <div className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-dim)" }}>
              Consolidate {overdueMonths.length} overdue work month
              {overdueMonths.length !== 1 ? "s" : ""} into a § 53.054 sworn affidavit. Parties
              and property auto-filled from project data.
            </div>
            {overdueMonths.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {overdueMonths.map((wm) => (
                  <span
                    key={wm.id}
                    className="rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold"
                    style={{ background: alpha("#3b82f6", 0.1), color: "#3b82f6" }}
                  >
                    {new Date(wm.month).toISOString().slice(0, 7)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Step 3: Export to Texas Easy Lien ─────────────────────────── */}
      <SectionCard accent={filingStep >= 3 ? alpha("#8b5cf6", 0.5) : "var(--helm-border)"}>
        <div className="flex items-start gap-3">
          <StepBadge n={3} done={filingStep >= 3} accent="#8b5cf6" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                Export to Texas Easy Lien
              </div>
              <button
                onClick={() => exportTEL.mutate()}
                disabled={exportTEL.isPending || filingStep !== 2}
                className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
                style={{ background: alpha("#8b5cf6", 0.15), color: "#8b5cf6" }}
              >
                {exportTEL.isPending
                  ? "Exporting…"
                  : filingStep >= 3
                  ? "Exported ✓"
                  : "Export"}
              </button>
            </div>
            <div className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-dim)" }}>
              Hand off the affidavit package to Texas Easy Lien for county recording.
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Step 4: Record with County ────────────────────────────────── */}
      <SectionCard accent={filingStep >= 4 ? alpha("#14eba3", 0.5) : "var(--helm-border)"}>
        <div className="flex items-start gap-3">
          <StepBadge n={4} done={filingStep >= 4} accent="#14eba3" />
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
              Record with County
            </div>
            <div
              className="mt-1 mb-3 text-[12px] leading-snug"
              style={{ color: "var(--text-dim)" }}
            >
              Enter recording details. Immediately computes the 5-business-day post-notice deadline
              (§ 53.055) and 1-year enforcement window (§ 53.158).
            </div>

            {filingStep >= 4 ? (
              <>
                <FieldGrid
                  items={[
                    { label: "County", value: filing?.county ?? "—" },
                    { label: "Filing date", value: fmtDate(filing?.filingDate) },
                    { label: "Recording ref", value: filing?.recordingRef ?? "—" },
                    {
                      label: "Filing fee",
                      value: filing?.filingFee ? `$${filing.filingFee}` : "—",
                    },
                  ]}
                />
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    {
                      label: "Post-notice deadline (§ 53.055)",
                      date: filing?.postFilingNoticeDeadline,
                      accent: "#f59e0b",
                      Icon: Send,
                    },
                    {
                      label: "Enforcement window (§ 53.158)",
                      date: filing?.enforcementDeadline,
                      accent: "#eb143f",
                      Icon: Scale,
                    },
                  ].map(({ label, date, accent, Icon }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                      style={{
                        background: alpha(accent, 0.07),
                        borderColor: alpha(accent, 0.25),
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
                      <div>
                        <div
                          className="text-[11.5px] font-semibold"
                          style={{ color: accent }}
                        >
                          {label}
                        </div>
                        <div className="text-[12px]" style={{ color: "var(--text-base)" }}>
                          {fmtDate(date)}{" "}
                          <span style={{ color: "var(--text-dim)" }}>· {daysUntil(date)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "County *",
                    value: county,
                    set: setCounty,
                    placeholder: "e.g. Dallas",
                    type: "text",
                  },
                  {
                    label: "Filing date *",
                    value: filingDate,
                    set: setFilingDate,
                    placeholder: "",
                    type: "date",
                  },
                  {
                    label: "Recording reference *",
                    value: recordingRef,
                    set: setRecordingRef,
                    placeholder: "e.g. 2026-DAL-00123",
                    type: "text",
                  },
                  {
                    label: "Filing fee",
                    value: filingFee,
                    set: setFilingFee,
                    placeholder: "95.00",
                    type: "number",
                  },
                ].map(({ label, value, set, placeholder, type }) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {label}
                    </span>
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      placeholder={placeholder}
                      className="rounded-md border px-3 py-2 text-[13px] outline-none"
                      style={{
                        background: "var(--surface-raised)",
                        borderColor: "var(--helm-border)",
                        color: "var(--text-base)",
                      }}
                    />
                  </label>
                ))}
                <div className="flex justify-end sm:col-span-2">
                  <button
                    onClick={() => record.mutate()}
                    disabled={
                      record.isPending ||
                      filingStep >= 4 ||
                      !county.trim() ||
                      !filingDate ||
                      !recordingRef.trim()
                    }
                    className="rounded-md px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
                    style={{ background: "#14eba3", color: "#0b0e13" }}
                  >
                    {record.isPending ? "Recording…" : "Record Filing"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Step 5: Send Filed Copies ─────────────────────────────────── */}
      <SectionCard accent={filingStep >= 5 ? alpha("#14eba3", 0.4) : "var(--helm-border)"}>
        <div className="flex items-start gap-3">
          <StepBadge n={5} done={filingStep >= 5} accent="#f59e0b" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                Send Filed Copies (§ 53.055)
              </div>
              <button
                onClick={() => postNotice.mutate()}
                disabled={postNotice.isPending || filingStep !== 4}
                className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
                style={{ background: alpha("#f59e0b", 0.15), color: "#f59e0b" }}
              >
                {postNotice.isPending
                  ? "Mailing…"
                  : filingStep >= 5
                  ? "Sent ✓"
                  : "Send Certified Mail"}
              </button>
            </div>
            <div className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-dim)" }}>
              Certified copies of the filed affidavit to owner + GC within 5 business days.
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Step 6: Release (§ 53.152) ───────────────────────────────── */}
      <SectionCard
        accent={currentRelease ? alpha("#14eba3", 0.4) : "var(--helm-border)"}
      >
        <div className="flex items-start gap-3">
          <StepBadge
            n={6}
            done={currentRelease?.status === "filed" || currentRelease?.status === "signed"}
            accent="#14eba3"
          />
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
              Lien Release (§ 53.152)
            </div>
            <div
              className="mt-1 mb-3 text-[12px] leading-snug"
              style={{ color: "var(--text-dim)" }}
            >
              Generate and log a release once the underlying claim is satisfied. 10-day window
              after demand.
            </div>

            {currentRelease ? (
              <FieldGrid
                items={[
                  {
                    label: "Status",
                    value: currentRelease.status.replace(/_/g, " "),
                  },
                  { label: "Signed", value: fmtDate(currentRelease.signedDate) },
                  {
                    label: "Confirmation",
                    value: currentRelease.filingConfirmation ?? "—",
                  },
                  {
                    label: "Requested",
                    value: fmtDate(currentRelease.requestedAt),
                  },
                ]}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Release status
                  </span>
                  <select
                    value={releaseStatus}
                    onChange={(e) => setReleaseStatus(e.target.value as ReleaseStatus)}
                    className="rounded-md border px-3 py-2 text-[13px] outline-none"
                    style={{
                      background: "var(--surface-raised)",
                      borderColor: "var(--helm-border)",
                      color: "var(--text-base)",
                    }}
                  >
                    <option value="requested">Requested</option>
                    <option value="generated">Generated</option>
                    <option value="signed">Signed</option>
                    <option value="filed">Filed (stream → released)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Signed date
                  </span>
                  <input
                    type="date"
                    value={releaseSignedDate}
                    onChange={(e) => setReleaseSignedDate(e.target.value)}
                    className="rounded-md border px-3 py-2 text-[13px] outline-none"
                    style={{
                      background: "var(--surface-raised)",
                      borderColor: "var(--helm-border)",
                      color: "var(--text-base)",
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Filing confirmation number
                  </span>
                  <input
                    value={releaseConfirmation}
                    onChange={(e) => setReleaseConfirmation(e.target.value)}
                    placeholder="e.g. 2026-DAL-00188"
                    className="rounded-md border px-3 py-2 text-[13px] outline-none"
                    style={{
                      background: "var(--surface-raised)",
                      borderColor: "var(--helm-border)",
                      color: "var(--text-base)",
                    }}
                  />
                </label>
                <div className="flex justify-end sm:col-span-2">
                  <button
                    onClick={() => release.mutate()}
                    disabled={release.isPending || filingStep < 4}
                    className="rounded-md px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
                    style={{ background: alpha("#14eba3", 0.18), color: "#14eba3" }}
                  >
                    {release.isPending ? "Saving…" : "Record Release"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
