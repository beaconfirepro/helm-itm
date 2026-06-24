import { Activity, AlertTriangle, CheckCircle2, Clock, Lock, Pencil, Send } from "lucide-react";
import { alpha } from "@/lib/utils";

interface StatusMeta {
  label: string;
  color: string;
  Icon: React.ElementType;
}

const META: Record<string, StatusMeta> = {
  "at-risk":    { label: "At Risk",        color: "#f59f0a", Icon: Clock },
  at_risk:      { label: "At Risk",        color: "#f59f0a", Icon: Clock },
  overdue:      { label: "Overdue",        color: "#eb143f", Icon: AlertTriangle },
  lapsed:       { label: "Rights Lapsed",  color: "#eb143f", Icon: AlertTriangle },
  cleared:      { label: "Cleared",        color: "#14eba3", Icon: CheckCircle2 },
  paid:         { label: "Paid",           color: "#14eba3", Icon: CheckCircle2 },
  released:     { label: "Released",       color: "#14eba3", Icon: CheckCircle2 },
  active:       { label: "Active",         color: "#6366f1", Icon: Activity },
  notice_active:{ label: "Notice Active",  color: "#6366f1", Icon: Activity },
  open:         { label: "Open",           color: "#6366f1", Icon: Activity },
  filed:        { label: "Filed",          color: "#a855f7", Icon: Activity },
  filing:       { label: "Filing",         color: "#eb143f", Icon: AlertTriangle },
  draft:        { label: "Draft",          color: "#8b90a0", Icon: Pencil },
  approved:     { label: "Approved",       color: "#14eba3", Icon: CheckCircle2 },
  sent:         { label: "Sent",           color: "#6366f1", Icon: Send },
  delivered:    { label: "Delivered",      color: "#14eba3", Icon: CheckCircle2 },
  pending:      { label: "Pending",        color: "#f59f0a", Icon: Clock },
  blocked:      { label: "Blocked",        color: "#eb143f", Icon: Lock },
  closed:       { label: "Closed",         color: "#8b90a0", Icon: CheckCircle2 },
};

export function StatusBadge({ status }: { status: string }) {
  const m: StatusMeta = META[status] ?? { label: status || "—", color: "#8b90a0", Icon: Activity };
  const { Icon } = m;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-[10.5px] font-bold tracking-wide"
      style={{ color: m.color, background: alpha(m.color, 0.14) }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.4} />
      {m.label}
    </span>
  );
}
