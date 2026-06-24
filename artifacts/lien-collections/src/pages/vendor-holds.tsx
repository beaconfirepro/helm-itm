import * as React from "react";
import { Lock, Unlock, Plus, X } from "lucide-react";
import { Panel, useRightPanel, useLeftPanel } from "@/components/nav/AppShell";
import { QueueList } from "@/components/ui/queue-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListPageLayout } from "@/components/ui/list-page";
import { money, alpha } from "@/lib/utils";

const VENDOR_BILLS = [
  { id: "b1", vendor: "Ferguson Fire & Fabrication", item: "Pipe & fittings — ESFR mains", project: "Harbor Logistics — Bay 3", client: "Harbor Logistics LLC", amount: 18400, due: "Jun 30", status: "open" as const, clientOverdue: true, clientLabel: "Client overdue 96d" },
  { id: "b2", vendor: "Victaulic", item: "Couplings & valves", project: "Harbor Logistics — Bay 3", client: "Harbor Logistics LLC", amount: 9250, due: "Jul 5", status: "open" as const, clientOverdue: true, clientLabel: "Client overdue 96d" },
  { id: "b3", vendor: "Viking Supply", item: "Sprinkler heads", project: "Grandview Hotel", client: "Grandview Hospitality", amount: 12800, due: "Jun 28", status: "hold" as const, clientOverdue: true, clientLabel: "Client overdue 124d" },
  { id: "b4", vendor: "Core & Main", item: "Underground tie-in", project: "Northgate Medical — Wing C", client: "Northgate Health System", amount: 22100, due: "Jul 10", status: "open" as const, clientOverdue: false, clientLabel: "Client current" },
  { id: "b5", vendor: "Potter Electric", item: "Alarm devices", project: "Lincoln Elementary", client: "Austin ISD", amount: 6400, due: "Jul 2", status: "open" as const, clientOverdue: false, clientLabel: "Bonded — current" },
  { id: "b6", vendor: "Ferguson Fire & Fabrication", item: "Hangers & trim", project: "Cedar Ridge Apartments", client: "Cedar Ridge Partners", amount: 14200, due: "Jun 25", status: "paid" as const, clientOverdue: false, clientLabel: "Client paid" },
  { id: "b7", vendor: "Victaulic", item: "Riser assemblies", project: "Lone Star Mall", client: "Lone Star Mall Partners", amount: 19900, due: "Jun 20", status: "open" as const, clientOverdue: true, clientLabel: "Rights lapsed 156d" },
];

type BillStatus = "open" | "hold" | "paid";
type Bill = typeof VENDOR_BILLS[number] & { status: BillStatus };

const billStatusMap: Record<BillStatus, string> = { open: "active", hold: "pending", paid: "paid" };

