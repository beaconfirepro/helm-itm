import * as React from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";

export interface ProjectSearchResult {
  id: string;
  projectName: string;
  hubspotProjectId: string;
  clientName: string | null;
  status: string | null;
  lienWorkflowType: string;
}

function searchProjects(q: string): Promise<{ results: ProjectSearchResult[] }> {
  return fetch(`/api/projects/search?q=${encodeURIComponent(q)}`, {
    credentials: "include",
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ results: ProjectSearchResult[] }>;
  });
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const debounced = useDebounced(query.trim(), 200);
  const enabled = debounced.length > 0;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["project-search", debounced],
    queryFn: () => searchProjects(debounced),
    enabled,
    retry: false,
    staleTime: 15_000,
  });

  const results = enabled ? data?.results ?? [] : [];

  React.useEffect(() => {
    setActive(0);
  }, [debounced]);

  // Close on outside click.
  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function close() {
    setOpen(false);
    setQuery("");
    onNavigate?.();
  }

  function goTo(result: ProjectSearchResult) {
    setLocation(`/projects/${result.id}`);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) {
      if (e.key === "ArrowDown" && results.length > 0) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = results[active];
      if (sel) goTo(sel);
    }
  }

  const showDropdown = open && enabled;

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: "var(--text-muted-color)" }}
      />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search projects…"
        className="w-full rounded-md border py-2 pl-9 pr-8 text-[13px] outline-none"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--helm-border)",
          color: "var(--text-base)",
        }}
      />
      {isFetching && enabled && (
        <Loader2
          className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin"
          style={{ color: "var(--text-muted-color)" }}
        />
      )}

      {showDropdown && (
        <div
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-lg border shadow-xl"
          style={{
            background: "var(--surface)",
            borderColor: "var(--helm-border)",
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {isError ? (
            <div className="px-3.5 py-3 text-[12.5px]" style={{ color: "#eb6b6b" }}>
              Search failed. Please try again.
            </div>
          ) : results.length === 0 ? (
            isFetching ? (
              <div className="px-3.5 py-3 text-[12.5px]" style={{ color: "var(--text-muted-color)" }}>
                Searching…
              </div>
            ) : (
              <div className="px-3.5 py-3 text-[12.5px]" style={{ color: "var(--text-muted-color)" }}>
                No projects match “{debounced}”.
              </div>
            )
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => goTo(r)}
                className="flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition-colors"
                style={{
                  background: i === active ? "var(--surface-3)" : "transparent",
                  borderBottom:
                    i < results.length - 1 ? "1px solid var(--helm-border)" : "none",
                }}
              >
                <span
                  className="truncate text-[13px] font-semibold"
                  style={{ color: "var(--text-base)" }}
                >
                  {r.projectName}
                </span>
                <span
                  className="truncate text-[11.5px]"
                  style={{ color: "var(--text-muted-color)" }}
                >
                  {[r.clientName, r.hubspotProjectId].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
