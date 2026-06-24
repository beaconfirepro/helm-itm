import * as React from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "liengeasy-theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function applyResolved(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  document.body?.classList.toggle("dark", resolved === "dark");
}

interface ThemeContextValue {
  /** The chosen preference (may be "system"). */
  theme: Theme;
  /** The concrete light/dark currently applied. */
  resolved: ResolvedTheme;
  /** Change the preference, persisting to localStorage AND the server. */
  setTheme: (theme: Theme) => void;
  /** Adopt the server's stored preference without re-persisting it. */
  syncFromServer: (theme: Theme) => void;
}

const ThemeCtx = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => readStored());

  // Apply the resolved theme to the DOM whenever the preference changes.
  React.useEffect(() => {
    applyResolved(resolveTheme(theme));
  }, [theme]);

  // While following the system, react to OS color-scheme changes live.
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyResolved(resolveTheme("system"));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const persistToServer = React.useCallback((t: Theme) => {
    // Best-effort: the theme is also cached locally, so a failed PATCH (e.g.
    // on the login screen) must not break the toggle.
    fetch("/api/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {
      /* ignore */
    });
  }, []);

  const setTheme = React.useCallback(
    (t: Theme) => {
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        /* ignore */
      }
      setThemeState(t);
      persistToServer(t);
    },
    [persistToServer],
  );

  const syncFromServer = React.useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolved: resolveTheme(theme), setTheme, syncFromServer }),
    [theme, setTheme, syncFromServer],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
