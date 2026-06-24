import * as React from "react";
import { Link, useLocation } from "wouter";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { cn } from "@/lib/utils";
import { useResponsive } from "@/hooks/use-responsive";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@workspace/replit-auth-web";
import { GlobalSearch } from "./GlobalSearch";
import { RoleSwitcher } from "./RoleSwitcher";
import {
  LayoutGrid, Landmark, DollarSign, Lock, Settings,
  Bell, Menu, X,
  Sun, Moon, PanelRightClose, PanelRightOpen,
  PanelLeftClose, PanelLeftOpen, FileSignature, LogOut,
  ChevronDown, User, Users2,
  Send, Shield, FileText,
} from "lucide-react";

/* ─── Panel context (inner left + right) ─────────────────────────────────── */
const PanelCtx = React.createContext<{
  setRight: (n: React.ReactNode) => void;
  setLeft: (n: React.ReactNode) => void;
} | null>(null);

export function useRightPanel(node: React.ReactNode, deps: React.DependencyList = []) {
  const ctx = React.useContext(PanelCtx);
  React.useEffect(() => {
    ctx?.setRight(node);
    return () => ctx?.setRight(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useLeftPanel(node: React.ReactNode, deps: React.DependencyList = []) {
  const ctx = React.useContext(PanelCtx);
  React.useEffect(() => {
    ctx?.setLeft(node);
    return () => ctx?.setLeft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ─── Panel helper used by pages ─────────────────────────────────────────── */
export function Panel({
  title, accent = "#6366f1", count, children,
}: {
  title: string; accent?: string; count?: number; children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-3.5" style={{ borderColor: "var(--helm-border)" }}>
        <div className="text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>{title}</div>
        {count != null && (
          <span className="rounded-full px-2 py-0.5 font-mono text-[11.5px] font-semibold" style={{ color: accent, background: `${accent}22` }}>{count}</span>
        )}
      </div>
      {children}
    </>
  );
}

/* ─── Collapsible card (tablet panel surface) ────────────────────────────── */
function CollapsibleCard({
  label, Icon, defaultOpen = false, children,
}: {
  label: string; Icon: React.ComponentType<{ className?: string }>; defaultOpen?: boolean; children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors"
        aria-expanded={open}
        style={{ color: "var(--text-base)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-[13.5px] font-semibold">{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t" style={{ borderColor: "var(--helm-border)" }}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ─── Navigation config ──────────────────────────────────────────────────── */
const MODULE_NAV = [
  { key: "dashboard", label: "Dashboard", to: "/", Icon: LayoutGrid },
  { key: "waivers", label: "Waivers", to: "/waivers", Icon: FileSignature },
  { key: "holds", label: "Vendor Holds", to: "/holds", Icon: Lock },
  { key: "collections", label: "Collections", to: "/collections", Icon: DollarSign },
  { key: "notices", label: "Notices", to: "/notices", Icon: Send },
  { key: "projects", label: "Projects", to: "/liens", Icon: Landmark },
  { key: "liens", label: "Liens", to: "/liens-board", Icon: FileText },
];

const TITLES: [RegExp, string][] = [
  [/^\/settings$/, "Company Settings"],
  [/^\/liens$/, "Projects"],
  [/^\/liens-board$/, "Liens"],
  [/^\/notices$/, "Notices"],
  [/^\/send-queue$/, "Ready-to-Send Queue"],
  [/^\/projects\//, "Project Workspace"],
  [/^\/waivers$/, "Waiver Workspace"],
  [/^\/filing\//, "Filing Workspace"],
  [/^\/holds$/, "Vendor Bill Holds"],
  [/^\/collections\/.+/, "Account Detail"],
  [/^\/collections$/, "Collections Pipeline"],
  [/^\/team$/, "Team & Access"],
  [/^\/$/, "Dashboard"],
];

function getTitle(path: string) {
  return TITLES.find(([re]) => re.test(path))?.[1] ?? "LiensEasy";
}

/* ─── Main AppShell ──────────────────────────────────────────────────────── */
function userInitials(user: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const f = user.firstName?.trim()?.[0] ?? "";
  const l = user.lastName?.trim()?.[0] ?? "";
  const initials = `${f}${l}`.toUpperCase();
  if (initials) return initials;
  return (user.email?.trim()?.[0] ?? "?").toUpperCase();
}

function userDisplayName(user: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Account";
}

/* ─── Login gate (unauthenticated) ───────────────────────────────────────── */
function LoginScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 dark" style={{ background: "var(--bg)" }}>
      <div
        className="w-full max-w-sm rounded-xl border p-8 text-center shadow-xl"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl" style={{ background: "var(--surface-3)" }}>
          <Landmark className="h-7 w-7 text-amber-500" />
        </div>
        <div className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text-base)" }}>
          LiensEasy
        </div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--text-muted-color)" }}>
          by HELM
        </div>
        <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Please log in to access the workspace.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton />
          </Show>
        </div>
      </div>
    </div>
  );
}

/* ─── Pending-access gate (authenticated, no role yet) ───────────────────── */
function PendingAccessScreen({
  user,
  onLogout,
}: {
  user: { firstName: string | null; lastName: string | null; email: string | null };
  onLogout: () => void;
}) {
  const name = userDisplayName(user);
  return (
    <div className="flex min-h-screen items-center justify-center px-4 dark" style={{ background: "var(--bg)" }}>
      <div
        className="w-full max-w-md rounded-xl border p-8 text-center shadow-xl"
        style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl" style={{ background: "var(--surface-3)" }}>
          <Lock className="h-7 w-7 text-amber-500" />
        </div>
        <div className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text-base)" }}>
          You're almost in
        </div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--text-muted-color)" }}>
          Access pending
        </div>
        <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          You're signed in as <span className="font-semibold" style={{ color: "var(--text-base)" }}>{name}</span>, but your account
          doesn't have a role assigned yet. An administrator needs to grant you access before you can use the workspace.
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted-color)" }}>
          Please reach out to your LiensEasy admin. Once they've assigned your role, reload this page to get started.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded-md py-2.5 text-[14px] font-semibold text-[#1a1205] transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}
        >
          Check again
        </button>
        <button
          onClick={onLogout}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md border py-2.5 text-[13.5px] font-medium transition-colors"
          style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isDesktop, isTablet, isMobile, width } = useResponsive();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { resolved: resolvedTheme, setTheme, syncFromServer } = useTheme();
  const [location] = useLocation();
  const [drawer, setDrawer] = React.useState(false);
  const [right, setRight] = React.useState<React.ReactNode>(null);
  const [left, setLeft] = React.useState<React.ReactNode>(null);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [mobilePanel, setMobilePanel] = React.useState<null | "left" | "right">(null);

  // Adopt the server's stored theme once the authenticated user loads, so the
  // preference follows the account across devices / re-login. The local cache
  // already prevented a flash on first paint.
  const syncedThemeRef = React.useRef(false);
  React.useEffect(() => {
    if (user?.theme && !syncedThemeRef.current) {
      syncedThemeRef.current = true;
      syncFromServer(user.theme);
    }
  }, [user?.theme, syncFromServer]);

  /* Close the mobile panel overlay when leaving phone width or when the
     corresponding panel content unregisters. */
  React.useEffect(() => {
    if (!isMobile) setMobilePanel(null);
  }, [isMobile]);
  React.useEffect(() => {
    if (mobilePanel === "left" && !left) setMobilePanel(null);
    if (mobilePanel === "right" && !right) setMobilePanel(null);
  }, [mobilePanel, left, right]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center dark" style={{ background: "var(--bg)", color: "var(--text-dim)" }}>
        <span className="text-[13.5px]">Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (user && !user.role) {
    return <PendingAccessScreen user={user} onLogout={logout} />;
  }

  const title = getTitle(location);

  const isLiensSection =
    location === "/liens" ||
    location.startsWith("/projects") ||
    location.startsWith("/filing");
  const isNoticesSection =
    location === "/notices" ||
    location.startsWith("/send-queue");
  const isModuleActive = (m: { key: string; to: string }) =>
    m.to === "/" ? location === "/" :
    m.key === "projects" ? isLiensSection :
    m.key === "notices" ? isNoticesSection :
    location.startsWith(m.to);

  /* Inner left panel (DD-UI: LP · content · RP) is now page-registered via
     useLeftPanel — pages decide its content. */
  const hasLeftPanel = !!left;
  const hasRightPanel = !!right;

  /* Desktop: side columns (left fixed column, right column or stacked). */
  const sidebarW = isDesktop ? 236 : 0;
  const leftCol = hasLeftPanel && leftOpen && isDesktop;
  const leftW = leftCol ? 208 : 0;
  const avail = width - sidebarW - leftW;
  const rightFits = avail - 314 >= 470;
  const rightCol = hasRightPanel && rightOpen && isDesktop && rightFits;
  const rightStacked = hasRightPanel && rightOpen && isDesktop && !rightFits;

  /* Tablet: inline collapsible cards (left above content, right below). */
  const leftCard = hasLeftPanel && isTablet;
  const rightCard = hasRightPanel && isTablet;

  const ctx = { setRight, setLeft };

  return (
    <PanelCtx.Provider value={ctx}>
      <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>

        {/* ─── Left rail (Helm slot) ───────────────────────────────────────
            In the standalone module app this rail is intentionally empty — it
            is the slot the Helm platform fills when LiensEasy runs inside Helm.
            LiensEasy's own nav lives in the top bar; its brand in the header. */}
        {isDesktop && (
          <aside
            className="sticky top-0 h-screen shrink-0 border-r"
            style={{ width: 236, background: "var(--surface)", borderColor: "var(--helm-border)" }}
            aria-hidden="true"
          />
        )}

        {/* ─── Main column ─────────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--bg)" }}>
          {/* Header */}
          <header
            className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 md:px-6"
            style={{ background: "var(--bg)", borderColor: "var(--helm-border)" }}
          >
            {!isDesktop && (
              <button onClick={() => setDrawer(true)} className="-ml-1 p-1.5" style={{ color: "var(--text-base)" }}>
                <Menu className="h-6 w-6" />
              </button>
            )}
            {/* LiensEasy brand — the app's identity lives in the header */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Landmark className="h-[22px] w-[22px] shrink-0 text-amber-500" />
              <div className="min-w-0">
                <div className="text-[16px] font-bold leading-[1.1] tracking-tight md:text-[18px]" style={{ color: "var(--text-base)" }}>
                  LiensEasy <span className="font-medium" style={{ color: "var(--text-dim)" }}>by Helm</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide" style={{ color: "#14eba3", background: "rgba(20,235,163,.12)" }}>
                    <Shield className="h-3 w-3" />Texas
                  </span>
                  <span className="hidden truncate text-[12px] sm:block" style={{ color: "var(--text-dim)" }}>protecting Beacon&apos;s right to payment</span>
                </div>
              </div>
            </div>
            <GlobalSearch className="relative hidden w-56 lg:block" />
            <RoleSwitcher />
            {user?.role === "admin" && (
              <Link href="/team">
                <div
                  className="hidden h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-md border sm:flex"
                  style={{ background: location === "/team" ? "var(--surface-3)" : "var(--surface-2)", borderColor: "var(--helm-border)", color: location === "/team" ? "var(--text-base)" : "var(--text-dim)" }}
                  title="Team & Access"
                >
                  <Users2 className="h-[18px] w-[18px]" />
                </div>
              </Link>
            )}
            <Link href="/settings">
              <div
                className="hidden h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-md border sm:flex"
                style={{ background: location === "/settings" ? "var(--surface-3)" : "var(--surface-2)", borderColor: "var(--helm-border)", color: location === "/settings" ? "var(--text-base)" : "var(--text-dim)" }}
                title="Company Settings"
              >
                <Settings className="h-[18px] w-[18px]" />
              </div>
            </Link>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10.5px] font-semibold tracking-wide sm:flex" style={{ background: "rgba(20,235,163,.12)", color: "#14eba3" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#14eba3]" />PROD
            </span>
            <button className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border" style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}>
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full border-2 bg-[#eb143f]" style={{ borderColor: "var(--surface)" }} />
            </button>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border"
              style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolvedTheme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <div className="flex shrink-0 items-center gap-2.5">
              <Link href="/profile">
                <div className="flex shrink-0 cursor-pointer items-center gap-2.5" title="Profile & preferences">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={userDisplayName(user)}
                      className="h-[38px] w-[38px] shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-[#1a1205]" style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                      {user ? userInitials(user) : "?"}
                    </div>
                  )}
                  {user && (
                    <span className="hidden text-[13px] font-medium lg:block" style={{ color: "var(--text-base)" }}>
                      {userDisplayName(user)}
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={logout}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border"
                style={{ background: "var(--surface-2)", borderColor: "var(--helm-border)", color: "var(--text-dim)" }}
                title="Log out"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>

          {/* Sub-header */}
          <div
            className="sticky top-16 z-20 flex h-12 items-center gap-3 border-b px-4 md:px-6"
            style={{ background: "var(--bg)", borderColor: "var(--helm-border)" }}
          >
            {isDesktop ? (
              <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {MODULE_NAV.map((m) => {
                  const active = isModuleActive(m);
                  return (
                    <Link key={m.key} href={m.to}>
                      <div
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] transition-colors"
                        style={active
                          ? { background: "rgba(245,159,10,.14)", color: "#f59e0b", fontWeight: 600 }
                          : { background: "transparent", color: "var(--text-dim)", fontWeight: 500 }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface-2)"; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                      >
                        <m.Icon className="h-4 w-4 shrink-0" />
                        {m.label}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15.5px] font-semibold" style={{ color: "var(--text-base)" }}>{title}</div>
              </div>
            )}
          </div>

          {/* Body — inner left tab · content · right panel (DD-UI: LP · content · RP) */}
          <div
            className="relative grid flex-1 items-start gap-4 p-4 md:gap-[18px] md:p-[18px]"
            style={{
              gridTemplateColumns: [
                leftCol ? "208px" : null,
                "minmax(0,1fr)",
                rightCol ? "296px" : null,
              ].filter(Boolean).join(" "),
              paddingBottom: isMobile ? 80 : undefined,
            }}
          >
            {leftCol && (
              <aside
                className="relative sticky top-[120px] overflow-hidden rounded-lg border"
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
              >
                <button
                  onClick={() => setLeftOpen((o) => !o)}
                  className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-colors"
                  style={{
                    background: "var(--surface-3)",
                    borderColor: "var(--helm-border)",
                    color: "var(--text-base)",
                  }}
                  title="Collapse panel"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
                <div className="pt-12">
                  {left}
                </div>
              </aside>
            )}
            {isDesktop && hasLeftPanel && !leftOpen && (
              <button
                onClick={() => setLeftOpen(true)}
                className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-colors"
                style={{
                  background: "var(--surface-3)",
                  borderColor: "var(--helm-border)",
                  color: "var(--text-base)",
                }}
                title="Expand panel"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <div className="flex min-w-0 flex-col gap-4">
              {/* Tablet: left panel as collapsible card above content */}
              {leftCard && (
                <CollapsibleCard label="Filters & Navigation" Icon={PanelLeftOpen}>
                  {left}
                </CollapsibleCard>
              )}
              {children}
              {/* Tablet: right panel as collapsible card below content */}
              {rightCard && (
                <CollapsibleCard label="Details & Context" Icon={PanelRightOpen}>
                  {right}
                </CollapsibleCard>
              )}
            </div>
            {(rightCol || rightStacked) && (
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg border",
                  rightStacked && "col-span-full",
                  rightCol && "sticky top-[120px]",
                )}
                style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
              >
                <button
                  onClick={() => setRightOpen((o) => !o)}
                  className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-colors"
                  style={{
                    background: "var(--surface-3)",
                    borderColor: "var(--helm-border)",
                    color: "var(--text-base)",
                  }}
                  title="Collapse panel"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
                <div className="pt-12">
                  {right}
                </div>
              </div>
            )}
            {isDesktop && hasRightPanel && !rightOpen && (
              <button
                onClick={() => setRightOpen(true)}
                className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-colors"
                style={{
                  background: "var(--surface-3)",
                  borderColor: "var(--helm-border)",
                  color: "var(--text-base)",
                }}
                title="Expand panel"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Footer */}
          <footer
            className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3 text-[11px]"
            style={{ background: "var(--surface)", borderColor: "var(--helm-border)", color: "var(--text-muted-color)", marginBottom: isMobile ? 62 : 0 }}
          >
            <span>© 2026 HELM Fire Protection · LiensEasy v1.0</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#14eba3]" />
              Status: Operational
            </span>
          </footer>
        </main>

        {/* ─── Phone floating panel buttons ──────────────────────────── */}
        {isMobile && hasLeftPanel && (
          <button
            onClick={() => setMobilePanel("left")}
            className="fixed left-3 z-40 flex items-center gap-1.5 rounded-full border px-3.5 py-2.5 shadow-lg"
            style={{ bottom: 74, background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
          >
            <PanelLeftOpen className="h-4 w-4" />
            <span className="text-[12px] font-semibold">Filters</span>
          </button>
        )}
        {isMobile && hasRightPanel && (
          <button
            onClick={() => setMobilePanel("right")}
            className="fixed right-3 z-40 flex items-center gap-1.5 rounded-full border px-3.5 py-2.5 shadow-lg"
            style={{ bottom: 74, background: "var(--surface-3)", borderColor: "var(--helm-border)", color: "var(--text-base)" }}
          >
            <PanelRightOpen className="h-4 w-4" />
            <span className="text-[12px] font-semibold">Details</span>
          </button>
        )}

        {/* ─── Phone panel overlay (bottom sheet) ─────────────────────── */}
        {isMobile && mobilePanel && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setMobilePanel(null)}>
            <div
              className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-2xl border-t"
              style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--helm-border)" }}>
                <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--text-base)" }}>
                  {mobilePanel === "left" ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelRightOpen className="h-[18px] w-[18px]" />}
                  {mobilePanel === "left" ? "Filters & Navigation" : "Details & Context"}
                </span>
                <button onClick={() => setMobilePanel(null)} style={{ color: "var(--text-dim)" }}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain">
                {mobilePanel === "left" ? left : right}
              </div>
            </div>
          </div>
        )}

        {/* ─── Mobile bottom tab bar ─────────────────────────────────── */}
        {isMobile && (
          <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[62px] border-t" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
            {[
              { label: "Dashboard", to: "/", Icon: LayoutGrid },
              { label: "Waivers", to: "/waivers", Icon: FileSignature },
              { label: "Vendor Holds", to: "/holds", Icon: Lock },
              { label: "Collections", to: "/collections", Icon: DollarSign },
              { label: "Notices", to: "/notices", Icon: Send },
            ].map(({ label, to, Icon }) => {
              const active =
                to === "/" ? location === to :
                to === "/liens" ? isLiensSection :
                to === "/notices" ? isNoticesSection :
                location.startsWith(to);
              return (
                <Link key={label} href={to}>
                  <div
                    className="flex flex-1 w-16 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer"
                    style={{ color: active ? "#f59e0b" : "var(--text-muted-color)" }}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </div>
                </Link>
              );
            })}
          </nav>
        )}

        {/* ─── Mobile drawer ──────────────────────────────────────────── */}
        {drawer && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)}>
            <div
              className="absolute inset-y-0 left-0 flex w-[250px] flex-col border-r"
              style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-16 items-center justify-between border-b px-[18px]" style={{ borderColor: "var(--helm-border)" }}>
                <span className="text-[15px] font-bold leading-tight" style={{ color: "var(--text-base)" }}>
                  LiensEasy
                  <span className="block text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-muted-color)" }}>By HELM</span>
                </span>
                <button onClick={() => setDrawer(false)} style={{ color: "var(--text-dim)" }}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="border-b p-3" style={{ borderColor: "var(--helm-border)" }}>
                <GlobalSearch className="relative w-full" onNavigate={() => setDrawer(false)} />
              </div>
              <nav className="flex flex-1 flex-col gap-1 p-3">
                {MODULE_NAV.map((m) => {
                  const active =
                    m.to === "/" ? location === "/" :
                    m.key === "projects" ? isLiensSection :
                    location.startsWith(m.to);
                  return (
                    <div key={m.key}>
                      <Link href={m.to}>
                        <div
                          className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm cursor-pointer"
                          style={active
                            ? { background: "var(--surface-3)", color: "var(--text-base)", fontWeight: 600 }
                            : { color: "var(--text-dim)", fontWeight: 500 }}
                          onClick={() => setDrawer(false)}
                        >
                          <m.Icon className="h-4 w-4 shrink-0" />{m.label}
                        </div>
                      </Link>
                    </div>
                  );
                })}
                <Link href="/profile">
                  <div
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm cursor-pointer"
                    style={location === "/profile"
                      ? { background: "var(--surface-3)", color: "var(--text-base)", fontWeight: 600 }
                      : { color: "var(--text-dim)", fontWeight: 500 }}
                    onClick={() => setDrawer(false)}
                  >
                    <User className="h-4 w-4 shrink-0" />My Profile
                  </div>
                </Link>
                {user?.role === "admin" && (
                  <Link href="/team">
                    <div
                      className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm cursor-pointer"
                      style={location === "/team"
                        ? { background: "var(--surface-3)", color: "var(--text-base)", fontWeight: 600 }
                        : { color: "var(--text-dim)", fontWeight: 500 }}
                      onClick={() => setDrawer(false)}
                    >
                      <Users2 className="h-4 w-4 shrink-0" />Team &amp; Access
                    </div>
                  </Link>
                )}
                <Link href="/settings">
                  <div
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm cursor-pointer"
                    style={location === "/settings"
                      ? { background: "var(--surface-3)", color: "var(--text-base)", fontWeight: 600 }
                      : { color: "var(--text-dim)", fontWeight: 500 }}
                    onClick={() => setDrawer(false)}
                  >
                    <Settings className="h-4 w-4 shrink-0" />Company Settings
                  </div>
                </Link>
              </nav>
            </div>
          </div>
        )}
      </div>
    </PanelCtx.Provider>
  );
}
