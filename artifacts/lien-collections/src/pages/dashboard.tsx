import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { QueueList } from "@/components/ui/queue-list";
import { AgingBuckets } from "@/components/ui/aging-buckets";
import { DeadlineCountdown } from "@/components/ui/deadline-countdown";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLeftPanel, useRightPanel } from "@/components/nav/AppShell";
import { money } from "@/lib/utils";

interface Project {
  id: string;
  cachedProjectName: string | null;
  hubspotProjectId: string;
  lienWorkflowType: string;
  contractorTier: string;
  sovs: { id: string; workStream: string; status: string }[];
  completionChecklistComplete: boolean;
  nextDeadline: {
    id: string;
    adjustedDate: string;
    lienScheduleOfValuesId: string;
  } | null;
}

interface AgingData {
  buckets: {
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d91plus: number;
  };
  totalOverdue: number;
  invoiceCount: number;
  overdueCount: number;
}

interface CollectionAccount {
  id: string;
  status: string;
  escalationStage: string;
  totalOverdue: string;
  oldestOverdueDays: number;
  riskScore: number | null;
  cachedName: string | null;
}

function apiFetch<T>(path: string): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include" }).then((r) => r.json());
}

const RISK_ORDER = [
  "at_risk",
  "filing",
  "lapsed",
  "notice_active",
  "filed",
  "open",
];
function highestRisk(sovs: Project["sovs"]) {
  for (const s of RISK_ORDER) {
    if (sovs.some((st) => st.status === s)) return s;
  }
  return sovs[0]?.status ?? "open";
}

function daysUntil(dateStr: string): number {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffMs = startOfDay(new Date(dateStr)) - startOfDay(new Date());
  return Math.round(diffMs / 86_400_000);
}

