import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Users, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
// Types & labels
// ---------------------------------------------------------------------------

type Role = "admin" | "pm" | "finance" | "coordinator";

interface ManagedUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: Role | null;
  createdAt: string;
}

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Full access — manages settings, rules, and users" },
  { value: "pm", label: "Project Manager", description: "Approves lien actions and manages project streams" },
  { value: "finance", label: "Finance", description: "Approves financial steps and manages collections" },
  { value: "coordinator", label: "Coordinator", description: "Day-to-day lien coordination and notice prep" },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  pm: "Project Manager",
  finance: "Finance",
  coordinator: "Coordinator",
};

const NO_ACCESS = "__none__";

function displayName(u: ManagedUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || u.id;
}

function initials(u: ManagedUser): string {
  const f = u.firstName?.trim()?.[0] ?? "";
  const l = u.lastName?.trim()?.[0] ?? "";
  const s = `${f}${l}`.toUpperCase();
  return s || (u.email?.trim()?.[0] ?? "?").toUpperCase();
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function UsersRolesTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch<{ users: ManagedUser[] }>("/users"),
    enabled: isAdmin,
  });

  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role | typeof NO_ACCESS>(
    "coordinator",
  );

  const invite = useMutation({
    mutationFn: (vars: { email: string; role: Role | null }) =>
      apiFetch<{ user: ManagedUser }>("/users", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("coordinator");
      const u = res.user;
      toast({
        title: "User added",
        description: `${u.email} can sign in${u.role ? ` as ${ROLE_LABELS[u.role]}` : ""}. Their role applies once they log in.`,
      });
    },
    onError: (err: unknown) => {
      toast({
        variant: "destructive",
        title: "Could not add user",
        description: err instanceof Error ? err.message : "Unexpected error",
      });
    },
  });

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    invite.mutate({
      email,
      role: inviteRole === NO_ACCESS ? null : inviteRole,
    });
  }

  const setRole = useMutation({
    mutationFn: (vars: { id: string; role: Role | null }) =>
      apiFetch<{ user: ManagedUser }>(`/users/${vars.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: vars.role }),
      }),
    onMutate: (vars) => setPendingId(vars.id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      const u = res.user;
      toast({
        title: "Role updated",
        description: `${displayName(u)} is now ${u.role ? ROLE_LABELS[u.role] : "without access"}.`,
      });
    },
    onError: (err: unknown) => {
      toast({
        variant: "destructive",
        title: "Could not update role",
        description: err instanceof Error ? err.message : "Unexpected error",
      });
    },
    onSettled: () => setPendingId(null),
  });

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Admin access required</CardTitle>
              <CardDescription>
                Only administrators can view and manage user roles. Ask an admin
                if you need access here.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Users &amp; Roles</CardTitle>
              <CardDescription>
                Set what each team member can do. Add a user to let them sign in,
                or wait for them to first sign in, then assign a role. Changes
                take effect on their next action.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={inviteOpen ? "outline" : "default"}
            className="shrink-0"
            onClick={() => setInviteOpen((o) => !o)}
          >
            {inviteOpen ? (
              <>
                <X className="mr-1.5 h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Add user
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {inviteOpen && (
          <form
            onSubmit={submitInvite}
            className="mb-5 rounded-lg border border-border bg-muted/30 p-4"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  autoFocus
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:w-[220px]">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as Role | typeof NO_ACCESS)}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={NO_ACCESS}>No access yet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={invite.isPending || !inviteEmail.trim()}
                className="md:w-auto"
              >
                {invite.isPending ? "Adding…" : "Add user"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The user can sign in with this email. Their role takes effect the
              first time they log in.
            </p>
          </form>
        )}

        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading users…
          </p>
        )}

        {isError && (
          <p className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load users"}
          </p>
        )}

        {data && data.users.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No users yet. Team members appear here after they first sign in.
          </p>
        )}

        {data && data.users.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Current role</th>
                  <th className="px-4 py-2.5 font-medium">Assign role</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const isSelf = u.id === user?.id;
                  const saving = pendingId === u.id && setRole.isPending;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.profileImageUrl ? (
                            <img
                              src={u.profileImageUrl}
                              alt={displayName(u)}
                              className="h-8 w-8 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                              {initials(u)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {displayName(u)}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </div>
                            {u.email && (
                              <div className="truncate text-xs text-muted-foreground">
                                {u.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.role ? (
                          <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            No access yet
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.role ?? NO_ACCESS}
                          disabled={isSelf || saving}
                          onValueChange={(value) => {
                            const next = value === NO_ACCESS ? null : (value as Role);
                            if (next === u.role) return;
                            setRole.mutate({ id: u.id, role: next });
                          }}
                        >
                          <SelectTrigger
                            className={cn("w-[200px]", isSelf && "opacity-60")}
                            title={
                              isSelf
                                ? "You cannot change your own role"
                                : undefined
                            }
                          >
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                            <SelectItem value={NO_ACCESS}>No access</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
