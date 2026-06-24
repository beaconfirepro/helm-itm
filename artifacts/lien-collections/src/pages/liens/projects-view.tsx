/**
 * projects-view.tsx — Projects table for the unified Liens workspace.
 *
 * Lists every project (the portfolio) with its highest-risk stream status and
 * next deadline. Rows click through to the project detail page. Registers the
 * "Notices Needed" (left) and "Send Queue" (right) side panels.
 *
 * Previously this was the standalone /liens page (home.tsx).
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { QueueList } from "@/components/ui/queue-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DeadlineCountdown } from "@/components/ui/deadline-countdown";
import { ListPageLayout, ListTableState } from "@/components/ui/list-page";
import { Search, ChevronDown } from "lucide-react";

interface ScheduleOfValues {
  id: string;
  workStream: string;
  status: string;
}

interface QueueNotice {
  id: string;
  status: string;
  monthListed: string;
  project: { id: string; projectName: string } | null;
}

function fmtMonthListed(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface Project {
  id: string;
  hubspotProjectId: string;
  cachedProjectName: string | null;
  cachedHubspotStatus: string | null;
  lienWorkflowType: string;
  contractorTier: string;
  county: string | null;
  legalPropertyAddress: string | null;
  contractStartDate: string | null;
  completionChecklistComplete: boolean;
  sovs: ScheduleOfValues[];
}

function apiFetch<T>(path: string): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  });
}

const WORKFLOW_LABELS: Record<string, string> = {
  commercial_sub: "Commercial Sub",
  residential_sub: "Residential Sub",
  public_bond: "Public / Bond",
  none: "No Lien Tracking",
};

const RISK_ORDER = ["at_risk", "filing", "lapsed", "notice_active", "filed", "open", "released", "closed"];

function highestRisk(sovs: ScheduleOfValues[] | undefined): string {
  if (!sovs || !sovs.length) return "none";
  for (const r of RISK_ORDER) {
    if (sovs.some((s) => s.status === r)) return r;
  }
  return sovs[0]?.status ?? "none";
}

const DAYS_BY_STATUS: Record<string, number> = {
  lapsed: -45, filing: -10, at_risk: -3, notice_active: 14, filed: 30, open: 45,
};

export default function ProjectsView() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = React.useState("");
  const [filterWorkflow, setFilterWorkflow] = React.useState("all");
  const [sortBy, setSortBy] = React.useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  const [filterTier, setFilterTier] = React.useState<string | null>(null);
  const [statusFilterOpen, setStatusFilterOpen] = React.useState(false);
  const [tierFilterOpen, setTierFilterOpen] = React.useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<{ projects: Project[] }>("/projects"),
    retry: false,
  });

  const { data: queueData } = useQuery({
    queryKey: ["send-queue"],
    queryFn: () => apiFetch<{ notices: QueueNotice[] }>("/monthly/send-queue"),
    retry: false,
    staleTime: 30_000,
  });

  const queueNotices = queueData?.notices ?? [];
  const draftNotices = queueNotices.filter((n) => n.status === "draft");
  const readyNotices = queueNotices.filter((n) => n.status === "approved");
  const draftSig = draftNotices.map((n) => n.id).join(",");
  const readySig = readyNotices.map((n) => n.id).join(",");

  const projects = data?.projects ?? [];

  const filtered = projects.filter((p) => {
    const name = (p.cachedProjectName ?? p.hubspotProjectId).toLowerCase();
    const county = (p.county ?? "").toLowerCase();
    if (search && !name.includes(search.toLowerCase()) && !county.includes(search.toLowerCase())) return false;
    if (filterWorkflow !== "all" && p.lienWorkflowType !== filterWorkflow) return false;
    return true;
  });

  type ProjectRow = Project & { risk: string; days: number };

  const rows: ProjectRow[] = filtered.map((p) => ({
    ...p,
    risk: highestRisk(p.sovs),
    days: DAYS_BY_STATUS[highestRisk(p.sovs)] ?? 60,
  }));

  // Get unique statuses and tiers for filters
  const statusOptions = React.useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const statuses = new Set(rows.map((r) => r.risk).filter(Boolean));
    return Array.from(statuses).sort((a, b) => {
      const aIdx = RISK_ORDER.indexOf(a);
      const bIdx = RISK_ORDER.indexOf(b);
      return aIdx - bIdx;
    });
  }, [rows]);

  const tierOptions = ["first_tier", "second_tier"];

  // Apply column filters
  let filteredRows = rows.filter((r) => {
    if (filterStatus && r.risk !== filterStatus) return false;
    if (filterTier && r.contractorTier !== filterTier) return false;
    return true;
  });

  // Apply sorting
  if (sortBy) {
    const sortKey = sortBy.key;
    filteredRows = [...filteredRows].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortKey === "name") {
        aVal = (a.cachedProjectName ?? a.hubspotProjectId).toLowerCase();
        bVal = (b.cachedProjectName ?? b.hubspotProjectId).toLowerCase();
      } else if (sortKey === "tier") {
        aVal = a.contractorTier === "second_tier" ? 1 : 0;
        bVal = b.contractorTier === "second_tier" ? 1 : 0;
      } else if (sortKey === "sovs") {
        aVal = a.sovs.length;
        bVal = b.sovs.length;
      } else if (sortKey === "deadline") {
        aVal = a.days;
        bVal = b.days;
      } else if (sortKey === "status") {
        aVal = RISK_ORDER.indexOf(a.risk);
        bVal = RISK_ORDER.indexOf(b.risk);
      }

      if (aVal < bVal) return sortBy.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortBy.direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  const atRiskCount = projects.filter((p) => {
    const r = highestRisk(p.sovs);
    return r === "at_risk" || r === "filing" || r === "lapsed";
  }).length;
  const incompleteCount = projects.filter((p) => !p.completionChecklistComplete).length;

  useLeftPanel(
    <Panel title="Notices Needed" accent="#f59e0b" count={draftNotices.length}>
      <QueueList
        items={
          draftNotices.length > 0
            ? draftNotices.map((n) => ({
                id: n.id,
                title: n.project?.projectName ?? "Unknown project",
                sub: `Draft · ${fmtMonthListed(n.monthListed)}`,
                onClick: () => setLocation(`/send-queue?notice=${n.id}`),
              }))
            : [{ id: "empty", title: "Nothing to send", sub: "No draft notices" }]
        }
      />
    </Panel>,
    [draftSig],
  );

  useRightPanel(
    <Panel title="Send Queue" accent="#6366f1" count={readyNotices.length}>
      <QueueList
        items={
          readyNotices.length > 0
            ? readyNotices.map((n) => ({
                id: n.id,
                title: n.project?.projectName ?? "Unknown project",
                sub: `Approved · ${fmtMonthListed(n.monthListed)}`,
                action: "Send",
                actionTone: "#f59e0b",
                onClick: () => setLocation(`/send-queue?notice=${n.id}`),
              }))
            : [{ id: "empty", title: "Queue empty", sub: "Approve notices to send" }]
        }
      />
    </Panel>,
    [readySig],
  );

  const columns = [
    {
      key: "name",
      header: "Project / Client",
      sortable: true,
      render: (r: ProjectRow) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            {r.cachedProjectName ?? r.hubspotProjectId}
          </div>
          <div className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>
            {r.county ? `${r.county} Co.` : ""}
            {r.county && r.lienWorkflowType ? " · " : ""}
            {WORKFLOW_LABELS[r.lienWorkflowType] ?? r.lienWorkflowType}
          </div>
        </div>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      sortable: true,
      render: (r: ProjectRow) => (
        <span className="font-mono text-[11px]" style={{ color: "var(--text-dim)" }}>
          {r.contractorTier === "second_tier" ? "T2" : "T1"}
        </span>
      ),
    },
    {
      key: "sovs",
      header: "Schedules of Values",
      sortable: true,
      render: (r: ProjectRow) => (
        <span className="font-mono text-[11px]" style={{ color: "var(--text-dim)" }}>
          {r.sovs?.length ?? 0}
        </span>
      ),
    },
    {
      key: "deadline",
      header: "Next deadline",
      sortable: true,
      render: (r: ProjectRow) => (r.sovs?.length ?? 0) > 0
        ? <DeadlineCountdown days={r.days} />
        : <span className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>No schedules of values</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "right" as const,
      sortable: true,
      render: (r: ProjectRow) => r.risk === "none"
        ? <span className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>Healthy</span>
        : <StatusBadge status={r.risk} />,
    },
  ];

  const handleSort = (key: string) => {
    if (sortBy?.key === key) {
      setSortBy(sortBy.direction === "asc" ? { key, direction: "desc" } : null);
    } else {
      setSortBy({ key, direction: "asc" });
    }
  };

  return (
    <ListPageLayout
      kpis={[
        { label: "Total Projects", value: isLoading ? "—" : projects.length, color: "#6366f1" },
        { label: "At Risk", value: isLoading ? "—" : atRiskCount, color: atRiskCount > 0 ? "#eb143f" : "#14eba3" },
        { label: "Setup Incomplete", value: isLoading ? "—" : incompleteCount, color: incompleteCount > 0 ? "#f59f0a" : "#14eba3" },
      ]}
      filters={
        <>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted-color)" }} />
            <input
              placeholder="Search projects or county…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border py-2 pl-9 pr-3 text-[13px] outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
            />
          </div>
          <div className="flex gap-0.5 rounded-md border p-0.5" style={{ borderColor: "var(--helm-border)" }}>
            {[
              { v: "all", l: "All" },
              { v: "commercial_sub", l: "Commercial" },
              { v: "residential_sub", l: "Residential" },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setFilterWorkflow(v)}
                className="rounded px-2.5 py-1 text-[12px] font-semibold"
                style={filterWorkflow === v
                  ? { background: "var(--surface-3)", color: "var(--text-base)" }
                  : { color: "var(--text-dim)" }}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Status Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusFilterOpen(!statusFilterOpen)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-semibold"
              style={{
                borderColor: "var(--helm-border)",
                background: filterStatus ? "var(--surface-2)" : "transparent",
                color: filterStatus ? "#6366f1" : "var(--text-dim)",
              }}
            >
              Status {filterStatus && `(${filterStatus.replace(/_/g, " ")})`}
              <ChevronDown className="h-4 w-4" />
            </button>
            {statusFilterOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-40 rounded-md border shadow-lg z-10"
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setFilterStatus(null);
                    setStatusFilterOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-[12px] text-left hover:opacity-80"
                  style={{
                    color: filterStatus === null ? "#6366f1" : "var(--text-base)",
                    background: filterStatus === null ? "var(--surface-2)" : "",
                  }}
                >
                  All Status
                </button>
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setFilterStatus(status);
                      setStatusFilterOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-[12px] text-left hover:opacity-80"
                    style={{
                      color: filterStatus === status ? "#6366f1" : "var(--text-base)",
                      background: filterStatus === status ? "var(--surface-2)" : "",
                    }}
                  >
                    {status === "none" ? "Healthy" : status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tier Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setTierFilterOpen(!tierFilterOpen)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-semibold"
              style={{
                borderColor: "var(--helm-border)",
                background: filterTier ? "var(--surface-2)" : "transparent",
                color: filterTier ? "#6366f1" : "var(--text-dim)",
              }}
            >
              Tier {filterTier && `(${filterTier === "second_tier" ? "T2" : "T1"})`}
              <ChevronDown className="h-4 w-4" />
            </button>
            {tierFilterOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-32 rounded-md border shadow-lg z-10"
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setFilterTier(null);
                    setTierFilterOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-[12px] text-left hover:opacity-80"
                  style={{
                    color: filterTier === null ? "#6366f1" : "var(--text-base)",
                    background: filterTier === null ? "var(--surface-2)" : "",
                  }}
                >
                  All Tiers
                </button>
                {tierOptions.map((tier) => (
                  <button
                    key={tier}
                    onClick={() => {
                      setFilterTier(tier);
                      setTierFilterOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-[12px] text-left hover:opacity-80"
                    style={{
                      color: filterTier === tier ? "#6366f1" : "var(--text-base)",
                      background: filterTier === tier ? "var(--surface-2)" : "",
                    }}
                  >
                    {tier === "second_tier" ? "T2" : "T1"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      }
    >
      <ListTableState
        isLoading={isLoading}
        isError={isError}
        isEmpty={filteredRows.length === 0}
        loadingText="Loading projects…"
        errorText={
          String((error as Error)?.message ?? "").includes("401")
            ? "Your session has expired — please refresh the page to sign in again."
            : `Failed to load: ${(error as Error)?.message}`
        }
        emptyText={
          projects.length === 0 ? "No projects yet. Create one to get started." : "No projects match the current filters."
        }
      >
        <ResponsiveTable
          columns={columns}
          rows={filteredRows}
          gridTemplate="1.5fr .4fr .4fr .8fr .9fr"
          onRowClick={(r: ProjectRow) => {
            window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/projects/${r.id}`;
          }}
          sortBy={sortBy}
          onSort={handleSort}
        />
      </ListTableState>
    </ListPageLayout>
  );
}
