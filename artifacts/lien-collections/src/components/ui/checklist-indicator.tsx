import { Check, X } from "lucide-react";
import { alpha } from "@/lib/utils";

interface ChecklistItem {
  label: string;
  ok: boolean;
}

export function ChecklistIndicator({ items = [] }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.ok).length;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Lien checklist</div>
        <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>{done}/{items.length}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((c, i) => {
          const color = c.ok ? "#14eba3" : "#eb143f";
          const Icon = c.ok ? Check : X;
          return (
            <div key={i} className="flex items-center gap-2.5">
              <span
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                style={{ background: alpha(color, c.ok ? 0.16 : 0.14), color }}
              >
                <Icon className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="text-[12.5px]" style={{ color: c.ok ? "var(--text-base)" : "var(--text-muted-color)" }}>
                {c.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
