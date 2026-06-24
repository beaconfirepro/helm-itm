import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Gauge,
  Lock,
  RotateCcw,
  Save,
  Clock,
  PieChart,
  HandCoins,
  DollarSign,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Fetch helper (session cookie — no auth header needed for web)
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskBand {
  threshold: number;
  points: number;
  inclusive: boolean;
}

interface RiskScoreConfig {
  age: RiskBand[];
  ratio: RiskBand[];
  brokenPromises: RiskBand[];
  exposure: RiskBand[];
}

interface RiskConfigResponse {
  config: RiskScoreConfig;
  defaults: RiskScoreConfig;
  isDefault: boolean;
}

type FactorKey = keyof RiskScoreConfig;

const FACTOR_META: Record<
  FactorKey,
  {
    label: string;
    description: string;
    maxPoints: number;
    icon: React.ElementType;
    unit: "days" | "ratio" | "count" | "dollars";
    thresholdLabel: string;
  }
> = {
  age: {
    label: "Overdue Age",
    description: "Points by how long the oldest overdue invoice has been past due (~40% of the score).",
    maxPoints: 40,
    icon: Clock,
    unit: "days",
    thresholdLabel: "Days overdue",
  },
  ratio: {
    label: "Overdue-to-AR Ratio",
    description: "Points by the share of total receivables that is overdue (~30% of the score).",
    maxPoints: 30,
    icon: PieChart,
    unit: "ratio",
    thresholdLabel: "Ratio (0–1)",
  },
  brokenPromises: {
    label: "Broken Promises",
    description: "Points by how many promises to pay the client has broken (~20% of the score).",
    maxPoints: 20,
    icon: HandCoins,
    unit: "count",
    thresholdLabel: "Broken count",
  },
  exposure: {
    label: "Overdue Exposure",
    description: "Points by the total dollar amount overdue (~10% of the score).",
    maxPoints: 10,
    icon: DollarSign,
    unit: "dollars",
    thresholdLabel: "Amount ($)",
  },
};

const FACTOR_ORDER: FactorKey[] = ["age", "ratio", "brokenPromises", "exposure"];

function formatThreshold(value: number, unit: string): string {
  if (unit === "dollars") return `$${value.toLocaleString()}`;
  if (unit === "ratio") return value.toString();
  return value.toString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RiskScoringTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["config-risk-scoring"],
    queryFn: () => apiFetch<RiskConfigResponse>("/config/risk-scoring"),
    retry: false,
  });

  const [draft, setDraft] = React.useState<RiskScoreConfig | null>(null);

  // Sync the editable draft whenever the server config loads/changes.
  React.useEffect(() => {
    if (data?.config) setDraft(structuredClone(data.config));
  }, [data?.config]);

  const save = useMutation({
    mutationFn: (config: RiskScoreConfig) =>
      apiFetch<{ config: RiskScoreConfig }>("/config/risk-scoring", {
        method: "PUT",
        body: JSON.stringify({ config }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-risk-scoring"] });
      toast({
        title: "Risk scoring saved",
        description: "New collection risk scores will use these settings.",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: () =>
      apiFetch<RiskConfigResponse>("/config/risk-scoring", { method: "DELETE" }),
    onSuccess: (res) => {
      setDraft(structuredClone(res.config));
      qc.invalidateQueries({ queryKey: ["config-risk-scoring"] });
      toast({ title: "Reset to defaults", description: "Scoring restored to the system defaults." });
    },
    onError: (err: Error) =>
      toast({ title: "Could not reset", description: err.message, variant: "destructive" }),
  });

  function updateBand(
    factor: FactorKey,
    index: number,
    field: "threshold" | "points",
    value: number,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next[factor][index][field] = value;
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading risk scoring…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {(error as Error)?.message?.includes("401")
          ? "Your session has expired — please refresh the page to sign in again."
          : `Failed to load risk scoring: ${(error as Error)?.message}`}
      </div>
    );
  }

  if (!draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data?.config);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Gauge className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Risk Scoring</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Collection risk is scored 0–100 from four factors. Adjust the point bands below to match
            how your company weighs risk. Saved changes drive new risk calculations immediately.
          </p>
        </div>
        {data?.isDefault ? (
          <Badge variant="secondary" className="shrink-0">Using defaults</Badge>
        ) : (
          <Badge className="shrink-0">Customized</Badge>
        )}
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          <Lock className="h-4 w-4 shrink-0" />
          Only administrators can change risk scoring. You can view the current settings below.
        </div>
      )}

      <div className="grid gap-4">
        {FACTOR_ORDER.map((factor) => {
          const meta = FACTOR_META[factor];
          const bands = draft[factor];
          const Icon = meta.icon;
          return (
            <Card key={factor}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{meta.label}</CardTitle>
                  <Badge variant="outline" className="ml-auto text-[11px]">
                    max {meta.maxPoints} pts
                  </Badge>
                </div>
                <CardDescription className="text-xs">{meta.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="w-8" />
                    <span>{meta.thresholdLabel}</span>
                    <span className="w-20 text-right">Points</span>
                    <span className="w-10" />
                  </div>
                  {bands.map((band, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3"
                    >
                      <span className="inline-flex h-7 w-8 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                        {band.inclusive ? "≥" : ">"}
                      </span>
                      <Input
                        type="number"
                        className="h-8 text-sm"
                        value={band.threshold}
                        step={meta.unit === "ratio" ? 0.05 : 1}
                        min={0}
                        max={meta.unit === "ratio" ? 1 : undefined}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          updateBand(factor, idx, "threshold", Number(e.target.value))
                        }
                      />
                      <div className="flex w-20 items-center gap-1">
                        <Input
                          type="number"
                          className="h-8 text-sm text-right"
                          value={band.points}
                          step={1}
                          min={0}
                          max={100}
                          disabled={!isAdmin}
                          onChange={(e) =>
                            updateBand(factor, idx, "points", Number(e.target.value))
                          }
                        />
                      </div>
                      <span className="w-10 text-xs text-muted-foreground">pts</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    Bands are checked from the top down — the first one a client meets sets the
                    points. Example: {meta.label.toLowerCase()} of{" "}
                    {formatThreshold(bands[0]?.threshold ?? 0, meta.unit)} or more →{" "}
                    {bands[0]?.points ?? 0} pts.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between border-t pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={reset.isPending}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset risk scoring?</AlertDialogTitle>
                <AlertDialogDescription>
                  This restores every factor band to the system defaults. New risk scores will use
                  the defaults. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => reset.mutate()}>
                  Reset to defaults
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate(draft)}
            >
              <Save className="mr-2 h-4 w-4" />
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
