import * as React from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark, Clock, Phone, Mail, ChevronLeft, RefreshCw, Plus, Check, Trash2 } from "lucide-react";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { WorkspaceHeader } from "@/components/nav/WorkspaceLayout";
import { QueueList } from "@/components/ui/queue-list";
import { AgingBuckets } from "@/components/ui/aging-buckets";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { money, alpha } from "@/lib/utils";

function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include", ...opts }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<T>;
  });
}

const STAGE_LABELS: Record<string, string> = {
  none: "Monitoring",
  soft_collections: "Soft Collections",
  pre_lien_notice: "Pre-Lien Notice",
  lien_filing: "Lien Filing",
  agency_attorney: "Agency / Attorney",
  write_off: "Write-Off",
};

const ESCALATION_LADDER = [
  "none",
  "soft_collections",
  "pre_lien_notice",
  "lien_filing",
  "agency_attorney",
  "write_off",
];

const METHOD_ICON: Record<string, React.ReactNode> = {
  phone: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  letter: <span className="text-[10px] font-bold">LTR</span>,
  sms: <span className="text-[10px] font-bold">SMS</span>,
  portal: <span className="text-[10px] font-bold">WEB</span>,
  in_person: <span className="text-[10px] font-bold">IRL</span>,
};

export default function AccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [showActivityForm, setShowActivityForm] = React.useState(false);
  const [showPromiseForm, setShowPromiseForm] = React.useState(false);
  const [showPlanForm, setShowPlanForm] = React.useState(false);
  const [actMethod, setActMethod] = React.useState("phone");
  const [actNotes, setActNotes] = React.useState("");
  const [promiseAmount, setPromiseAmount] = React.useState("");
  const [promiseDate, setPromiseDate] = React.useState("");
  const [promiseNotes, setPromiseNotes] = React.useState("");
  const [planInstallments, setPlanInstallments] = React.useState<Array<{ dueDate: string; amount: string }>>([
    { dueDate: "", amount: "" },
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ["collections/accounts", accountId],
    queryFn: () =>
      apiFetch<{
        account: {
          id: string; status: string; escalationStage: string;
          totalOverdue: string; oldestOverdueDays: number; riskScore: number | null;
        };
        client: { id: string; cachedName: string | null; cachedEmail: string | null } | null;
        activities: Array<{ id: string; method: string; activityDate: string; notes: string | null; createdByUserId: string | null }>;
        promises: Array<{ id: string; amount: string; promisedDate: string; status: string; notes: string | null }>;
        plans: Array<{ id: string; totalAmount: string; status: string; installments: Array<{ id: string; dueDate: string; amount: string; paid: boolean; paidDate: string | null }> }>;
        openPromise: { id: string; amount: string; promisedDate: string } | null;
        lienBackstop: { deadlineDate: string; deadlineType: string; streamId: string } | null;
        aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d91plus: number };
      }>(`/collections/accounts/${accountId}`),
    enabled: !!accountId,
    retry: false,
  });

  const logActivityMut = useMutation({
    mutationFn: (body: { method: string; activityDate: string; notes: string }) =>
      apiFetch(`/collections/accounts/${accountId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections/accounts", accountId] });
      setShowActivityForm(false);
      setActNotes("");
    },
  });

  const promiseMut = useMutation({
    mutationFn: (body: { amount: number; promisedDate: string; notes: string }) =>
      apiFetch(`/collections/accounts/${accountId}/promise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections/accounts", accountId] });
      qc.invalidateQueries({ queryKey: ["collections/accounts"] });
      setShowPromiseForm(false);
      setPromiseAmount("");
      setPromiseDate("");
    },
  });

  const updatePromiseMut = useMutation({
    mutationFn: ({ promiseId, status }: { promiseId: string; status: string }) =>
      apiFetch(`/collections/promises/${promiseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections/accounts", accountId] });
      qc.invalidateQueries({ queryKey: ["collections/accounts"] });
    },
  });

  const installmentMut = useMutation({
    mutationFn: ({ planId, installmentId, paid }: { planId: string; installmentId: string; paid: boolean }) =>
      apiFetch(`/collections/plans/${planId}/installments/${installmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid, paidDate: paid ? new Date().toISOString().slice(0, 10) : undefined }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collections/accounts", accountId] }),
  });

  const createPlanMut = useMutation({
    mutationFn: (body: { totalAmount: number; installments: Array<{ dueDate: string; amount: number }> }) =>
      apiFetch(`/collections/accounts/${accountId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections/accounts", accountId] });
      qc.invalidateQueries({ queryKey: ["collections/accounts"] });
      setShowPlanForm(false);
      setPlanInstallments([{ dueDate: "", amount: "" }]);
    },
  });

  const escalateMut = useMutation({
    mutationFn: (escalationStage: string) =>
      apiFetch(`/collections/accounts/${accountId}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escalationStage }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections/accounts", accountId] });
      qc.invalidateQueries({ queryKey: ["collections/accounts"] });
    },
  });

  useRightPanel(
    <Panel title="Actions">
      <QueueList
        items={[
          { id: "x1", title: "Log activity", sub: "Writes to HubSpot", action: "Log", actionTone: "#6366f1" },
          { id: "x2", title: "Record promise-to-pay", sub: "Suppresses escalation", action: "Add", actionTone: "#14eba3" },
          { id: "x3", title: "Payment plan", sub: "Create installments" },
          { id: "x4", title: "Escalate stage", sub: "Escalate to next stage", action: "Escalate", actionTone: "#eb143f" },
        ]}
      />
    </Panel>,
    [accountId],
  );

  useLeftPanel(
    <Panel title="Account">
      {data ? (
        <div className="flex flex-col gap-2 p-3">
          <div className="text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            {data.client?.cachedName ?? data.account.id}
          </div>
          {[
            { label: "Risk score", value: data.account.riskScore != null ? String(data.account.riskScore) : "—" },
            { label: "Total overdue", value: money(Number(data.account.totalOverdue)) },
            { label: "Oldest", value: `${data.account.oldestOverdueDays}d` },
            { label: "Stage", value: STAGE_LABELS[data.account.escalationStage] ?? data.account.escalationStage },
            { label: "Status", value: data.account.status },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>{r.label}</span>
              <span className="font-mono text-[12px] font-semibold" style={{ color: "var(--text-base)" }}>{r.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 text-[12px]" style={{ color: "var(--text-muted-color)" }}>Loading…</div>
      )}
    </Panel>,
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm" style={{ color: "var(--text-muted-color)" }}>
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading account…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: "var(--text-muted-color)" }}>
        Account not found.{" "}
        <button onClick={() => navigate("/collections")} className="underline">
          Back to collections
        </button>
      </div>
    );
  }

  const { account, client, activities, promises, plans, openPromise, lienBackstop, aging } = data;
  const agingValues = [aging.current, aging.d1_30, aging.d31_60, aging.d61_90, aging.d91plus];
  const riskColor = (r: number | null) =>
    r == null ? "#6b7280" : r >= 75 ? "#eb143f" : r >= 45 ? "#f59f0a" : "#14eba3";
  const rc = riskColor(account.riskScore);

  // Build timeline from activities + promises
  const timelineItems: Array<{ text: string; date: string; color: string }> = [
    ...activities.slice(0, 6).map((a) => ({
      text: `${a.method.charAt(0).toUpperCase() + a.method.slice(1)} contact logged${a.notes ? ` — "${a.notes}"` : ""}`,
      date: new Date(a.activityDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      color: "#6366f1",
    })),
    ...promises.slice(0, 3).map((p) => ({
      text: `Promise-to-pay ${p.status}: ${money(Number(p.amount))} by ${new Date(p.promisedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      date: new Date(p.promisedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      color: p.status === "kept" ? "#14eba3" : p.status === "broken" ? "#eb143f" : "#f59f0a",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

  const currentStageIdx = ESCALATION_LADDER.indexOf(account.escalationStage);
  const nextStage = ESCALATION_LADDER[currentStageIdx + 1];

  return (
    <>
      {/* Back */}
      <button
        onClick={() => navigate("/collections")}
        className="flex items-center gap-1.5 text-[12px]"
        style={{ color: "var(--text-dim)" }}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        All accounts
      </button>

      {/* Open promise banner */}
      {openPromise && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: alpha("#6366f1", 0.08), border: `1px solid ${alpha("#6366f1", 0.32)}` }}
        >
          <Clock className="h-[17px] w-[17px] shrink-0" style={{ color: "#818cf8" }} />
          <div className="flex-1 text-[13px]" style={{ color: "var(--text-base)" }}>
            Open promise-to-pay on file —{" "}
            <span className="font-semibold" style={{ color: "#818cf8" }}>
              {money(Number(openPromise.amount))} by{" "}
              {new Date(openPromise.promisedDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            . Dunning suppressed.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updatePromiseMut.mutate({ promiseId: openPromise.id, status: "kept" })}
              className="rounded-md border px-2.5 py-1 text-[11.5px] font-semibold text-[#14eba3]"
              style={{ background: alpha("#14eba3", 0.12), borderColor: alpha("#14eba3", 0.3) }}
            >
              <Check className="inline h-3 w-3 mr-1" />Kept
            </button>
            <button
              onClick={() => updatePromiseMut.mutate({ promiseId: openPromise.id, status: "broken" })}
              className="rounded-md border px-2.5 py-1 text-[11.5px] font-semibold text-[#eb143f]"
              style={{ background: alpha("#eb143f", 0.08), borderColor: alpha("#eb143f", 0.25) }}
            >
              Broken
            </button>
          </div>
        </div>
      )}

      {/* Account header */}
      <WorkspaceHeader
        title={client?.cachedName ?? account.id}
        subtitle={
          <>
            <div>
              {STAGE_LABELS[account.escalationStage] ?? account.escalationStage}
              {account.riskScore != null && ` · risk ${account.riskScore}`}
              {` · ${account.oldestOverdueDays}d oldest`}
            </div>
            {client?.cachedEmail && (
              <div className="mt-1 flex items-center gap-1 text-[11.5px]">
                <Mail className="h-3 w-3" />
                {client.cachedEmail}
              </div>
            )}
          </>
        }
        right={
          <div className="text-right">
            <div className="font-mono text-[22px] font-bold text-[#eb143f]">
              {money(Number(account.totalOverdue))}
            </div>
            <div className="text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>
              {account.oldestOverdueDays} days oldest
            </div>
            <div className="mt-1 flex items-center justify-end gap-1">
              <span className="font-mono text-[9.5px]" style={{ color: "var(--text-muted-color)" }}>RISK</span>
              <span
                className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-bold"
                style={{ color: rc, background: alpha(rc, 0.15) }}
              >
                {account.riskScore ?? "—"}
              </span>
            </div>
          </div>
        }
      />

      {/* Aging */}
      <div className="rounded-lg border p-[18px]" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
        <div className="mb-3 text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
          Aging breakdown
        </div>
        <AgingBuckets values={agingValues} variant="columns" />
      </div>

      {/* Escalation ladder — full ladder with current stage highlighted */}
      <div
        className="overflow-hidden rounded-lg border"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
      >
        <div className="border-b px-[18px] py-3" style={{ borderColor: "var(--helm-border)" }}>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            Escalation ladder
          </div>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--helm-border)" }}>
          {ESCALATION_LADDER.map((stage, idx) => {
            const isCurrent = stage === account.escalationStage;
            const isPast = idx < currentStageIdx;
            const STAGE_CLR: Record<string, string> = {
              none: "#14eba3",
              soft_collections: "#6366f1",
              pre_lien_notice: "#f59f0a",
              lien_filing: "#f97316",
              agency_attorney: "#eb143f",
              write_off: "#6b7280",
            };
            const color = STAGE_CLR[stage] ?? "#6b7280";
            return (
              <div
                key={stage}
                className="flex items-center gap-3 px-[18px] py-2.5"
                style={
                  isCurrent
                    ? { background: alpha(color, 0.1), borderLeft: `3px solid ${color}` }
                    : { borderLeft: "3px solid transparent" }
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: isCurrent || isPast ? color : "var(--helm-border)" }}
                />
                <span
                  className="flex-1 text-[12.5px]"
                  style={{
                    color: isCurrent ? "var(--text-base)" : isPast ? "var(--text-dim)" : "var(--text-muted-color)",
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  {STAGE_LABELS[stage]}
                </span>
                {isCurrent && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{ color, background: alpha(color, 0.15) }}
                  >
                    current
                  </span>
                )}
                {!isCurrent && stage === nextStage && (
                  <button
                    onClick={() => escalateMut.mutate(nextStage)}
                    disabled={escalateMut.isPending}
                    className="rounded-md border px-2.5 py-0.5 text-[11px] font-semibold text-[#eb143f]"
                    style={{ background: alpha("#eb143f", 0.07), borderColor: alpha("#eb143f", 0.28) }}
                  >
                    Escalate
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lien backstop — only shown when stage is pre_lien_notice or higher */}
      {["pre_lien_notice", "lien_filing", "agency_attorney", "write_off"].includes(account.escalationStage) && (
        lienBackstop ? (
          <Link href={`/filing/${lienBackstop.streamId}`}>
            <div
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-[18px] py-3.5 transition-opacity hover:opacity-80"
              style={{ background: alpha("#f59f0a", 0.06), borderColor: alpha("#f59f0a", 0.35) }}
            >
              <Landmark className="h-4 w-4 shrink-0 text-[#f59f0a]" />
              <div className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
                Lien backstop —{" "}
                <span className="font-semibold" style={{ color: "var(--text-base)" }}>
                  {lienBackstop.deadlineType.replace(/_/g, " ")} due{" "}
                  {new Date(lienBackstop.deadlineDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div
            className="flex items-center gap-2.5 rounded-lg border px-[18px] py-3.5"
            style={{ background: "var(--surface)", borderColor: alpha("#f59f0a", 0.25) }}
          >
            <Landmark className="h-4 w-4 shrink-0 text-[#f59f0a]" />
            <div className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              No lien deadlines found for this client's projects — verify lien stream is set up.
            </div>
          </div>
        )
      )}

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowActivityForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
        >
          <Phone className="h-3.5 w-3.5" />
          Log activity
        </button>
        <button
          onClick={() => setShowPromiseForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Promise-to-pay
        </button>
        <button
          onClick={() => setShowPlanForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Payment plan
        </button>
      </div>

      {/* Log activity form */}
      {showActivityForm && (
        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
        >
          <div className="mb-3 text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            Log activity
          </div>
          <div className="flex gap-3 flex-wrap">
            <select
              value={actMethod}
              onChange={(e) => setActMethod(e.target.value)}
              className="rounded-md border px-3 py-2 text-[12.5px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            >
              {["phone", "email", "letter", "sms", "portal", "in_person"].map((m) => (
                <option key={m} value={m}>{m.replace("_", " ")}</option>
              ))}
            </select>
            <input
              value={actNotes}
              onChange={(e) => setActNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="flex-1 rounded-md border px-3 py-2 text-[12.5px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            />
            <button
              onClick={() =>
                logActivityMut.mutate({
                  method: actMethod,
                  activityDate: new Date().toISOString().slice(0, 10),
                  notes: actNotes,
                })
              }
              disabled={logActivityMut.isPending}
              className="rounded-md px-4 py-2 text-[12.5px] font-semibold text-white"
              style={{ background: "#6366f1" }}
            >
              {logActivityMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Promise-to-pay form */}
      {showPromiseForm && (
        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
        >
          <div className="mb-3 text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            Record promise-to-pay
          </div>
          <div className="flex gap-3 flex-wrap">
            <input
              type="number"
              value={promiseAmount}
              onChange={(e) => setPromiseAmount(e.target.value)}
              placeholder="Amount ($)"
              className="w-36 rounded-md border px-3 py-2 text-[12.5px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            />
            <input
              type="date"
              value={promiseDate}
              onChange={(e) => setPromiseDate(e.target.value)}
              className="rounded-md border px-3 py-2 text-[12.5px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            />
            <input
              value={promiseNotes}
              onChange={(e) => setPromiseNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="flex-1 rounded-md border px-3 py-2 text-[12.5px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            />
            <button
              onClick={() =>
                promiseMut.mutate({
                  amount: Number(promiseAmount),
                  promisedDate: promiseDate,
                  notes: promiseNotes,
                })
              }
              disabled={!promiseAmount || !promiseDate || promiseMut.isPending}
              className="rounded-md px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: "#14eba3" }}
            >
              {promiseMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Payment plan creation form */}
      {showPlanForm && (
        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
              Create payment plan
            </div>
            <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              {planInstallments.length} installment{planInstallments.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2">
            {planInstallments.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="date"
                  value={inst.dueDate}
                  onChange={(e) => {
                    const next = [...planInstallments];
                    next[idx] = { ...next[idx], dueDate: e.target.value };
                    setPlanInstallments(next);
                  }}
                  className="rounded-md border px-3 py-2 text-[12.5px]"
                  style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
                />
                <input
                  type="number"
                  value={inst.amount}
                  onChange={(e) => {
                    const next = [...planInstallments];
                    next[idx] = { ...next[idx], amount: e.target.value };
                    setPlanInstallments(next);
                  }}
                  placeholder="Amount ($)"
                  className="w-32 rounded-md border px-3 py-2 text-[12.5px]"
                  style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
                />
                {planInstallments.length > 1 && (
                  <button
                    onClick={() => setPlanInstallments(planInstallments.filter((_, i) => i !== idx))}
                    className="rounded-md p-1.5"
                    style={{ color: "var(--text-dim)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setPlanInstallments([...planInstallments, { dueDate: "", amount: "" }])}
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
            >
              <Plus className="h-3 w-3" />Add installment
            </button>
            <button
              onClick={() => {
                const valid = planInstallments.every((i) => i.dueDate && Number(i.amount) > 0);
                if (!valid) return;
                const total = planInstallments.reduce((s, i) => s + Number(i.amount), 0);
                createPlanMut.mutate({
                  totalAmount: total,
                  installments: planInstallments.map((i) => ({ dueDate: i.dueDate, amount: Number(i.amount) })),
                });
              }}
              disabled={
                createPlanMut.isPending ||
                planInstallments.some((i) => !i.dueDate || !i.amount)
              }
              className="rounded-md px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: "#6366f1" }}
            >
              {createPlanMut.isPending ? "Saving…" : `Create plan · ${money(planInstallments.reduce((s, i) => s + (Number(i.amount) || 0), 0))}`}
            </button>
          </div>
        </div>
      )}

      {/* Payment plans */}
      {plans.length > 0 && (
        <div
          className="overflow-hidden rounded-lg border"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
        >
          <div className="border-b px-[18px] py-3.5" style={{ borderColor: "var(--helm-border)" }}>
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
              Payment plans
            </div>
          </div>
          {plans.map((plan) => (
            <div key={plan.id} className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12.5px] font-medium" style={{ color: "var(--text-base)" }}>
                  {money(Number(plan.totalAmount))} total · {plan.status}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                  {plan.installments.filter((i) => i.paid).length}/{plan.installments.length} paid
                </span>
              </div>
              <div className="space-y-1.5">
                {plan.installments.map((inst) => (
                  <div
                    key={inst.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2"
                    style={{
                      borderColor: inst.paid ? alpha("#14eba3", 0.3) : "var(--helm-border)",
                      background: inst.paid ? alpha("#14eba3", 0.06) : "var(--surface-2)",
                    }}
                  >
                    <button
                      onClick={() =>
                        installmentMut.mutate({ planId: plan.id, installmentId: inst.id, paid: !inst.paid })
                      }
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                      style={{
                        borderColor: inst.paid ? "#14eba3" : "var(--helm-border)",
                        background: inst.paid ? "#14eba3" : "transparent",
                        color: "white",
                      }}
                    >
                      {inst.paid && <Check className="h-3 w-3" />}
                    </button>
                    <span className="flex-1 text-[12px]" style={{ color: "var(--text-base)" }}>
                      {new Date(inst.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="font-mono text-[12.5px] font-semibold" style={{ color: inst.paid ? "#14eba3" : "var(--text-base)" }}>
                      {money(Number(inst.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promises history */}
      {promises.length > 0 && (
        <div
          className="overflow-hidden rounded-lg border"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
        >
          <div className="border-b px-[18px] py-3.5" style={{ borderColor: "var(--helm-border)" }}>
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
              Promise-to-pay history
            </div>
          </div>
          {promises.map((p) => {
            const statusColor =
              p.status === "kept" ? "#14eba3" : p.status === "broken" ? "#eb143f" : p.status === "open" ? "#f59f0a" : "#6b7280";
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b px-[18px] py-3 last:border-0"
                style={{ borderColor: "var(--helm-border)" }}
              >
                <div className="flex-1">
                  <div className="text-[12.5px] font-medium" style={{ color: "var(--text-base)" }}>
                    {money(Number(p.amount))} by{" "}
                    {new Date(p.promisedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {p.notes && (
                    <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                      {p.notes}
                    </div>
                  )}
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ color: statusColor, background: alpha(statusColor, 0.12) }}
                >
                  {p.status}
                </span>
                {p.status === "open" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updatePromiseMut.mutate({ promiseId: p.id, status: "kept" })}
                      className="rounded border px-2 py-0.5 text-[10.5px] font-semibold text-[#14eba3]"
                      style={{ borderColor: alpha("#14eba3", 0.3), background: alpha("#14eba3", 0.1) }}
                    >
                      Kept
                    </button>
                    <button
                      onClick={() => updatePromiseMut.mutate({ promiseId: p.id, status: "broken" })}
                      className="rounded border px-2 py-0.5 text-[10.5px] font-semibold text-[#eb143f]"
                      style={{ borderColor: alpha("#eb143f", 0.3), background: alpha("#eb143f", 0.08) }}
                    >
                      Broken
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Activity timeline */}
      <div className="rounded-lg border p-5" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
        <div className="mb-3.5 text-sm font-semibold" style={{ color: "var(--text-base)" }}>
          Activity timeline
        </div>
        {timelineItems.length > 0 ? (
          <ActivityTimeline items={timelineItems} />
        ) : (
          <div className="text-[12px]" style={{ color: "var(--text-muted-color)" }}>
            No activity logged yet. Use "Log activity" above to record contact.
          </div>
        )}
      </div>
    </>
  );
}