export default function DashboardPage() {
  const blankPanel = React.useMemo(() => <div className="min-h-[220px] p-4" />, []);
  useLeftPanel(blankPanel, [blankPanel]);
  useRightPanel(blankPanel, [blankPanel]);

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<{ projects: Project[] }>("/projects"),
    retry: false,
  });

  const { data: agingData } = useQuery({
    queryKey: ["collections/aging"],
    queryFn: () => apiFetch<AgingData>("/collections/aging"),
    retry: false,
  });

  const { data: accountsData } = useQuery({
    queryKey: ["collections/accounts"],
    queryFn: () =>
      apiFetch<{ accounts: CollectionAccount[]; activeHoldsCount: number }>(
        "/collections/accounts",
      ),
    retry: false,
  });

  const projects = projectsData?.projects ?? [];
  const aging = agingData?.buckets;
  const accounts = accountsData?.accounts ?? [];
  const activeHoldsCount = accountsData?.activeHoldsCount ?? 0;

  const atRisk = projects.filter((p) => {
    const r = highestRisk(p.sovs);
    return r === "at_risk" || r === "filing" || r === "lapsed";
  });
  const incompleteCount = projects.filter(
    (p) => !p.completionChecklistComplete,
  ).length;
  const totalStreams = projects.reduce((a, p) => a + p.sovs.length, 0);
  const lapsed = projects.filter((p) =>
    p.sovs.some((s) => s.status === "lapsed"),
  ).length;

  const totalOverdue = agingData?.totalOverdue ?? 0;
  const inCollections = accounts.filter(
    (a) => a.status === "in_collections",
  ).length;
  const highRisk = accounts.filter((a) => (a.riskScore ?? 0) >= 75).length;

  const agingValues = aging
    ? [aging.current, aging.d1_30, aging.d31_60, aging.d61_90, aging.d91plus]
    : [0, 0, 0, 0, 0];
  const agingTotal = agingValues.reduce((a, b) => a + b, 0);

  const kpis = [
    {
      label: "Active Streams",
      value: totalStreams,
      sub: `across ${projects.length} projects`,
      color: "#6366f1",
    },
    {
      label: "At Risk · This Month",
      value: atRisk.length,
      sub: "notice or filing due",
      color: "#f59f0a",
    },
    {
      label: "Rights Lapsed",
      value: lapsed,
      sub: lapsed > 0 ? "requires escalation" : "none lapsed",
      color: lapsed > 0 ? "#eb143f" : "#14eba3",
    },
    {
      label: "In Collections",
      value: inCollections,
      sub: inCollections > 0 ? "active escalations" : "all current",
      color: inCollections > 0 ? "#eb143f" : "#14eba3",
    },
    {
      label: "AR Overdue",
      value: money(totalOverdue),
      sub: `${agingData?.overdueCount ?? 0} invoices`,
      color: totalOverdue > 0 ? "#eb143f" : "#14eba3",
    },
    {
      label: "Active Holds",
      value: activeHoldsCount,
      sub: activeHoldsCount > 0 ? "vendor holds open" : "no holds",
      color: activeHoldsCount > 0 ? "#f59f0a" : "#14eba3",
    },
  ];

  const deadlineRows = projects
    .filter((p) => p.sovs.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.cachedProjectName ?? p.hubspotProjectId,
      status: highestRisk(p.sovs),
      days: p.nextDeadline ? daysUntil(p.nextDeadline.adjustedDate) : null,
    }))
    .sort((a, b) => {
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    })
    .slice(0, 5);

  const topAccounts = [...accounts]
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 4);

  return (
    <>
      {/* Dashboard grid: stats + content left, Due This Month + extra right */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 xl:items-start">
        {/* LEFT column: stats, Liens snapshot, AR aging */}
        <div className="flex flex-col gap-3 xl:col-span-2">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className="relative overflow-hidden rounded-lg border px-4 pb-3.5 pt-4"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--helm-border)",
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: k.color }}
                />
                <div
                  className="truncate text-[10.5px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted-color)" }}
                >
                  {k.label}
                </div>
                <div
                  className="mt-1.5 font-mono text-[26px] font-bold leading-none"
                  style={{ color: k.color }}
                >
                  {k.value}
                </div>
                <div
                  className="mt-0.5 text-[11.5px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  {k.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Liens snapshot + AR aging */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Liens snapshot */}
            <div
              className="overflow-hidden rounded-lg border"
              style={{
                background: "var(--surface)",
                borderColor: "var(--helm-border)",
              }}
            >
              <div
                className="flex items-center justify-between border-b px-[18px] py-3.5"
                style={{ borderColor: "var(--helm-border)" }}
              >
                <div
                  className="text-[14.5px] font-semibold"
                  style={{ color: "var(--text-base)" }}
                >
                  Liens snapshot
                </div>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  active projects
                </span>
              </div>
              {deadlineRows.length === 0 ? (
                <div
                  className="px-[18px] py-6 text-[12px]"
                  style={{ color: "var(--text-muted-color)" }}
                >
                  No projects yet.
                </div>
              ) : (
                deadlineRows.map((d) => (
                  <Link key={d.id} href={`/projects/${d.id}`}>
                    <div
                      className="flex w-full cursor-pointer items-center gap-3 border-b px-[18px] py-3 text-left last:border-0 hover:bg-[var(--surface-2)]"
                      style={{ borderColor: "var(--helm-border)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-[13px] font-medium"
                          style={{ color: "var(--text-base)" }}
                        >
                          {d.name}
                        </div>
                        <div
                          className="mt-0.5 text-[11.5px]"
                          style={{ color: "var(--text-muted-color)" }}
                        >
                          {d.days === null
                            ? "No upcoming deadline"
                            : "Next statutory deadline"}
                        </div>
                      </div>
                      {d.days !== null && <DeadlineCountdown days={d.days} />}
                      <StatusBadge status={d.status} />
                      <ChevronRight
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--text-muted-color)" }}
                      />
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* AR aging + Collections pipeline */}
            <div
              className="rounded-lg border p-[18px]"
              style={{
                background: "var(--surface)",
                borderColor: "var(--helm-border)",
              }}
            >
              <div className="mb-3.5 flex items-center justify-between">
                <div
                  className="text-[14.5px] font-semibold"
                  style={{ color: "var(--text-base)" }}
                >
                  AR aging
                </div>
                <span className="font-mono text-[13px] font-semibold text-[#eb143f]">
                  {money(agingTotal)}
                </span>
              </div>
              <AgingBuckets values={agingValues} variant="bars" />

              {topAccounts.length > 0 && (
                <>
                  <div
                    className="mb-2 mt-[18px] text-[10.5px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-muted-color)" }}
                  >
                    Top accounts by risk
                  </div>
                  <div className="space-y-1.5">
                    {topAccounts.map((a) => {
                      const rc =
                        (a.riskScore ?? 0) >= 75
                          ? "#eb143f"
                          : (a.riskScore ?? 0) >= 45
                            ? "#f59f0a"
                            : "#14eba3";
                      return (
                        <Link key={a.id} href={`/collections/${a.id}`}>
                          <div
                            className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 hover:opacity-80"
                            style={{
                              background: "var(--surface-2)",
                              borderColor: "var(--helm-border)",
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-[12px] font-medium"
                                style={{ color: "var(--text-base)" }}
                              >
                                {a.cachedName ?? a.id}
                              </div>
                            </div>
                            <span
                              className="font-mono text-[10.5px] font-bold"
                              style={{ color: rc }}
                            >
                              {a.riskScore ?? "—"}
                            </span>
                            <span className="font-mono text-[12px] font-semibold text-[#eb143f]">
                              {money(Number(a.totalOverdue))}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Overdue pipeline by escalation stage */}
              <div
                className="mb-2 mt-[18px] text-[10.5px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted-color)" }}
              >
                Overdue pipeline by stage
              </div>
              {(() => {
                const STAGE_ORDER_DASH = [
                  "lien_filing",
                  "agency_attorney",
                  "pre_lien_notice",
                  "soft_collections",
                  "none",
                ] as const;
                const STAGE_LABEL_SHORT: Record<string, string> = {
                  none: "Monitoring",
                  soft_collections: "Soft",
                  pre_lien_notice: "Pre-Lien",
                  lien_filing: "Filing",
                  agency_attorney: "Agency",
                };
                const STAGE_CLR: Record<string, string> = {
                  none: "#14eba3",
                  soft_collections: "#6366f1",
                  pre_lien_notice: "#f59f0a",
                  lien_filing: "#f97316",
                  agency_attorney: "#eb143f",
                };
                const overdueAccounts = accounts.filter(
                  (a) => a.oldestOverdueDays > 0,
                );
                const hasAny = overdueAccounts.length > 0;
                if (!hasAny) {
                  return (
                    <div
                      className="text-[11.5px]"
                      style={{ color: "var(--text-muted-color)" }}
                    >
                      No overdue accounts.
                    </div>
                  );
                }
                return (
                  <div className="space-y-1.5">
                    {STAGE_ORDER_DASH.map((stage) => {
                      const group = overdueAccounts.filter(
                        (a) => a.escalationStage === stage,
                      );
                      if (!group.length) return null;
                      const total = group.reduce(
                        (s, a) => s + Number(a.totalOverdue),
                        0,
                      );
                      const color = STAGE_CLR[stage];
                      return (
                        <Link key={stage} href={`/collections?stage=${stage}`}>
                          <div
                            className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 hover:opacity-80"
                            style={{
                              background: "var(--surface-2)",
                              borderColor: "var(--helm-border)",
                            }}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: color }}
                            />
                            <span
                              className="flex-1 text-[12px] font-medium"
                              style={{ color: "var(--text-base)" }}
                            >
                              {STAGE_LABEL_SHORT[stage]}
                            </span>
                            <span
                              className="font-mono text-[11px]"
                              style={{ color: "var(--text-dim)" }}
                            >
                              {group.length}
                            </span>
                            <span
                              className="font-mono text-[12px] font-semibold"
                              style={{ color }}
                            >
                              {money(total)}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })()}
              <Link href="/collections">
                <div
                  className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 hover:opacity-80"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: "var(--helm-border)",
                  }}
                >
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    View full pipeline →
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: "var(--text-muted-color)" }}
                  />
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT column: Due This Month + extra card */}
        <div className="flex flex-col gap-3 xl:col-span-1">
          {/* Due This Month */}
          <div
            className="overflow-hidden rounded-lg border"
            style={{
              background: "var(--surface)",
              borderColor: "var(--helm-border)",
            }}
          >
            <div
              className="flex items-center justify-between border-b px-[18px] py-3.5"
              style={{ borderColor: "var(--helm-border)" }}
            >
              <div
                className="text-[14.5px] font-semibold"
                style={{ color: "var(--text-base)" }}
              >
                Due This Month
              </div>
              <span
                className="text-[11px]"
                style={{ color: "var(--text-dim)" }}
              >
                {atRisk.length} project{atRisk.length !== 1 ? "s" : ""} at risk
              </span>
            </div>
            {atRisk.length === 0 ? (
              <div
                className="px-[18px] py-6 text-[12px]"
                style={{ color: "var(--text-muted-color)" }}
              >
                Nothing due this month.
              </div>
            ) : (
              <QueueList
                items={atRisk.slice(0, 6).map((p, i) => ({
                  id: p.id,
                  title: p.cachedProjectName ?? p.hubspotProjectId,
                  sub: `${highestRisk(p.sovs).replace("_", " ")} · stream active`,
                  action: i === 0 ? "View project" : undefined,
                  actionTone: "#f59e0b",
                }))}
              />
            )}
          </div>

          {/* PRETEST_REQUIRED: Reserved dashboard card is unfinished; implement or hide before UX acceptance testing. */}
          {/* Placeholder card — reserved for future content */}
          <div
            className="flex min-h-[180px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-6 text-center"
            style={{
              borderColor: "var(--helm-border)",
              background: "var(--surface)",
            }}
          >
            <span
              className="text-[12.5px] font-medium"
              style={{ color: "var(--text-dim)" }}
            >
              Reserved space
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted-color)" }}
            >
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
