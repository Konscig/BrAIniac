import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { AUTH_EXPIRED_EVENT, AUTH_EXPIRED_MESSAGE, AUTH_REFRESHED_EVENT, type AuthExpiredDetail } from "../lib/api";

export type AuthTokens = {
  accessToken: string;
};

const normalizeTokens = (input: unknown): AuthTokens | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const access = candidate.accessToken ?? candidate.access_token;
  if (typeof access === "string") {
    return {
      accessToken: access
    };
  }

  return null;
};

type AuthContextValue = {
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  authNotice: string | null;
  authStatus: "signed_in" | "signed_out" | "refreshing" | "expired";
  setSession: (tokens: AuthTokens) => void;
  clearSession: () => void;
  clearAuthNotice: () => void;
};

const STORAGE_KEY = "brainiac.tokens";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStoredTokens = (): AuthTokens | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const normalized = normalizeTokens(JSON.parse(raw));
    if (normalized) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: normalized.accessToken }));
    }
    return normalized;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => readStoredTokens());
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthContextValue["authStatus"]>(() =>
    readStoredTokens() ? "signed_in" : "signed_out"
  );

  const persistTokens = useCallback(
    (next: AuthTokens | null) => {
      setTokens(next);
      try {
        if (next) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: next.accessToken }));
          setAuthStatus("signed_in");
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setAuthStatus("signed_out");
        }
      } catch {
        /* noop */
      }
    },
    [setTokens]
  );

  const setSession = useCallback(
    (nextTokens: AuthTokens) => {
      setAuthNotice(null);
      persistTokens(nextTokens);
    },
    [persistTokens]
  );

  const clearSession = useCallback(() => {
    setAuthNotice(null);
    persistTokens(null);
  }, [persistTokens]);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  React.useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      const detail = (event as CustomEvent<AuthExpiredDetail>).detail;
      setAuthNotice(detail?.message || AUTH_EXPIRED_MESSAGE);
      setAuthStatus("expired");
      setTokens(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    };

    const handleAuthRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<AuthTokens>).detail;
      const normalized = normalizeTokens(detail);
      if (!normalized) return;
      setAuthNotice(null);
      persistTokens(normalized);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    window.addEventListener(AUTH_REFRESHED_EVENT, handleAuthRefreshed);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
      window.removeEventListener(AUTH_REFRESHED_EVENT, handleAuthRefreshed);
    };
  }, [persistTokens]);

  const value = useMemo(
    () => ({
      tokens,
      isAuthenticated: Boolean(tokens?.accessToken),
      authNotice,
      authStatus,
      setSession,
      clearSession,
      clearAuthNotice
    }),
    [tokens, authNotice, authStatus, setSession, clearSession, clearAuthNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

export const normalizeAuthTokens = (input: unknown): AuthTokens | null => normalizeTokens(input);
