/**
 * streams-view.tsx — Streams (filings) table for the unified Liens workspace.
 *
 * Lists every lien stream across all projects so a user can jump straight into
 * the per-stream Filing Workspace (/filing/:streamId). Registers the
 * "New Filing" (left) and "At Risk" (right) side panels.
 *
 * Previously this was the standalone /filing list page (filings.tsx).
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListPageLayout, ListTableState } from "@/components/ui/list-page";
import { Search, Plus, FileText } from "lucide-react";
import { money } from "@/lib/utils";

interface ScheduleOfValues {
  id: string;
  workStream: "construction" | "design" | string;
  status: string;
  openedAt: string | null;
}

interface Project {
  id: string;
  hubspotProjectId: string;
  cachedProjectName: string | null;
  county: string | null;
  lienWorkflowType: string;
  sovs: ScheduleOfValues[];
}

interface FilingRow {
  streamId: string;
  projectId: string;
  projectName: string;
  county: string | null;
  workStream: string;
  status: string;
  openedAt: string | null;
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

const WORKSTREAM_LABELS: Record<string, string> = {
  construction: "Construction",
  design: "Design",
};

function apiFetch<T>(path: string): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function StreamsView() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = React.useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => apiFetch<{ projects: Project[] }>("/projects?limit=200"),
    retry: false,
  });

  const { data: exposureData } = useQuery({
    queryKey: ["filing-exposure"],
    queryFn: () => apiFetch<{ exposure: ExposureRow[] }>("/waivers/exposure"),
  });

  const projects = data?.projects ?? [];

  const allFilings: FilingRow[] = projects.flatMap((p) =>
    p.sovs.map((s) => ({
      streamId: s.id,
      projectId: p.id,
      projectName: p.cachedProjectName ?? p.hubspotProjectId,
      county: p.county,
      workStream: s.workStream,
      status: s.status,
      openedAt: s.openedAt,
    })),
  );

  const filtered = allFilings.filter((f) => {
    if (search) {
      const q = search.toLowerCase();
      const name = f.projectName.toLowerCase();
      const county = (f.county ?? "").toLowerCase();
      if (!name.includes(q) && !county.includes(q)) return false;
    }
    return true;
  });

  const atRiskCount = allFilings.filter(
    (f) => f.status === "at_risk" || f.status === "filing" || f.status === "lapsed",
  ).length;
  const filedCount = allFilings.filter((f) => f.status === "filed").length;

  const statusSig = allFilings.map((f) => f.status).sort().join(",");

  // Upcoming compliance gaps: projects whose lien notices/documents are coming
  // due, due, or overdue (overdue months or unresolved net exposure).
  const compliance = (exposureData?.exposure ?? EMPTY_EXPOSURE)
    .filter((row) => row.overdueMonths > 0 || row.netExposure > 0)
    .sort((a, b) => b.overdueMonths - a.overdueMonths || b.netExposure - a.netExposure);

  // The "New Filing" / "New Affidavit" actions run inside a stream's filing
  // workspace, so route to the most urgent compliance gap (falling back to the
  // first filing) where those actions live.
  const startStreamId = compliance[0]?.streamId ?? allFilings[0]?.streamId ?? null;
  const complianceSig = compliance.map((r) => `${r.streamId}:${r.overdueMonths}:${r.netExposure}`).join(",");

  useLeftPanel(
    <Panel title="New Filing" accent="#f59e0b">
      <div className="flex flex-col">
        {/* Section 1 — New Filing actions */}
        <div className="flex flex-col gap-2 p-3">
          <button
            onClick={() => startStreamId && setLocation(`/filing/${startStreamId}`)}
            disabled={!startStreamId}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#f59e0b", color: "#1a1205" }}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            New Filing
          </button>
          <button
            onClick={() => startStreamId && setLocation(`/filing/${startStreamId}`)}
            disabled={!startStreamId}
            className="flex items-center gap-2 rounded-md border px-3 py-2.5 text-[12.5px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            New Affidavit
          </button>
        </div>

        {/* Section 2 — Upcoming Compliance */}
        <div className="border-t" style={{ borderColor: "var(--helm-border)" }}>
          <div
            className="px-4 pb-2 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted-color)" }}
          >
            Upcoming Compliance
          </div>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {compliance.length > 0 ? (
              compliance.map((row) => {
                const dot = row.overdueMonths > 0 ? "#eb143f" : "#f59e0b";
                const sub =
                  row.overdueMonths > 0
                    ? `${row.overdueMonths} overdue month${row.overdueMonths !== 1 ? "s" : ""}`
                    : `Net exposure ${money(row.netExposure)}`;
                return (
                  <button
                    key={row.streamId}
                    onClick={() => setLocation(`/filing/${row.streamId}`)}
                    className="cursor-pointer rounded-md border px-3 py-2 text-left transition-colors"
                    style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
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
                  </button>
                );
              })
            ) : (
              <div className="px-1 py-2 text-[11px]" style={{ color: "var(--text-muted-color)" }}>
                No compliance gaps flagged.
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>,
    [complianceSig, startStreamId],
  );

  useRightPanel(
    <Panel title="At Risk" accent="#eb143f" count={atRiskCount}>
      <div className="flex flex-col gap-2 p-3">
        {atRiskCount === 0 ? (
          <div className="text-[12px]" style={{ color: "var(--text-muted-color)" }}>
            No filings need urgent attention.
          </div>
        ) : (
          allFilings
            .filter((f) => f.status === "at_risk" || f.status === "filing" || f.status === "lapsed")
            .map((f) => (
              <button
                key={f.streamId}
                onClick={() => setLocation(`/filing/${f.streamId}`)}
                className="flex flex-col gap-1 rounded-md border px-3 py-2 text-left"
                style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
              >
                <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--text-base)" }}>
                  {f.projectName}
                </span>
                <StatusBadge status={f.status} />
              </button>
            ))
        )}
      </div>
    </Panel>,
    [statusSig],
  );

  const columns = [
    {
      key: "project",
      header: "Project / Client",
      render: (r: FilingRow) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            {r.projectName}
          </div>
          <div className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>
            {r.county ? `${r.county} Co.` : "—"}
          </div>
        </div>
      ),
    },
    {
      key: "workStream",
      header: "Work Stream",
      render: (r: FilingRow) => (
        <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>
          {WORKSTREAM_LABELS[r.workStream] ?? r.workStream}
        </span>
      ),
    },
    {
      key: "openedAt",
      header: "Opened",
      render: (r: FilingRow) => (
        <span className="font-mono text-[11.5px]" style={{ color: "var(--text-dim)" }}>
          {fmtDate(r.openedAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right" as const,
      render: (r: FilingRow) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <ListPageLayout
      kpis={[
        { label: "Total Filings", value: isLoading ? "—" : allFilings.length, color: "#a855f7" },
        { label: "At Risk", value: isLoading ? "—" : atRiskCount, color: atRiskCount > 0 ? "#eb143f" : "#14eba3" },
        { label: "Filed", value: isLoading ? "—" : filedCount, color: "#6366f1" },
      ]}
      filters={
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted-color)" }} />
          <input
            placeholder="Search project or county…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border py-2 pl-9 pr-3 text-[13px] outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
          />
        </div>
      }
    >
      <ListTableState
        isLoading={isLoading}
        isError={isError}
        isEmpty={filtered.length === 0}
        loadingText="Loading filings…"
        errorText={
          String((error as Error)?.message ?? "").includes("401")
            ? "Your session has expired — please refresh the page to sign in again."
            : `Failed to load: ${(error as Error)?.message}`
        }
        emptyText={
          allFilings.length === 0
            ? "No filings yet. Open a lien stream on a project to start a filing."
            : "No filings match the current filters."
        }
      >
        <ResponsiveTable
          columns={columns}
          rows={filtered}
          gridTemplate="1.6fr .8fr .8fr .9fr"
          onRowClick={(r: FilingRow) => setLocation(`/filing/${r.streamId}`)}
        />
      </ListTableState>
    </ListPageLayout>
  );
}
