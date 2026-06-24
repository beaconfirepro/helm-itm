/**
 * home.tsx — Unified "Liens" workspace.
 *
 * Route: /liens (and /liens?view=streams)
 *
 * A single portfolio workspace with a toggle between two views over the same
 * underlying data:
 *   - Projects — the project portfolio (rows → project detail).
 *   - Streams  — the lien streams / filings (rows → filing workspace).
 *
 * The active view is derived from the `view` query param so it is bookmarkable
 * and so the legacy /filing list route can redirect here with the Stream view
 * active. Each view registers its own side panels via useLeftPanel/useRightPanel
 * and swaps them as the toggle changes.
 */

import * as React from "react";
import { useLocation, useSearch } from "wouter";
import { Landmark, Gavel } from "lucide-react";
import ProjectsView from "@/pages/liens/projects-view";
import StreamsView from "@/pages/liens/streams-view";

type View = "projects" | "streams";

const TABS: { v: View; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: "projects", label: "Projects", Icon: Landmark },
  { v: "streams", label: "Streams", Icon: Gavel },
];

export default function LiensWorkspace() {
  const search = useSearch();
  const [, setLocation] = useLocation();

  const view: View = new URLSearchParams(search).get("view") === "streams" ? "streams" : "projects";

  const selectView = (v: View) =>
    setLocation(v === "streams" ? "/liens?view=streams" : "/liens");

  return (
    <>
      {/* View toggle */}
      <div
        className="inline-flex w-fit gap-0.5 rounded-md border p-0.5"
        style={{ borderColor: "var(--helm-border)", background: "var(--surface)" }}
      >
        {TABS.map(({ v, label, Icon }) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => selectView(v)}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={active
                ? { background: "var(--surface-3)", color: "var(--text-base)" }
                : { color: "var(--text-dim)" }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>

      {view === "projects" ? <ProjectsView /> : <StreamsView />}
    </>
  );
}
