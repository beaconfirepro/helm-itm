import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/primitives/Screen";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Panel, useLeftPanel } from "@/components/nav/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { RiskScoringTab } from "@/components/settings/RiskScoringTab";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import {
  ChevronRight,
  Plus,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Building2,
  Layers,
  Layout,
  GitBranch,
  Pencil,
  Banknote,
  FileText,
  RotateCcw,
  Lock,
  Eye,
  ChevronDown,
  Trash2,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Plain-language lien workflow type labels (L04)
// ---------------------------------------------------------------------------

const WORKFLOW_TYPE_LABELS: Record<
  string,
  { label: string; description: string }
> = {
  commercial_sub: {
    label: "Commercial Sub",
    description:
      "HELM is sub-contractor on a commercial job — primary HELM case",
  },
  residential_sub: {
    label: "Residential Sub",
    description:
      "HELM is sub-contractor; GC has direct agreement with owner-occupant",
  },
  public_bond: {
    label: "Public / Bond",
    description:
      "Public project — handled outside the lien system via payment bond claims",
  },
  none: {
    label: "No Lien Tracking",
    description: "Lien tracking is not applicable for this type",
  },
};

const CLOCK_TRIGGER_LABELS: Record<
  string,
  { label: string; description: string }
> = {
  none: { label: "None", description: "Stage does not start any lien clock" },
  design_start: {
    label: "Design Start",
    description: "Starts the design-stream lien clock",
  },
  field_work_start: {
    label: "Field Work Start",
    description: "Starts the construction-stream lien clock",
  },
};

const RULE_KIND_LABELS: Record<string, string> = {
  notice: "Pre-Lien Notice",
  filing: "Lien Filing",
  retainage: "Retainage Notice",
  post_filing_notice: "Post-Filing Notice",
  enforcement: "Enforcement",
  release: "Release",
};

// ---------------------------------------------------------------------------
// Fetch helpers (use session cookie — no auth header needed for web)
// ---------------------------------------------------------------------------

/**
 * Return the API server base URL.
 * The Replit proxy routes /api/* → API server (port 8080), stripping the /api prefix.
 */
function getApiBase(): string {
  return "/api";
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const apiBase = getApiBase().replace(/\/$/, "");
  const res = await fetch(`${apiBase}${path}`, {
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

interface SubSystemType {
  id: string;
  name: string;
  systemTypeId: string;
  lienWorkflowType: string;
}

interface SystemType {
  id: string;
  name: string;
  departmentId: string;
  subSystemTypes: SubSystemType[];
}

interface Department {
  id: string;
  name: string;
  systemTypes: SystemType[];
}

interface StageTrigger {
  id: string;
  hubspotStageKey: string;
  label: string;
  lienClockTrigger: string;
}

interface LienRule {
  id: string;
  ruleKind: string;
  lienWorkflowType: string;
  workStream: string;
  anchor: string;
  offsetMonths?: number;
  offsetDayOfMonth?: number;
  offsetDays?: number;
  offsetIsBusinessDays: boolean;
  businessDayHandling?: string;
  statuteCitation: string;
  description: string;
}

interface LienRuleSet {
  id: string;
  version: string;
  effectiveDate: string;
  statuteRef: string;
  legalReviewed: boolean;
  rules?: LienRule[];
}

interface Jurisdiction {
  id: string;
  code: string;
  name: string;
  active: boolean;
  ruleSets: LienRuleSet[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WorkflowTypeBadge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    commercial_sub: "bg-blue-100 text-blue-800",
    residential_sub: "bg-green-100 text-green-800",
    public_bond: "bg-purple-100 text-purple-800",
    none: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colors[value] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {WORKFLOW_TYPE_LABELS[value]?.label ?? value}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Reference Tree
// ---------------------------------------------------------------------------

function ReferenceTreeTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["config-departments"],
    queryFn: () =>
      apiFetch<{ departments: Department[] }>("/config/departments"),
    retry: false,
  });

  const [newDeptName, setNewDeptName] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [stNames, setStNames] = React.useState<Record<string, string>>({});
  const [sstForms, setSstForms] = React.useState<
    Record<string, { name: string; lienWorkflowType: string }>
  >({});

  const addDept = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/config/departments", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-departments"] });
      setNewDeptName("");
      toast({ title: "Department added" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const addSt = useMutation({
    mutationFn: ({
      name,
      departmentId,
    }: {
      name: string;
      departmentId: string;
    }) =>
      apiFetch("/config/system-types", {
        method: "POST",
        body: JSON.stringify({ name, departmentId }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["config-departments"] });
      setStNames((prev) => ({ ...prev, [vars.departmentId]: "" }));
      toast({ title: "System type added" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const addSst = useMutation({
    mutationFn: ({
      name,
      systemTypeId,
      lienWorkflowType,
    }: {
      name: string;
      systemTypeId: string;
      lienWorkflowType: string;
    }) =>
      apiFetch("/config/sub-system-types", {
        method: "POST",
        body: JSON.stringify({ name, systemTypeId, lienWorkflowType }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["config-departments"] });
      setSstForms((prev) => ({
        ...prev,
        [vars.systemTypeId]: { name: "", lienWorkflowType: "" },
      }));
      toast({ title: "Sub-system type added" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  type EditName = { id: string; name: string };
  type EditSst = { id: string; name: string; lienWorkflowType: string };
  const [editDept, setEditDept] = React.useState<EditName | null>(null);
  const [editSt, setEditSt] = React.useState<EditName | null>(null);
  const [editSst, setEditSst] = React.useState<EditSst | null>(null);

  const patchDept = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch(`/config/departments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-departments"] });
      setEditDept(null);
      toast({ title: "Department renamed" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const patchSt = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch(`/config/system-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-departments"] });
      setEditSt(null);
      toast({ title: "System type renamed" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const patchSst = useMutation({
    mutationFn: ({
      id,
      name,
      lienWorkflowType,
    }: {
      id: string;
      name: string;
      lienWorkflowType: string;
    }) =>
      apiFetch(`/config/sub-system-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, lienWorkflowType }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-departments"] });
      setEditSst(null);
      toast({ title: "Sub-system type updated" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading reference tree…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {(error as Error)?.message?.includes("401")
          ? "Your session has expired — please refresh the page to sign in again."
          : `Failed to load reference tree: ${(error as Error)?.message}`}
      </div>
    );
  }

  const departments = data?.departments ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Building2}
        title="Department → System Type → Sub-System Type"
        subtitle="Each Sub-System Type must declare its lien workflow — this determines which statutory rules apply."
      />

      {departments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No departments configured. Add one below.
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map((dept) => (
            <div key={dept.id} className="rounded-lg border bg-card">
              <div className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-foreground">
                {editDept?.id === dept.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      className="h-7 text-xs w-44"
                      value={editDept.name}
                      autoFocus
                      onChange={(e) =>
                        setEditDept({ id: dept.id, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editDept.name.trim())
                          patchDept.mutate({
                            id: dept.id,
                            name: editDept.name.trim(),
                          });
                        if (e.key === "Escape") setEditDept(null);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!editDept.name.trim() || patchDept.isPending}
                      onClick={() =>
                        patchDept.mutate({
                          id: dept.id,
                          name: editDept.name.trim(),
                        })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditDept(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleExpand(dept.id)}
                    className="flex flex-1 items-center gap-2 hover:opacity-80 transition-opacity text-left"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{dept.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {dept.systemTypes.length} type
                      {dept.systemTypes.length !== 1 ? "s" : ""}
                    </Badge>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform ml-auto",
                        expanded.has(dept.id) && "rotate-90",
                      )}
                    />
                  </button>
                )}
                {editDept?.id !== dept.id && (
                  <button
                    type="button"
                    title="Rename department"
                    className="ml-2 p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                    onClick={() =>
                      setEditDept({ id: dept.id, name: dept.name })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {expanded.has(dept.id) && (
                <div className="border-t px-4 pb-4">
                  {dept.systemTypes.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                      No system types yet.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {dept.systemTypes.map((st) => {
                        const sstForm = sstForms[st.id] ?? {
                          name: "",
                          lienWorkflowType: "",
                        };
                        return (
                          <div
                            key={st.id}
                            className="pl-4 border-l-2 border-muted"
                          >
                            <div className="flex items-center gap-2 py-1">
                              {editSt?.id === st.id ? (
                                <>
                                  <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <Input
                                    className="h-7 text-xs w-40"
                                    value={editSt.name}
                                    autoFocus
                                    onChange={(e) =>
                                      setEditSt({
                                        id: st.id,
                                        name: e.target.value,
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === "Enter" &&
                                        editSt.name.trim()
                                      )
                                        patchSt.mutate({
                                          id: st.id,
                                          name: editSt.name.trim(),
                                        });
                                      if (e.key === "Escape") setEditSt(null);
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={
                                      !editSt.name.trim() || patchSt.isPending
                                    }
                                    onClick={() =>
                                      patchSt.mutate({
                                        id: st.id,
                                        name: editSt.name.trim(),
                                      })
                                    }
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => setEditSt(null)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm font-medium">
                                    {st.name}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {st.subSystemTypes.length} sub-type
                                    {st.subSystemTypes.length !== 1 ? "s" : ""}
                                  </Badge>
                                  <button
                                    type="button"
                                    title="Rename system type"
                                    className="ml-1 p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                                    onClick={() =>
                                      setEditSt({ id: st.id, name: st.name })
                                    }
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                            {st.subSystemTypes.length > 0 && (
                              <div className="ml-4 mt-1 space-y-1">
                                {st.subSystemTypes.map((sst) => (
                                  <div key={sst.id}>
                                    {editSst?.id === sst.id ? (
                                      <div className="flex flex-wrap items-end gap-2 py-1 pl-1 border-l border-dashed">
                                        <div className="space-y-0.5">
                                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Name
                                          </p>
                                          <Input
                                            className="h-7 text-xs w-36"
                                            value={editSst.name}
                                            autoFocus
                                            onChange={(e) =>
                                              setEditSst({
                                                ...editSst,
                                                name: e.target.value,
                                              })
                                            }
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Lien Workflow
                                          </p>
                                          <Select
                                            value={editSst.lienWorkflowType}
                                            onValueChange={(v) =>
                                              setEditSst({
                                                ...editSst,
                                                lienWorkflowType: v,
                                              })
                                            }
                                          >
                                            <SelectTrigger className="h-7 text-xs w-44">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {Object.entries(
                                                WORKFLOW_TYPE_LABELS,
                                              ).map(
                                                ([
                                                  value,
                                                  { label, description },
                                                ]) => (
                                                  <SelectItem
                                                    key={value}
                                                    value={value}
                                                  >
                                                    <span className="font-medium">
                                                      {label}
                                                    </span>
                                                    <span className="ml-1 text-muted-foreground text-[10px]">
                                                      — {description}
                                                    </span>
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs"
                                          disabled={
                                            !editSst.name.trim() ||
                                            !editSst.lienWorkflowType ||
                                            patchSst.isPending
                                          }
                                          onClick={() =>
                                            patchSst.mutate({
                                              id: sst.id,
                                              name: editSst.name.trim(),
                                              lienWorkflowType:
                                                editSst.lienWorkflowType,
                                            })
                                          }
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-xs"
                                          onClick={() => setEditSst(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 py-0.5">
                                        <Layout className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs text-foreground">
                                          {sst.name}
                                        </span>
                                        <WorkflowTypeBadge
                                          value={sst.lienWorkflowType}
                                        />
                                        <span className="text-xs text-muted-foreground">
                                          —{" "}
                                          {
                                            WORKFLOW_TYPE_LABELS[
                                              sst.lienWorkflowType
                                            ]?.description
                                          }
                                        </span>
                                        <button
                                          type="button"
                                          title="Edit sub-system type"
                                          className="ml-1 p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                                          onClick={() =>
                                            setEditSst({
                                              id: sst.id,
                                              name: sst.name,
                                              lienWorkflowType:
                                                sst.lienWorkflowType,
                                            })
                                          }
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="ml-4 mt-2 flex flex-wrap items-end gap-2 border-l border-dashed pl-3 pb-1">
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Add Sub-System Type
                                </p>
                                <Input
                                  placeholder="Name"
                                  className="h-7 text-xs w-36"
                                  value={sstForm.name}
                                  onChange={(e) =>
                                    setSstForms((prev) => ({
                                      ...prev,
                                      [st.id]: {
                                        ...sstForm,
                                        name: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Lien Workflow
                                </p>
                                <Select
                                  value={sstForm.lienWorkflowType}
                                  onValueChange={(v) =>
                                    setSstForms((prev) => ({
                                      ...prev,
                                      [st.id]: {
                                        ...sstForm,
                                        lienWorkflowType: v,
                                      },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs w-44">
                                    <SelectValue placeholder="Select workflow…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(WORKFLOW_TYPE_LABELS).map(
                                      ([value, { label, description }]) => (
                                        <SelectItem key={value} value={value}>
                                          <span className="font-medium">
                                            {label}
                                          </span>
                                          <span className="ml-1 text-muted-foreground text-[10px]">
                                            — {description}
                                          </span>
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={
                                  !sstForm.name.trim() ||
                                  !sstForm.lienWorkflowType ||
                                  addSst.isPending
                                }
                                onClick={() =>
                                  addSst.mutate({
                                    name: sstForm.name.trim(),
                                    systemTypeId: st.id,
                                    lienWorkflowType: sstForm.lienWorkflowType,
                                  })
                                }
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-dashed bg-muted/20 px-3 py-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Add System Type
                      </p>
                      <Input
                        placeholder="e.g. Multifamily"
                        className="h-7 text-xs w-44"
                        value={stNames[dept.id] ?? ""}
                        onChange={(e) =>
                          setStNames((prev) => ({
                            ...prev,
                            [dept.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          const n = stNames[dept.id]?.trim();
                          if (e.key === "Enter" && n)
                            addSt.mutate({ name: n, departmentId: dept.id });
                        }}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!stNames[dept.id]?.trim() || addSt.isPending}
                      onClick={() => {
                        const n = stNames[dept.id]?.trim();
                        if (n) addSt.mutate({ name: n, departmentId: dept.id });
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add System Type
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Separator />

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Add Department
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Fire Protection"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            className="max-w-xs"
            onKeyDown={(e) =>
              e.key === "Enter" &&
              newDeptName.trim() &&
              addDept.mutate(newDeptName.trim())
            }
          />
          <Button
            size="sm"
            onClick={() => addDept.mutate(newDeptName.trim())}
            disabled={!newDeptName.trim() || addDept.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Stage Triggers
// ---------------------------------------------------------------------------

function StageTriggersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["config-stage-triggers"],
    queryFn: () =>
      apiFetch<{ stageTriggers: StageTrigger[] }>("/config/stage-triggers"),
    retry: false,
  });

  const [form, setForm] = React.useState({
    hubspotStageKey: "",
    label: "",
    lienClockTrigger: "",
  });

  const addTrigger = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch("/config/stage-triggers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-stage-triggers"] });
      setForm({ hubspotStageKey: "", label: "", lienClockTrigger: "" });
      toast({ title: "Stage trigger added" });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const triggers = data?.stageTriggers ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={GitBranch}
        title="HubSpot Stage → Lien Clock Trigger"
        subtitle="Maps each HubSpot deal/project stage to the lien clock it starts. A stage with 'none' does not affect lien tracking."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          Loading…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          Failed to load stage triggers — check session auth.
        </div>
      ) : triggers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No stage triggers configured.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                  HubSpot Stage Key
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                  Label
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                  Lien Clock Trigger
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                  Effect
                </th>
              </tr>
            </thead>
            <tbody>
              {triggers.map((t, i) => (
                <tr
                  key={t.id}
                  className={cn(
                    "border-b last:border-0",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {t.hubspotStageKey}
                  </td>
                  <td className="px-4 py-2.5">{t.label}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        t.lienClockTrigger === "none"
                          ? "bg-gray-100 text-gray-600"
                          : t.lienClockTrigger === "field_work_start"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-blue-100 text-blue-800",
                      )}
                    >
                      {CLOCK_TRIGGER_LABELS[t.lienClockTrigger]?.label ??
                        t.lienClockTrigger}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {CLOCK_TRIGGER_LABELS[t.lienClockTrigger]?.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Separator />

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Add Stage Trigger
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">HubSpot Stage Key</Label>
            <Input
              placeholder="e.g. install"
              value={form.hubspotStageKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, hubspotStageKey: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Display Label</Label>
            <Input
              placeholder="e.g. Field Work Start"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lien Clock Trigger</Label>
            <Select
              value={form.lienClockTrigger}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, lienClockTrigger: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select trigger…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CLOCK_TRIGGER_LABELS).map(
                  ([value, { label }]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => addTrigger.mutate(form)}
          disabled={
            !form.hubspotStageKey.trim() ||
            !form.label.trim() ||
            !form.lienClockTrigger ||
            addTrigger.isPending
          }
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Trigger
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Jurisdiction Rules — add/remove option constants + helper components
// ---------------------------------------------------------------------------

const WORKFLOW_TYPE_OPTIONS = [
  "commercial_sub",
  "residential_sub",
  "public_bond",
  "none",
] as const;
const WORK_STREAM_OPTIONS = ["construction", "design"] as const;
const RULE_KIND_OPTIONS = [
  "notice",
  "filing",
  "retainage",
  "post_filing_notice",
  "enforcement",
  "release",
] as const;
const ANCHOR_OPTIONS = ["work_month", "completion", "filing_date"] as const;
const ANCHOR_LABELS: Record<string, string> = {
  work_month: "Work month end",
  completion: "Completion date",
  filing_date: "Filing date",
};
const BUSINESS_DAY_OPTIONS = ["next_business_day", "exact"] as const;
const BUSINESS_DAY_LABELS: Record<string, string> = {
  next_business_day: "Roll to next business day",
  exact: "Exact date (no roll)",
};

function DeleteConfirmButton({
  title,
  description,
  onConfirm,
  pending,
  label,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  pending: boolean;
  label: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={pending}
          aria-label={label}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddRuleSetDialog({ jurisdictionId }: { jurisdictionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [statuteRef, setStatuteRef] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/config/rule-sets", {
        method: "POST",
        body: JSON.stringify({
          jurisdictionId,
          version: version.trim(),
          effectiveDate,
          statuteRef: statuteRef.trim(),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-jurisdictions"] });
      toast({ title: "Rule set added" });
      setOpen(false);
      setVersion("");
      setEffectiveDate("");
      setStatuteRef("");
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const valid = version.trim() && effectiveDate && statuteRef.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add rule set
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add rule set</DialogTitle>
          <DialogDescription>
            Create a new statutory rule set for this jurisdiction. You can add rules to it
            afterward.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="rs-version">Version</Label>
            <Input
              id="rs-version"
              placeholder="e.g. TX 2024"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-effective">Effective date</Label>
            <Input
              id="rs-effective"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-statute">Statute reference</Label>
            <Input
              id="rs-statute"
              placeholder="e.g. Tex. Prop. Code ch. 53"
              value={statuteRef}
              onChange={(e) => setStatuteRef(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add rule set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  ruleSetId,
  rule,
}: {
  ruleSetId: string;
  rule?: LienRule;
}) {
  const isEdit = !!rule;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const numToStr = (n: number | null | undefined) =>
    n == null ? "" : String(n);

  const initial = React.useMemo(
    () => ({
      ruleKind: rule?.ruleKind ?? "",
      lienWorkflowType: rule?.lienWorkflowType ?? "",
      workStream: rule?.workStream ?? "",
      anchor: rule?.anchor ?? "",
      offsetMonths: numToStr(rule?.offsetMonths),
      offsetDayOfMonth: numToStr(rule?.offsetDayOfMonth),
      offsetDays: numToStr(rule?.offsetDays),
      offsetIsBusinessDays: rule?.offsetIsBusinessDays ?? false,
      businessDayHandling: rule?.businessDayHandling ?? "next_business_day",
      statuteCitation: rule?.statuteCitation ?? "",
      description: rule?.description ?? "",
    }),
    [rule],
  );

  const [ruleKind, setRuleKind] = React.useState<string>(initial.ruleKind);
  const [lienWorkflowType, setLienWorkflowType] = React.useState<string>(
    initial.lienWorkflowType,
  );
  const [workStream, setWorkStream] = React.useState<string>(initial.workStream);
  const [anchor, setAnchor] = React.useState<string>(initial.anchor);
  const [offsetMonths, setOffsetMonths] = React.useState(initial.offsetMonths);
  const [offsetDayOfMonth, setOffsetDayOfMonth] = React.useState(
    initial.offsetDayOfMonth,
  );
  const [offsetDays, setOffsetDays] = React.useState(initial.offsetDays);
  const [offsetIsBusinessDays, setOffsetIsBusinessDays] = React.useState(
    initial.offsetIsBusinessDays,
  );
  const [businessDayHandling, setBusinessDayHandling] = React.useState<string>(
    initial.businessDayHandling,
  );
  const [statuteCitation, setStatuteCitation] = React.useState(
    initial.statuteCitation,
  );
  const [description, setDescription] = React.useState(initial.description);

  const applyInitial = () => {
    setRuleKind(initial.ruleKind);
    setLienWorkflowType(initial.lienWorkflowType);
    setWorkStream(initial.workStream);
    setAnchor(initial.anchor);
    setOffsetMonths(initial.offsetMonths);
    setOffsetDayOfMonth(initial.offsetDayOfMonth);
    setOffsetDays(initial.offsetDays);
    setOffsetIsBusinessDays(initial.offsetIsBusinessDays);
    setBusinessDayHandling(initial.businessDayHandling);
    setStatuteCitation(initial.statuteCitation);
    setDescription(initial.description);
  };

  const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(isEdit ? `/config/rules/${rule!.id}` : "/config/rules", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(isEdit ? {} : { ruleSetId }),
          lienWorkflowType,
          workStream,
          ruleKind,
          anchor,
          offsetMonths: toNum(offsetMonths),
          offsetDayOfMonth: toNum(offsetDayOfMonth),
          offsetDays: toNum(offsetDays),
          offsetIsBusinessDays,
          businessDayHandling,
          statuteCitation: statuteCitation.trim(),
          description: description.trim(),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-jurisdictions"] });
      toast({ title: isEdit ? "Rule updated" : "Rule added" });
      setOpen(false);
      if (!isEdit) applyInitial();
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const valid =
    ruleKind &&
    lienWorkflowType &&
    workStream &&
    anchor &&
    statuteCitation.trim() &&
    description.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) applyInitial();
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            aria-label="Edit rule"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit rule" : "Add rule"}</DialogTitle>
          <DialogDescription>
            Define a deadline rule. The deadline is computed from the anchor date plus the offsets
            you set.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rule kind</Label>
              <Select value={ruleKind} onValueChange={setRuleKind}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_KIND_OPTIONS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {RULE_KIND_LABELS[k] ?? k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Workflow type</Label>
              <Select value={lienWorkflowType} onValueChange={setLienWorkflowType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_TYPE_OPTIONS.map((w) => (
                    <SelectItem key={w} value={w}>
                      {WORKFLOW_TYPE_LABELS[w]?.label ?? w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Work stream</Label>
              <Select value={workStream} onValueChange={setWorkStream}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_STREAM_OPTIONS.map((w) => (
                    <SelectItem key={w} value={w} className="capitalize">
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Anchor</Label>
              <Select value={anchor} onValueChange={setAnchor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {ANCHOR_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ANCHOR_LABELS[a] ?? a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-months">Offset months</Label>
              <Input
                id="r-months"
                type="number"
                placeholder="—"
                value={offsetMonths}
                onChange={(e) => setOffsetMonths(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-dom">Day of month</Label>
              <Input
                id="r-dom"
                type="number"
                placeholder="—"
                value={offsetDayOfMonth}
                onChange={(e) => setOffsetDayOfMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-days">Offset days</Label>
              <Input
                id="r-days"
                type="number"
                placeholder="—"
                value={offsetDays}
                onChange={(e) => setOffsetDays(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="r-bizdays"
              type="checkbox"
              className="h-4 w-4"
              checked={offsetIsBusinessDays}
              onChange={(e) => setOffsetIsBusinessDays(e.target.checked)}
            />
            <Label htmlFor="r-bizdays" className="font-normal">
              Offset days are business days
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label>Business-day handling</Label>
            <Select value={businessDayHandling} onValueChange={setBusinessDayHandling}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_DAY_OPTIONS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {BUSINESS_DAY_LABELS[b] ?? b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-citation">Statute citation</Label>
            <Input
              id="r-citation"
              placeholder="e.g. § 53.056"
              value={statuteCitation}
              onChange={(e) => setStatuteCitation(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-desc">Description</Label>
            <Input
              id="r-desc"
              placeholder="Short description of the deadline"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending
              ? isEdit
                ? "Saving…"
                : "Adding…"
              : isEdit
                ? "Save changes"
                : "Add rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab: Jurisdiction Rules
// ---------------------------------------------------------------------------

function JurisdictionRulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "pm";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["config-jurisdictions"],
    retry: false,
    queryFn: async () => {
      const base = await apiFetch<{ jurisdictions: Jurisdiction[] }>(
        "/config/jurisdictions",
      );
      const jurisdictions = await Promise.all(
        base.jurisdictions.map(async (j) => {
          const ruleSets = await Promise.all(
            j.ruleSets.map(async (rs) => {
              const rulesData = await apiFetch<{ rules?: LienRule[] }>(
                `/config/rule-sets/${rs.id}/rules`,
              ).catch(() => ({ rules: [] }));
              return { ...rs, rules: rulesData.rules ?? [] };
            }),
          );
          return { ...j, ruleSets };
        }),
      );
      return { jurisdictions };
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      ruleSetId,
      legalReviewed,
    }: {
      ruleSetId: string;
      legalReviewed: boolean;
    }) =>
      apiFetch(`/config/rule-sets/${ruleSetId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ legalReviewed }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["config-jurisdictions"] });
      toast({
        title: vars.legalReviewed
          ? "Rule set marked as reviewed"
          : "Reviewed badge removed",
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const deleteRuleSetMutation = useMutation({
    mutationFn: (ruleSetId: string) =>
      apiFetch(`/config/rule-sets/${ruleSetId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-jurisdictions"] });
      toast({ title: "Rule set deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) =>
      apiFetch(`/config/rules/${ruleId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-jurisdictions"] });
      toast({ title: "Rule deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const jurisdictions = data?.jurisdictions ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading jurisdiction data…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Failed to load jurisdiction rules — check session auth.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={ShieldAlert}
        title="Jurisdictions & Statutory Rules"
        subtitle="Jurisdictional rules are provided as standards and starting points for deadline calculation."
      />

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm text-amber-900">
          <p className="font-semibold">These rules are standards, not legal advice.</p>
          <p className="text-amber-800">
            The jurisdictional rules below are provided as starting points only. We make{" "}
            <span className="font-medium">no guarantees</span> about their accuracy, completeness,
            or legal sufficiency for your situation. You are responsible for reviewing, adjusting,
            and confirming the values you use. Authorized users may freely edit these standards and
            override individual deadlines on any project.
          </p>
        </div>
      </div>

      {jurisdictions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No jurisdictions configured.
        </div>
      ) : (
        jurisdictions.map((jur) => (
          <div key={jur.id} className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">{jur.name}</h3>
              <Badge variant="outline" className="font-mono text-xs">
                {jur.code}
              </Badge>
              {jur.active ? (
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
              {canEdit && (
                <div className="ml-auto">
                  <AddRuleSetDialog jurisdictionId={jur.id} />
                </div>
              )}
            </div>

            {canEdit && jur.ruleSets.length === 0 && (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                No rule sets yet. Use “Add rule set” to create one.
              </div>
            )}

            {jur.ruleSets.map((rs) => (
              <Card key={rs.id} className="border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {rs.version}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {rs.statuteRef} · Effective{" "}
                        {new Date(rs.effectiveDate).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {rs.legalReviewed ? (
                        <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          Reviewed
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                          <Clock className="h-4 w-4" />
                          Not reviewed
                        </div>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              reviewMutation.mutate({
                                ruleSetId: rs.id,
                                legalReviewed: !rs.legalReviewed,
                              })
                            }
                            disabled={reviewMutation.isPending}
                          >
                            {rs.legalReviewed ? "Mark not reviewed" : "Mark reviewed"}
                          </Button>
                          <DeleteConfirmButton
                            label="Delete rule set"
                            title="Delete this rule set?"
                            description={`This permanently removes the "${rs.version}" rule set and all ${rs.rules?.length ?? 0} of its rules. This cannot be undone.`}
                            pending={deleteRuleSetMutation.isPending}
                            onConfirm={() => deleteRuleSetMutation.mutate(rs.id)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {rs.rules && rs.rules.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              Rule
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              Workflow
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              Stream
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              Deadline Expression
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              Citation
                            </th>
                            {canEdit && (
                              <th className="w-10 px-3 py-2" aria-label="Actions" />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {rs.rules.map((rule, i) => {
                            const parts: string[] = [];
                            if (rule.offsetMonths != null)
                              parts.push(`+${rule.offsetMonths} mo`);
                            if (rule.offsetDayOfMonth != null)
                              parts.push(`day ${rule.offsetDayOfMonth}`);
                            if (rule.offsetDays != null)
                              parts.push(
                                `+${rule.offsetDays}${rule.offsetIsBusinessDays ? " biz" : ""} days`,
                              );
                            const expr = `From ${rule.anchor}: ${parts.join(", ") || "—"}`;

                            return (
                              <tr
                                key={rule.id}
                                className={cn(
                                  "border-b last:border-0",
                                  i % 2 === 0 ? "bg-background" : "bg-muted/20",
                                )}
                              >
                                <td className="px-3 py-2">
                                  <div className="font-medium text-foreground">
                                    {RULE_KIND_LABELS[rule.ruleKind] ??
                                      rule.ruleKind}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {rule.description}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <WorkflowTypeBadge
                                    value={rule.lienWorkflowType}
                                  />
                                </td>
                                <td className="px-3 py-2 capitalize">
                                  {rule.workStream}
                                </td>
                                <td className="px-3 py-2 font-mono text-muted-foreground">
                                  {expr}
                                </td>
                                <td className="px-3 py-2 font-mono">
                                  {rule.statuteCitation}
                                </td>
                                {canEdit && (
                                  <td className="px-1 py-2 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-0.5">
                                      <RuleDialog
                                        ruleSetId={rs.id}
                                        rule={rule}
                                      />
                                      <DeleteConfirmButton
                                        label="Delete rule"
                                        title="Delete this rule?"
                                        description={`This permanently removes the "${RULE_KIND_LABELS[rule.ruleKind] ?? rule.ruleKind}" rule (${rule.statuteCitation}). This cannot be undone.`}
                                        pending={deleteRuleMutation.isPending}
                                        onConfirm={() => deleteRuleMutation.mutate(rule.id)}
                                      />
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No rules in this set yet.
                    </div>
                  )}
                  {!rs.legalReviewed && (
                    <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      This rule set has not been marked as reviewed. It is still
                      usable — the badge is informational only.
                    </p>
                  )}
                  {canEdit && (
                    <div className="mt-3">
                      <RuleDialog ruleSetId={rs.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Integrations (QBO + future connections)
// ---------------------------------------------------------------------------

const QBO_ENV_VARS = [
  {
    key: "QBO_CLIENT_ID",
    purpose: "OAuth2 client ID from the Intuit Developer Portal app.",
  },
  {
    key: "QBO_CLIENT_SECRET",
    purpose: "OAuth2 client secret paired with the client ID.",
  },
  {
    key: "QBO_REFRESH_TOKEN",
    purpose:
      "Long-lived refresh token obtained from the initial OAuth2 authorization flow.",
  },
  {
    key: "QBO_REALM_ID",
    purpose: "Company ID (realmId) visible in the QBO URL after login.",
  },
  {
    key: "QBO_ENVIRONMENT",
    purpose:
      'Set to "production" for the live QBO company, or "sandbox" (default) for testing.',
  },
];

const HUBSPOT_ENV_VARS = [
  {
    key: "HUBSPOT_API_KEY",
    purpose:
      "Private app access token. Reads projects/companies from HubSpot and writes collection activity notes back to the associated company.",
  },
];

const NOTARYLIVE_ENV_VARS = [
  {
    key: "NOTARYLIVE_API_USER",
    purpose:
      "NotaryLive API user (the username half of the HTTP Basic credentials from your NotaryLive account).",
  },
  {
    key: "NOTARYLIVE_API_KEY",
    purpose:
      "NotaryLive API key (the password half of the HTTP Basic credentials).",
  },
];

function IntegrationsTab() {
  const { data: qboStatus } = useQuery({
    queryKey: ["config-qbo-status"],
    queryFn: () => apiFetch<{ connected: boolean }>("/config/qbo-status"),
    retry: false,
  });

  const { data: hubspotStatus } = useQuery({
    queryKey: ["config-hubspot-status"],
    queryFn: () => apiFetch<{ connected: boolean }>("/config/hubspot-status"),
    retry: false,
  });

  const { data: notaryStatus } = useQuery({
    queryKey: ["config-notarylive-status"],
    queryFn: () =>
      apiFetch<{ connected: boolean }>("/config/notarylive-status"),
    retry: false,
  });

  const connected = qboStatus?.connected ?? false;
  const hubspotConnected = hubspotStatus?.connected ?? false;
  const notaryConnected = notaryStatus?.connected ?? false;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Banknote}
        title="QuickBooks Online (QBO)"
        subtitle="Invoice sync pulls billing data from QBO into each project. Credentials are stored as Replit secrets — never in code."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm font-semibold">
                Connection Status
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                All four required secrets must be present for live sync to
                activate.
              </CardDescription>
            </div>
            {connected ? (
              <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
                <Clock className="h-4 w-4" />
                Not connected — add secrets below
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    Secret Name
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    Purpose
                  </th>
                </tr>
              </thead>
              <tbody>
                {QBO_ENV_VARS.map((v, i) => (
                  <tr
                    key={v.key}
                    className={cn(
                      "border-b last:border-0",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20",
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-foreground whitespace-nowrap">
                      {v.key}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {v.purpose}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Add these in the{" "}
            <span className="font-medium text-foreground">Secrets</span> tab of
            your Replit workspace. Once all four required secrets are set, the{" "}
            <span className="font-medium text-foreground">Sync QBO</span> button
            on each project will pull live invoice data from QuickBooks Online.
          </p>
        </CardContent>
      </Card>

      <SectionHeader
        icon={Building2}
        title="HubSpot CRM"
        subtitle="Syncs projects and companies from HubSpot and writes collection activity notes back to the associated company. Credentials are stored as Replit secrets — never in code."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm font-semibold">
                Connection Status
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                The API key must be present for live reads and activity
                write-back to activate.
              </CardDescription>
            </div>
            {hubspotConnected ? (
              <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
                <Clock className="h-4 w-4" />
                Not connected — add secret below
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    Secret Name
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    Purpose
                  </th>
                </tr>
              </thead>
              <tbody>
                {HUBSPOT_ENV_VARS.map((v, i) => (
                  <tr
                    key={v.key}
                    className={cn(
                      "border-b last:border-0",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20",
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-foreground whitespace-nowrap">
                      {v.key}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {v.purpose}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PRETEST_REQUIRED: HubSpot integration falls back to fixture/stub behavior when secrets are missing. */}
          <p className="mt-3 text-xs text-muted-foreground">
            Add this in the{" "}
            <span className="font-medium text-foreground">Secrets</span> tab of
            your Replit workspace. When absent, project/company reads fall back
            to fixture data and activity write-back uses a local placeholder so
            development still works.
          </p>
        </CardContent>
      </Card>

      <SectionHeader
        icon={ShieldAlert}
        title="NotaryLive (Remote Online Notarization)"
        subtitle="Powers waiver notarization and the generic notarize-anything flow. Credentials are stored as Replit secrets — never in code."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm font-semibold">
                Connection Status
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Both secrets must be present for live notarization to activate.
              </CardDescription>
            </div>
            {notaryConnected ? (
              <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
                <Clock className="h-4 w-4" />
                Sandbox mode — add secrets below
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    Secret Name
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    Purpose
                  </th>
                </tr>
              </thead>
              <tbody>
                {NOTARYLIVE_ENV_VARS.map((v, i) => (
                  <tr
                    key={v.key}
                    className={cn(
                      "border-b last:border-0",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20",
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-foreground whitespace-nowrap">
                      {v.key}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {v.purpose}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Add these in the{" "}
            <span className="font-medium text-foreground">Secrets</span> tab of
            your Replit workspace. When absent, the integration runs against
            NotaryLive's public sandbox so the flow works end-to-end in
            development, but orders never reach a true notarized state.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Document Templates
// ---------------------------------------------------------------------------

interface DocTemplateListItem {
  type: string;
  category: string;
  label: string;
  statuteRef: string;
  customized: boolean;
  updatedAt: string | null;
}

interface DocRegion {
  key: string;
  label: string;
  description: string;
  default: string;
}

interface DocField {
  key: string;
  label: string;
}

interface ResolvedDoc {
  branding: string;
  intro: string;
  closing: string;
  signature: string;
  footer: string;
  lockedBody: string;
}

interface DocTemplateDetail {
  type: string;
  category: string;
  label: string;
  statuteRef: string;
  lockedBody: string;
  regions: DocRegion[];
  fields: DocField[];
  saved: Record<string, string | null>;
  customized: boolean;
  updatedAt: string | null;
  canEdit: boolean;
}

interface DocPreviewResult {
  type: string;
  label: string;
  statuteRef: string;
  resolved: ResolvedDoc;
  source: { kind: string; projectName?: string };
}

const DOC_CATEGORY_LABELS: Record<string, string> = {
  notice: "Statutory Notices",
  waiver: "Lien Waivers",
  affidavit: "Lien Affidavit",
};

const DOC_CATEGORY_ORDER = ["notice", "waiver", "affidavit"];

function DocumentTemplatesTab() {
  const {
    data: list,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["doc-templates"],
    queryFn: () =>
      apiFetch<{ templates: DocTemplateListItem[]; canEdit: boolean }>(
        "/config/document-templates",
      ),
  });

  const [selectedType, setSelectedType] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedType && list?.templates?.length) {
      setSelectedType(list.templates[0].type);
    }
  }, [list, selectedType]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading templates…</p>;
  }
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load document templates: {(error as Error)?.message}
      </p>
    );
  }

  const templates = list?.templates ?? [];
  const grouped = DOC_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: templates.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="max-w-md space-y-1.5">
        <Label className="text-xs font-semibold">
          Select a template to modify:
        </Label>
        <Select
          value={selectedType ?? ""}
          onValueChange={(v) => setSelectedType(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a document to customize" />
          </SelectTrigger>
          <SelectContent>
            {grouped.map((group) => (
              <SelectGroup key={group.category}>
                <SelectLabel>
                  {DOC_CATEGORY_LABELS[group.category] ?? group.category}
                </SelectLabel>
                {group.items.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    <span className="flex items-center gap-2">
                      {t.label}
                      {t.customized && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          Custom
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0">
        {selectedType ? (
          <DocTemplateEditor key={selectedType} type={selectedType} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a document to customize.
          </p>
        )}
      </div>
    </div>
  );
}

type RichFormatCommand = "bold" | "italic" | "underline";
type MergeFieldEditorHandle = {
  insertToken: (key: string) => void;
  format: (cmd: RichFormatCommand) => void;
};

interface RichSeg {
  text?: string;
  token?: string;
  br?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// Parse a region string (limited `<b>`/`<i>`/`<u>` markup + `{{token}}` merge
// fields + `\n` newlines) into ordered segments for DOM rendering.
function parseRichValue(value: string): RichSeg[] {
  const segs: RichSeg[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  const re = /(\{\{\s*\w+\s*\}\}|<\/?[biu]>|\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (t: string) => {
    if (!t) return;
    segs.push({
      text: t,
      bold: bold > 0,
      italic: italic > 0,
      underline: underline > 0,
    });
  };
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) pushText(value.slice(last, m.index));
    const tok = m[0];
    if (tok === "\n") segs.push({ br: true });
    else if (tok.startsWith("{{"))
      segs.push({ token: tok.replace(/[{}]/g, "").trim() });
    else if (tok === "<b>") bold++;
    else if (tok === "</b>") bold = Math.max(0, bold - 1);
    else if (tok === "<i>") italic++;
    else if (tok === "</i>") italic = Math.max(0, italic - 1);
    else if (tok === "<u>") underline++;
    else if (tok === "</u>") underline = Math.max(0, underline - 1);
    last = re.lastIndex;
  }
  if (last < value.length) pushText(value.slice(last));
  return segs;
}

/**
 * Rich-text editor for a single template region. Supports limited inline
 * formatting (bold / italic / underline), renders `{{token}}` merge fields as
 * non-editable chips inline with the surrounding editable text, and serializes
 * the content back to a markup string for save/preview.
 */
const MergeFieldEditor = React.forwardRef<
  MergeFieldEditorHandle,
  {
    value: string;
    readOnly: boolean;
    fieldLabels: Record<string, string>;
    placeholder?: string;
    minHeight?: number;
    onChange: (value: string) => void;
    onFocus?: () => void;
  }
>(function MergeFieldEditor(props, ref) {
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const lastValueRef = React.useRef<string>("");
  const { onChange, fieldLabels } = props;

  const makeChip = React.useCallback(
    (key: string): HTMLSpanElement => {
      const span = document.createElement("span");
      span.contentEditable = "false";
      span.dataset.token = key;
      span.className =
        "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 text-[11px] font-medium text-primary mx-0.5 align-baseline";
      span.textContent = fieldLabels[key] ?? key;
      return span;
    },
    [fieldLabels],
  );

  const renderHtml = React.useCallback(
    (value: string) => {
      const el = elRef.current;
      if (!el) return;
      el.innerHTML = "";
      for (const s of parseRichValue(value)) {
        if (s.br) {
          el.appendChild(document.createElement("br"));
          continue;
        }
        if (s.token) {
          el.appendChild(makeChip(s.token));
          continue;
        }
        let node: Node = document.createTextNode(s.text ?? "");
        if (s.underline) {
          const u = document.createElement("u");
          u.appendChild(node);
          node = u;
        }
        if (s.italic) {
          const it = document.createElement("i");
          it.appendChild(node);
          node = it;
        }
        if (s.bold) {
          const b = document.createElement("b");
          b.appendChild(node);
          node = b;
        }
        el.appendChild(node);
      }
    },
    [makeChip],
  );

  const serialize = React.useCallback((): string => {
    const el = elRef.current;
    if (!el) return "";
    type Ctx = { bold: boolean; italic: boolean; underline: boolean };
    const deriveCtx = (
      tag: string,
      style: CSSStyleDeclaration | null,
      ctx: Ctx,
    ): Ctx => {
      const next = { ...ctx };
      if (tag === "B" || tag === "STRONG") next.bold = true;
      if (tag === "I" || tag === "EM") next.italic = true;
      if (tag === "U") next.underline = true;
      if (style) {
        const fw = style.fontWeight;
        if (
          fw === "bold" ||
          fw === "bolder" ||
          (/^\d+$/.test(fw) && parseInt(fw, 10) >= 600)
        )
          next.bold = true;
        if (style.fontStyle === "italic") next.italic = true;
        const td = `${style.textDecorationLine} ${style.textDecoration}`;
        if (td.includes("underline")) next.underline = true;
      }
      return next;
    };
    const wrap = (text: string, ctx: Ctx): string => {
      if (!text) return "";
      let t = text;
      if (ctx.underline) t = `<u>${t}</u>`;
      if (ctx.italic) t = `<i>${t}</i>`;
      if (ctx.bold) t = `<b>${t}</b>`;
      return t;
    };
    const ser = (node: ChildNode, needsLeadNl: boolean, ctx: Ctx): string => {
      if (node.nodeType === Node.TEXT_NODE)
        return wrap(node.textContent ?? "", ctx);
      if (node.nodeType === Node.ELEMENT_NODE) {
        const e = node as HTMLElement;
        if (e.dataset && e.dataset.token) return `{{${e.dataset.token}}}`;
        if (e.tagName === "BR") return "\n";
        const next = deriveCtx(e.tagName, e.style ?? null, ctx);
        let inner = "";
        e.childNodes.forEach((c, i) => {
          inner += ser(c, i > 0, next);
        });
        if (e.tagName === "DIV" || e.tagName === "P") {
          return (needsLeadNl ? "\n" : "") + inner;
        }
        return inner;
      }
      return "";
    };
    const base: Ctx = { bold: false, italic: false, underline: false };
    let out = "";
    el.childNodes.forEach((c, i) => {
      out += ser(c, i > 0, base);
    });
    return out;
  }, []);

  // Render from the incoming value on mount and when it changes externally
  // (e.g. Reset), but never clobber the DOM mid-typing.
  React.useEffect(() => {
    if (props.value !== lastValueRef.current) {
      lastValueRef.current = props.value;
      renderHtml(props.value);
    }
  }, [props.value, renderHtml]);

  const handleInput = React.useCallback(() => {
    const v = serialize();
    lastValueRef.current = v;
    onChange(v);
  }, [serialize, onChange]);

  React.useImperativeHandle(
    ref,
    () => ({
      insertToken: (key: string) => {
        const el = elRef.current;
        if (!el || props.readOnly) return;
        el.focus();
        const sel = window.getSelection();
        const chip = makeChip(key);
        if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(chip);
          range.setStartAfter(chip);
          range.setEndAfter(chip);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.appendChild(chip);
        }
        handleInput();
      },
      format: (cmd: RichFormatCommand) => {
        const el = elRef.current;
        if (!el || props.readOnly) return;
        el.focus();
        try {
          document.execCommand("styleWithCSS", false, "false");
        } catch {
          /* ignore — not supported everywhere */
        }
        document.execCommand(cmd, false);
        handleInput();
      },
    }),
    [makeChip, handleInput, props.readOnly],
  );

  return (
    <div
      ref={elRef}
      contentEditable={!props.readOnly}
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={props.onFocus}
      role="textbox"
      aria-multiline="true"
      data-placeholder={props.placeholder}
      className={cn(
        "mf-editor w-full rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        props.readOnly && "cursor-default opacity-70",
      )}
      style={{ minHeight: props.minHeight ?? 52 }}
    />
  );
});

function DocTemplateEditor({ type }: { type: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["doc-template", type],
    queryFn: () =>
      apiFetch<DocTemplateDetail>(`/config/document-templates/${type}`),
  });

  const [regions, setRegions] = React.useState<Record<string, string>>({});
  const editorRefs = React.useRef<
    Record<string, MergeFieldEditorHandle | null>
  >({});

  // Seed local editor state from the effective content (saved override or
  // default) once the detail loads.
  React.useEffect(() => {
    if (!data) return;
    const seed: Record<string, string> = {};
    for (const r of data.regions) {
      const savedVal = data.saved?.[r.key];
      seed[r.key] = savedVal != null ? savedVal : r.default;
    }
    setRegions(seed);
  }, [data]);

  const [preview, setPreview] = React.useState<DocPreviewResult | null>(null);
  const [projectQuery, setProjectQuery] = React.useState("");
  const [selectedProject, setSelectedProject] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data: projectResults } = useQuery({
    queryKey: ["doc-template-project-search", projectQuery],
    queryFn: () =>
      apiFetch<{ results: { id: string; projectName: string }[] }>(
        `/projects/search?q=${encodeURIComponent(projectQuery)}&limit=6`,
      ),
    enabled: projectQuery.trim().length > 0,
  });

  const previewMutation = useMutation({
    mutationFn: (body: { regions: Record<string, string>; projectId?: string }) =>
      apiFetch<DocPreviewResult>(`/config/document-templates/${type}/preview`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => setPreview(res),
    onError: (e) =>
      toast({
        title: "Preview failed",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const runPreview = React.useCallback(() => {
    previewMutation.mutate({
      regions,
      projectId: selectedProject?.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, selectedProject]);

  // Auto-run an initial preview once content is seeded.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (data && Object.keys(regions).length > 0 && !seededRef.current) {
      seededRef.current = true;
      previewMutation.mutate({ regions });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, regions]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      apiFetch<DocTemplateDetail>(`/config/document-templates/${type}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Template saved" });
      qc.invalidateQueries({ queryKey: ["doc-templates"] });
      qc.invalidateQueries({ queryKey: ["doc-template", type] });
    },
    onError: (e) =>
      toast({
        title: "Save failed",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const fieldLabels = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of data?.fields ?? []) map[f.key] = f.label;
    return map;
  }, [data]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        Failed to load template: {(error as Error)?.message}
      </p>
    );
  }

  const canEdit = data.canEdit;

  const insertFieldInto = (regionKey: string, fieldKey: string) => {
    editorRefs.current[regionKey]?.insertToken(fieldKey);
  };

  const formatRegion = (regionKey: string, cmd: RichFormatCommand) => {
    editorRefs.current[regionKey]?.format(cmd);
  };

  const handleSave = () => {
    const body: Record<string, string | null> = {};
    for (const r of data.regions) {
      const value = regions[r.key] ?? "";
      // Store null when the content equals the default so the document falls
      // back to the canonical default (no stale copies of statutory wording).
      body[r.key] = value === r.default ? null : value;
    }
    saveMutation.mutate(body);
  };

  const handleResetAll = () => {
    const seed: Record<string, string> = {};
    for (const r of data.regions) seed[r.key] = r.default;
    setRegions(seed);
    toast({
      title: "Reset to defaults",
      description: "Click Save to apply the reset.",
    });
  };

  return (
    <div className="space-y-5">
    <Collapsible className="rounded-md border border-border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md px-4 py-3 text-left hover:bg-muted/50">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Customize content
          </h3>
          <p className="text-xs text-muted-foreground">
            {data.label} · Texas Property Code {data.statuteRef}
            {data.customized ? " · Customized" : " · Using defaults"}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 px-4 pb-4">
        {canEdit && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAll}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          You have read-only access. Only administrators can edit document
          templates.
        </div>
      )}

      {/* Editable regions */}
      <style>{`.mf-editor:empty:before{content:attr(data-placeholder);color:var(--muted-foreground,#94a3b8);pointer-events:none;}`}</style>
      <div className="space-y-4">
        {data.regions.map((r) => (
          <div
            key={r.key}
            className="rounded-md border border-border bg-muted/40 p-3"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <Label className="text-xs font-semibold capitalize">
                {r.label}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {r.description}
              </span>
            </div>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!canEdit}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => formatRegion(r.key, "bold")}
                className="h-7 w-7 rounded-md border border-border bg-background text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                title="Bold"
                aria-label="Bold"
              >
                B
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => formatRegion(r.key, "italic")}
                className="h-7 w-7 rounded-md border border-border bg-background text-[13px] italic text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                title="Italic"
                aria-label="Italic"
              >
                I
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => formatRegion(r.key, "underline")}
                className="h-7 w-7 rounded-md border border-border bg-background text-[13px] underline text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                title="Underline"
                aria-label="Underline"
              >
                U
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={!canEdit}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Insert merge field"
                >
                  Insert merge field
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  {data.fields.map((f) => (
                    <DropdownMenuItem
                      key={f.key}
                      className="text-xs"
                      onSelect={() => insertFieldInto(r.key, f.key)}
                    >
                      {f.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <MergeFieldEditor
              ref={(h) => {
                editorRefs.current[r.key] = h;
              }}
              value={regions[r.key] ?? ""}
              readOnly={!canEdit}
              fieldLabels={fieldLabels}
              onChange={(value) =>
                setRegions((prev) => ({ ...prev, [r.key]: value }))
              }
              minHeight={r.key === "signature" || r.key === "footer" ? 68 : 48}
              placeholder={
                r.key === "branding" || r.key === "intro" || r.key === "closing"
                  ? "(empty — nothing rendered)"
                  : undefined
              }
            />
          </div>
        ))}
      </div>
      </CollapsibleContent>
    </Collapsible>

      {/* Locked statutory body */}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">
            Statutory body (locked)
          </Label>
        </div>
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {data.lockedBody}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This statutory wording is fixed and merges with real data at PDF
          generation. It cannot be edited.
        </p>
      </div>

      {/* Live preview */}
      <div className="rounded-md border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Eye className="h-3.5 w-3.5" />
            Live preview
            <span className="font-normal text-muted-foreground">
              ·{" "}
              {preview?.source.kind === "project"
                ? preview.source.projectName
                : "Sample data"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runPreview}
            disabled={previewMutation.isPending}
            className="gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            {previewMutation.isPending ? "Rendering…" : "Update preview"}
          </Button>
        </div>

        <div className="space-y-2 px-3 py-2">
          <div className="relative">
            <Input
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder="Preview with a real project (search by name)…"
              className="h-8 text-xs"
            />
            {projectQuery.trim().length > 0 &&
              (projectResults?.results.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  {projectResults!.results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProject({ id: p.id, name: p.projectName });
                        setProjectQuery("");
                        previewMutation.mutate({ regions, projectId: p.id });
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {p.projectName}
                    </button>
                  ))}
                </div>
              )}
          </div>
          {selectedProject && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Using project:{" "}
              <span className="font-medium text-foreground">
                {selectedProject.name}
              </span>
              <button
                onClick={() => {
                  setSelectedProject(null);
                  previewMutation.mutate({ regions });
                }}
                className="underline"
              >
                use sample data
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-background px-5 py-4">
          {preview ? (
            <DocPreviewBody resolved={preview.resolved} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Preview will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DocPreviewBody({ resolved }: { resolved: ResolvedDoc }) {
  const block = (text: string, className: string) =>
    text.trim() ? (
      <p className={cn("whitespace-pre-wrap", className)}>{text}</p>
    ) : null;

  return (
    <div className="mx-auto max-w-[640px] space-y-3 text-[11px] leading-relaxed text-foreground">
      {block(resolved.branding, "text-center text-muted-foreground")}
      {block(resolved.intro, "")}
      <div className="rounded border-l-2 border-border bg-muted/50 px-3 py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Statutory body (locked)
        </p>
        <p className="whitespace-pre-wrap">{resolved.lockedBody}</p>
      </div>
      {block(resolved.closing, "")}
      {block(resolved.signature, "text-muted-foreground")}
      {block(
        resolved.footer,
        "text-center text-[10px] text-muted-foreground border-t border-border pt-2",
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ConfigPage() {
  const [tab, setTab] = React.useState("reference");

  useLeftPanel(
    <Panel title="Settings">
      <div className="flex flex-col gap-1 p-3">
        {[
          { value: "reference", label: "Reference Tree", Icon: Building2 },
          { value: "triggers", label: "Stage Triggers", Icon: GitBranch },
          {
            value: "jurisdictions",
            label: "Jurisdiction Rules",
            Icon: ShieldAlert,
          },
          { value: "documents", label: "Document Templates", Icon: FileText },
          { value: "integrations", label: "Integrations", Icon: Banknote },
          { value: "risk", label: "Risk Scoring", Icon: Gauge },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-[12.5px] font-medium transition-colors"
            style={
              tab === t.value
                ? {
                    background: "var(--surface-3)",
                    borderColor: "var(--helm-border)",
                    color: "var(--text-base)",
                  }
                : {
                    background: "var(--surface-2)",
                    borderColor: "var(--helm-border)",
                    color: "var(--text-dim)",
                  }
            }
          >
            <t.Icon className="h-4 w-4 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>
    </Panel>,
    [tab],
  );

  return (
    <Screen>
      <div className="max-w-5xl mx-auto">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="hidden">
            <TabsTrigger value="reference" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Reference Tree
            </TabsTrigger>
            <TabsTrigger value="triggers" className="gap-1.5">
              <GitBranch className="h-4 w-4" />
              Stage Triggers
            </TabsTrigger>
            <TabsTrigger value="jurisdictions" className="gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              Jurisdiction Rules
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Document Templates
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Banknote className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reference">
            <ReferenceTreeTab />
          </TabsContent>

          <TabsContent value="triggers">
            <StageTriggersTab />
          </TabsContent>

          <TabsContent value="jurisdictions">
            <JurisdictionRulesTab />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentTemplatesTab />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab />
          </TabsContent>

          <TabsContent value="risk">
            <RiskScoringTab />
          </TabsContent>
        </Tabs>
      </div>
    </Screen>
  );
}
