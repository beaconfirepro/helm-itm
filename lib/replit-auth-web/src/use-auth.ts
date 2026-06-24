import { useState, useEffect, useCallback } from "react";
import { useClerk, useUser } from "@clerk/react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

/** Fire this event (e.g. after saving the profile) to make every `useAuth`
 * consumer re-fetch the current user. */
export const AUTH_REFRESH_EVENT = "auth:refresh";

export function refreshAuth(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_REFRESH_EVENT));
  }
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  refetch: () => void;
}

export function useAuth(): AuthState {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { openSignIn, signOut } = useClerk();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const mapClerkUser = useCallback((raw: NonNullable<typeof clerkUser>): AuthUser => {
    const meta = raw.publicMetadata as Record<string, unknown>;
    const role = meta.role;
    const theme = meta.theme;
    const displayName = typeof meta.displayName === "string" ? meta.displayName : null;
    const language = typeof meta.language === "string" ? meta.language : "en";
    const currency = typeof meta.currency === "string" ? meta.currency : "USD";

    return {
      id: raw.id,
      email: raw.primaryEmailAddress?.emailAddress ?? null,
      firstName: raw.firstName ?? null,
      lastName: raw.lastName ?? null,
      profileImageUrl: raw.imageUrl ?? null,
      role: role === "admin" || role === "pm" || role === "finance" || role === "coordinator" ? role : null,
      displayName,
      avatarUrl: raw.imageUrl ?? null,
      hasCustomAvatar: false,
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      language,
      currency,
    };
  }, []);

  const load = useCallback(async () => {
    if (!isLoaded) {
      setIsLoading(true);
      return;
    }

    if (!isSignedIn || !clerkUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUser | null };
        setUser(data.user ?? mapClerkUser(clerkUser));
      } else {
        setUser(mapClerkUser(clerkUser));
      }
    } catch {
      setUser(mapClerkUser(clerkUser));
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, clerkUser, mapClerkUser, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) {
        setRefreshTick((n) => n + 1);
      }
    };
    void load();
    window.addEventListener(AUTH_REFRESH_EVENT, run);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_REFRESH_EVENT, run);
    };
  }, [load]);

  const login = useCallback(() => {
    void openSignIn();
  }, [openSignIn]);

  const logout = useCallback(() => {
    void signOut({ redirectUrl: "/" });
  }, [signOut]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refetch: load,
  };
}
