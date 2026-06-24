import { AlertTriangle, Clock } from "lucide-react";
import { alpha } from "@/lib/utils";

export function DeadlineCountdown({ days }: { days: number }) {
  let color: string, text: string, overdue: boolean;
  if (days < 0) {
    color = "#eb143f";
    text = `Overdue ${-days}d`;
    overdue = true;
  } else if (days <= 7) {
    color = "#f59f0a";
    text = `Due ${days}d`;
    overdue = false;
  } else if (days <= 30) {
    color = "#6366f1";
    text = `${days}d left`;
    overdue = false;
  } else {
    color = "#8b90a0";
    text = `${days}d`;
    overdue = false;
  }
  const Icon = overdue ? AlertTriangle : Clock;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold"
      style={{ color, background: alpha(color, 0.13) }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.2} />
      {text}
    </span>
  );
}
