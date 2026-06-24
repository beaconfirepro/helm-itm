import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Pencil, Check, Send, FileText, ChevronRight } from "lucide-react";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { QueueList } from "@/components/ui/queue-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeadlineCountdown } from "@/components/ui/deadline-countdown";
import { money, alpha } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface Recipient {
  id: string;
  recipientType: string;
  legalName: string;
  mailingAddress: string;
}

interface QueueNotice {
  id: string;
  status: string;
  noticeType: string;
  claimAmount: string;
  workDescription: string | null;
  monthListed: string;
  createdAt: string;
  noticeDeadline: string | null;
  recipients: Recipient[];
  sov: { id: string; workStream: string; status: string } | null;
  project: {
    id: string;
    projectName: string;
    contractorTier: string;
    lienWorkflowType: string;
    county: string | null;
    legalPropertyAddress: string | null;
  } | null;
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

function apiPatch(path: string, body: unknown) {
  return fetch(`/api${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(iso: string | null): number {
  if (!iso) return 99;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function fmtMonthListed(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statuteRef(noticeType: string): string {
  if (noticeType === "retainage_claim") return "§ 53.057";
  if (noticeType === "early_warning") return "§ 53.056 (courtesy)";
  return "§ 53.056";
}

function noticeBody(n: QueueNotice): string {
  const project = n.project?.projectName ?? "this property";
  const month = fmtMonthListed(n.monthListed);
  const amt = money(Number(n.claimAmount));

  if (n.noticeType === "retainage_claim") {
    return `This notice is to advise you that HELM Fire Protection has furnished labor and materials for fire-protection work at ${project}. The unpaid retainage balance is ${amt}. If this balance is not paid, the property may be subject to a mechanic's lien.`;
  }
  if (n.noticeType === "early_warning") {
    return `This is a courtesy notice from HELM Fire Protection. We have furnished labor and materials for fire-protection work at ${project} in ${month}. The unpaid balance is ${amt}. Payment within 10 days will avoid the issuance of a formal statutory notice.`;
  }
  return `This notice is to advise you that HELM Fire Protection has furnished labor and materials for fire-protection work at ${project}. The unpaid balance for work performed in ${month} is ${amt}. If this balance is not paid, the property may be subject to a mechanic's lien.`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SendQueuePage() {
  const queryClient = useQueryClient();
  const search = useSearch();
  const deepLinkNoticeId = React.useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("notice");
  }, [search]);

  const { data, isLoading, isError } = useQuery<{ notices: QueueNotice[] }>({
    queryKey: ["send-queue"],
    queryFn: () => apiFetch<{ notices: QueueNotice[] }>("/monthly/send-queue"),
    retry: false,
    staleTime: 30_000,
  });

  const notices = data?.notices ?? [];
  const [selectedId, setSelectedId] = React.useState<string | null>(deepLinkNoticeId);

  React.useEffect(() => {
    if (deepLinkNoticeId && notices.some((n) => n.id === deepLinkNoticeId)) {
      setSelectedId(deepLinkNoticeId);
    }
  }, [deepLinkNoticeId, notices.length]);

  const selected: QueueNotice | undefined = React.useMemo(
    () => notices.find((n) => n.id === selectedId) ?? notices[0],
    [notices, selectedId],
  );

  const [editing, setEditing] = React.useState(false);
  const [editAmount, setEditAmount] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");

  React.useEffect(() => {
    if (selected) {
      setEditAmount(selected.claimAmount ?? "");
      setEditDesc(selected.workDescription ?? "");
      setEditing(false);
    }
  }, [selected?.id]);

