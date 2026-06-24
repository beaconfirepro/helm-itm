import { alpha } from "@/lib/utils";

interface QueueItem {
  id: string;
  title: string;
  sub?: string;
  badge?: string;
  badgeTone?: string;
  action?: string;
  actionTone?: string;
  active?: boolean;
  onClick?: () => void;
}

interface QueueListProps {
  items?: QueueItem[];
  onAction?: (item: QueueItem) => void;
}

export function QueueList({ items = [], onAction }: QueueListProps) {
  if (!items.length) {
    return (
      <div className="px-3 py-6 text-center text-xs italic" style={{ color: "var(--text-muted-color)" }}>
        Queue is clear.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {items.map((q) => (
        <div
          key={q.id}
          onClick={q.onClick}
          className={`rounded-lg border p-3 transition-colors${q.onClick ? " cursor-pointer" : ""}`}
          style={{
            background: q.active ? "var(--surface-3)" : "var(--surface-2)",
            borderColor: q.active ? "var(--helm-accent)" : "var(--helm-border)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-[12.5px] font-semibold leading-tight" style={{ color: "var(--text-base)" }}>{q.title}</div>
            {q.badge && (
              q.badgeTone ? (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide"
                  style={{ color: q.badgeTone, background: alpha(q.badgeTone, 0.15) }}
                >
                  {q.badge}
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "var(--text-muted-color)" }}>{q.badge}</span>
              )
            )}
          </div>
          {q.sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted-color)" }}>{q.sub}</div>}
          {q.action && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction?.(q); }}
              className="mt-2 w-full rounded-md border px-2 py-1.5 text-[11.5px] font-semibold transition-opacity hover:opacity-80"
              style={{
                color: q.actionTone ?? "#f59e0b",
                background: alpha(q.actionTone ?? "#f59e0b", 0.14),
                borderColor: alpha(q.actionTone ?? "#f59e0b", 0.3),
              }}
            >
              {q.action}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
