import { alpha } from "@/lib/utils";

interface TimelineItem {
  text: string;
  date: string;
  color: string;
}

export function ActivityTimeline({ items = [] }: { items: TimelineItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((t, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex shrink-0 flex-col items-center">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: t.color, boxShadow: `0 0 0 3px ${alpha(t.color, 0.16)}` }}
            />
            {i < items.length - 1 && <span className="mt-1 w-0.5 flex-1" style={{ background: "var(--helm-border)" }} />}
          </div>
          <div className="min-w-0 pb-4">
            <div className="text-[12.5px] leading-snug" style={{ color: "var(--text-base)" }}>{t.text}</div>
            <div className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--text-muted-color)" }}>{t.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
