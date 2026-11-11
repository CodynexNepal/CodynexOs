"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { clearToken, setToken, toApiError, type ApiErrorShape } from "@/lib/axios";
import { USER_KEY } from "@/lib/env";
import type { AuthUser } from "@/types/os";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  authError: ApiErrorShape | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  } catch {
    /* noop */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<ApiErrorShape | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const res = await codynexApi.auth.me();
      const me = unwrap<AuthUser>(res.data);
      setUser(me);
      writeCachedUser(me);
    } catch {
      setUser(null);
      writeCachedUser(null);
      clearToken();
    }
  }, []);

  useEffect(() => {
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
      setIsLoading(false);
      refreshMe().catch(() => {});
    } else {
      refreshMe().finally(() => setIsLoading(false));
    }
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const res = await codynexApi.auth.login({ email, password });
        const payload = unwrap<{ user: AuthUser; accessToken?: string }>(res.data);
        if (payload.accessToken) setToken(payload.accessToken);
        setUser(payload.user);
        writeCachedUser(payload.user);
        router.push("/overview");
        return { ok: true };
      } catch (err) {
        const apiErr = toApiError(err);
        setAuthError(apiErr);
        return { ok: false, error: apiErr.message };
      } finally {
        setIsAuthenticating(false);
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await codynexApi.auth.logout(false);
    } catch {
      /* still clear locally */
    } finally {
      clearToken();
      writeCachedUser(null);
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticating,
      authError,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshMe,
    }),
    [user, isLoading, isAuthenticating, authError, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
