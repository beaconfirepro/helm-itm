import { money } from "@/lib/utils";

const LABELS = ["Current", "1–30", "31–60", "61–90", "90+"];
const BAR_COLORS = ["#14eba3", "#a3e635", "#f59f0a", "#f97316", "#eb143f"];

interface AgingBucketsProps {
  values?: number[];
  variant?: "bars" | "columns";
}

export function AgingBuckets({ values = [0, 0, 0, 0, 0], variant = "columns" }: AgingBucketsProps) {
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);

  if (variant === "bars") {
    return (
      <div className="flex flex-col gap-3">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-14 shrink-0 text-[11.5px]" style={{ color: "var(--text-dim)" }}>{LABELS[i]}</div>
            <div className="h-2.5 flex-1 overflow-hidden rounded-md" style={{ background: "var(--surface-3)" }}>
              <div className="h-full rounded-md transition-all" style={{ width: `${(v / max) * 100}%`, background: BAR_COLORS[i] }} />
            </div>
            <div className="w-16 shrink-0 text-right font-mono text-xs" style={{ color: BAR_COLORS[i] }}>
              {money(v)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {values.map((v, i) => (
        <div key={i} className="min-w-0 flex-1">
          <div className="mb-1.5 h-2 rounded" style={{ background: BAR_COLORS[i] }} />
          <div className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>{LABELS[i]}</div>
          <div className="mt-0.5 font-mono text-[12.5px]" style={{ color: "var(--text-base)" }}>{money(v)}</div>
        </div>
      ))}
      <span className="sr-only">Total {money(total)}</span>
    </div>
  );
}
