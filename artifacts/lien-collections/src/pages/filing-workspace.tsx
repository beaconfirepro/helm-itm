/**
 * FilingWorkspacePage — standalone per-stream Filing Workspace.
 *
 * Route: /filing/:streamId
 *
 * Reached by clicking a filing under the "Filings" menu item. Wraps the
 * FilingWorkspace execution UI with a workspace header that links back to the
 * parent project ("Link to Project").
 */

import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Screen } from "@/components/primitives/Screen";
import { WorkspaceHeader } from "@/components/nav/WorkspaceLayout";
import FilingWorkspace from "@/components/filing/FilingWorkspace";

interface StreamResponse {
  sov: {
    id: string;
    workStream: string;
    lienProjectId: string;
  } | null;
  project: {
    id: string;
    cachedProjectName: string | null;
  } | null;
}

function apiFetch<T>(path: string): Promise<T> {
  return fetch(`/api${path}`, { credentials: "include" }).then((r) => r.json());
}

export default function FilingWorkspacePage() {
  const { streamId } = useParams<{ streamId: string }>();
  const [, setLocation] = useLocation();

  const { data } = useQuery({
    queryKey: ["filing-stream", streamId],
    queryFn: () => apiFetch<StreamResponse>(`/filing/stream/${streamId}`),
    enabled: !!streamId,
  });

  const projectId = data?.sov?.lienProjectId ?? data?.project?.id ?? null;
  const projectName = data?.project?.cachedProjectName ?? null;
  const workStream = data?.sov?.workStream ?? null;

  return (
    <Screen className="pt-0 md:pt-0">
      <div className="flex flex-col gap-4">
        <WorkspaceHeader
          title="Filing Workspace"
          subtitle={
            (projectName || workStream) && (
              <span className="flex items-center gap-2 flex-wrap">
                {projectName && <span>{projectName}</span>}
                {workStream && (
                  <span className="capitalize" style={{ color: "var(--text-muted-color)" }}>
                    {workStream.replace(/_/g, " ")} stream
                  </span>
                )}
              </span>
            )
          }
          right={
            projectId && (
              <button
                type="button"
                onClick={() => setLocation(`/projects/${projectId}`)}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:opacity-80"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--helm-border)",
                  color: "var(--text-dim)",
                }}
              >
                <Building2 className="h-3.5 w-3.5" />
                Link to Project
              </button>
            )
          }
        />

        {streamId && <FilingWorkspace key={streamId} streamId={streamId} />}
      </div>
    </Screen>
  );
}