export default function VendorHoldsPage() {
  const [bills, setBills] = React.useState<Bill[]>(VENDOR_BILLS as Bill[]);
  const [filter, setFilter] = React.useState("all");
  const [vendor, setVendor] = React.useState<string | null>(null);

  const toggleHold = (id: string) =>
    setBills((bs) => bs.map((b) => b.id === id ? { ...b, status: (b.status === "hold" ? "open" : "hold") as BillStatus } : b));

  let shown = bills;
  if (filter === "recommended") shown = shown.filter((b) => b.status === "open" && b.clientOverdue);
  else if (filter === "open") shown = shown.filter((b) => b.status === "open");
  else if (filter === "hold") shown = shown.filter((b) => b.status === "hold");
  if (vendor) shown = shown.filter((b) => b.vendor === vendor);

  const openSum = bills.filter((b) => b.status === "open").reduce((x, b) => x + b.amount, 0);
  const holdSum = bills.filter((b) => b.status === "hold").reduce((x, b) => x + b.amount, 0);
  const recCount = bills.filter((b) => b.status === "open" && b.clientOverdue).length;

  const vendMap: Record<string, { vendor: string; count: number; total: number }> = {};
  bills.filter((b) => b.status === "open" || b.status === "hold").forEach((b) => {
    if (!vendMap[b.vendor]) vendMap[b.vendor] = { vendor: b.vendor, count: 0, total: 0 };
    vendMap[b.vendor].count++;
    vendMap[b.vendor].total += b.amount;
  });
  const vendors = Object.values(vendMap).sort((a, b) => b.total - a.total);

  useRightPanel(
    <Panel title="Unpaid by vendor" accent="#f59f0a" count={vendors.length}>
      <div className="flex flex-col gap-2 p-3">
        {vendors.map((v) => (
          <button
            key={v.vendor}
            onClick={() => setVendor((cur) => cur === v.vendor ? null : v.vendor)}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left w-full"
            style={vendor === v.vendor
              ? { background: alpha("#f59f0a", 0.12), borderColor: alpha("#f59f0a", 0.4) }
              : { background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold" style={{ color: "var(--text-base)" }}>{v.vendor}</div>
              <div className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>{v.count} open bills</div>
            </div>
            <span className="shrink-0 font-mono text-[12.5px] font-semibold text-[#eb143f]">{money(v.total)}</span>
          </button>
        ))}
        <div className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--text-muted-color)" }}>Tap a vendor to filter.</div>
      </div>
    </Panel>,
    [vendor, vendors.length],
  );

  const openCount = bills.filter((b) => b.status === "open").length;
  const holdCount = bills.filter((b) => b.status === "hold").length;

  useLeftPanel(
    <Panel title="Bill Filters">
      <div className="flex flex-col gap-1 p-3">
        {[
          { key: "all", label: "All bills", count: bills.length },
          { key: "recommended", label: "Hold advised", count: recCount },
          { key: "open", label: "Open", count: openCount },
          { key: "hold", label: "On hold", count: holdCount },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors"
            style={
              filter === f.key
                ? { background: alpha("#f59f0a", 0.12), borderColor: alpha("#f59f0a", 0.4) }
                : { background: "var(--surface-2)", borderColor: "var(--helm-border)" }
            }
          >
            <span className="text-[12.5px] font-medium" style={{ color: "var(--text-base)" }}>{f.label}</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--text-muted-color)" }}>{f.count}</span>
          </button>
        ))}
      </div>
    </Panel>,
    [filter, bills],
  );

  return (
    <ListPageLayout
      kpis={[
        { label: "Open A/P", value: money(openSum), sub: "unpaid vendor bills", color: "#6366f1" },
        { label: "On Hold", value: money(holdSum), sub: "payment withheld", color: "#f59f0a" },
        { label: "Recommended", value: recCount, sub: "client overdue — hold advised", color: "#eb143f" },
      ]}
    >
      <div className="overflow-hidden rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}>
          <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>Open vendor bills</div>
          <div className="flex items-center gap-2">
            {vendor && (
              <button
                onClick={() => setVendor(null)}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-semibold"
                style={{ color: "#f59f0a", background: alpha("#f59f0a", 0.14), borderColor: alpha("#f59f0a", 0.4) }}
              >
                {vendor}<X className="h-3 w-3" />
              </button>
            )}
            <div className="flex gap-0.5 rounded-md border p-0.5" style={{ borderColor: "var(--helm-border)" }}>
              {(["all", "recommended", "open", "hold"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="rounded px-2.5 py-1 text-[12px] font-semibold capitalize"
                  style={filter === f ? { background: "var(--surface-3)", color: "var(--text-base)" } : { color: "var(--text-dim)" }}
                >
                  {f === "all" ? "All bills" : f}
                </button>
              ))}
            </div>
          </div>
        </div>
        {shown.map((b) => {
          const rec = b.status === "open" && b.clientOverdue;
          const held = b.status === "hold";
          return (
            <div
              key={b.id}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
              style={{ borderColor: "var(--helm-border)", borderLeft: `3px solid ${rec ? "#eb143f" : "transparent"}` }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>{b.vendor}</span>
                  {rec && (
                    <span className="shrink-0 rounded-sm px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-[#eb143f]" style={{ background: alpha("#eb143f", 0.14) }}>HOLD ADVISED</span>
                  )}
                </div>
                <div className="truncate text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>{b.item} · {b.project} · due {b.due}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] font-semibold" style={{ color: b.clientOverdue ? "#eb143f" : "#14eba3" }}>{b.clientLabel}</div>
                <StatusBadge status={billStatusMap[b.status]} />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>{money(b.amount)}</span>
              {b.status === "paid" ? (
                <span className="w-[104px] shrink-0 text-center text-[12px] font-semibold" style={{ color: "var(--text-muted-color)" }}>Paid</span>
              ) : (
                <button
                  onClick={() => toggleHold(b.id)}
                  className="flex w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold"
                  style={held
                    ? { color: "#14eba3", background: alpha("#14eba3", 0.14), borderColor: alpha("#14eba3", 0.3) }
                    : { color: "#f59f0a", background: alpha("#f59f0a", 0.14), borderColor: alpha("#f59f0a", 0.35) }}
                >
                  {held ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {held ? "Release" : "Place hold"}
                </button>
              )}
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted-color)" }}>No vendor bills match this filter.</div>
        )}
      </div>
    </ListPageLayout>
  );
}
