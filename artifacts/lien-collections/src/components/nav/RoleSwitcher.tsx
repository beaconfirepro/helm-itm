import * as React from "react";
import { UserCog, ChevronDown, Check } from "lucide-react";

type RoleOption = { role: string; label: string; name: string };

interface DevAuth {
  enabled: boolean;
  role: string | null;
  options: RoleOption[];
}

/**
 * RoleSwitcher — a development-only control that lets a tester assume any app
 * role (admin / coordinator / pm / finance) from inside the app, so role gates
 * can be exercised positively and negatively without editing the database.
 *
 * It renders nothing unless the server reports the dev login bypass is active
 * (`GET /api/dev/auth` → enabled), which is never the case in a deployed
 * environment. Switching a role POSTs the choice and reloads so the new role
 * takes effect everywhere (the auth user is re-fetched on load).
 */
export function RoleSwitcher() {
  const [data, setData] = React.useState<DevAuth | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/auth", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DevAuth | null) => {
        if (!cancelled && d?.enabled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data?.enabled) return null;

  const current =
    data.options.find((o) => o.role === data.role) ?? data.options[0];

  async function choose(role: string) {
    if (role === data?.role) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/dev/auth/role", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
    } catch {
      /* ignore — leave the menu open so the tester can retry */
    }
    setBusy(false);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        title="Dev: switch role"
        className="flex h-[38px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold disabled:opacity-60"
        style={{
          background: "rgba(245,158,11,.12)",
          borderColor: "rgba(245,158,11,.4)",
          color: "#f59e0b",
        }}
      >
        <UserCog className="h-[16px] w-[16px]" />
        <span className="hidden sm:block">{current?.label ?? "Role"}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 z-50 mt-1.5 w-60 overflow-hidden rounded-lg border shadow-xl"
            style={{
              background: "var(--surface)",
              borderColor: "var(--helm-border)",
            }}
          >
            <div
              className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-[1px]"
              style={{
                borderColor: "var(--helm-border)",
                color: "var(--text-muted-color)",
              }}
            >
              Test as role (dev only)
            </div>
            {data.options.map((o) => {
              const active = o.role === data.role;
              return (
                <button
                  key={o.role}
                  onClick={() => choose(o.role)}
                  disabled={busy}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors disabled:opacity-60"
                  style={{ color: "var(--text-base)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {active && (
                      <Check className="h-4 w-4" style={{ color: "#f59e0b" }} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">
                      {o.label}
                    </span>
                    <span
                      className="block truncate text-[11.5px]"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {o.name}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
