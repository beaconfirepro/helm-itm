import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { QueueList } from "@/components/ui/queue-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApprovalGateBanner } from "@/components/ui/approval-gate-banner";
import { ListTableState } from "@/components/ui/list-page";
import { money } from "@/lib/utils";
import { Check, FileText, Landmark, ShieldAlert, Plus, X, RefreshCw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type WaiverApprovalStatus =
  | "not_required"
  | "pending_pm"
  | "pending_pm_finance"
  | "approved"
  | "rejected";

type WaiverType =
  | "conditional_progress"
  | "unconditional_progress"
  | "conditional_final"
  | "unconditional_final";

interface Waiver {
  id: string;
  lienProjectId: string;
  workStream: "construction" | "design";
  waiverType: WaiverType;
  paymentAmount: string;
  approvalStatus: WaiverApprovalStatus;
  pmApprovedAt: string | null;
  financeApprovedAt: string | null;
  notarized: boolean;
  notaryLiveRef: string | null;
  signedDate: string | null;
  invoiceLinkId: string | null;
  generatedDocUrl: string | null;
  createdAt: string;
  project: { id: string; cachedProjectName: string | null; lienWorkflowType: string } | null;
}

interface InvoiceLink {
  id: string;
  amount: string;
  qboInvoiceId: string | null;
  clearedFlag: boolean;
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

const WAIVER_TYPE_LABELS: Record<WaiverType, string> = {
  conditional_progress: "Conditional Progress",
  unconditional_progress: "Unconditional Progress",
  conditional_final: "Conditional Final",
  unconditional_final: "Unconditional Final",
};

const WAIVER_TYPE_SUBSECTION: Record<WaiverType, string> = {
  conditional_progress: "§ 53.284(b)",
  unconditional_progress: "§ 53.284(c)",
  conditional_final: "§ 53.284(d)",
  unconditional_final: "§ 53.284(e)",
};

const WAIVER_TYPE_DEFINITIONS: Record<WaiverType, string> = {
  conditional_progress:
    "Waives lien rights for a single progress payment, but only takes effect once that payment actually clears.",
  unconditional_progress:
    "Waives lien rights for a progress payment that has already been received and cleared. Effective immediately.",
  conditional_final:
    "Waives all remaining lien rights on the project, but only takes effect once the final payment clears.",
  unconditional_final:
    "Waives all lien rights for a final payment that has already been received and cleared. Effective immediately.",
};

function gateText(w: Waiver): string | null {
  if (w.approvalStatus === "pending_pm" && !w.pmApprovedAt) {
    return "Requires Project Manager approval before release.";
  }
  if (w.approvalStatus === "pending_pm_finance") {
    if (!w.pmApprovedAt) return "Requires PM approval, then Finance approval before release.";
    return "PM approved — awaiting Finance approval before release.";
  }
  return null;
}

function gateTone(w: Waiver): string {
  if (w.approvalStatus === "pending_pm_finance") return "#eb143f";
  return "#f59e0b";
}

function approvalStatusLabel(s: WaiverApprovalStatus): string {
  switch (s) {
    case "not_required": return "approved";
    case "pending_pm": return "pending";
    case "pending_pm_finance": return "pending";
    case "approved": return "approved";
    case "rejected": return "rejected";
    default: return s;
  }
}

function alpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function Field({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
        {label}
      </span>
      <span className="text-[12.5px]" style={{ color: dim ? "var(--text-dim)" : "var(--text-base)" }}>
        {value}
      </span>
    </div>
  );
}

// ── Create Waiver Form ─────────────────────────────────────────────────────

interface CreateFormState {
  lienProjectId: string;
  workStream: string;
  waiverType: WaiverType;
  paymentAmount: string;
  invoiceLinkId: string;
}

function CreateWaiverModal({
  onClose,
  onCreated,
  initialType = "conditional_progress",
}: {
  onClose: () => void;
  onCreated: () => void;
  initialType?: WaiverType;
}) {
  const [form, setForm] = React.useState<CreateFormState>({
    lienProjectId: "",
    workStream: "construction",
    waiverType: initialType,
    paymentAmount: "",
    invoiceLinkId: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Load projects for selector.
  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-waiver"],
    queryFn: () => apiFetch<{ projects: { id: string; cachedProjectName: string | null }[] }>("/projects"),
  });

  // Load invoices for selected project.
  const { data: invoicesData } = useQuery({
    queryKey: ["invoices-for-waiver", form.lienProjectId],
    queryFn: () => apiFetch<{ invoices: InvoiceLink[] }>(`/invoices?projectId=${form.lienProjectId}`),
    enabled: !!form.lienProjectId,
  });

  const isUnconditional =
    form.waiverType === "unconditional_progress" || form.waiverType === "unconditional_final";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = {
        lienProjectId: form.lienProjectId,
        workStream: form.workStream,
        waiverType: form.waiverType,
        paymentAmount: form.paymentAmount,
      };
      if (form.invoiceLinkId) body.invoiceLinkId = form.invoiceLinkId;

      const res = await apiPost("/waivers", body);
      if (res.error) {
        setError(res.error);
      } else {
        onCreated();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  const inp =
    "rounded-md border px-3 py-2 text-[12.5px] w-full focus:outline-none focus:ring-1 focus:ring-[#14eba3]";
  const inpStyle = {
    background: "var(--surface)",
    borderColor: "var(--helm-border)",
    color: "var(--text-base)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }}>
      <div
        className="relative w-full max-w-md rounded-xl border p-6 shadow-2xl"
        style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1"
          style={{ color: "var(--text-dim)" }}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-5 text-[14px] font-semibold" style={{ color: "var(--text-base)" }}>
          New Waiver
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg border px-3 py-2 text-[12px]"
            style={{ background: alpha("#eb143f", 0.1), borderColor: alpha("#eb143f", 0.3), color: "#eb143f" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
              Waiver type
            </label>
            <select
              value={form.waiverType}
              onChange={(e) => setForm((f) => ({ ...f, waiverType: e.target.value as WaiverType }))}
              className={inp}
              style={inpStyle}
            >
              {(Object.entries(WAIVER_TYPE_LABELS) as [WaiverType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l} — {WAIVER_TYPE_SUBSECTION[v]}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-muted-color)" }}>
              {WAIVER_TYPE_DEFINITIONS[form.waiverType]}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
              Project
            </label>
            <select
              required
              value={form.lienProjectId}
              onChange={(e) => setForm((f) => ({ ...f, lienProjectId: e.target.value }))}
              className={inp}
              style={inpStyle}
            >
              <option value="">Select project…</option>
              {projectsData?.projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cachedProjectName ?? p.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
              Stream
            </label>
            <select value={form.workStream} onChange={(e) => setForm((f) => ({ ...f, workStream: e.target.value }))} className={inp} style={inpStyle}>
              <option value="construction">Construction</option>
              <option value="design">Design</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
              Payment amount
            </label>
            <input
              required
              type="text"
              placeholder="e.g. 12000.00"
              value={form.paymentAmount}
              onChange={(e) => setForm((f) => ({ ...f, paymentAmount: e.target.value }))}
              className={inp}
              style={inpStyle}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
              Invoice link{isUnconditional ? " (required — must be cleared)" : " (optional)"}
            </label>
            <select
              value={form.invoiceLinkId}
              onChange={(e) => setForm((f) => ({ ...f, invoiceLinkId: e.target.value }))}
              className={inp}
              style={inpStyle}
              required={isUnconditional}
            >
              <option value="">Select invoice…</option>
              {invoicesData?.invoices?.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.qboInvoiceId ?? inv.id} — {money(Number(inv.amount))}{inv.clearedFlag ? " ✓ cleared" : " (uncleared)"}
                </option>
              ))}
            </select>
          </div>

          {isUnconditional && (
            <div
              className="rounded-lg border px-3 py-2 text-[11.5px]"
              style={{ background: alpha("#f59e0b", 0.08), borderColor: alpha("#f59e0b", 0.25), color: "#f59e0b" }}
            >
              Unconditional waivers require a coordinator-cleared invoice. Select a cleared invoice above.
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md border py-2 text-[13px] font-semibold"
              style={{ background: alpha("#14eba3", 0.14), borderColor: alpha("#14eba3", 0.3), color: "#14eba3" }}
            >
              {loading ? "Creating…" : "Create waiver"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-[13px]"
              style={{ background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function WaiversPage() {
  const queryClient = useQueryClient();
  const [createType, setCreateType] = React.useState<WaiverType | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["waivers"],
    queryFn: () => apiFetch<{ waivers: Waiver[] }>("/waivers"),
  });

  const { data: exposureData } = useQuery({
    queryKey: ["waivers-exposure"],
    queryFn: () => apiFetch<{ exposure: ExposureRow[] }>("/waivers/exposure"),
  });

  const exposureSig =
    exposureData?.exposure
      ?.map((r) => `${r.streamId}:${r.projectName}:${r.grossExposure}:${r.waivedAmount}:${r.netExposure}`)
      .join("|") ?? "";

  const waivers = data?.waivers ?? [];
  const pendingWaivers = waivers.filter(
    (w) => w.approvalStatus === "pending_pm" || w.approvalStatus === "pending_pm_finance",
  );

  const selected: Waiver | undefined = React.useMemo(
    () => waivers.find((w) => w.id === selectedId) ?? waivers[0],
    [waivers, selectedId],
  );

  const approvePmMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/waivers/${id}/approve-pm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["waivers"] }),
  });

  const approveFinanceMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/waivers/${id}/approve-finance`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["waivers"] }),
  });

  const notarizeMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/waivers/${id}/notarize`),
    onSuccess: (data: { signingUrl?: string }) => {
      if (data?.signingUrl) window.open(data.signingUrl, "_blank", "noopener,noreferrer");
      queryClient.invalidateQueries({ queryKey: ["waivers"] });
    },
  });

  const notaryRefreshMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/waivers/${id}/notary-refresh`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["waivers"] }),
  });

  useLeftPanel(
    <Panel title="New Waiver" accent="#14eba3">
      <div className="flex flex-col gap-2 p-3">
        <button
          onClick={() => setCreateType("conditional_progress")}
          className="flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-center text-[12.5px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: alpha("#14eba3", 0.1), borderColor: alpha("#14eba3", 0.25), color: "#14eba3" }}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>New Waiver</span>
        </button>
      </div>

      {/* Lien Exposure */}
      {(exposureData?.exposure?.length ?? 0) > 0 && (
        <div className="border-t" style={{ borderColor: "var(--helm-border)" }}>
          <div className="flex items-center gap-2 px-4 pb-2 pt-3">
            <Landmark className="h-3.5 w-3.5" style={{ color: "#6366f1" }} />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted-color)" }}>
              Lien Exposure
            </span>
          </div>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {exposureData!.exposure.map((row) => (
              <div
                key={row.streamId}
                className="rounded-md border px-3 py-2"
                style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
              >
                <div className="truncate text-[12px] font-medium" style={{ color: "var(--text-base)" }}>
                  {row.projectName}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[10.5px]" style={{ color: "var(--text-muted-color)" }}>
                    gross {money(row.grossExposure)} — waived {money(row.waivedAmount)}
                  </span>
                  <span
                    className="font-mono text-[12.5px] font-semibold"
                    style={{ color: row.netExposure > 0 ? "#f59e0b" : "#14eba3" }}
                  >
                    {money(row.netExposure)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>,
    [exposureSig],
  );

  useRightPanel(
    <Panel title="Approval Queue" count={pendingWaivers.length}>
      <QueueList
        items={
          pendingWaivers.length > 0
            ? pendingWaivers.map((w) => ({
                id: w.id,
                title: WAIVER_TYPE_LABELS[w.waiverType],
                sub: `${w.project?.cachedProjectName ?? "Unknown"} · ${w.approvalStatus === "pending_pm" ? "awaiting PM" : w.pmApprovedAt ? "awaiting Finance" : "awaiting PM + Finance"}`,
                active: w.id === selected?.id,
                onClick: () => setSelectedId(w.id),
              }))
            : [{ id: "empty", title: "No pending approvals", sub: "All caught up" }]
        }
      />
    </Panel>,
    [pendingWaivers.length, selected?.id],
  );

  return (
    <>
      {createType && (
        <CreateWaiverModal
          initialType={createType}
          onClose={() => setCreateType(null)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["waivers"] });
            queryClient.invalidateQueries({ queryKey: ["waivers-exposure"] });
          }}
        />
      )}

      <div className="flex flex-col gap-4">
        {/* Waiver cards */}
        <ListTableState
          isLoading={isLoading}
          isError={isError}
          isEmpty={waivers.length === 0}
          loadingText="Loading waivers…"
          errorText="Failed to load waivers."
          emptyText="No waivers yet — use the New Waiver panel to create one."
        >
          <div className="flex flex-col gap-4">
            {waivers.map((w) => {
          const gate = gateText(w);
          const tone = gateTone(w);
          const isSelected = w.id === selected?.id;

          return (
            <div
              key={w.id}
              onClick={() => setSelectedId(w.id)}
              className="cursor-pointer rounded-lg border p-[18px] transition-all"
              style={{
                background: isSelected ? "var(--surface-2)" : "var(--surface)",
                borderColor: isSelected ? alpha("#14eba3", 0.35) : "var(--helm-border)",
              }}
            >
              {/* Top row */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                      {WAIVER_TYPE_LABELS[w.waiverType]}
                    </span>
                    <span className="text-[10.5px]" style={{ color: "var(--text-muted-color)" }}>
                      {WAIVER_TYPE_SUBSECTION[w.waiverType]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-dim)" }}>
                    {w.project?.cachedProjectName ?? w.lienProjectId} · {w.workStream}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[14px]" style={{ color: "var(--text-base)" }}>
                    {money(Number(w.paymentAmount))}
                  </span>
                  <StatusBadge status={approvalStatusLabel(w.approvalStatus)} />
                </div>
              </div>

              {/* Gate banner */}
              {gate && (
                <div className="mt-3">
                  <ApprovalGateBanner text={gate} tone={tone} />
                </div>
              )}

              {/* Detail row — notarization + approvals */}
              <div className="mt-3 flex flex-wrap gap-3">
                {w.notarized && (
                  <span
                    className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]"
                    style={{ borderColor: alpha("#14eba3", 0.3), color: "#14eba3" }}
                  >
                    <Check className="h-3 w-3" />
                    Notarized
                  </span>
                )}
                {w.pmApprovedAt && (
                  <span
                    className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]"
                    style={{ borderColor: alpha("#6366f1", 0.3), color: "#6366f1" }}
                  >
                    <Check className="h-3 w-3" />
                    PM approved
                  </span>
                )}
                {w.financeApprovedAt && (
                  <span
                    className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]"
                    style={{ borderColor: alpha("#6366f1", 0.3), color: "#6366f1" }}
                  >
                    <Check className="h-3 w-3" />
                    Finance approved
                  </span>
                )}
                {w.signedDate && (
                  <span className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>
                    Signed {new Date(w.signedDate).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Actions — only show when selected */}
              {isSelected && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--helm-border)" }}>
                  {/* PDF preview */}
                  <a
                    href={`/api/waivers/${w.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold no-underline"
                    style={{ background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Preview PDF
                  </a>

                  {/* PM approve */}
                  {(w.approvalStatus === "pending_pm" || (w.approvalStatus === "pending_pm_finance" && !w.pmApprovedAt)) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); approvePmMutation.mutate(w.id); }}
                      disabled={approvePmMutation.isPending}
                      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: alpha("#6366f1", 0.12), borderColor: alpha("#6366f1", 0.3), color: "#6366f1" }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {approvePmMutation.isPending ? "Approving…" : "Approve (PM)"}
                    </button>
                  )}

                  {/* Finance approve */}
                  {w.waiverType === "unconditional_final" && w.approvalStatus === "pending_pm_finance" && !!w.pmApprovedAt && !w.financeApprovedAt && (
                    <button
                      onClick={(e) => { e.stopPropagation(); approveFinanceMutation.mutate(w.id); }}
                      disabled={approveFinanceMutation.isPending}
                      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: alpha("#f59e0b", 0.12), borderColor: alpha("#f59e0b", 0.3), color: "#f59e0b" }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {approveFinanceMutation.isPending ? "Approving…" : "Approve (Finance)"}
                    </button>
                  )}

                  {/* Notarize */}
                  {!w.notarized && (
                    <button
                      onClick={(e) => { e.stopPropagation(); notarizeMutation.mutate(w.id); }}
                      disabled={notarizeMutation.isPending}
                      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: alpha("#14eba3", 0.1), borderColor: alpha("#14eba3", 0.25), color: "#14eba3" }}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {notarizeMutation.isPending ? "Initiating…" : "Notarize"}
                    </button>
                  )}

                  {/* Check notarization status (poll NotaryLive) */}
                  {!!w.notaryLiveRef && !w.notarized && (
                    <button
                      onClick={(e) => { e.stopPropagation(); notaryRefreshMutation.mutate(w.id); }}
                      disabled={notaryRefreshMutation.isPending}
                      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {notaryRefreshMutation.isPending ? "Checking…" : "Check notary status"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
            })}
          </div>
        </ListTableState>

        {/* Mailing tracking section — sent notices */}
        <MailingTracker />
      </div>
    </>
  );
}

