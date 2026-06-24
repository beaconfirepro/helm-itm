import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { Screen } from "@/components/primitives/Screen";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  Users as UsersIcon,
  Clock,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Fetch helper (session cookie — mirrors the pattern used across the app)
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

type Role = "admin" | "pm" | "finance" | "coordinator";

interface TeamUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: Role | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  pm: "Project Manager",
  finance: "Finance",
  coordinator: "Coordinator",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access, including team & company settings",
  pm: "Approves project-level actions",
  finance: "Approves finance-level actions",
  coordinator: "Day-to-day lien & notice work",
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pm: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  finance: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  coordinator: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

const ROLE_OPTIONS: Role[] = ["admin", "pm", "finance", "coordinator"];
const NO_ROLE_VALUE = "__none__";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayName(u: TeamUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "Unknown user";
}

function initials(u: TeamUser): string {
  const f = u.firstName?.trim()?.[0] ?? "";
  const l = u.lastName?.trim()?.[0] ?? "";
  const i = `${f}${l}`.toUpperCase();
  if (i) return i;
  return (u.email?.trim()?.[0] ?? "?").toUpperCase();
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return "Just now";
  if (diffMs < 60 * 60 * 1000) {
    const m = Math.floor(diffMs / (60 * 1000));
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / (60 * 60 * 1000));
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 7 * day) {
    const dd = Math.floor(diffMs / day);
    return `${dd} day${dd === 1 ? "" : "s"} ago`;
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Role selector
// ---------------------------------------------------------------------------

function RoleSelect({
  user,
  isSelf,
  onChange,
  pending,
}: {
  user: TeamUser;
  isSelf: boolean;
  onChange: (role: Role | null) => void;
  pending: boolean;
}) {
  // An admin cannot demote themselves (would risk locking everyone out of
  // this screen) — the control is disabled with an explanatory title.
  const lockSelf = isSelf && user.role === "admin";
  return (
    <Select
      value={user.role ?? NO_ROLE_VALUE}
      disabled={pending || lockSelf}
      onValueChange={(v) => onChange(v === NO_ROLE_VALUE ? null : (v as Role))}
    >
      <SelectTrigger
        className="h-9 w-[200px] text-[13px]"
        title={
          lockSelf
            ? "You can't change your own admin role — ask another admin"
            : undefined
        }
      >
        <SelectValue placeholder="No access" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ROLE_VALUE}>
          <span className="text-muted-foreground">No access</span>
        </SelectItem>
        {ROLE_OPTIONS.map((r) => (
          <SelectItem key={r} value={r}>
            <div className="flex flex-col">
              <span>{ROLE_LABELS[r]}</span>
              <span className="text-[11px] text-muted-foreground">
                {ROLE_DESCRIPTIONS[r]}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Access-restricted screen (non-admins)
// ---------------------------------------------------------------------------

function Restricted() {
  return (
    <Screen>
      <div className="mx-auto mt-16 max-w-md text-center">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl"
          style={{ background: "var(--surface-3)" }}
        >
          <ShieldAlert className="h-7 w-7 text-amber-500" />
        </div>
        <h2
          className="text-[17px] font-semibold"
          style={{ color: "var(--text-base)" }}
        >
          Admin access required
        </h2>
        <p
          className="mt-2 text-[13.5px] leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          Managing team members and roles is restricted to administrators. Ask
          an admin if you need access changed.
        </p>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { user: me, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = me?.role === "admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["team-users"],
    queryFn: () => apiFetch<{ users: TeamUser[] }>("/users"),
    retry: false,
    enabled: isAdmin,
  });

  // --- Add user dialog state ---------------------------------------------
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role | typeof NO_ROLE_VALUE>(
    NO_ROLE_VALUE,
  );
  const [emailError, setEmailError] = React.useState<string | null>(null);

  function resetInvite() {
    setInviteEmail("");
    setInviteRole(NO_ROLE_VALUE);
    setEmailError(null);
  }

  const invite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: Role | null }) =>
      apiFetch<{ user: TeamUser }>("/users", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["team-users"] });
      setInviteOpen(false);
      resetInvite();
      const u = res.user;
      toast({
        title: "User added",
        description: u.role
          ? `${u.email} can sign in as ${ROLE_LABELS[u.role]}. Their role applies once they log in.`
          : `${u.email} can sign in. Assign a role once they appear in the list.`,
      });
    },
    onError: (err: Error) => {
      // Surface duplicate-email and other API errors inline on the form.
      setEmailError(err.message);
    },
  });

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      setEmailError("Email address is required.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    invite.mutate({
      email,
      role: inviteRole === NO_ROLE_VALUE ? null : inviteRole,
    });
  }

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role | null }) =>
      apiFetch<{ user: TeamUser }>(`/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["team-users"] });
      toast({
        title: vars.role ? "Role updated" : "Access revoked",
        description: vars.role
          ? `Set to ${ROLE_LABELS[vars.role]}.`
          : "User now has no access until a role is assigned.",
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not update role",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (authLoading) {
    return (
      <Screen>
        <div className="mt-16 text-center text-[13.5px]" style={{ color: "var(--text-dim)" }}>
          Loading…
        </div>
      </Screen>
    );
  }

  if (!isAdmin) return <Restricted />;

  const users = data?.users ?? [];
  const withAccess = users.filter((u) => u.role).length;
  const pendingId =
    setRole.isPending && setRole.variables ? setRole.variables.id : null;

  return (
    <Screen>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: "var(--surface-3)" }}
          >
            <UsersIcon className="h-5 w-5 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-[18px] font-semibold tracking-tight"
              style={{ color: "var(--text-base)" }}
            >
              Team &amp; Access
            </h1>
            <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
              Manage who can access LiensEasy and what they can do.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--helm-border)",
                color: "var(--text-dim)",
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {withAccess} with access
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--helm-border)",
                color: "var(--text-dim)",
              }}
            >
              {users.length} total
            </span>
            <Dialog
              open={inviteOpen}
              onOpenChange={(open) => {
                setInviteOpen(open);
                if (!open) resetInvite();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  Add user
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={submitInvite}>
                  <DialogHeader>
                    <DialogTitle>Add a team member</DialogTitle>
                    <DialogDescription>
                      Pre-create a user by email so they can sign in. Their role
                      takes effect the first time they log in.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        autoFocus
                        placeholder="teammate@company.com"
                        value={inviteEmail}
                        onChange={(e) => {
                          setInviteEmail(e.target.value);
                          if (emailError) setEmailError(null);
                        }}
                        aria-invalid={emailError ? true : undefined}
                      />
                      {emailError && (
                        <p className="text-[12px] text-red-400">{emailError}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-role">Role (optional)</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) =>
                          setInviteRole(v as Role | typeof NO_ROLE_VALUE)
                        }
                      >
                        <SelectTrigger id="invite-role">
                          <SelectValue placeholder="No role yet" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ROLE_VALUE}>
                            <span className="text-muted-foreground">
                              No role yet
                            </span>
                          </SelectItem>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setInviteOpen(false);
                        resetInvite();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={invite.isPending}>
                      {invite.isPending ? "Adding…" : "Add user"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Content: table (75%) + role legend card (25%) */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 space-y-6 lg:w-3/4">
            {/* States */}
            {isLoading && (
              <div className="text-[13.5px]" style={{ color: "var(--text-dim)" }}>
                Loading team…
              </div>
            )}
            {isError && (
              <div className="text-[13.5px] text-red-400">
                {(error as Error)?.message ?? "Failed to load team."}
              </div>
            )}

            {!isLoading && !isError && users.length === 0 && (
              <div
                className="rounded-lg border p-8 text-center text-[13.5px]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--helm-border)",
                  color: "var(--text-dim)",
                }}
              >
                No one has signed in yet. Users appear here after their first login.
              </div>
            )}

            {/* Table */}
            {!isLoading && !isError && users.length > 0 && (
              <div
                className="overflow-hidden rounded-lg border"
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
              >
                <table className="w-full border-collapse text-left">
              <thead>
                <tr
                  className="border-b text-[11px] font-semibold uppercase tracking-wide"
                  style={{ borderColor: "var(--helm-border)", color: "var(--text-muted-color)" }}
                >
                  <th className="px-4 py-3">Member</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Current role</th>
                  <th className="hidden px-4 py-3 md:table-cell">Last login</th>
                  <th className="px-4 py-3 text-right">Assign role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b last:border-0"
                      style={{ borderColor: "var(--helm-border)" }}
                    >
                      {/* Member */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.profileImageUrl ? (
                            <img
                              src={u.profileImageUrl}
                              alt={displayName(u)}
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-[#1a1205]"
                              style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}
                            >
                              {initials(u)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div
                              className="flex items-center gap-1.5 truncate text-[13.5px] font-medium"
                              style={{ color: "var(--text-base)" }}
                            >
                              {displayName(u)}
                              {isSelf && (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[12px]" style={{ color: "var(--text-muted-color)" }}>
                              {u.email ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current role */}
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {u.role ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${ROLE_BADGE[u.role]}`}
                          >
                            {ROLE_LABELS[u.role]}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium"
                            style={{
                              background: "var(--surface-2)",
                              borderColor: "var(--helm-border)",
                              color: "var(--text-muted-color)",
                            }}
                          >
                            No access
                          </span>
                        )}
                      </td>

                      {/* Last login */}
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span
                          className="inline-flex items-center gap-1.5 text-[12.5px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-muted-color)" }} />
                          {formatLastLogin(u.lastLoginAt)}
                        </span>
                      </td>

                      {/* Assign role */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <RoleSelect
                            user={u}
                            isSelf={isSelf}
                            pending={pendingId === u.id}
                            onChange={(role) => setRole.mutate({ id: u.id, role })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              </div>
            )}
          </div>

          {/* Role legend (25%) */}
          <aside className="lg:w-1/4 lg:shrink-0">
            <div
              className="rounded-lg border p-4"
              style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
            >
              <h2
                className="text-[13px] font-semibold"
                style={{ color: "var(--text-base)" }}
              >
                Roles
              </h2>
              <p
                className="mt-1 text-[12px] leading-relaxed"
                style={{ color: "var(--text-dim)" }}
              >
                Everyone who has signed in appears here. Assign a role to grant
                access to the workspace.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {ROLE_OPTIONS.map((r) => (
                  <div key={r} className="flex flex-col gap-1">
                    <span
                      className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[r]}`}
                    >
                      {ROLE_LABELS[r]}
                    </span>
                    <span
                      className="text-[11.5px] leading-relaxed"
                      style={{ color: "var(--text-muted-color)" }}
                    >
                      {ROLE_DESCRIPTIONS[r]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Screen>
  );
}
