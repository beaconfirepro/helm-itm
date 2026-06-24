import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Screen } from "@/components/primitives/Screen";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  GitBranch,
  Info,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Users,
  Building2,
  XCircle,
  Receipt,
  Link as LinkIcon,
  Bell,
  Send,
  Gavel,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileSignature,
  Lock,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeadlineCountdown } from "@/components/ui/deadline-countdown";
import { useAuth } from "@workspace/replit-auth-web";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Panel, useLeftPanel, useRightPanel } from "@/components/nav/AppShell";
import { WorkspaceHeader } from "@/components/nav/WorkspaceLayout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleOfValues {
  id: string;
  workStream: string;
  status: string;
  openedAt: string;
}

interface Party {
  id: string;
  partyRelationType: string;
  hubspotCompanyId: string;
  cachedLegalName: string;
  cachedMailingAddress: string | null;
}

interface SubSystemType {
  id: string;
  name: string;
  lienWorkflowType: string;
}

interface Project {
  id: string;
  hubspotProjectId: string;
  cachedProjectName: string | null;
  cachedHubspotStatus: string | null;
  lienWorkflowType: string;
  contractorTier: string;
  legalPropertyAddress: string | null;
  county: string | null;
  contractStartDate: string | null;
  completionDate: string | null;
  completionChecklistComplete: boolean;
  jurisdictionId: string;
  subSystemTypeId: string;
}

interface ChecklistItem {
  field: string;
  label: string;
}

interface ProjectDetailResponse {
  project: Project;
  parties: Party[];
  sovs: ScheduleOfValues[];
  subSystemType: SubSystemType | null;
  checklist: { complete: boolean; missing: ChecklistItem[] };
}

interface Deadline {
  id: string;
  ruleId: string;
  ruleKind: string;
  computedDate: string;
  adjustedDate: string;
  satisfiedAt: string | null;
  isOverridden: boolean;
  overrideDate: string | null;
  sourceData: Record<string, unknown>;
  rule?: {
    statuteCitation: string;
    description: string;
    ruleKind: string;
  } | null;
}

/** The effective deadline date — the manual override when present, else the computed/adjusted date. */
function effectiveDeadlineDate(dl: Deadline): string {
  return dl.isOverridden && dl.overrideDate ? dl.overrideDate : dl.adjustedDate;
}

interface WorkMonth {
  id: string;
  month: string;
  derivedOverdue: boolean;
  clearedFlag: boolean;
  invoiceLinkId: string | null;
  deadlines: Deadline[];
}

interface StreamWithWorkMonths {
  sov: ScheduleOfValues;
  workMonths: WorkMonth[];
  summary?: { workMonthsProcessed: number; deadlinesComputed: number };
}

interface Invoice {
  id: string;
  qboInvoiceId: string | null;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  qboStatus: string;
  clearedFlag: boolean;
  clearedAt: string | null;
  isSupplierInvoice: boolean;
}

interface StreamNotice {
  id: string;
  status: "draft" | "approved" | "sent" | "delivered";
  noticeType: string;
  workMonthId: string | null;
  claimAmount: string;
  monthListed: string;
  sentAt: string | null;
  deliveredAt: string | null;
  mailing: {
    trackingNumber: string | null;
    labelUrl: string | null;
    proofUrl: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  });
}

const WORKFLOW_LABELS: Record<string, string> = {
  commercial_sub: "Commercial Sub",
  residential_sub: "Residential Sub",
  public_bond: "Public / Bond",
  none: "No Lien Tracking",
};

const WORKFLOW_COLORS: Record<string, string> = {
  commercial_sub: "bg-blue-100 text-blue-800",
  residential_sub: "bg-green-100 text-green-800",
  public_bond: "bg-purple-100 text-purple-800",
  none: "bg-gray-100 text-gray-600",
};

const PARTY_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  original_contractor: "Original Contractor (GC)",
  hiring_party: "Hiring Party",
};

const STREAM_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  at_risk: "At Risk",
  notice_active: "Notice Active",
  filing: "Filing",
  filed: "Filed",
  released: "Released",
  closed: "Closed",
  lapsed: "Lapsed",
};

const STREAM_STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  at_risk: "bg-red-100 text-red-800",
  notice_active: "bg-amber-100 text-amber-800",
  filing: "bg-orange-100 text-orange-800",
  filed: "bg-purple-100 text-purple-800",
  released: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  lapsed: "bg-red-200 text-red-900",
};

const RULE_KIND_LABELS: Record<string, string> = {
  notice: "Pre-Lien Notice",
  filing: "Lien Filing",
  retainage: "Retainage Notice",
  post_filing_notice: "Post-Filing Notice",
  enforcement: "Enforcement Deadline",
  release: "Release",
};

