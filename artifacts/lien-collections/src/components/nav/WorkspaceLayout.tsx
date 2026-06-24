import * as React from "react";
import { ChevronLeft } from "lucide-react";

/**
 * WorkspaceLayout — shared "workspace" shell primitives used by the detail
 * screens (Account, Project) so they look consistent and no longer duplicate
 * the header / tab shell. Themed entirely with Helm CSS variables.
 */

export function WorkspaceHeader({
  back,
  title,
  subtitle,
  right,
}: {
  back?: { label: string; onClick: () => void };
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back && (
        <button
          onClick={back.onClick}
          className="flex items-center gap-1.5 self-start text-[12px]"
          style={{ color: "var(--text-dim)" }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {back.label}
        </button>
      )}
      <div
        className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
      >
        <div className="min-w-0">
          <div className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text-base)" }}>
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              {subtitle}
            </div>
          )}
        </div>
        {right && <div>{right}</div>}
      </div>
    </div>
  );
}

export interface WorkspaceTab {
  key: string;
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
}

export function WorkspaceTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: WorkspaceTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg border p-1"
      style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors"
            style={
              isActive
                ? { background: "var(--surface-3)", color: "var(--text-base)" }
                : { background: "transparent", color: "var(--text-dim)" }
            }
          >
            {t.Icon && <t.Icon className="h-4 w-4" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
