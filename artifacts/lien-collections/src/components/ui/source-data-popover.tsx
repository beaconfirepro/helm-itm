import { useState } from "react";
import { Info } from "lucide-react";

interface SourceDataPopoverProps {
  data?: Record<string, unknown>;
}

export function SourceDataPopover({ data = {} }: SourceDataPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-text-muted hover:text-text-dim transition-colors"
        title="Show source data"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-5 z-20 w-60 rounded-lg border p-3 shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>Computed from</div>
            <div className="flex flex-col gap-1.5">
              {Object.entries(data).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[11.5px]">
                  <span style={{ color: "var(--text-dim)" }}>{k}</span>
                  <span className="font-mono text-right break-all" style={{ color: "var(--text-base)" }}>
                    {Array.isArray(v) ? v.join(", ") : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