// ── Mailing Tracker ────────────────────────────────────────────────────────

function MailingTracker() {
  const { data } = useQuery({
    queryKey: ["notices-sent"],
    queryFn: () =>
      apiFetch<{
        notices: {
          id: string;
          status: string;
          noticeType: string;
          sentAt: string | null;
          deliveredAt: string | null;
          project: { cachedProjectName: string | null } | null;
          mailing: { trackingNumber: string | null; labelUrl: string | null } | null;
        }[];
      }>("/notices?status=sent,delivered"),
  });

  const sentNotices = data?.notices ?? [];

  if (!sentNotices.length) return null;

  return (
    <div className="rounded-lg border p-4" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
        Mailing Tracking
      </div>
      <div className="flex flex-col gap-2">
        {sentNotices.map((n) => (
          <div key={n.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12.5px]" style={{ color: "var(--text-base)" }}>
                {n.project?.cachedProjectName ?? n.id} — {n.noticeType.replace(/_/g, " ")}
              </div>
              {n.sentAt && (
                <div className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>
                  Sent {new Date(n.sentAt).toLocaleDateString()}
                  {n.deliveredAt ? ` · Delivered ${new Date(n.deliveredAt).toLocaleDateString()}` : ""}
                </div>
              )}
            </div>
            <StatusBadge status={n.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