  const editMutation = useMutation({
    mutationFn: ({ id, claimAmount, workDescription }: { id: string; claimAmount: string; workDescription: string }) =>
      apiPatch(`/notices/${id}`, { claimAmount, workDescription }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["send-queue"] });
      setEditing(false);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/notices/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["send-queue"] }),
  });

  const [sendResult, setSendResult] = React.useState<
    { trackingNumber: string; project: string } | null
  >(null);
  const [sendError, setSendError] = React.useState<string | null>(null);

  const sendMutation = useMutation({
    mutationFn: async ({ id }: { id: string; project: string }) => {
      const res = await fetch(`/api/notices/${id}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return body as { mailing?: { trackingNumber: string | null } };
    },
    onSuccess: (data, variables) => {
      setSendError(null);
      setSendResult({
        trackingNumber: data.mailing?.trackingNumber ?? "—",
        project: variables.project,
      });
      queryClient.invalidateQueries({ queryKey: ["send-queue"] });
      queryClient.invalidateQueries({ queryKey: ["stream-notices"] });
    },
    onError: (err: Error) => {
      setSendResult(null);
      setSendError(err.message);
    },
  });

  useRightPanel(
    <Panel title="Send Queue" count={notices.length}>
      <QueueList
        items={
          notices.length > 0
            ? notices.map((n) => ({
                id: n.id,
                title: n.project?.projectName ?? "Unknown project",
                sub: `${n.status[0].toUpperCase()}${n.status.slice(1)} · ${fmtMonthListed(n.monthListed)}`,
                active: n.id === selected?.id,
                onClick: () => setSelectedId(n.id),
              }))
            : [{ id: "empty", title: "No notices in queue", sub: "All caught up" }]
        }
      />
    </Panel>,
    [notices.length, selected?.id],
  );

  const draftCount = notices.filter((n) => n.status === "draft").length;
  const approvedCount = notices.filter((n) => n.status === "approved").length;
  const totalClaim = notices.reduce((s, n) => s + Number(n.claimAmount), 0);

  useLeftPanel(
    <Panel title="Queue Summary">
      <div className="flex flex-col gap-2 p-3">
        {[
          { label: "Draft", value: String(draftCount), color: "#f59f0a" },
          { label: "Approved", value: String(approvedCount), color: "#14eba3" },
          { label: "Total claim", value: money(totalClaim), color: "var(--text-base)" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between rounded-md border px-3 py-2.5"
            style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
          >
            <span className="text-[12px]" style={{ color: "var(--text-muted-color)" }}>{s.label}</span>
            <span className="font-mono text-[13px] font-semibold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    </Panel>,
    [notices.length, draftCount, approvedCount, totalClaim],
  );

  if (isError) {
    return (
      <div
        className="rounded-lg border px-4 py-8 text-center text-[12px]"
        style={{
          background: "var(--surface)",
          borderColor: "var(--helm-border)",
          color: "var(--text-muted-color)",
        }}
      >
        Unable to load send queue. Your session may have expired — please
        refresh the page to sign in again.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg border px-4 py-10 text-center text-[12px]"
        style={{
          background: "var(--surface)",
          borderColor: "var(--helm-border)",
          color: "var(--text-muted-color)",
        }}
      >
        Loading notices…
      </div>
    );
  }

  if (!selected) {
    return (
      <div
        className="rounded-lg border px-4 py-8 text-center text-[12px]"
        style={{
          background: "var(--surface)",
          borderColor: "var(--helm-border)",
          color: "var(--text-muted-color)",
        }}
      >
        No draft or approved notices in queue.
        <br />
        <span style={{ color: "var(--text-muted-color)" }}>
          Approve notices from the Liens workspace to add them to the send queue.
        </span>
      </div>
    );
  }

  const recipientNames = selected.recipients.map((r) => r.legalName).join(" · ") || "No recipients";

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb / summary strip */}
      <div className="flex flex-wrap items-center gap-2">
        {notices.map((n) => (
          <button
            key={n.id}
            onClick={() => setSelectedId(n.id)}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]"
            style={{
              background: n.id === selected.id ? "var(--surface-3)" : "var(--surface)",
              borderColor: n.id === selected.id ? "var(--helm-accent)" : "var(--helm-border)",
              color: n.id === selected.id ? "var(--text-base)" : "var(--text-dim)",
            }}
          >
            <span className="truncate max-w-[120px]">{n.project?.projectName ?? "Notice"}</span>
            <StatusBadge status={n.status} />
          </button>
        ))}
      </div>

      {/* Notice preview card */}
      <div
        className="overflow-hidden rounded-lg border"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--helm-border)" }}
        >
          <div className="min-w-0">
            <div
              className="text-[14.5px] font-semibold"
              style={{ color: "var(--text-base)" }}
            >
              {selected.project?.projectName ?? "Notice preview"}
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-dim)" }}>
              {selected.sov?.workStream ?? ""} stream ·{" "}
              {fmtMonthListed(selected.monthListed)} · {statuteRef(selected.noticeType)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selected.noticeDeadline && (
              <DeadlineCountdown days={daysUntil(selected.noticeDeadline)} />
            )}
            <StatusBadge status={selected.status} />
          </div>
        </div>

        <div className="flex flex-col gap-3.5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Claim amount"
              value={money(Number(selected.claimAmount))}
              mono
            />
            <Field
              label="Month listed"
              value={fmtMonthListed(selected.monthListed)}
            />
          </div>
          <Field label="Recipients" value={recipientNames} dim />
          {selected.project?.legalPropertyAddress && (
            <Field label="Property" value={selected.project.legalPropertyAddress} dim />
          )}

          {/* Statutory notice body */}
          <div
            className="rounded-lg border p-[18px] font-mono text-[11.5px] leading-relaxed"
            style={{
              background: "#0f1117",
              borderColor: "var(--helm-border)",
              color: "var(--text-dim)",
            }}
          >
            <div
              className="mb-2.5 text-[10px] uppercase tracking-wide"
              style={{ color: "var(--text-muted-color)" }}
            >
              Tex. Prop. Code {statuteRef(selected.noticeType)} — Notice to Owner &amp; Original Contractor
            </div>
            {noticeBody(selected)}
          </div>

          {/* Inline edit form (draft only) */}
          {editing && selected.status === "draft" && (
            <div
              className="rounded-lg border p-4 flex flex-col gap-3"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
            >
              <div className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
                Edit notice
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
                  Claim amount
                </label>
                <input
                  type="text"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="rounded-md border px-3 py-2 text-[13px] font-mono"
                  style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
                  Work description
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="rounded-md border px-3 py-2 text-[12.5px] resize-none"
                  style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => editMutation.mutate({ id: selected.id, claimAmount: editAmount, workDescription: editDesc })}
                  disabled={editMutation.isPending}
                  className="rounded-md border px-3.5 py-1.5 text-[13px] font-semibold"
                  style={{ background: alpha("#14eba3", 0.14), borderColor: alpha("#14eba3", 0.3), color: "#14eba3" }}
                >
                  {editMutation.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-md border px-3.5 py-1.5 text-[13px]"
                  style={{ background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/notices/${selected.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] font-semibold no-underline"
              style={{
                background: "var(--surface-3)",
                borderColor: "var(--helm-border)",
                color: "var(--text-dim)",
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Preview PDF
            </a>

            {selected.status === "draft" && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] font-semibold"
                style={{
                  background: "var(--surface-3)",
                  borderColor: "var(--helm-border)",
                  color: "var(--text-dim)",
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}

            {selected.status === "draft" && (
              <button
                onClick={() => approveMutation.mutate(selected.id)}
                disabled={approveMutation.isPending}
                className="flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] font-semibold"
                style={{
                  background: alpha("#14eba3", 0.14),
                  borderColor: alpha("#14eba3", 0.3),
                  color: "#14eba3",
                }}
              >
                <Check className="h-3.5 w-3.5" />
                {approveMutation.isPending ? "Approving…" : "Approve"}
              </button>
            )}

            {selected.status === "approved" && (
              <button
                disabled={sendMutation.isPending}
                className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
                style={{ background: "#f59e0b", color: "#1a1205" }}
                onClick={() =>
                  sendMutation.mutate({
                    id: selected.id,
                    project: selected.project?.projectName ?? "Notice",
                  })
                }
              >
                <Send className="h-3.5 w-3.5" />
                {sendMutation.isPending ? "Sending…" : "Send certified"}
              </button>
            )}

            {(selected.status === "sent" || selected.status === "delivered") && (
              <div
                className="flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px]"
                style={{ color: "#14eba3" }}
              >
                <Check className="h-3.5 w-3.5" />
                {selected.status === "delivered" ? "Delivered" : "Sent via certified mail"}
              </div>
            )}
          </div>

          {/* Send result / error banner */}
          {sendResult && (
            <div
              className="flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-[12.5px]"
              style={{
                background: alpha("#14eba3", 0.1),
                borderColor: alpha("#14eba3", 0.3),
                color: "#14eba3",
              }}
            >
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                Certified mail dispatched for {sendResult.project}.
              </span>
              <span className="font-mono" style={{ color: "var(--text-dim)" }}>
                Tracking: {sendResult.trackingNumber}
              </span>
            </div>
          )}
          {sendError && (
            <div
              className="rounded-md border px-4 py-3 text-[12.5px]"
              style={{
                background: alpha("#ef4444", 0.1),
                borderColor: alpha("#ef4444", 0.3),
                color: "#ef4444",
              }}
            >
              Could not send notice: {sendError}
            </div>
          )}
        </div>
      </div>

      {/* Recipients detail */}
      {selected.recipients.length > 0 && (
        <div
          className="overflow-hidden rounded-lg border"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
        >
          <div
            className="border-b px-5 py-3 text-[12px] font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}
          >
            Recipients
          </div>
          <div className="divide-y" style={{ borderColor: "var(--helm-border)" }}>
            {selected.recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: "var(--text-base)" }}>
                    {r.legalName}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                    {r.mailingAddress}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded px-2 py-0.5 text-[10px] uppercase tracking-wide"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-muted-color)",
                  }}
                >
                  {r.recipientType === "original_contractor" ? "General Contractor" : "Owner"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  dim,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div>
      <div
        className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted-color)" }}
      >
        {label}
      </div>
      <div
        className={`rounded-md border px-3 py-2.5 text-[13px] ${mono ? "font-mono" : ""}`}
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--helm-border)",
          color: dim ? "var(--text-dim)" : "var(--text-base)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
