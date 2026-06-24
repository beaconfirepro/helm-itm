import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Phone, Plus, Check, X, Filter, MessageSquare } from "lucide-react";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { QueueList } from "@/components/ui/queue-list";
import { AgingBuckets } from "@/components/ui/aging-buckets";
import { ListPageLayout, ListTableState } from "@/components/ui/list-page";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { money, alpha } from "@/lib/utils";

function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include", ...opts }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<T>;
  });
}

interface CollectionAccount {
  id: string;
  linkedClientId: string | null;
  status: string;
  escalationStage: string;
  totalOverdue: string;
  oldestOverdueDays: number;
  riskScore: number | null;
  cachedName: string | null;
  cachedEmail: string | null;
  hasOpenPromise: boolean;
  currentDunningStepId: string | null;
}

interface AgingData {
  buckets: { current: number; d1_30: number; d31_60: number; d61_90: number; d91plus: number };
  totalOverdue: number;
  invoiceCount: number;
  overdueCount: number;
}

interface VendorHold {
  id: string;
  holdType: "schedule_hold" | "material_hold";
  linkedClientId: string | null;
  clientName: string | null;
  supplierBillRef: string | null;
  supplierBillAmount: string | null;
  reason: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  none: "Current / Monitoring",
  soft_collections: "Soft Collections",
  pre_lien_notice: "Pre-Lien Notice",
  lien_filing: "Lien Filing",
  agency_attorney: "Agency / Attorney",
  write_off: "Write-Off",
};

const STAGE_COLOR: Record<string, string> = {
  none: "#14eba3",
  soft_collections: "#6366f1",
  pre_lien_notice: "#f59f0a",
  lien_filing: "#f97316",
  agency_attorney: "#eb143f",
  write_off: "#6b7280",
};

const STAGE_ORDER = [
  "lien_filing",
  "agency_attorney",
  "pre_lien_notice",
  "soft_collections",
  "none",
  "write_off",
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "current", label: "Current" },
  { value: "overdue", label: "Overdue" },
  { value: "in_collections", label: "In Collections" },
  { value: "promised", label: "Promised" },
  { value: "payment_plan", label: "Payment Plan" },
  { value: "escalated", label: "Escalated" },
  { value: "written_off", label: "Written Off" },
];

const STAGE_OPTIONS = [
  { value: "", label: "All stages" },
  { value: "none", label: "Monitoring" },
  { value: "soft_collections", label: "Soft Collections" },
  { value: "pre_lien_notice", label: "Pre-Lien Notice" },
  { value: "lien_filing", label: "Lien Filing" },
  { value: "agency_attorney", label: "Agency / Attorney" },
  { value: "write_off", label: "Write-Off" },
];

const riskColor = (r: number | null) => {
  if (r == null) return "#6b7280";
  return r >= 75 ? "#eb143f" : r >= 45 ? "#f59f0a" : "#14eba3";
};