const RULE_KIND_COLORS: Record<string, string> = {
  notice: "bg-amber-50 border-amber-200 text-amber-800",
  filing: "bg-red-50 border-red-200 text-red-800",
  retainage: "bg-orange-50 border-orange-200 text-orange-700",
  post_filing_notice: "bg-purple-50 border-purple-200 text-purple-800",
  enforcement: "bg-red-100 border-red-300 text-red-900",
  release: "bg-green-50 border-green-200 text-green-700",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function deadlineUrgency(adjustedDate: string): "overdue" | "urgent" | "upcoming" | "future" {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dl = new Date(adjustedDate);
  dl.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.floor((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "urgent";
  if (diffDays <= 30) return "upcoming";
  return "future";
}

// ---------------------------------------------------------------------------
// Checklist panel
// ---------------------------------------------------------------------------

function ChecklistPanel({
  checklist,
  contractorTier,
}: {
  checklist: { complete: boolean; missing: ChecklistItem[] };
  contractorTier: string;
}) {
  if (checklist.complete) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <span className="text-sm font-medium text-green-800">Setup complete — all required fields filled</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-medium text-amber-800">
          Setup incomplete — {checklist.missing.length} item{checklist.missing.length !== 1 ? "s" : ""} remaining
        </span>
      </div>
      <ul className="space-y-1 ml-6">
        {checklist.missing.map((item) => (
          <li key={item.field} className="text-xs text-amber-700 list-disc">
            {item.label}
          </li>
        ))}
      </ul>
      {contractorTier === "second_tier" && (
        <div className="flex items-start gap-1.5 mt-2">
          <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            2nd-tier projects require both a hiring party and original contractor in the parties section below.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notice status badge + countdown — inline per work month
// ---------------------------------------------------------------------------

const NOTICE_STATUS_STYLES: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 border-gray-300",
  approved:  "bg-blue-100 text-blue-700 border-blue-300",
  sent:      "bg-amber-100 text-amber-700 border-amber-300",
  delivered: "bg-green-100 text-green-700 border-green-300",
};

const NOTICE_STATUS_LABELS: Record<string, string> = {
  draft:     "Draft",
  approved:  "Approved",
  sent:      "Sent",
  delivered: "Delivered",
};

function NoticeBadge({
  notice,
  onNavigate,
}: {
  notice: StreamNotice;
  onNavigate: () => void;
}) {
  const styleClass = NOTICE_STATUS_STYLES[notice.status] ?? "bg-gray-100 text-gray-700 border-gray-300";
  const label = NOTICE_STATUS_LABELS[notice.status] ?? notice.status;

  return (
    <button
      type="button"
      title="Open in Send Queue"
      onClick={onNavigate}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer",
        styleClass,
      )}
    >
      <Bell className="h-3 w-3" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create Notice — inline button + minimal modal per work month
// ---------------------------------------------------------------------------

const NOTICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "early_warning", label: "Early Warning (Courtesy)" },
  { value: "statutory_claim", label: "Statutory Claim (§ 53.056)" },
  { value: "retainage_claim", label: "Retainage Claim (§ 53.057)" },
];

function CreateNoticeButton({
  streamId,
  workMonthId,
  workMonthLabel,
}: {
  streamId: string;
  workMonthId: string;
  workMonthLabel: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [noticeType, setNoticeType] = React.useState("statutory_claim");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ notice: StreamNotice }>(`/notices`, {
        method: "POST",
        body: JSON.stringify({ lienScheduleOfValuesId: streamId, workMonthId, noticeType }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stream-notices", streamId] });
      toast({
        title: "Notice created",
        description: `Draft notice created for ${workMonthLabel}.`,
      });
      setOpen(false);
    },
    onError: (err: Error) =>
      toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs gap-1 px-2"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3" />
        Create Notice
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Notice</DialogTitle>
            <DialogDescription>
              Draft a new notice for {workMonthLabel}. Recipients are auto-filled from the project
              parties.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <Label htmlFor="notice-type">Notice type</Label>
            <Select value={noticeType} onValueChange={setNoticeType}>
              <SelectTrigger id="notice-type">
                <SelectValue placeholder="Select a notice type" />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Deadline countdown helper — days until the earliest open notice deadline
// ---------------------------------------------------------------------------

function earliestNoticeDays(deadlines: Deadline[]): number | null {
  const open = deadlines
    .filter((dl) => !dl.satisfiedAt && (dl.ruleKind === "notice" || dl.ruleKind === "retainage"))
    .map((dl) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const d = new Date(effectiveDeadlineDate(dl));
      d.setUTCHours(0, 0, 0, 0);
      return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    });
  if (!open.length) return null;
  return Math.min(...open);
}

// ---------------------------------------------------------------------------
// Stream card (collapsible)
// ---------------------------------------------------------------------------

function StreamCard({
  sov,
  projectId,
  onOpenFiling,
}: {
  sov: ScheduleOfValues;
  projectId: string;
  onOpenFiling: (sovId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  // Shares the TanStack Query cache with StreamDeadlinesPanel (same queryKey),
  // so this does not trigger a second network request.
  const { data } = useQuery({
    queryKey: ["stream-work-months", sov.id],
    queryFn: () =>
      apiFetch<StreamWithWorkMonths>(`/streams/${sov.id}/work-months`),
  });

  const workMonths = data?.workMonths ?? [];
  const overdueCount = workMonths.filter(
    (wm) => wm.derivedOverdue && !wm.clearedFlag,
  ).length;
  const nextDeadline = workMonths
    .flatMap((wm) => wm.deadlines)
    .filter((dl) => !dl.satisfiedAt)
    .sort(
      (a, b) =>
        new Date(effectiveDeadlineDate(a)).getTime() -
        new Date(effectiveDeadlineDate(b)).getTime(),
    )[0];

  return (
    <div className="rounded-lg border bg-muted/20">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium capitalize">
              {sov.workStream}
            </span>
            <span className="text-xs text-muted-foreground">
              Opened {new Date(sov.openedAt).toLocaleDateString()}
            </span>
          </div>
          {/* Summary line — visible when collapsed and expanded */}
          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span>
              {workMonths.length} work month{workMonths.length === 1 ? "" : "s"}
            </span>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {overdueCount} overdue
              </span>
            )}
            {nextDeadline && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 tabular-nums",
                  deadlineUrgency(effectiveDeadlineDate(nextDeadline)) === "overdue" &&
                    "text-red-600 font-medium",
                  deadlineUrgency(effectiveDeadlineDate(nextDeadline)) === "urgent" &&
                    "text-orange-600",
                  deadlineUrgency(effectiveDeadlineDate(nextDeadline)) === "upcoming" &&
                    "text-amber-600",
                )}
              >
                <Clock className="h-3 w-3" />
                Next {formatDate(effectiveDeadlineDate(nextDeadline))}
              </span>
            )}
          </div>
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onOpenFiling(sov.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOpenFiling(sov.id);
            }
          }}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 h-7 px-2.5 text-xs gap-1 cursor-pointer",
          )}
        >
          Open filing
          <ArrowRight className="h-3 w-3" />
        </span>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            STREAM_STATUS_COLORS[sov.status] ?? "bg-gray-100 text-gray-600",
          )}
        >
          {STREAM_STATUS_LABELS[sov.status] ?? sov.status}
        </span>
      </button>

      {/* Deadlines sub-panel */}
      {open && (
        <div className="px-3 pb-3">
          <StreamDeadlinesPanel streamId={sov.id} projectId={projectId} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deadline override control — set/clear a manual override on one deadline
// ---------------------------------------------------------------------------

function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function DeadlineOverrideControl({
  deadline,
  streamId,
  canEdit,
}: {
  deadline: Deadline;
  streamId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [dateValue, setDateValue] = React.useState(() =>
    toDateInputValue(effectiveDeadlineDate(deadline)),
  );

  React.useEffect(() => {
    if (open) setDateValue(toDateInputValue(effectiveDeadlineDate(deadline)));
  }, [open, deadline]);

  const mutation = useMutation({
    mutationFn: (overrideDate: string | null) =>
      apiFetch<{ deadline: Deadline }>(`/deadlines/${deadline.id}/override`, {
        method: "PATCH",
        body: JSON.stringify({ overrideDate }),
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["stream-work-months", streamId] });
      toast({
        title: vars === null ? "Override cleared" : "Deadline overridden",
        description:
          vars === null
            ? "This deadline now uses the computed date."
            : "This deadline now uses your manual date and won't be changed by recompute.",
      });
      setOpen(false);
    },
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  if (!canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {deadline.isOverridden ? "Edit override" : "Override"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override deadline</DialogTitle>
            <DialogDescription>
              Set a manual date for this deadline. The override persists and is not changed when the
              stream is recomputed. Jurisdiction rules are standards only — you are responsible for
              the date you set.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="text-xs text-muted-foreground">
              Computed date:{" "}
              <span className="font-medium text-foreground">{formatDate(deadline.adjustedDate)}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`override-${deadline.id}`}>Manual deadline date</Label>
              <Input
                id={`override-${deadline.id}`}
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {deadline.isOverridden && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive mr-auto"
                onClick={() => mutation.mutate(null)}
                disabled={mutation.isPending}
              >
                Clear override
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(dateValue)}
              disabled={mutation.isPending || !dateValue}
            >
              {mutation.isPending ? "Saving…" : "Save override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stream deadlines panel
// ---------------------------------------------------------------------------

function StreamDeadlinesPanel({
  streamId,
  projectId,
}: {
  streamId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditDeadlines = user?.role === "admin" || user?.role === "pm";
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["stream-work-months", streamId],
    queryFn: () => apiFetch<StreamWithWorkMonths>(`/streams/${streamId}/work-months`),
  });

  const { data: noticesData } = useQuery({
    queryKey: ["stream-notices", streamId],
    queryFn: () => apiFetch<{ notices: StreamNotice[] }>(`/notices?streamId=${streamId}`),
    staleTime: 30_000,
  });
  const streamNotices = noticesData?.notices ?? [];

  const recompute = useMutation({
    mutationFn: () =>
      apiFetch<StreamWithWorkMonths>(`/streams/${streamId}/recompute`, { method: "POST" }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["stream-work-months", streamId] });
      toast({
        title: "Deadlines recomputed",
        description: `${result.summary?.workMonthsProcessed ?? 0} work months, ${result.summary?.deadlinesComputed ?? 0} deadlines.`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Recompute failed", description: err.message, variant: "destructive" }),
  });

  const clearInvoice = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch(`/invoices/${invoiceId}/clear`, {
        method: "POST",
        body: JSON.stringify({ clearedFlag: true }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stream-work-months", streamId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Invoice marked cleared" });
    },
    onError: (err: Error) =>
      toast({ title: "Clear failed", description: err.message, variant: "destructive" }),
  });

  const markDelivered = useMutation({
    mutationFn: (noticeId: string) =>
      apiFetch<{ notice: StreamNotice }>(`/notices/${noticeId}/deliver`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stream-notices", streamId] });
      toast({ title: "Delivery confirmed", description: "Notice marked as delivered." });
    },
    onError: (err: Error) =>
      toast({ title: "Could not confirm delivery", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="py-3 text-xs text-muted-foreground">Loading deadlines…</div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-2 text-xs text-destructive">Could not load deadline data.</div>
    );
  }

  const { workMonths } = data;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Work Months & Deadlines
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={recompute.isPending}
          onClick={() => recompute.mutate()}
        >
          <RefreshCw className={cn("h-3 w-3", recompute.isPending && "animate-spin")} />
          Recompute
        </Button>
      </div>

      {workMonths.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No work months derived yet. Click Recompute to derive from timesheets.
        </p>
      ) : (
        <div className="space-y-3">
          {workMonths.map((wm) => {
            const wmNotices = streamNotices.filter((n) => n.workMonthId === wm.id);
            const noticeDays = earliestNoticeDays(wm.deadlines);

            return (
              <div key={wm.id} className="rounded-lg border bg-card p-3 space-y-2">
                {/* Work month header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{formatMonth(wm.month)}</span>
                    {wm.derivedOverdue && !wm.clearedFlag && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        Overdue
                      </span>
                    )}
                    {wm.clearedFlag && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Cleared
                      </span>
                    )}
                    {/* Notice badges */}
                    {wmNotices.map((notice) => (
                      <NoticeBadge
                        key={notice.id}
                        notice={notice}
                        onNavigate={() => navigate(`/send-queue?notice=${notice.id}`)}
                      />
                    ))}
                    {/* Countdown for open notice deadlines when no notice exists yet */}
                    {wmNotices.length === 0 && noticeDays !== null && (
                      <DeadlineCountdown days={noticeDays} />
                    )}
                    {/* Inline create-notice action when no notice exists yet */}
                    {wmNotices.length === 0 && (
                      <CreateNoticeButton
                        streamId={streamId}
                        workMonthId={wm.id}
                        workMonthLabel={formatMonth(wm.month)}
                      />
                    )}
                  </div>
                  {wm.invoiceLinkId && !wm.clearedFlag && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 px-2"
                      disabled={clearInvoice.isPending}
                      onClick={() => clearInvoice.mutate(wm.invoiceLinkId!)}
                    >
                      Mark Cleared
                    </Button>
                  )}
                </div>

                {/* Deadlines */}
                {wm.deadlines.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-5">
                    No deadlines computed — run Recompute above.
                  </p>
                ) : (
                  <div className="space-y-1.5 pl-1">
                    {wm.deadlines.map((dl) => {
                      const effectiveDate = effectiveDeadlineDate(dl);
                      const urgency = deadlineUrgency(effectiveDate);
                      const isSatisfied = !!dl.satisfiedAt;

                      return (
                        <div
                          key={dl.id}
                          className={cn(
                            "rounded border px-3 py-2 flex items-start justify-between gap-3",
                            isSatisfied
                              ? "bg-gray-50 border-gray-200 opacity-60"
                              : RULE_KIND_COLORS[dl.ruleKind] ?? "bg-gray-50 border-gray-200",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold">
                                {RULE_KIND_LABELS[dl.ruleKind] ?? dl.ruleKind}
                              </span>
                              {dl.rule?.statuteCitation && (
                                <span className="text-xs opacity-70 font-mono">
                                  {dl.rule.statuteCitation}
                                </span>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs text-xs font-mono p-2">
                                    <p className="font-semibold mb-1 text-foreground not-italic">Source data</p>
                                    {Object.entries(dl.sourceData ?? {}).map(([k, v]) => (
                                      <div key={k} className="flex gap-1">
                                        <span className="text-muted-foreground w-28 shrink-0">{k}:</span>
                                        <span className="break-all">
                                          {Array.isArray(v) ? v.join(", ") : String(v)}
                                        </span>
                                      </div>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {isSatisfied && (
                                <Badge variant="outline" className="text-xs h-4 px-1 text-green-700 border-green-300">
                                  Satisfied
                                </Badge>
                              )}
                              {dl.isOverridden && (
                                <Badge variant="outline" className="text-xs h-4 px-1 text-indigo-700 border-indigo-300 bg-indigo-50">
                                  Overridden
                                </Badge>
                              )}
                            </div>
                            {dl.rule?.description && (
                              <p className="text-xs opacity-70 mt-0.5 truncate">{dl.rule.description}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={cn(
                                "text-xs font-semibold tabular-nums",
                                !isSatisfied && urgency === "overdue" && "text-red-700",
                                !isSatisfied && urgency === "urgent" && "text-orange-700",
                                !isSatisfied && urgency === "upcoming" && "text-amber-700",
                                (isSatisfied || urgency === "future") && "text-muted-foreground",
                              )}
                            >
                              {formatDate(effectiveDate)}
                            </div>
                            {dl.isOverridden ? (
                              <div className="text-xs text-muted-foreground line-through">
                                {formatDate(dl.adjustedDate)}
                              </div>
                            ) : (
                              dl.computedDate !== dl.adjustedDate && (
                                <div className="text-xs text-muted-foreground line-through">
                                  {formatDate(dl.computedDate)}
                                </div>
                              )
                            )}
                            {!isSatisfied && (
                              <div
                                className={cn(
                                  "text-xs mt-0.5",
                                  urgency === "overdue" && "text-red-600 font-medium",
                                  urgency === "urgent" && "text-orange-600",
                                  urgency === "upcoming" && "text-amber-600",
                                  urgency === "future" && "text-muted-foreground",
                                )}
                              >
                                {urgency === "overdue" && "Past due"}
                                {urgency === "urgent" && "≤7 days"}
                                {urgency === "upcoming" && "≤30 days"}
                                {urgency === "future" && "Upcoming"}
                              </div>
                            )}
                            {!isSatisfied && canEditDeadlines && (
                              <div className="mt-1">
                                <DeadlineOverrideControl
                                  deadline={dl}
                                  streamId={streamId}
                                  canEdit={canEditDeadlines}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Send / deliver timeline for sent or delivered notices */}
                {wmNotices
                  .filter((n) => n.status === "sent" || n.status === "delivered")
                  .map((notice) => (
                    <div
                      key={`events-${notice.id}`}
                      className="rounded border border-dashed bg-muted/30 px-3 py-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        <Send className="h-3 w-3" />
                        Certified Mail
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-medium">Sent</span>
                          {notice.sentAt && (
                            <span className="text-muted-foreground"> · {formatDate(notice.sentAt)}</span>
                          )}
                          {notice.mailing?.trackingNumber && (
                            <span className="block font-mono text-[11px] text-muted-foreground break-all">
                              Tracking: {notice.mailing.trackingNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      {notice.status === "delivered" ? (
                        <div className="flex items-start gap-2 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-medium text-green-700">Delivered</span>
                            {notice.deliveredAt && (
                              <span className="text-muted-foreground"> · {formatDate(notice.deliveredAt)}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pl-5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">In transit</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={markDelivered.isPending}
                            onClick={() => markDelivered.mutate(notice.id)}
                          >
                            Mark delivered
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Last Time on Job panel
// ---------------------------------------------------------------------------

interface LastTimelogEntry {
  connecteamUserId: string;
  displayName: string;
  lastWorkDate: string | null;
}

function LastTimeOnJobPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["last-timelog", projectId],
    queryFn: () =>
      apiFetch<{ employees: LastTimelogEntry[] }>(`/projects/${projectId}/last-timelog`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const employees = data?.employees ?? [];

  function daysSince(iso: string): number {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const d = new Date(iso);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  function freshnessColor(iso: string): string {
    const days = daysSince(iso);
    if (days <= 7) return "text-green-700";
    if (days <= 30) return "text-amber-700";
    return "text-red-700";
  }

  return (
    <div className="rounded-lg border bg-muted/10">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold hover:opacity-80 transition-opacity"
        >
          <Clock className="h-4 w-4 text-primary" />
          Last Time on Job
          {employees.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {employees.length}
            </Badge>
          )}
        </button>
      </div>

      {open && (
        <div className="border-t px-4 pb-4 pt-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-2">Loading…</p>
          ) : employees.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No timesheets synced yet. Run Recompute on a lien stream to pull from Connecteam.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Clock-In</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Days Ago</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.connecteamUserId} className="border-b last:border-0 bg-card">
                      <td className="px-3 py-2 font-medium">{emp.displayName}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {emp.lastWorkDate ? formatDate(emp.lastWorkDate) : "—"}
                      </td>
                      <td className={cn("px-3 py-2 tabular-nums font-medium", emp.lastWorkDate ? freshnessColor(emp.lastWorkDate) : "text-muted-foreground")}>
                        {emp.lastWorkDate ? `${daysSince(emp.lastWorkDate)}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AR — customer invoices (receivables) with notice-eligibility indicators
// ---------------------------------------------------------------------------

function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date();
}

/** A customer invoice is a candidate for a pre-lien notice when it is unpaid,
 *  not yet cleared, and already past its due date. This is an at-a-glance
 *  indicator — the binding notice deadlines live on each work month. */
function invoiceNoticeEligible(inv: Invoice): boolean {
  return !inv.clearedFlag && inv.qboStatus !== "paid" && isOverdue(inv.dueDate);
}

function ARPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: qboStatus } = useQuery({
    queryKey: ["qbo-status"],
    queryFn: () => apiFetch<{ connected: boolean }>("/config/qbo-status"),
    staleTime: 60_000,
  });
  const connected = qboStatus?.connected ?? false;

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoices", projectId],
    queryFn: () => apiFetch<{ invoices: Invoice[] }>(`/invoices?projectId=${projectId}`),
    enabled: !!projectId,
  });
  const invoices = (invoiceData?.invoices ?? []).filter((inv) => !inv.isSupplierInvoice);

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ synced: number; skipped: boolean; reason?: string }>("/invoices/sync", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["invoices", projectId] });
      if (result.skipped) {
        toast({ title: "Sync skipped", description: result.reason ?? "QBO credentials not configured" });
      } else {
        toast({
          title: "Invoices synced",
          description: `${result.synced} invoice${result.synced !== 1 ? "s" : ""} pulled from QuickBooks.`,
        });
      }
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: ({ id, flag }: { id: string; flag: boolean }) =>
      apiFetch(`/invoices/${id}/clear`, { method: "POST", body: JSON.stringify({ clearedFlag: flag }) }),
    onMutate: async ({ id, flag }) => {
      await qc.cancelQueries({ queryKey: ["invoices", projectId] });
      const prev = qc.getQueryData<{ invoices: Invoice[] }>(["invoices", projectId]);
      qc.setQueryData<{ invoices: Invoice[] }>(["invoices", projectId], (old) =>
        old ? { invoices: old.invoices.map((inv) => (inv.id === id ? { ...inv, clearedFlag: flag } : inv)) } : old,
      );
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["invoices", projectId], ctx.prev);
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["invoices", projectId] }),
  });

  function rowColor(inv: Invoice): string {
    if (inv.clearedFlag) return "bg-teal-50 border-teal-200";
    if (inv.qboStatus === "paid") return "bg-green-50 border-green-200";
    if (isOverdue(inv.dueDate)) return "bg-red-50 border-red-200";
    return "bg-card border-border";
  }

  function statusBadge(inv: Invoice) {
    if (inv.clearedFlag)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-700 px-2 py-0.5 text-xs font-medium">
          <CheckCircle2 className="h-3 w-3" /> Cleared
        </span>
      );
    if (inv.qboStatus === "paid")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
          <CheckCircle2 className="h-3 w-3" /> Paid
        </span>
      );
    if (isOverdue(inv.dueDate))
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
          <AlertTriangle className="h-3 w-3" /> Overdue
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
        <Clock className="h-3 w-3" /> Open
      </span>
    );
  }

  function noticeBadge(inv: Invoice) {
    if (inv.clearedFlag || inv.qboStatus === "paid")
      return <span className="text-xs text-muted-foreground">—</span>;
    if (invoiceNoticeEligible(inv))
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium cursor-help">
                <Bell className="h-3 w-3" /> Eligible
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">
              Unpaid and past due — a candidate for a pre-lien notice. Open the lien stream to send.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">
        <Clock className="h-3 w-3" /> Monitoring
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ArrowDownCircle className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Accounts Receivable</h3>
          <span className="text-xs text-muted-foreground">— customer invoices</span>
        </div>
        {connected ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            <RefreshCw className={cn("h-3 w-3", syncMutation.isPending && "animate-spin")} />
            Sync QBO
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <LinkIcon className="h-3 w-3" />
            Not connected —{" "}
            <a href="/config" className="underline hover:text-foreground">add credentials</a>
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No customer invoices on record.{" "}
          {connected ? "Click Sync QBO to pull from QuickBooks." : "Connect QBO credentials to enable sync."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Due Date</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notice</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Cleared</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className={cn("border-b last:border-0", rowColor(inv))}>
                  <td className="px-3 py-2 font-mono">{inv.qboInvoiceId ? `#${inv.qboInvoiceId}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(inv.dueDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ${Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2">{statusBadge(inv)}</td>
                  <td className="px-3 py-2">{noticeBadge(inv)}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={inv.clearedFlag}
                      disabled={clearMutation.isPending}
                      onChange={(e) => clearMutation.mutate({ id: inv.id, flag: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer"
                      title={inv.clearedFlag ? "Mark as not cleared" : "Mark as cleared"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AP — supplier bills (payables) + holds
// ---------------------------------------------------------------------------

interface ProjectHold {
  id: string;
  holdType: string;
  reason: string;
  setAt: string;
}

function APPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoices", projectId],
    queryFn: () => apiFetch<{ invoices: Invoice[] }>(`/invoices?projectId=${projectId}`),
    enabled: !!projectId,
  });
  const bills = (invoiceData?.invoices ?? []).filter((inv) => inv.isSupplierInvoice);

  const { data: holdsData } = useQuery({
    queryKey: ["project-holds", projectId],
    queryFn: () => apiFetch<{ holds: ProjectHold[] }>(`/holds?projectId=${projectId}`),
    enabled: !!projectId,
  });
  const holds = holdsData?.holds ?? [];

  const recompute = useMutation({
    mutationFn: () => apiFetch("/holds/recompute", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-holds", projectId] });
      toast({ title: "Holds recomputed", description: "Schedule & material holds re-evaluated." });
    },
    onError: (err: Error) => toast({ title: "Recompute failed", description: err.message, variant: "destructive" }),
  });

  function rowColor(inv: Invoice): string {
    if (inv.qboStatus === "paid") return "bg-green-50 border-green-200";
    if (isOverdue(inv.dueDate)) return "bg-red-50 border-red-200";
    return "bg-card border-border";
  }

  function statusBadge(inv: Invoice) {
    if (inv.qboStatus === "paid")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
          <CheckCircle2 className="h-3 w-3" /> Paid
        </span>
      );
    if (isOverdue(inv.dueDate))
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
          <AlertTriangle className="h-3 w-3" /> Overdue
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
        <Clock className="h-3 w-3" /> Unpaid
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Accounts Payable</h3>
          <span className="text-xs text-muted-foreground">— supplier bills</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={recompute.isPending}
          onClick={() => recompute.mutate()}
        >
          <RefreshCw className={cn("h-3 w-3", recompute.isPending && "animate-spin")} />
          Recompute Holds
        </Button>
      </div>

      {/* Active holds on this project */}
      {holds.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-sm font-medium text-red-800">Active Holds</span>
          </div>
          {holds.map((h) => (
            <div key={h.id} className="flex items-center gap-2 ml-6">
              <span
                className={cn(
                  "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                  h.holdType === "schedule_hold" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700",
                )}
              >
                {h.holdType === "schedule_hold" ? "Schedule Hold" : "Material Hold"}
              </span>
              <span className="text-xs text-red-700">{h.reason}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-green-600" />
          No active holds. Holds are auto-evaluated from overdue invoices — use Recompute Holds to re-check.
        </div>
      )}

      {/* Supplier bills */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading bills…</p>
      ) : bills.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No supplier bills on record for this project.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Bill #</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Due Date</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((inv) => (
                <tr key={inv.id} className={cn("border-b last:border-0", rowColor(inv))}>
                  <td className="px-3 py-2 font-mono">{inv.qboInvoiceId ? `#${inv.qboInvoiceId}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(inv.dueDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ${Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2">{statusBadge(inv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waivers tab — project waivers summary
// ---------------------------------------------------------------------------

interface ProjectWaiver {
  id: string;
  workStream: string;
  waiverType: string;
  paymentAmount: string;
  approvalStatus: string;
  notarized: boolean;
  signedDate: string | null;
  providedToGc: boolean;
}

const WAIVER_TYPE_LABELS: Record<string, string> = {
  conditional_progress: "Conditional Progress",
  unconditional_progress: "Unconditional Progress",
  conditional_final: "Conditional Final",
  unconditional_final: "Unconditional Final",
};

const WAIVER_STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  pending_pm: "bg-amber-100 text-amber-700",
  pending_finance: "bg-amber-100 text-amber-700",
  not_required: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
};

function WaiversPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["project-waivers", projectId],
    queryFn: () => apiFetch<{ waivers: ProjectWaiver[] }>(`/waivers?projectId=${projectId}`),
    enabled: !!projectId,
  });
  const waivers = data?.waivers ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Lien Waivers</h3>
        </div>
        <a href="/waivers" className="text-xs underline text-muted-foreground hover:text-foreground">
          Open Waivers
        </a>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading waivers…</p>
      ) : waivers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No waivers on record for this project.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Stream</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notarized</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Signed</th>
              </tr>
            </thead>
            <tbody>
              {waivers.map((w) => (
                <tr key={w.id} className="border-b last:border-0 bg-card">
                  <td className="px-3 py-2 font-medium">{WAIVER_TYPE_LABELS[w.waiverType] ?? w.waiverType}</td>
                  <td className="px-3 py-2 capitalize">{w.workStream}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ${Number(w.paymentAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        WAIVER_STATUS_COLORS[w.approvalStatus] ?? "bg-gray-100 text-gray-600",
                      )}
                    >
                      {w.approvalStatus.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {w.notarized ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {w.signedDate ? formatDate(w.signedDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices tab — project notices summary (across streams)
// ---------------------------------------------------------------------------

const NOTICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  approved: "bg-blue-100 text-blue-700",
  sent: "bg-amber-100 text-amber-700",
  delivered: "bg-green-100 text-green-700",
};

const NOTICE_TYPE_LABELS: Record<string, string> = {
  early_warning: "Early Warning",
  statutory_claim: "Monthly Notice",
  retainage_claim: "Retainage Claim",
};

function NoticesPanel({ projectId }: { projectId: string }) {
  const navigate = useLocation()[1];
  const { data, isLoading } = useQuery({
    queryKey: ["project-notices", projectId],
    queryFn: () => apiFetch<{ notices: StreamNotice[] }>(`/notices?projectId=${projectId}`),
    enabled: !!projectId,
  });
  const notices = data?.notices ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Notices</h3>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading notices…</p>
      ) : notices.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No notices yet. Notices are created per work month on the lien streams above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Month</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Claim</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sent</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id} className="border-b last:border-0 bg-card">
                  <td className="px-3 py-2 font-medium">{NOTICE_TYPE_LABELS[n.noticeType] ?? n.noticeType}</td>
                  <td className="px-3 py-2">{n.monthListed ? formatMonth(n.monthListed) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {n.claimAmount
                      ? `$${Number(n.claimAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        NOTICE_STATUS_COLORS[n.status] ?? "bg-gray-100 text-gray-600",
                      )}
                    >
                      {n.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {n.sentAt ? formatDate(n.sentAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/send-queue?notice=${n.id}`)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parties tab
// ---------------------------------------------------------------------------

function PartiesPanel({
  projectId,
  parties,
  contractorTier,
}: {
  projectId: string;
  parties: Party[];
  contractorTier: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addParty, setAddParty] = React.useState({
    hubspotCompanyId: "",
    partyRelationType: "",
    cachedLegalName: "",
    cachedMailingAddress: "",
  });

  const addPartyMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/projects/${projectId}/parties`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: { party: Party; warnings: string[] }) => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      if (res.warnings?.length) {
        toast({ title: "Party added", description: res.warnings.join(" | ") });
      } else {
        toast({ title: "Party added" });
      }
      setAddParty({ hubspotCompanyId: "", partyRelationType: "", cachedLegalName: "", cachedMailingAddress: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeParty = useMutation({
    mutationFn: (partyId: string) =>
      apiFetch(`/projects/${projectId}/parties/${partyId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Party removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Parties</h3>
        {contractorTier === "second_tier" && (
          <span className="text-xs text-muted-foreground ml-1">
            — 2nd-tier requires hiring party + original contractor
          </span>
        )}
      </div>

      {parties.length === 0 ? (
        <p className="text-sm text-muted-foreground">No parties added yet.</p>
      ) : (
        <div className="space-y-2">
          {parties.map((party) => (
            <div key={party.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{party.cachedLegalName}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {PARTY_ROLE_LABELS[party.partyRelationType] ?? party.partyRelationType}
                  </Badge>
                </div>
                {party.cachedMailingAddress && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{party.cachedMailingAddress}</p>
                )}
              </div>
              <button
                type="button"
                title="Remove party"
                className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                onClick={() => removeParty.mutate(party.id)}
                disabled={removeParty.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add Party</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select
              value={addParty.partyRelationType}
              onValueChange={(v) => setAddParty((p) => ({ ...p, partyRelationType: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="original_contractor">Original Contractor (GC)</SelectItem>
                <SelectItem value="hiring_party">Hiring Party</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">HubSpot Company ID</Label>
            <Input
              placeholder="hs_co_…"
              className="h-8 text-xs"
              value={addParty.hubspotCompanyId}
              onChange={(e) => setAddParty((p) => ({ ...p, hubspotCompanyId: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Legal Name</Label>
            <Input
              placeholder="Legal entity name"
              className="h-8 text-xs"
              value={addParty.cachedLegalName}
              onChange={(e) => setAddParty((p) => ({ ...p, cachedLegalName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mailing Address (optional)</Label>
            <Input
              placeholder="123 Main St, City, TX"
              className="h-8 text-xs"
              value={addParty.cachedMailingAddress}
              onChange={(e) => setAddParty((p) => ({ ...p, cachedMailingAddress: e.target.value }))}
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!addParty.partyRelationType || !addParty.hubspotCompanyId || addPartyMutation.isPending}
          onClick={() => addPartyMutation.mutate(addParty)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Party
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lien Setup card (left rail) — self-contained so it manages its own form
// ---------------------------------------------------------------------------

function LienSetupCard({ projectId, project }: { projectId: string; project: Project }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = React.useState({
    contractorTier: project.contractorTier,
    legalPropertyAddress: project.legalPropertyAddress ?? "",
    county: project.county ?? "",
    contractStartDate: project.contractStartDate ? project.contractStartDate.slice(0, 10) : "",
  });

  const patchProject = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-3 border-t p-3" style={{ borderColor: "var(--helm-border)" }}>
      <div className="flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-base)" }}>Lien Setup</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">Contractor Tier</Label>
        <Select value={form.contractorTier} onValueChange={(v) => setForm((f) => ({ ...f, contractorTier: v }))}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first_tier">1st Tier</SelectItem>
            <SelectItem value="second_tier">2nd Tier</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">County</Label>
        <Input
          placeholder="e.g. Travis"
          className="h-8 text-xs"
          value={form.county}
          onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">Legal Property Address</Label>
        <Input
          placeholder="100 Main St, Austin, TX"
          className="h-8 text-xs"
          value={form.legalPropertyAddress}
          onChange={(e) => setForm((f) => ({ ...f, legalPropertyAddress: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">Contract Start Date</Label>
        <Input
          type="date"
          className="h-8 text-xs"
          value={form.contractStartDate}
          onChange={(e) => setForm((f) => ({ ...f, contractStartDate: e.target.value }))}
        />
      </div>

      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={patchProject.isPending}
        onClick={() =>
          patchProject.mutate({
            contractorTier: form.contractorTier,
            legalPropertyAddress: form.legalPropertyAddress || null,
            county: form.county || null,
            contractStartDate: form.contractStartDate || null,
          })
        }
      >
        Save Setup
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming Deadlines card (right rail) — nearest unsatisfied deadline / stream
// ---------------------------------------------------------------------------

function StreamUpcomingRow({ stream }: { stream: ScheduleOfValues }) {
  const { data } = useQuery({
    queryKey: ["stream-work-months", stream.id],
    queryFn: () => apiFetch<StreamWithWorkMonths>(`/streams/${stream.id}/work-months`),
  });

  const next = React.useMemo(() => {
    const all = (data?.workMonths ?? [])
      .flatMap((wm) => wm.deadlines)
      .filter((dl) => !dl.satisfiedAt)
      .sort(
        (a, b) =>
          new Date(effectiveDeadlineDate(a)).getTime() -
          new Date(effectiveDeadlineDate(b)).getTime(),
      );
    return all[0] ?? null;
  }, [data]);

  return (
    <div className="rounded-md border p-2.5" style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium capitalize" style={{ color: "var(--text-base)" }}>
          {stream.workStream.replace(/_/g, " ")}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted-color)" }}>
          {stream.status.replace(/_/g, " ")}
        </span>
      </div>
      {next ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11.5px]" style={{ color: "var(--text-dim)" }}>
            {RULE_KIND_LABELS[next.ruleKind] ?? next.ruleKind}
          </span>
          <span
            className={cn(
              "text-[11.5px] font-semibold tabular-nums",
              deadlineUrgency(effectiveDeadlineDate(next)) === "overdue" && "text-red-600",
              deadlineUrgency(effectiveDeadlineDate(next)) === "urgent" && "text-orange-600",
              deadlineUrgency(effectiveDeadlineDate(next)) === "upcoming" && "text-amber-600",
            )}
          >
            {formatDate(effectiveDeadlineDate(next))}
          </span>
        </div>
      ) : (
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted-color)" }}>
          No upcoming deadlines.
        </p>
      )}
    </div>
  );
}

function UpcomingDeadlinesCard({ streams }: { streams: ScheduleOfValues[] }) {
  return (
    <Panel title="Deadlines">
      <div className="flex flex-col gap-2 p-3">
        {streams.length === 0 ? (
          <p className="text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>
            No lien streams open.
          </p>
        ) : (
          streams.map((s) => <StreamUpcomingRow key={s.id} stream={s} />)
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface HoldsData {
  holds: { id: string; holdType: string; reason: string; setAt: string }[];
}

function DeadlinesTab({
  id,
  data,
  holdsData,
  onOpenFiling,
  showHolds,
}: {
  id: string;
  data: ProjectDetailResponse;
  holdsData?: HoldsData;
  onOpenFiling: (streamId: string) => void;
  showHolds: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { project, parties, sovs: streams, checklist } = data;

  // New stream form state
  const [newStream, setNewStream] = React.useState({ workStream: "" });

  const openStream = useMutation({
    mutationFn: (body: { lienProjectId: string; workStream: string }) =>
      apiFetch("/streams/open", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      toast({ title: "Stream opened" });
      setNewStream({ workStream: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  useLeftPanel(
    <Panel title="Project">
      <div className="flex flex-col gap-3 p-3">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text-base)" }}>
            {project.cachedProjectName ?? project.hubspotProjectId}
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {[
              { label: "County", value: project.county ?? "—" },
              { label: "Tier", value: project.contractorTier.replace(/_/g, " ") },
              { label: "Workflow", value: project.lienWorkflowType.replace(/_/g, " ") },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2">
                <span className="text-[11px]" style={{ color: "var(--text-muted-color)" }}>{r.label}</span>
                <span className="text-[11.5px] font-medium capitalize" style={{ color: "var(--text-dim)" }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div
            className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted-color)" }}
          >
            Lien Streams
          </div>
          {streams.length > 0 ? (
            <div className="flex flex-col gap-1">
              {streams.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpenFiling(s.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left hover:opacity-80"
                  style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)" }}
                >
                  <span className="truncate text-[12px] font-medium capitalize" style={{ color: "var(--text-base)" }}>
                    {s.workStream.replace(/_/g, " ")}
                  </span>
                  <span
                    className="shrink-0 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-muted-color)" }}
                  >
                    {s.status.replace(/_/g, " ")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[11.5px]" style={{ color: "var(--text-muted-color)" }}>No lien streams</div>
          )}
        </div>
      </div>
      <LienSetupCard key={id} projectId={id} project={project} />
    </Panel>,
    [data, id],
  );

  useRightPanel(
    <div className="flex flex-col gap-3">
      <UpcomingDeadlinesCard streams={streams} />
      <Panel title="Crew Activity">
        <div className="p-3">
          <LastTimeOnJobPanel projectId={id} />
        </div>
      </Panel>
    </div>,
    [data, id],
  );

  const activeHolds = holdsData?.holds ?? [];
  const existingStreamTypes = new Set(streams.map((s) => s.workStream));

  return (
      <div className="space-y-6 max-w-3xl">
        {/* Active holds banner — only when toggled via the header "Holds" badge */}
        {showHolds && activeHolds.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-600 shrink-0" />
              <span className="text-sm font-medium text-red-800">Active Holds</span>
            </div>
            {activeHolds.map((hold) => (
              <div key={hold.id} className="flex items-center gap-2 ml-6">
                <span
                  className={cn(
                    "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                    hold.holdType === "schedule_hold"
                      ? "bg-red-100 text-red-700"
                      : "bg-orange-100 text-orange-700",
                  )}
                >
                  {hold.holdType === "schedule_hold" ? "Schedule Hold" : "Material Hold"}
                </span>
                <span className="text-xs text-red-700">{hold.reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Checklist — only when incomplete (the header badge already signals "Setup Complete") */}
        {!checklist.complete && (
          <ChecklistPanel checklist={checklist} contractorTier={project.contractorTier} />
        )}

        <Separator />

        {/* Lien Streams + Deadlines */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Lien Streams</h2>
          </div>

          {streams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No streams opened yet.</p>
          ) : (
            <div className="space-y-4">
              {streams.map((s) => (
                <StreamCard
                  key={s.id}
                  sov={s}
                  projectId={id!}
                  onOpenFiling={onOpenFiling}
                />
              ))}
            </div>
          )}

          {/* Open new stream */}
          {(project.lienWorkflowType !== "none") && (
            <div className="rounded-lg border border-dashed bg-muted/10 p-3 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Open Stream
              </p>
              <div className="flex items-center gap-2">
                <Select
                  value={newStream.workStream}
                  onValueChange={(v) => setNewStream({ workStream: v })}
                >
                  <SelectTrigger className="h-8 text-xs w-44">
                    <SelectValue placeholder="Select stream…" />
                  </SelectTrigger>
                  <SelectContent>
                    {!existingStreamTypes.has("construction") && (
                      <SelectItem value="construction">Construction</SelectItem>
                    )}
                    {!existingStreamTypes.has("design") && (
                      <SelectItem value="design">Design</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!newStream.workStream || openStream.isPending}
                  onClick={() =>
                    openStream.mutate({ lienProjectId: id!, workStream: newStream.workStream })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Open
                </Button>
              </div>
              {existingStreamTypes.size === 2 && (
                <p className="text-xs text-muted-foreground">Both streams are already open.</p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Ledger sub-tabs */}
        <Tabs defaultValue="ar" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="ar" className="gap-1.5 text-xs">
              <ArrowDownCircle className="h-3.5 w-3.5" /> AR
            </TabsTrigger>
            <TabsTrigger value="ap" className="gap-1.5 text-xs">
              <ArrowUpCircle className="h-3.5 w-3.5" /> AP
            </TabsTrigger>
            <TabsTrigger value="waivers" className="gap-1.5 text-xs">
              <FileSignature className="h-3.5 w-3.5" /> Waivers
            </TabsTrigger>
            <TabsTrigger value="notices" className="gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" /> Notices
            </TabsTrigger>
            <TabsTrigger value="parties" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Parties
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ar" className="mt-4">
            <ARPanel projectId={id!} />
          </TabsContent>
          <TabsContent value="ap" className="mt-4">
            <APPanel projectId={id!} />
          </TabsContent>
          <TabsContent value="waivers" className="mt-4">
            <WaiversPanel projectId={id!} />
          </TabsContent>
          <TabsContent value="notices" className="mt-4">
            <NoticesPanel projectId={id!} />
          </TabsContent>
          <TabsContent value="parties" className="mt-4">
            <PartiesPanel projectId={id!} parties={parties} contractorTier={project.contractorTier} />
          </TabsContent>
        </Tabs>
      </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<ProjectDetailResponse>(`/projects/${id}`),
    retry: false,
    enabled: !!id,
  });

  const { data: holdsData } = useQuery({
    queryKey: ["project-holds", id],
    queryFn: () =>
      apiFetch<HoldsData>(`/holds?projectId=${id}`),
    enabled: !!id,
  });

  const [showHolds, setShowHolds] = React.useState(false);

  const streams = data?.sovs ?? [];

  // Filing Workspace now lives at its own route (/filing/:streamId), reached via
  // the Filings menu or a stream's "Open filing" action.
  function openFiling(streamId: string) {
    setLocation(`/filing/${streamId}`);
  }

  if (isLoading) {
    return (
      <Screen>
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Loading project…
        </div>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {(error as Error)?.message?.includes("401")
            ? "Your session has expired — please refresh the page to sign in again."
            : `Failed to load project: ${(error as Error)?.message}`}
        </div>
      </Screen>
    );
  }

  const { project, subSystemType } = data;
  const activeHolds = holdsData?.holds ?? [];
  // "Link to Filing" is only unambiguous when there's exactly one stream; with
  // multiple streams, use each stream card's "Open filing" action instead.
  const soleStream = streams.length === 1 ? streams[0] : null;

  return (
    <Screen className="pt-0 md:pt-0">
      <div className="flex flex-col gap-4">
        <WorkspaceHeader
          title={project.cachedProjectName ?? project.hubspotProjectId}
          subtitle={
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  WORKFLOW_COLORS[project.lienWorkflowType] ?? "bg-gray-100 text-gray-600",
                )}
              >
                {WORKFLOW_LABELS[project.lienWorkflowType] ?? project.lienWorkflowType}
              </span>
              {project.contractorTier === "second_tier" && (
                <Badge variant="outline" className="text-xs">2nd Tier</Badge>
              )}
              {project.cachedHubspotStatus && (
                <span className="text-xs capitalize" style={{ color: "var(--text-muted-color)" }}>
                  HubSpot: {project.cachedHubspotStatus}
                </span>
              )}
              {subSystemType && (
                <span className="text-xs" style={{ color: "var(--text-muted-color)" }}>
                  {subSystemType.name}
                </span>
              )}
            </div>
          }
          right={
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLocation("/liens")}
                  className="inline-flex items-center gap-1 text-[12px] transition-colors hover:opacity-80"
                  style={{ color: "var(--text-dim)" }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Projects
                </button>
                {soleStream && (
                  <button
                    type="button"
                    onClick={() => openFiling(soleStream.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:opacity-80"
                    style={{
                      background: "var(--surface-2)",
                      borderColor: "var(--helm-border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    <Gavel className="h-3.5 w-3.5" />
                    Link to Filing
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {activeHolds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHolds((v) => !v)}
                    aria-pressed={showHolds}
                    title={showHolds ? "Hide hold details" : "Show hold details"}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                      showHolds
                        ? "bg-red-600 text-white"
                        : "bg-red-100 text-red-700 hover:bg-red-200",
                    )}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    {activeHolds.length} Hold{activeHolds.length !== 1 ? "s" : ""}
                  </button>
                )}
                {project.completionChecklistComplete ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 px-3 py-1 text-xs font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Setup Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-medium">
                    <XCircle className="h-3.5 w-3.5" />
                    Incomplete Setup
                  </span>
                )}
              </div>
            </div>
          }
        />

        <DeadlinesTab
          id={id!}
          data={data}
          holdsData={holdsData}
          onOpenFiling={openFiling}
          showHolds={showHolds}
        />
      </div>
    </Screen>
  );
}
