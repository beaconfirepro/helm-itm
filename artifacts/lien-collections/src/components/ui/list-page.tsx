/**
 * list-page.tsx — Shared index/list-page layout primitives.
 *
 * Every table screen in the app repeats the same structure: a row of KPI cards,
 * a search/filter bar, and a table area that swaps between loading / error /
 * empty / data states. These helpers centralize that structure so the index
 * pages (Projects, Streams, …) share one consistent shell.
 */

import * as React from "react";

export interface ListKpi {
  label: string;
  value: React.ReactNode;
  color: string;
  /** Optional caption rendered under the value (e.g. "unpaid vendor bills"). */
  sub?: React.ReactNode;
}

/**
 * ListPageLayout — KPI cards + optional filter bar + content slot.
 * The content slot is typically a <ListTableState> wrapping a ResponsiveTable.
 *
 * `kpis` is optional: pages that lead with their own header widget (e.g.
 * Collections' AR-aging panel) or have no summary cards can omit it and the
 * KPI grid is skipped entirely, leaving just the filter bar + content shell.
 */
export function ListPageLayout({
  kpis,
  filters,
  children,
}: {
  kpis?: ListKpi[];
  filters?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Summary KPIs */}
      {kpis != null && kpis.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="relative overflow-hidden rounded-lg border px-4 pb-3.5 pt-4"
              style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
            >
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: k.color }} />
              <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
                {k.label}
              </div>
              <div className="mt-1.5 font-mono text-[24px] font-bold leading-none" style={{ color: k.color }}>
                {k.value}
              </div>
              {k.sub != null && (
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--text-dim)" }}>
                  {k.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {filters != null && <div className="flex flex-wrap items-center gap-2">{filters}</div>}

      {children}
    </>
  );
}

/**
 * ListTableState — renders the loading / error / empty placeholder for a list,
 * or its children (the table) once data is present.
 */
export function ListTableState({
  isLoading,
  isError,
  isEmpty,
  loadingText,
  errorText,
  emptyText,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  loadingText: string;
  errorText: React.ReactNode;
  emptyText: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div
        className="rounded-lg border px-4 py-8 text-center text-[12px]"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}
      >
        {loadingText}
      </div>
    );
  }
  if (isError) {
    return (
      <div
        className="rounded-lg border px-4 py-6 text-center text-[12px]"
        style={{ background: "rgba(235,20,63,.06)", borderColor: "rgba(235,20,63,.3)", color: "#eb143f" }}
      >
        {errorText}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div
        className="rounded-lg border px-4 py-8 text-center text-[12px]"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}
      >
        {emptyText}
      </div>
    );
  }
  return <>{children}</>;
}