export default function CollectionsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [callIds, setCallIds] = React.useState<string[]>([]);
  const [closed, setClosed] = React.useState<Record<string, boolean>>({});
  const [search, setSearch] = React.useState("");
  const [filterStatuses, setFilterStatuses] = React.useState<string[]>([]);
  const [filterStages, setFilterStages] = React.useState<string[]>([]);
  const [sortKey, setSortKey] = React.useState<"risk" | "overdue" | "oldest" | "name" | "stage">("risk");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [selectedHoldClientId, setSelectedHoldClientId] = React.useState<string>("");

  // Log Contact modal state
  const [logContactModal, setLogContactModal] = React.useState<{ accountId: string; accountName: string } | null>(null);
  const [logMethod, setLogMethod] = React.useState("phone");
  const [logDate, setLogDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [logNotes, setLogNotes] = React.useState("");

  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ["collections/accounts"],
    queryFn: () => apiFetch<{ accounts: CollectionAccount[] }>("/collections/accounts"),
    retry: false,
  });

  const { data: agingData } = useQuery({
    queryKey: ["collections/aging"],
    queryFn: () => apiFetch<AgingData>("/collections/aging"),
    retry: false,
  });

  const { data: holdsData } = useQuery({
    queryKey: ["holds"],
    queryFn: () => apiFetch<{ holds: VendorHold[] }>("/holds"),
    retry: false,
  });

  const logActivityMut = useMutation({
    mutationFn: ({ accountId, method, activityDate, notes }: { accountId: string; method: string; activityDate?: string; notes?: string }) =>
      apiFetch(`/collections/accounts/${accountId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          activityDate: activityDate ?? new Date().toISOString().slice(0, 10),
          notes,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections/accounts"] });
      setLogContactModal(null);
      setLogNotes("");
    },
  });

  const promiseMut = useMutation({
    mutationFn: ({ accountId }: { accountId: string }) =>
      apiFetch(`/collections/accounts/${accountId}/promise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 0,
          promisedDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          notes: "Quick promise — update details on account page",
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collections/accounts"] }),
  });

  const advanceMut = useMutation({
    mutationFn: ({ accountId }: { accountId: string }) =>
      apiFetch(`/collections/accounts/${accountId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collections/accounts"] }),
  });

  const allAccounts = accountsData?.accounts ?? [];
  const activeHolds = holdsData?.holds ?? [];
  const aging = agingData?.buckets;

  // Apply filters
  const accounts = allAccounts.filter((a) => {
    const name = (a.cachedName ?? a.id).toLowerCase();
    const status = (a.status ?? "").toLowerCase();
    const stageLabel = (STAGE_LABELS[a.escalationStage] ?? a.escalationStage ?? "").toLowerCase();
    const q = search.trim().toLowerCase();
    if (q && !name.includes(q) && !status.includes(q) && !stageLabel.includes(q)) return false;
    if (filterStatuses.length > 0 && !filterStatuses.includes(a.status)) return false;
    if (filterStages.length > 0 && !filterStages.includes(a.escalationStage)) return false;
    return true;
  });

  const sortedAccounts = React.useMemo(() => {
    const sorted = [...accounts].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;

      if (sortKey === "risk") {
        av = a.riskScore ?? -1;
        bv = b.riskScore ?? -1;
      } else if (sortKey === "overdue") {
        av = Number(a.totalOverdue ?? 0);
        bv = Number(b.totalOverdue ?? 0);
      } else if (sortKey === "oldest") {
        av = a.oldestOverdueDays ?? 0;
        bv = b.oldestOverdueDays ?? 0;
      } else if (sortKey === "name") {
        av = (a.cachedName ?? a.id).toLowerCase();
        bv = (b.cachedName ?? b.id).toLowerCase();
      } else if (sortKey === "stage") {
        av = STAGE_ORDER.indexOf(a.escalationStage);
        bv = STAGE_ORDER.indexOf(b.escalationStage);
      }

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [accounts, sortKey, sortDir]);

  const agingValues = aging
    ? [aging.current, aging.d1_30, aging.d31_60, aging.d61_90, aging.d91plus]
    : [0, 0, 0, 0, 0];
  const agingTotal = agingValues.reduce((a, b) => a + b, 0);

  const toggleSection = (k: string) => setClosed((c) => ({ ...c, [k]: !c[k] }));
  const toggleCall = (id: string) =>
    setCallIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const callAccts = allAccounts
    .filter((a) => callIds.includes(a.id))
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));

  const lienNoticeClients = allAccounts
    .filter((a) => (a.escalationStage === "pre_lien_notice" || a.escalationStage === "lien_filing") && a.oldestOverdueDays > 0)
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));

  const recommendedHolds = activeHolds
    .filter((h) => {
      const reason = (h.reason ?? "").toLowerCase();
      const nonPaymentDriven = reason.includes("past-due") || reason.includes("overdue") || reason.includes("withheld");
      const tiedToNoticeClient = h.linkedClientId
        ? lienNoticeClients.some((c) => c.linkedClientId === h.linkedClientId)
        : false;
      return nonPaymentDriven || tiedToNoticeClient;
    })
    .filter((h) => (selectedHoldClientId ? h.linkedClientId === selectedHoldClientId : true))
    .sort((a, b) => Number(b.supplierBillAmount ?? 0) - Number(a.supplierBillAmount ?? 0));

  const callSig = callAccts.map((a) => a.id).join(",");
  const lienNoticeSig = lienNoticeClients.map((a) => a.id).join(",");
  const holdSig = recommendedHolds.map((h) => h.id).join(",");

  const activeFilterCount = filterStatuses.length + filterStages.length + (search.trim() ? 1 : 0);

  const tableColumns = [
    {
      key: "account",
      header: "Account",
      sortable: false,
      render: (a: CollectionAccount) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            {a.cachedName ?? a.id}
          </div>
          <div className="truncate text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>
            {a.hasOpenPromise ? "Promise on file" : "No active promise"}
          </div>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      sortable: false,
      render: (a: CollectionAccount) => {
        const c = STAGE_COLOR[a.escalationStage] ?? "#6b7280";
        return (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: c, background: alpha(c, 0.14) }}
          >
            {STAGE_LABELS[a.escalationStage] ?? a.escalationStage}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      sortable: false,
      render: (a: CollectionAccount) => (
        <span className="text-[12px] capitalize" style={{ color: "var(--text-dim)" }}>
          {a.status.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "oldest",
      header: "Oldest",
      align: "right" as const,
      sortable: false,
      render: (a: CollectionAccount) => (
        <span className="font-mono text-[12px]" style={{ color: a.oldestOverdueDays > 60 ? "#eb143f" : "var(--text-dim)" }}>
          {a.oldestOverdueDays}d
        </span>
      ),
    },
    {
      key: "risk",
      header: "Risk #",
      align: "center" as const,
      sortable: false,
      render: (a: CollectionAccount) => <RiskPill risk={a.riskScore} />,
    },
    {
      key: "overdue",
      header: "Overdue",
      align: "right" as const,
      sortable: false,
      render: (a: CollectionAccount) => (
        <span className="font-mono text-[12.5px] font-semibold" style={{ color: "#eb143f" }}>
          {money(Number(a.totalOverdue))}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right" as const,
      sortable: false,
      render: (a: CollectionAccount) => {
        const on = callIds.includes(a.id);
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLogContactModal({ accountId: a.id, accountName: a.cachedName ?? a.id });
                setLogMethod("phone");
                setLogDate(new Date().toISOString().slice(0, 10));
              }}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
              style={{ color: "#14eba3", background: alpha("#14eba3", 0.1), borderColor: alpha("#14eba3", 0.25) }}
              title="Log contact"
            >
              <MessageSquare className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                promiseMut.mutate({ accountId: a.id });
              }}
              disabled={a.hasOpenPromise}
              className="flex items-center rounded-md border px-2 py-1 text-[11px] disabled:opacity-40"
              style={{ color: "#6366f1", background: alpha("#6366f1", 0.1), borderColor: alpha("#6366f1", 0.25) }}
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                advanceMut.mutate({ accountId: a.id });
              }}
              disabled={a.hasOpenPromise}
              className="flex items-center rounded-md border px-2 py-1 text-[11px] disabled:opacity-40"
              style={{ color: "#f59f0a", background: alpha("#f59f0a", 0.1), borderColor: alpha("#f59f0a", 0.25) }}
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCall(a.id);
              }}
              className="flex items-center rounded-md border px-2 py-1 text-[11px]"
              style={
                on
                  ? { color: "#14eba3", background: alpha("#14eba3", 0.14), borderColor: alpha("#14eba3", 0.3) }
                  : { color: "var(--text-base)", background: "var(--surface-2)", borderColor: "var(--helm-border)" }
              }
            >
              {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </button>
          </div>
        );
      },
    },
  ];

  useRightPanel(
    <Panel title="Call Queue" accent="#eb143f" count={callAccts.length}>
      <QueueList
        items={callAccts.slice(0, 4).map((a) => ({
          id: a.id,
          title: a.cachedName ?? a.id,
          sub: `${money(Number(a.totalOverdue))} overdue · ${a.oldestOverdueDays}d oldest`,
          badge: a.riskScore != null ? String(a.riskScore) : "—",
          badgeTone: riskColor(a.riskScore),
          action: "Log contact",
          actionTone: "#6366f1",
        }))}
        onAction={(item) => {
          setLogContactModal({ accountId: item.id, accountName: item.title });
          setLogMethod("phone");
          setLogDate(new Date().toISOString().slice(0, 10));
          setLogNotes("");
        }}
      />
    </Panel>,
    [callSig],
  );

  useLeftPanel(
    <Panel title="Lien Notices & Holds">
      <div className="flex flex-col gap-3 p-3">
        <div className="rounded-md border p-2.5" style={{ borderColor: "var(--helm-border)", background: "var(--surface-2)" }}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
            Clients Receiving Lien Notices
          </div>
          <div className="flex flex-col gap-1.5">
            {lienNoticeClients.length === 0 ? (
              <div className="rounded-md border px-2.5 py-2 text-[11px]" style={{ borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}>
                No clients currently in pre-lien or filing stage.
              </div>
            ) : (
              lienNoticeClients.slice(0, 8).map((client) => {
                const clientId = client.linkedClientId ?? "";
                const active = selectedHoldClientId === clientId;
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedHoldClientId((cur) => (cur === clientId ? "" : clientId))}
                    className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left"
                    style={
                      active
                        ? { background: alpha("#f59f0a", 0.12), borderColor: alpha("#f59f0a", 0.45) }
                        : { background: "var(--surface)", borderColor: "var(--helm-border)" }
                    }
                    title="Filter recommended hold bills for this client"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: "var(--text-base)" }}>
                      {client.cachedName ?? client.id}
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: "#eb143f" }}>
                      {money(Number(client.totalOverdue))}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-md border p-2.5" style={{ borderColor: "var(--helm-border)", background: "var(--surface-2)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
              Recommended Vendor Bills To Hold
            </div>
            <button
              onClick={() => navigate("/holds")}
              className="text-[11px] font-semibold"
              style={{ color: "#f59f0a" }}
            >
              Open Holds
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {recommendedHolds.length === 0 ? (
              <div className="rounded-md border px-2.5 py-2 text-[11px]" style={{ borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}>
                No hold recommendations based on current non-payment signals.
              </div>
            ) : (
              recommendedHolds.slice(0, 8).map((hold) => (
                <div
                  key={hold.id}
                  className="rounded-md border px-2.5 py-2"
                  style={{ background: "var(--surface)", borderColor: alpha("#f59f0a", 0.35) }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold" style={{ color: "var(--text-base)" }}>
                      {hold.clientName ?? "Unknown client"}
                    </span>
                    <span className="font-mono text-[11.5px] font-semibold" style={{ color: "#eb143f" }}>
                      {money(Number(hold.supplierBillAmount ?? 0))}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-dim)" }}>
                    Bill {hold.supplierBillRef ?? "N/A"} · {hold.holdType === "material_hold" ? "Material hold" : "Schedule hold"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {selectedHoldClientId && (
          <button
            onClick={() => setSelectedHoldClientId("")}
            className="text-[11px]"
            style={{ color: "var(--text-muted-color)" }}
          >
            Clear client hold filter
          </button>
        )}
      </div>
    </Panel>,
    [lienNoticeSig, holdSig, selectedHoldClientId],
  );

  return (
    <>
      {/* AR Aging */}
      <Section
        open={!closed["__aging"]}
        onToggle={() => toggleSection("__aging")}
        header={
          <>
            <span className="flex-1 text-[14.5px] font-semibold" style={{ color: "var(--text-base)" }}>
              Accounts Receivable Aging
            </span>
            <span className="font-mono text-[14px] font-semibold text-[#eb143f]">
              {money(agingTotal)}
            </span>
          </>
        }
      >
        <div className="p-[18px]">
          <AgingBuckets values={agingValues} variant="columns" />
        </div>
      </Section>

      {/* Filter controls */}
      <ListPageLayout
        filters={
          <>
            <Filter className="h-4 w-4 shrink-0" style={{ color: "var(--text-dim)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, status, stage..."
              className="min-w-[220px] rounded-md border px-3 py-1.5 text-[12.5px]"
              style={{ background: "var(--surface)", borderColor: search ? "#6366f1" : "var(--helm-border)", color: "var(--text-base)" }}
            />
            <MultiSelectFilter
              label="Status"
              options={STATUS_OPTIONS.filter((o) => o.value !== "")}
              selected={filterStatuses}
              onToggle={(v) =>
                setFilterStatuses((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))
              }
            />
            <MultiSelectFilter
              label="Stage"
              options={STAGE_OPTIONS.filter((o) => o.value !== "")}
              selected={filterStages}
              onToggle={(v) =>
                setFilterStages((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))
              }
              getColor={(v) => STAGE_COLOR[v]}
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as "risk" | "overdue" | "oldest" | "name" | "stage")}
              className="rounded-md border px-3 py-1.5 text-[12.5px]"
              style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            >
              <option value="risk">Sort: Risk</option>
              <option value="overdue">Sort: Overdue</option>
              <option value="oldest">Sort: Oldest Days</option>
              <option value="name">Sort: Name</option>
              <option value="stage">Sort: Stage</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded-md border px-2.5 py-1.5 text-[12px]"
              style={{ borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            >
              {sortDir === "asc" ? "Asc" : "Desc"}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setSearch(""); setFilterStatuses([]); setFilterStages([]); }}
                className="text-[12px]"
                style={{ color: "var(--text-dim)" }}
              >
                Clear ({activeFilterCount})
              </button>
            )}
            <span className="ml-auto text-[12px]" style={{ color: "var(--text-muted-color)" }}>
              {sortedAccounts.length} account{sortedAccounts.length !== 1 ? "s" : ""}
            </span>
            {/* Active filter pills */}
            {(filterStatuses.length > 0 || filterStages.length > 0) && (
              <>
                {filterStatuses.map((v) => {
                  const label = STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
                  return (
                    <button
                      key={`status-${v}`}
                      onClick={() => setFilterStatuses((s) => s.filter((x) => x !== v))}
                      className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: alpha("#6366f1", 0.12), borderColor: alpha("#6366f1", 0.3), color: "#6366f1" }}
                    >
                      {label}
                      <X className="h-2.5 w-2.5" />
                    </button>
                  );
                })}
                {filterStages.map((v) => {
                  const label = STAGE_LABELS[v] ?? v;
                  const c = STAGE_COLOR[v] ?? "#6b7280";
                  return (
                    <button
                      key={`stage-${v}`}
                      onClick={() => setFilterStages((s) => s.filter((x) => x !== v))}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: alpha(c, 0.12), borderColor: alpha(c, 0.3), color: c }}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
                      {label}
                      <X className="h-2.5 w-2.5" />
                    </button>
                  );
                })}
              </>
            )}
          </>
        }
      >

      {/* Call list */}
      <Section
        open={!closed["__call"]}
        onToggle={() => toggleSection("__call")}
        header={
          <>
            <Phone className="h-[17px] w-[17px] shrink-0 text-[#14eba3]" />
            <div className="flex-1">
              <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                Call list
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>
                Ranked by risk
              </div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold text-[#14eba3]"
              style={{ background: alpha("#14eba3", 0.14) }}
            >
              {callAccts.length}
            </span>
            <span className="font-mono text-[12.5px] font-semibold text-[#eb143f]">
              {money(callAccts.reduce((x, a) => x + Number(a.totalOverdue), 0))}
            </span>
          </>
        }
      >
        {callAccts.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs leading-relaxed" style={{ color: "var(--text-muted-color)" }}>
            Add accounts to the call list below.
          </div>
        ) : (
          callAccts.map((a) => (
            <div
              key={a.id}
              className="flex cursor-pointer items-center gap-3 border-b px-[18px] py-3 last:border-0"
              style={{ borderColor: "var(--helm-border)" }}
              onClick={() => navigate(`/collections/${a.id}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                  {a.cachedName ?? a.id}
                </div>
                <div className="truncate text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>
                  {STAGE_LABELS[a.escalationStage] ?? a.escalationStage} · {a.oldestOverdueDays}d oldest
                </div>
              </div>
              <RiskPill risk={a.riskScore} />
              <span className="w-[74px] shrink-0 text-right font-mono text-[13.5px] font-semibold text-[#eb143f]">
                {money(Number(a.totalOverdue))}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLogContactModal({ accountId: a.id, accountName: a.cachedName ?? a.id });
                  setLogMethod("phone");
                  setLogDate(new Date().toISOString().slice(0, 10));
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold text-[#14eba3]"
                style={{ background: alpha("#14eba3", 0.14), borderColor: alpha("#14eba3", 0.3) }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Log contact
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCall(a.id);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                style={{ borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </Section>

      {/* Escalation stage buckets */}
      <ListTableState
        isLoading={loadingAccounts}
        isError={false}
        isEmpty={false}
        loadingText="Loading accounts…"
        errorText="Failed to load accounts."
        emptyText={
          activeFilterCount > 0
            ? "No accounts match the current filters."
            : "No collection accounts found."
        }
      >
      <ResponsiveTable
        columns={tableColumns}
        rows={sortedAccounts}
        gridTemplate="1.55fr 1.05fr .8fr .55fr .55fr .8fr 1.1fr"
        onRowClick={(a: CollectionAccount) => navigate(`/collections/${a.id}`)}
      />
      {!loadingAccounts && sortedAccounts.length === 0 && (
        <div
          className="mt-2 rounded-lg border px-4 py-3 text-center text-[12px]"
          style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}
        >
          {activeFilterCount > 0
            ? "No accounts match the current filters."
            : "No collection accounts found."}
        </div>
      )}
      </ListTableState>
      </ListPageLayout>

      {/* Log Contact Modal */}
      <Dialog
        open={!!logContactModal}
        onOpenChange={(o) => { if (!o) { setLogContactModal(null); setLogNotes(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Contact</DialogTitle>
            <DialogDescription>
              Record a contact activity for{" "}
              <span className="font-semibold" style={{ color: "var(--text-base)" }}>
                {logContactModal?.accountName}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Method */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold" style={{ color: "var(--text-dim)" }}>
                Contact Method
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "phone", label: "Phone" },
                  { value: "email", label: "Email" },
                  { value: "sms", label: "SMS" },
                  { value: "letter", label: "Letter" },
                  { value: "portal", label: "Portal" },
                  { value: "in_person", label: "In Person" },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setLogMethod(m.value)}
                    className="rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors"
                    style={
                      logMethod === m.value
                        ? { background: alpha("#6366f1", 0.15), borderColor: "#6366f1", color: "#6366f1" }
                        : { background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold" style={{ color: "var(--text-dim)" }}>
                Date
              </label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-[12.5px]"
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
              />
            </div>
            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold" style={{ color: "var(--text-dim)" }}>
                Notes
              </label>
              <textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="Add notes about this contact attempt..."
                rows={3}
                className="resize-none rounded-md border px-3 py-2 text-[12.5px] leading-relaxed"
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => { setLogContactModal(null); setLogNotes(""); }}
              className="rounded-md border px-4 py-2 text-[12.5px] font-semibold"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={logActivityMut.isPending}
              onClick={() => {
                if (!logContactModal) return;
                logActivityMut.mutate({
                  accountId: logContactModal.accountId,
                  method: logMethod,
                  activityDate: logDate || undefined,
                  notes: logNotes.trim() || undefined,
                });
              }}
              className="rounded-md px-4 py-2 text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "#6366f1", color: "white" }}
            >
              {logActivityMut.isPending ? "Saving…" : "Save contact"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  open,
  onToggle,
  header,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 border-b px-4 py-3 text-left"
        style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          style={{ color: "var(--text-dim)" }}
        />
        {header}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function RiskPill({ risk }: { risk: number | null }) {
  const c = riskColor(risk);
  return (
    <div className="flex shrink-0 items-center justify-center gap-1">
      <span className="font-mono text-[9.5px]" style={{ color: "var(--text-muted-color)" }}>
        RISK
      </span>
      <span
        className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-bold"
        style={{ color: c, background: alpha(c, 0.15) }}
      >
        {risk ?? "—"}
      </span>
    </div>
  );
}

function StageFilterRow({
  label,
  color,
  count,
  total,
  active,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  total?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors"
      style={
        active
          ? { background: alpha(color, 0.14), borderColor: alpha(color, 0.4) }
          : { background: "var(--surface-2)", borderColor: "var(--helm-border)" }
      }
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: "var(--text-base)" }}>
        {label}
      </span>
      <span className="font-mono text-[11px]" style={{ color: "var(--text-muted-color)" }}>
        {count}
      </span>
      {total != null && total > 0 && (
        <span className="font-mono text-[11.5px] font-semibold" style={{ color: "#eb143f" }}>
          {money(total)}
        </span>
      )}
    </button>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  getColor,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  getColor?: (value: string) => string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px]"
        style={{
          background: "var(--surface)",
          borderColor: selected.length > 0 ? "#6366f1" : "var(--helm-border)",
          color: "var(--text-base)",
        }}
      >
        {label}
        {selected.length > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold"
            style={{ background: "#6366f1", color: "white" }}
          >
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3" style={{ color: "var(--text-dim)" }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border p-1.5 shadow-lg"
            style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
          >
            {options.map((option) => {
              const checked = selected.includes(option.value);
              const color = getColor?.(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { onToggle(option.value); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-left transition-colors"
                  style={{
                    background: checked ? "var(--surface-2)" : "transparent",
                    color: "var(--text-base)",
                  }}
                  onMouseEnter={(e) => !checked && (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => !checked && (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border"
                    style={{
                      background: checked ? "#6366f1" : "transparent",
                      borderColor: checked ? "#6366f1" : "var(--helm-border)",
                    }}
                  >
                    {checked && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  {color && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  )}
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}
